"use client";

import { create } from "zustand";

import { answerQuery } from "./answer";
import { generateAnswer, generateBrief, splitAnswer } from "./generate";
import { buildGraph, type GraphEdge } from "./graph";
import { isConfigured, loadConfig } from "./llm";
import { requestRelations } from "./relations";
import { seedSources } from "./seed";
import { estimateTags, summarize } from "./text";
import type {
  Answer,
  Conflict,
  ConflictResolution,
  Source,
  SourceKind,
  View,
} from "./types";

const KEY = "loom.kb.v1";
const CONFLICT_KEY = "loom.conflicts.v1";
const EDGE_KEY = "loom.edges.v1";
const SEED_KEY = "loom.seedVersion";
const AUTO_KEY = "loom.autoRecompute";
const SHOW_RESET_KEY = "loom.showReset";

// 连续添加多条时合并成一次分析
let autoTimer: ReturnType<typeof setTimeout> | null = null;
/** 种子数据版本：每次给演示库加内容就 +1，老浏览器下次打开会自动补齐 */
const SEED_VERSION = 2;

interface SavedEdges {
  edges: GraphEdge[];
  tokens: number | null;
  at: number;
  /** 快照时的素材 id 集合，用于判断结果是否过期 */
  ids: string;
}

const idsKey = (sources: { id: string }[]) =>
  sources
    .map((source) => source.id)
    .sort()
    .join(",");

