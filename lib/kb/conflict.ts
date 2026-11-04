import { loadConfig } from "./llm";
import type { Source } from "./types";

export interface ConflictAnalysis {
  substance: string;
  difference: string;
  question: string;
  tokens: number | null;
}

/**
 * 冲突分析：让模型说清两条素材到底在争什么，以及该问自己什么问题。
 * 它只描述分歧，不替用户选边——采纳哪一条仍由用户决定。
 */
export async function analyzeConflict(
  a: Source,
  b: Source,
  reason: string,
): Promise<ConflictAnalysis> {
  const config = loadConfig();
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      task: "conflict",
      question: reason,
      sources: [
        { id: a.id, title: a.title, text: a.text.slice(0, 700) },
        { id: b.id, title: b.title, text: b.text.slice(0, 700) },
      ],
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
    }),
  });

  const data = (await response.json()) as {
    substance?: string;
    difference?: string;
    question?: string;
    tokens?: number | null;
    error?: string;
  };

  if (!response.ok || !data.substance) {
    throw new Error(data.error ?? "模型没有给出分析，稍后再试");
  }

  return {
    substance: data.substance,
    difference: data.difference ?? "",
    question: data.question ?? "",
    tokens: data.tokens ?? null,
  };
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

/** 就这对矛盾继续追问：带上两份材料、已有分析和对话历史 */
export async function askAboutConflict(
  a: Source,
  b: Source,
  analysis: ConflictAnalysis,
  history: ChatTurn[],
  question: string,
): Promise<string> {
  const config = loadConfig();
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      task: "discuss",
      question,
      notes: [
        `分歧实质：${analysis.substance}`,
        analysis.difference ? `分歧性质：${analysis.difference}` : "",
        analysis.question ? `建议自问：${analysis.question}` : "",
      ].filter(Boolean),
      history,
      sources: [
        { id: a.id, title: a.title, text: a.text.slice(0, 700) },
        { id: b.id, title: b.title, text: b.text.slice(0, 700) },
      ],
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
    }),
  });

  const data = (await response.json()) as { text?: string; error?: string };
  if (!response.ok || !data.text) {
    throw new Error(data.error ?? "追问失败，稍后再试");
  }
  return data.text;
}
