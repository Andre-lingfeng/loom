/**
 * 数据备份：把浏览器里的素材、冲突、关系打包成一个 JSON 文件。
 * 不包含模型 Key —— 备份文件可能被转发，密钥不该跟着走。
 */
import type { Conflict, Source } from "./types";

const KEYS = {
  sources: "loom.kb.v1",
  conflicts: "loom.conflicts.v1",
  edges: "loom.edges.v1",
  seed: "loom.seedVersion",
} as const;

export interface BackupFile {
  format: "loom-backup";
  version: 1;
  exportedAt: string;
  counts: { sources: number; conflicts: number };
  sources: Source[];
  conflicts: Conflict[];
  edges: unknown;
}

export function buildBackup(): BackupFile {
  const read = <T,>(key: string, fallback: T): T => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };

  const sources = read<Source[]>(KEYS.sources, []);
  const conflicts = read<Conflict[]>(KEYS.conflicts, []);
  const edges = read<unknown>(KEYS.edges, null);

  return {
    format: "loom-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    counts: { sources: sources.length, conflicts: conflicts.length },
    sources,
    conflicts,
    edges,
  };
}

/** 触发下载；文件名带日期，方便区分多次备份 */
export function downloadBackup() {
  const backup = buildBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);

  const link = document.createElement("a");
  link.href = url;
  link.download = `loom-backup-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // 交给浏览器下载后释放
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return backup.counts;
}

export interface ImportResult {
  sources: number;
  conflicts: number;
  skipped: number;
}

/** 导入前严格校验：宁可不导，也不要把坏数据写进库 */
export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("文件不是合法的 JSON");
  }

  const file = data as Partial<BackupFile>;
  if (file.format !== "loom-backup") {
    throw new Error("这不是织识的备份文件");
  }
  if (!Array.isArray(file.sources)) {
    throw new Error("备份文件缺少素材列表");
  }

  return {
    format: "loom-backup",
    version: 1,
    exportedAt: typeof file.exportedAt === "string" ? file.exportedAt : "",
    counts: {
      sources: file.sources.length,
      conflicts: Array.isArray(file.conflicts) ? file.conflicts.length : 0,
    },
    sources: file.sources,
    conflicts: Array.isArray(file.conflicts) ? file.conflicts : [],
    edges: file.edges ?? null,
  };
}

/**
 * 合并导入：按 id 去重，已存在的素材保持不动。
 * 返回实际写入的数量，方便提示「导入了多少、跳过多少」。
 */
export function applyBackup(backup: BackupFile): ImportResult {
  const existing = (() => {
    try {
      return JSON.parse(localStorage.getItem(KEYS.sources) ?? "[]") as Source[];
    } catch {
      return [] as Source[];
    }
  })();

  const byId = new Map(existing.map((item) => [item.id, item]));
  let skipped = 0;

  for (const source of backup.sources) {
    // 只接受结构完整的条目，残缺数据直接跳过
    if (
      !source ||
      typeof source.id !== "string" ||
      typeof source.title !== "string" ||
      typeof source.text !== "string"
    ) {
      skipped += 1;
      continue;
    }
    if (byId.has(source.id)) {
      skipped += 1;
      continue;
    }
    byId.set(source.id, source);
  }

  const sources = [...byId.values()];
  localStorage.setItem(KEYS.sources, JSON.stringify(sources));

  const conflicts = (() => {
    try {
      return JSON.parse(localStorage.getItem(KEYS.conflicts) ?? "[]") as Conflict[];
    } catch {
      return [] as Conflict[];
    }
  })();

  const conflictIds = new Set(conflicts.map((item) => item.id));
  const merged = [...conflicts];
  for (const conflict of backup.conflicts) {
    if (!conflict || typeof conflict.id !== "string" || conflictIds.has(conflict.id)) continue;
    conflictIds.add(conflict.id);
    merged.push(conflict);
  }
  localStorage.setItem(KEYS.conflicts, JSON.stringify(merged));

  return {
    sources: sources.length - existing.length,
    conflicts: merged.length - conflicts.length,
    skipped,
  };
}