function saveEdges(sources: { id: string }[], edges: GraphEdge[], tokens: number | null) {
  try {
    const payload: SavedEdges = { edges, tokens, at: Date.now(), ids: idsKey(sources) };
    localStorage.setItem(EDGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function clearSavedEdges() {
  try {
    localStorage.removeItem(EDGE_KEY);
  } catch {
    /* ignore */
  }
}

const pairKey = (a: string, b: string) => [a, b].sort().join("|");

function save(sources: Source[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(sources));
  } catch {
    /* 隐私模式下可能不可写，忽略即可 */
  }
}

function saveConflicts(conflicts: Conflict[]) {
  try {
    localStorage.setItem(CONFLICT_KEY, JSON.stringify(conflicts));
  } catch {
    /* ignore */
  }
}

/** 从云端边里提取「矛盾」关系，保留已处理过的判断 */
function deriveConflicts(edges: GraphEdge[], previous: Conflict[]): Conflict[] {
  const byId = new Map(previous.map((item) => [item.id, item]));
  return edges
    .filter((edge) => edge.kind === "contradicts")
    .map((edge) => {
      const id = pairKey(edge.source, edge.target);
      const existing = byId.get(id);
      return (
        existing ?? {
          id,
          aId: edge.source,
          bId: edge.target,
          reason: edge.reason ?? "两条素材的说法不一致",
          status: "pending" as const,
        }
      );
    });
}

interface AddInput {
  title: string;
  text: string;
  kind: SourceKind;
  url?: string;
  intent?: string;
  thumbnail?: string;
}

interface KbStore {
  hydrated: boolean;
  sources: Source[];
  view: View;
  selectedId: string | null;
  query: string;
  goal: string;
  question: string;
  answer: Answer | null;
  /** 当前关系边：本地算法或云端模型产出 */
  edges: GraphEdge[];
  edgeSource: "local" | "cloud";
  edgeStatus: "idle" | "loading" | "error";
  edgeError: string | null;
  edgeTokens: number | null;
  /** 云端结果生成时间；null 表示当前是本地算法 */
  edgeSavedAt: number | null;
  /** 添加素材后是否自动跑一次云端重算 */
  autoRecompute: boolean;
  /** 是否显示「恢复演示数据」入口（默认隐藏，避免误触清空） */
  showReset: boolean;
  /** 服务端能力（来自 /api/health）：没有自带 Key 时也能云端分析 */
  serverCloud: { relations: boolean; generate: boolean; vision: boolean } | null;
  /** 内容冲突：由云端「矛盾」关系派生 */
  conflicts: Conflict[];

  /** 云端生成的日报总结 */
  briefCloud: { text: string; tokens: number | null } | null;
  briefStatus: "idle" | "loading" | "error";
  briefError: string | null;

  /** 云端生成的问答回答 */
  answerCloud: { text: string; extra: string; tokens: number | null } | null;
  answerStatus: "idle" | "loading" | "error";
  answerError: string | null;

  hydrate: () => void;
  setView: (view: View) => void;
  select: (id: string | null) => void;
  setQuery: (query: string) => void;
  setGoal: (goal: string) => void;
  setQuestion: (question: string) => void;
  submitQuestion: () => void;
  addSource: (input: AddInput) => string;
  setIntent: (id: string, intent: string) => void;
  removeSource: (id: string) => void;
  reset: () => void;
  refreshEdges: () => Promise<void>;
  /** 处理冲突：必须给出判断，否则不关闭 */
  resolveConflict: (id: string, resolution: ConflictResolution, note: string) => void;
  generateBriefSummary: () => Promise<void>;
  generateCloudAnswer: () => Promise<void>;
  setAutoRecompute: (value: boolean) => void;
  setShowReset: (value: boolean) => void;
  loadServerCloud: () => Promise<void>;
}

export const useKb = create<KbStore>()((set, get) => ({
  hydrated: false,
  sources: [],
  view: "library",
  selectedId: null,
  query: "",
  goal: "",
  question: "",
  answer: null,
  edges: [],
  edgeSource: "local",
  edgeStatus: "idle",
  edgeError: null,
  edgeTokens: null,
  edgeSavedAt: null,
  autoRecompute: false,
  showReset: false,
  serverCloud: null,
  conflicts: [],
  briefCloud: null,
  briefStatus: "idle",
  briefError: null,
  answerCloud: null,
  answerStatus: "idle",
  answerError: null,

  hydrate: () => {
    if (get().hydrated) return;
    let stored: Source[] | null = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) stored = JSON.parse(raw) as Source[];
    } catch {
      stored = null;
    }
    const seeds = seedSources();
    let sources: Source[];

    if (stored && stored.length > 0) {
      const storedVersion = Number(localStorage.getItem(SEED_KEY) ?? 0);
      const looksSeeded = stored.some((item) => seeds.some((seed) => seed.id === item.id));

      if (looksSeeded && storedVersion < SEED_VERSION) {
        // 只补缺失的种子条目，用户自己加的、删过的一律不动
        const have = new Set(stored.map((item) => item.id));
        const missing = seeds.filter((item) => !have.has(item.id));
        sources = missing.length > 0 ? [...missing, ...stored] : stored;
        try {
          localStorage.setItem(SEED_KEY, String(SEED_VERSION));
        } catch {
          /* ignore */
        }
      } else {
        sources = stored;
      }
    } else {
      sources = seeds;
      try {
        localStorage.setItem(SEED_KEY, String(SEED_VERSION));
      } catch {
        /* ignore */
      }
    }

    let conflicts: Conflict[] = [];
    try {
      const raw = localStorage.getItem(CONFLICT_KEY);
      if (raw) conflicts = JSON.parse(raw) as Conflict[];
    } catch {
      conflicts = [];
    }

    // 恢复上次云端分析：素材集合变了就作废，避免对着已删除的素材画线
    let restored: SavedEdges | null = null;
    try {
      const raw = localStorage.getItem(EDGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedEdges;
        const alive = new Set(sources.map((source) => source.id));
        const valid =
          parsed.ids === idsKey(sources) &&
          Array.isArray(parsed.edges) &&
          parsed.edges.every((edge) => alive.has(edge.source) && alive.has(edge.target));
        if (valid) restored = parsed;
      }
    } catch {
      restored = null;
    }

    let autoRecompute = false;
    let showReset = false;
    try {
      autoRecompute = localStorage.getItem(AUTO_KEY) === "1";
      showReset = localStorage.getItem(SHOW_RESET_KEY) === "1";
    } catch {
      autoRecompute = false;
      showReset = false;
    }

    set({
      sources,
      conflicts,
      autoRecompute,
      showReset,
      hydrated: true,
      edges: restored?.edges ?? buildGraph(sources).edges,
      edgeSource: restored ? "cloud" : "local",
      edgeSavedAt: restored?.at ?? null,
      edgeStatus: "idle",
      edgeError: null,
    });
    save(sources);
  },

  setView: (view) => set({ view, selectedId: view === "library" ? get().selectedId : null }),
  select: (id) => {
    if (!id) {
      set({ selectedId: null });
      return;
    }
    const sources = get().sources.map((source) =>
      source.id === id ? { ...source, openedAt: Date.now() } : source,
    );
    set({ selectedId: id, sources });
    save(sources);
  },
  setQuery: (query) => set({ query }),
  setGoal: (goal) => set({ goal }),
  setQuestion: (question) => set({ question }),

  submitQuestion: () => {
    const { question, sources } = get();
    if (!question.trim()) return;
    set({ answer: answerQuery(question, sources), answerCloud: null, answerStatus: "idle", answerError: null });
  },

  addSource: (input) => {
    const now = Date.now();
    const source: Source = {
      id: `s${now.toString(36)}`,
      kind: input.kind,
      title: input.title.trim() || "未命名素材",
      url: input.url,
      thumbnail: input.thumbnail,
      text: input.text,
      createdAt: now,
      openedAt: now,
      intent: input.intent?.trim() || undefined,
      tags: estimateTags(input.title, input.text),
      summary: summarize(input.text) || input.text.slice(0, 80),
    };
    const sources = [source, ...get().sources];
    clearSavedEdges();
    set({
      sources,
      selectedId: source.id,
      edges: buildGraph(sources).edges,
      edgeSource: "local",
      edgeStatus: "idle",
      edgeError: null,
      edgeTokens: null,
      briefCloud: null,
      answerCloud: null,
    });
    save(sources);

    // 自动重算：只在开关打开且配置了模型时触发；1.5s 内的连续添加会合并成一次
    if (get().autoRecompute && isConfigured(loadConfig())) {
      if (autoTimer) clearTimeout(autoTimer);
      autoTimer = setTimeout(() => {
        autoTimer = null;
        void get().refreshEdges();
      }, 1500);
    }

    return source.id;
  },

  setIntent: (id, intent) => {
    const sources = get().sources.map((source) =>
      source.id === id ? { ...source, intent: intent.trim() || undefined } : source,
    );
    set({ sources });
    save(sources);
  },

  removeSource: (id) => {
    const sources = get().sources.filter((source) => source.id !== id);
    clearSavedEdges();
    const conflicts = get().conflicts.filter((c) => c.aId !== id && c.bId !== id);
    saveConflicts(conflicts);
    set({
      sources,
      conflicts,
      selectedId: get().selectedId === id ? null : get().selectedId,
      edges: buildGraph(sources).edges,
      edgeSource: "local",
      edgeStatus: "idle",
      edgeError: null,
      edgeTokens: null,
    });
    save(sources);
  },

  refreshEdges: async () => {
    const { sources } = get();
    if (sources.length < 2) return;

    set({ edgeStatus: "loading", edgeError: null });
    try {
      const { edges, tokens } = await requestRelations(sources);
      const conflicts = deriveConflicts(edges, get().conflicts);
      saveConflicts(conflicts);
      saveEdges(sources, edges, tokens);
      set({
        edges,
        conflicts,
        edgeSource: "cloud",
        edgeSavedAt: Date.now(),
        edgeStatus: "idle",
        edgeError: null,
        edgeTokens: tokens,
      });
    } catch (error) {
      // 失败时保留本地结果，不要把图清空
      clearSavedEdges();
      set({
        edges: buildGraph(sources).edges,
        edgeSource: "local",
        edgeSavedAt: null,
        edgeStatus: "error",
        edgeError: error instanceof Error ? error.message : "云端分析失败",
      });
    }
  },

  generateBriefSummary: async () => {
    const { sources } = get();
    if (sources.length === 0) return;

    set({ briefStatus: "loading", briefError: null });
    try {
      const result = await generateBrief(sources);
      set({ briefCloud: result, briefStatus: "idle", briefError: null });
    } catch (error) {
      set({
        briefStatus: "error",
        briefError: error instanceof Error ? error.message : "生成失败",
      });
    }
  },

  generateCloudAnswer: async () => {
    const { answer, sources } = get();
    if (!answer || answer.empty) return;

    const picked = answer.citations
      .map((citation) => sources.find((source) => source.id === citation.sourceId))
      .filter((source): source is Source => Boolean(source));

    // 检索完全没命中时仍然可以问：此时全部内容都会落在「库外补充」里
    if (picked.length === 0 && !answer.empty) return;

    set({ answerStatus: "loading", answerError: null });
    try {
      const result = await generateAnswer(get().question, picked);
      const split = splitAnswer(result.text);
      set({
        answerCloud: { ...result, text: split.grounded, extra: split.extra },
        answerStatus: "idle",
        answerError: null,
      });
    } catch (error) {
      set({
        answerStatus: "error",
        answerError: error instanceof Error ? error.message : "生成失败",
      });
    }
  },

  loadServerCloud: async () => {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        features?: { cloud?: { relations?: boolean; generate?: boolean; vision?: boolean } };
      };
      const cloud = data.features?.cloud;
      if (!cloud) return;

      set({
        serverCloud: {
          relations: Boolean(cloud.relations),
          generate: Boolean(cloud.generate),
          vision: Boolean(cloud.vision),
        },
      });
    } catch {
      /* 离线时保持 null，退回纯本地模式 */
    }
  },

  setShowReset: (value) => {
    set({ showReset: value });
    try {
      localStorage.setItem(SHOW_RESET_KEY, value ? "1" : "0");
    } catch {
      /* ignore */
    }
  },

  setAutoRecompute: (value) => {
    set({ autoRecompute: value });
    try {
      localStorage.setItem(AUTO_KEY, value ? "1" : "0");
    } catch {
      /* ignore */
    }
  },

  resolveConflict: (id, resolution, note) => {
    const trimmed = note.trim();
    // 没写判断就不许关闭——这是「逼你输出」的硬约束
    if (trimmed.length < 6) return;

    const conflict = get().conflicts.find((item) => item.id === id);
    if (!conflict) return;

    const conflicts = get().conflicts.map((item) =>
      item.id === id
        ? {
            ...item,
            status: "resolved" as const,
            resolution,
            note: trimmed,
            resolvedAt: Date.now(),
          }
        : item,
    );

    const { aId, bId } = conflict;
    const pair = [aId, bId];

    // 每次都从干净状态重新判定，允许「重来一次」改判
    const sources = get().sources.map((source) => {
      if (!pair.includes(source.id)) return source;

      const cleaned = { ...source };
      delete cleaned.supersededBy;
      delete cleaned.absorbedBy;
      delete cleaned.disputesWith;
      cleaned.absorbed = (cleaned.absorbed ?? []).filter((item) => !pair.includes(item));
      if (cleaned.absorbed.length === 0) delete cleaned.absorbed;

      const partner = source.id === aId ? bId : aId;

      if (resolution === "both") {
        return { ...cleaned, disputesWith: [partner] };
      }

      // 采纳某一方：另一方被「打包并入」，而不是删除
      const adopted = resolution === "a" ? aId : bId;
      const absorbed = resolution === "a" ? bId : aId;

      if (source.id === absorbed) {
        return { ...cleaned, supersededBy: adopted, absorbedBy: adopted };
      }

      return { ...cleaned, absorbed: [...(cleaned.absorbed ?? []), absorbed] };
    });

    set({ conflicts, sources });
    saveConflicts(conflicts);
    save(sources);
  },

  reset: () => {
    const sources = seedSources();
    clearSavedEdges();
    try {
      localStorage.setItem(SEED_KEY, String(SEED_VERSION));
    } catch {
      /* ignore */
    }
    saveConflicts([]);
    set({
      sources,
      conflicts: [],
      selectedId: null,
      answer: null,
      query: "",
      goal: "",
      edges: buildGraph(sources).edges,
      edgeSource: "local",
      edgeStatus: "idle",
      edgeError: null,
      edgeTokens: null,
    });
    save(sources);
  },
}));
