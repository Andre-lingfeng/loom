import { keywords } from "./text";
import type { GapReport, GapTerm, Source } from "./types";

/**
 * 缺口检测（MVP 无 LLM 版）：把写作目标拆成词块，逐个查库内覆盖度。
 *
 * 两个真实性保障：
 *  1. 切词用虚词/动词做分隔符，产出的是「落地现状 / 成本 / 失败率」这类短语，不是二元组碎片
 *  2. 多字词做词根回退（「落地现状」→「落地」），避免「库里明明有却说没有」
 *
 * 接模型后：把关键词换成模型拆出的「必备论点」（可做同义归并），接口不变。
 */
export function analyzeGaps(goal: string, sources: Source[]): GapReport {
  const terms = keywords(goal, 6);
  const docs = sources.map((source) => ({
    id: source.id,
    haystack: `${source.title}\n${source.text}`.toLowerCase(),
  }));

  const match = (term: string) => {
    const variants = new Set([term.toLowerCase()]);
    // 词根回退：4 字以上的短语，退到前 2–3 字再试一次
    if (term.length >= 4) {
      variants.add(term.slice(0, 3).toLowerCase());
      variants.add(term.slice(0, 2).toLowerCase());
    } else if (term.length === 3) {
      variants.add(term.slice(0, 2).toLowerCase());
    }
    return docs.filter((doc) =>
      [...variants].some((variant) => doc.haystack.includes(variant)),
    );
  };

  const rows: GapTerm[] = terms.map((term) => {
    const hits = match(term);
    const count = hits.length;
    return {
      term,
      count,
      sourceIds: hits.map((doc) => doc.id),
      level: count >= 3 ? "ok" : count >= 1 ? "weak" : "missing",
    };
  });

  const ok = rows.filter((row) => row.level === "ok").length;
  const missing = rows.filter((row) => row.level === "missing").length;
  const weak = rows.filter((row) => row.level === "weak").length;

  const coverage = rows.length === 0 ? 0 : Math.round((ok / rows.length) * 100);

  let verdict: string;
  if (rows.length === 0) {
    verdict = "先写一句你要写的东西，我再告诉你库里缺什么。";
  } else if (missing > 0) {
    verdict = `还缺 ${missing} 个方向的证据（${rows
      .filter((row) => row.level === "missing")
      .map((row) => row.term)
      .join("、")}），现在动笔会写空。`;
  } else if (weak > 0) {
    verdict = `没有空白，但有 ${weak} 处只有单一来源，论据偏薄，建议再补一条对照材料。`;
  } else {
    verdict = "证据齐了，可以开始写提纲了。";
  }

  return {
    goal,
    terms: rows.sort((a, b) => a.count - b.count),
    coverage,
    verdict,
  };
}
