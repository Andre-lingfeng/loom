import { loadConfig } from "./llm";
import type { Source } from "./types";

export interface IntentSuggestion {
  understand: string;
  intents: string[];
  tokens: number | null;
}

/**
 * 收件箱的「模型辅助」：让模型读懂这条素材，给出几个可能的收藏理由。
 * 只给候选，不替用户下结论——用户仍要自己选一句或改写后再确认。
 */
export async function suggestIntents(source: Source): Promise<IntentSuggestion> {
  const config = loadConfig();
  if (!config.apiKey) {
    throw new Error("还没配置模型，先去「模型接入」填一个 Key");
  }

  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      task: "intent",
      question: "这条材料为什么值得收藏？",
      sources: [
        {
          id: source.id,
          title: source.title,
          text: [source.summary, source.text.slice(0, 800)].filter(Boolean).join("\n"),
        },
      ],
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
    }),
  });

  const data = (await response.json()) as {
    understand?: string;
    intents?: string[];
    tokens?: number | null;
    error?: string;
  };

  if (!response.ok || !data.intents || data.intents.length === 0) {
    throw new Error(data.error ?? "模型没有给出建议，稍后再试");
  }

  return {
    understand: data.understand ?? "",
    intents: data.intents,
    tokens: data.tokens ?? null,
  };
}

export interface AssistTurn {
  role: "user" | "assistant";
  text: string;
}

/** 就这条材料继续追问：带上材料本身、模型的理解和对话历史 */
export async function askAboutSource(
  source: Source,
  understand: string,
  history: AssistTurn[],
  question: string,
): Promise<string> {
  const config = loadConfig();
  if (!config.apiKey) {
    throw new Error("还没配置模型，先去「模型接入」填一个 Key");
  }

  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      task: "reflect",
      question,
      notes: understand ? [`模型对这条材料的理解：${understand}`] : [],
      history,
      sources: [
        {
          id: source.id,
          title: source.title,
          text: [source.summary, source.text.slice(0, 900)].filter(Boolean).join("\n"),
        },
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
