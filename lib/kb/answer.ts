import { chunkText, rank, snippetOf, tokenize } from "./text.ts";
import type { Answer, Citation, Source } from "./types";

/**
 * MVP 的"回答"是**抽取式**的：不生成新句子，只把最相关的原文片段按主题拼起来，并强制标注出处。
 * 这样做的两个理由：
 *  1. 没有模型也能演示完整交互（引用、溯源、空结果引导）
 *  2. 引用式回答本身就是评分点（防幻觉）；接模型后只需把这段替换成 streamText
 */
export function answerQuery(question: string, sources: Source[]): Answer {
  // 冲突处理时被判定「已被取代」的素材不参与回答，让判断真正生效
  const usable = sources.filter((source) => !source.supersededBy && !source.absorbedBy);
  const pool = usable.length > 0 ? usable : sources;

  // 稀有词：只在 1–2 条素材里出现的词，通常是专有名词（METR、Copilot）。
  // 它们往往只命中一次，却是提问的核心，不能因为「命中数不足 2」被整条丢掉。
  const tokens = tokenize(question);
  const rareTokens = tokens.filter((token) => {
    const owners = pool.filter((source) =>
      `${source.title} ${source.text}`.toLowerCase().includes(token),
    ).length;
    return owners > 0 && owners <= 2;
  });

  const scored = rank(question, pool);
  const topScore = scored[0]?.score ?? 0;

  const hasRareHit = (sourceId: string) => {
    const source = pool.find((entry) => entry.id === sourceId);
    if (!source) return false;
    const haystack = `${source.title} ${source.text}`.toLowerCase();
    return rareTokens.some((token) => haystack.includes(token));
  };

  // 命中至少 2 个词，或命中一个稀有词；同时分数不低于榜首 45%
  const strong = scored.filter(
    (item) =>
      (item.hits >= 2 || hasRareHit(item.sourceId)) &&
      item.score >= topScore * 0.45,
  );
  const base = (strong.length > 0 ? strong : scored.slice(0, 1)).slice(0, 3);

  // 如果命中的素材存在「已确认的分歧」，把对立面也拉进来——
  // 问的正好是有争议的话题时，只给一面之词比不给答案更危险
  const ranked = [...base];
  for (const item of base) {
    const source = pool.find((entry) => entry.id === item.sourceId);
    for (const otherId of source?.disputesWith ?? []) {
      if (ranked.some((entry) => entry.sourceId === otherId)) continue;
      const other = scored.find((entry) => entry.sourceId === otherId);
      if (other) ranked.push(other);
    }
  }
  ranked.splice(4);

  if (ranked.length === 0) {
    return { text: "", citations: [], empty: true };
  }

  const citations: Citation[] = [];

  // 已确认并存的素材：若同时被引用，回答必须先声明分歧，不能缝成一个结论
  const pickedIds = ranked.map((item) => item.sourceId);
  const disputed: string[] = [];
  const seenPairs = new Set<string>();
  const short = (title: string) =>
    title.length > 18 ? `${title.slice(0, 18)}…` : title;

  for (const id of pickedIds) {
    const source = pool.find((item) => item.id === id);
    if (!source?.disputesWith) continue;
    for (const otherId of source.disputesWith) {
      if (!pickedIds.includes(otherId)) continue;

      // 分歧是双向登记的，同一对只提醒一次
      const pairKey = [id, otherId].sort().join("|");
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      const other = pool.find((item) => item.id === otherId);
      if (!other) continue;
      disputed.push(`「${short(source.title)}」↔「${short(other.title)}」`);
    }
  }

  const lines = ranked.map((item, index) => {
    const source = sources.find((s) => s.id === item.sourceId);
    if (!source) return "";

    const chunks = chunkText(source.text);
    const best =
      chunks
        .map((chunk) => ({
          chunk,
          hit: tokens.filter((token) => chunk.toLowerCase().includes(token)).length,
        }))
        .sort((a, b) => b.hit - a.hit)[0]?.chunk ?? source.text;

    const snippet = snippetOf(best, tokens, 120);
    citations.push({
      index: index + 1,
      sourceId: source.id,
      title: source.title,
      snippet,
    });

    return `[${index + 1}] 《${source.title}》\n${snippet}`;
  });

  const uniqueCaution = [...new Set(disputed)];
  const caution =
    uniqueCaution.length > 0
      ? [
          `⚠️ 注意：下面的素材里存在已确认的分歧（${uniqueCaution.join("；")}），`,
          "两种说法不能同时成立，请分别引用、不要合并成一个结论。",
          "",
        ].join("")
      : "";

  const text = [
    caution + `根据库里的 ${ranked.length} 条素材：`,
    "",
    ...lines,
  ].join("\n");

  return { text, citations };
}
