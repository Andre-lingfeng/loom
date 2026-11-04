import type { Source } from "./types";

const DAY = 86_400_000;

export interface Brief {
  newToday: Source[];
  backlog: Source[];
  stale: Source[];
  thinTopics: { tag: string; count: number }[];
  headline: string;
}

export function buildBrief(sources: Source[]): Brief {
  const now = Date.now();
  const newToday = sources.filter((source) => now - source.createdAt < DAY);
  const backlog = sources.filter((source) => !source.intent);
  const stale = sources.filter((source) => now - source.openedAt > 7 * DAY);

  const tagCount = new Map<string, number>();
  for (const source of sources) {
    for (const tag of source.tags) tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
  }
  const thinTopics = [...tagCount.entries()]
    .filter(([, count]) => count === 1)
    .map(([tag, count]) => ({ tag, count }))
    .slice(0, 4);

  const parts: string[] = [];
  if (backlog.length > 0) parts.push(`${backlog.length} 条还没消化`);
  if (newToday.length > 0) parts.push(`今天新增 ${newToday.length} 条`);
  if (stale.length > 0) parts.push(`${stale.length} 条超过 7 天没打开`);

  const headline =
    parts.length === 0
      ? "库里很干净，可以开始写了。"
      : `${parts.join("，")}。`;

  return { newToday, backlog, stale, thinTopics, headline };
}
