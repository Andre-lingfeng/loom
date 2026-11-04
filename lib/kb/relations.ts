import type { EdgeLevel, GraphEdge, RelationKind } from "./graph";
import { loadConfig } from "./llm";
import type { Source } from "./types";

const levelOf = (strength: number): EdgeLevel =>
  strength >= 0.7 ? "strong" : strength >= 0.45 ? "mid" : "weak";

interface ApiRelation {
  source: string;
  target: string;
  kind: string;
  strength: number;
  reason: string;
}

/**
 * 云端建联：把素材交给模型，拿回带类型与理由的关系。
 * 不使用本地算法兜底——调用方负责在失败时回退。
 */
export async function requestRelations(
  sources: Source[],
): Promise<{ edges: GraphEdge[]; tokens: number | null }> {
  const config = loadConfig();
  const response = await fetch("/api/relations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sources: sources.map((source) => ({
        id: source.id,
        title: source.title,
        text: source.text.slice(0, 800),
      })),
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
    }),
  });

  const data = (await response.json()) as {
    relations?: ApiRelation[];
    tokens?: number | null;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error ?? "云端分析失败");
  }

  const edges: GraphEdge[] = (data.relations ?? []).map((relation) => ({
    source: relation.source,
    target: relation.target,
    strength: relation.strength,
    level: levelOf(relation.strength),
    kind: relation.kind as RelationKind,
    reason: relation.reason,
    shared: [],
  }));

  return { edges, tokens: data.tokens ?? null };
}
