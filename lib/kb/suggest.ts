import { loadConfig } from "./llm";

export interface SuggestedSource {
  title: string;
  url: string;
  reason: string;
}

/**
 * 让模型推荐能补上这个缺口的材料。
 * 只返回「材料建议」，是否入库由用户决定。
 */
export async function suggestSources(
  question: string,
): Promise<{ suggestions: SuggestedSource[]; tokens: number | null }> {
  const config = loadConfig();

  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      task: "suggest",
      question,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
    }),
  });

  const data = (await response.json()) as {
    suggestions?: SuggestedSource[];
    tokens?: number | null;
    error?: string;
  };

  if (!response.ok || !data.suggestions) {
    throw new Error(data.error ?? "没能给出材料建议");
  }

  return { suggestions: data.suggestions, tokens: data.tokens ?? null };
}
