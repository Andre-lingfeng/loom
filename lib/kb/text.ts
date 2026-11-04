/**
 * 中文检索的最小实现：不引入分词库。
 * 策略：英文按词、中文按二元组（bigram），用 IDF 加权，外加短语命中加成。
 * 对 10–100 条素材的题库规模足够，且完全可解释（便于答辩讲清楚）。
 */
const STOP = new Set([
  "的是",
  "我们",
  "一个",
  "这个",
  "可以",
  "就是",
  "以及",
  "但是",
  "因为",
  "所以",
  "没有",
  "不是",
  "已经",
  "还是",
  "这些",
  "那些",
  "什么",
  "如何",
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
]);

export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const words = lower.match(/[a-z][a-z0-9-]{1,}/g) ?? [];
  const han = lower.match(/[\u4e00-\u9fa5]+/g) ?? [];

  const bigrams: string[] = [];
  for (const segment of han) {
    for (let i = 0; i < segment.length - 1; i += 1) {
      bigrams.push(segment.slice(i, i + 2));
    }
  }

  return [...words, ...bigrams].filter((token) => !STOP.has(token));
}

export function chunkText(text: string, size = 260, overlap = 40): string[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buffer = "";

  const flush = () => {
    if (!buffer.trim()) return;
    chunks.push(buffer.trim());
    buffer = buffer.slice(Math.max(0, buffer.length - overlap));
  };

  for (const paragraph of paragraphs) {
    if ((buffer + paragraph).length > size) flush();
    buffer += (buffer ? "\n" : "") + paragraph;
    while (buffer.length > size * 1.6) flush();
  }
  if (buffer.trim()) chunks.push(buffer.trim());

  return chunks.length > 0 ? chunks : [text.slice(0, size)];
}

/** 取包含命中的一句作为引用片段 */
export function snippetOf(text: string, tokens: string[], width = 110): string {
  const sentences = text.split(/(?<=[。！？；\n])/).filter((s) => s.trim());
  const hit = sentences.find((s) => tokens.some((t) => s.toLowerCase().includes(t)));
  const picked = (hit ?? sentences[0] ?? text).trim();
  return picked.length > width ? `${picked.slice(0, width)}…` : picked;
}

export interface Ranked {
  sourceId: string;
  score: number;
  /** 命中了几个不同的查询词 */
  hits: number;
  snippet: string;
}

export function rank(
  query: string,
  docs: { id: string; title: string; text: string }[],
): Ranked[] {
  // 用「短语切分」而不是二元组：避免「地的 / 率高 / 有哪」这类碎片制造假命中
  const rawTerms = extractTerms(query, 8).map((term) => term.toLowerCase());
  if (rawTerms.length === 0 || docs.length === 0) return [];

  const haystacks = docs.map((doc) =>
    `${doc.title}\n${doc.text}`.toLowerCase(),
  );
  const total = docs.length;

  // 词根回退：多字词精确匹配不到时，退到 3 字 / 2 字前缀（「成本优势」→「成本」）
  const resolve = (term: string) => {
    if (haystacks.some((haystack) => haystack.includes(term))) return term;
    for (const size of [3, 2]) {
      if (term.length <= size) continue;
      const prefix = term.slice(0, size);
      if (haystacks.some((haystack) => haystack.includes(prefix))) return prefix;
    }
    return term;
  };

  const terms = [...new Set(rawTerms.map(resolve))];

  const df = terms.map(
    (term) => haystacks.filter((haystack) => haystack.includes(term)).length,
  );

  const results: Ranked[] = [];

  docs.forEach((doc, index) => {
    const haystack = haystacks[index];
    let hits = 0;
    let score = 0;

    terms.forEach((term, termIndex) => {
      const at = haystack.indexOf(term);
      if (at < 0) return;
      hits += 1;
      const count = haystack.split(term).length - 1;
      const idf = Math.log(1 + total / Math.max(df[termIndex], 1));
      score += (1 + Math.log(count)) * idf;
    });

    if (hits === 0) return;

    if (terms.some((term) => doc.title.toLowerCase().includes(term))) {
      score *= 1.3;
    }
    // 只命中 1/6 个词的文档不该排在前面
    score *= hits / terms.length;

    results.push({
      sourceId: doc.id,
      score,
      hits,
      snippet: snippetOf(doc.text, terms),
    });
  });

  return results.sort((a, b) => b.hits - a.hits || b.score - a.score);
}

/** 功能词：拆目标时最容易被当成「论点」的垃圾词 */
const FUNCTION_WORDS = new Set([
  "写一",
  "一篇",
  "一段",
  "重点",
  "主要",
  "关于",
  "对于",
  "如何",
  "怎么",
  "我要",
  "我想",
  "需要",
  "进行",
  "通过",
  "使用",
  "实现",
  "包含",
  "包括",
  "以及",
  "并且",
  "但是",
  "所以",
  "因为",
  "如果",
  "就是",
  "已经",
  "还是",
  "没有",
  "不是",
  "可以",
  "这个",
  "那个",
]);

/** 以这些字开头的二元组几乎都是动词/虚词碎片 */
const FUNCTION_START = new Set(
  "的一是在有对为从到及等这那我你他它们把给让用做查找着过请帮想看讲说写要会能就也都很更又再还些比".split(""),
);

/** 出现在词尾几乎一定是副词/助词，剥掉才露出真正的关键词 */
const TRAILING = new Set("真很更都也还就又再最太挺地得着过".split(""));

/** 整词无意义，直接丢弃 */
const USELESS = new Set([
  "关于", "一篇", "什么", "什么样", "怎么", "怎样", "如何", "哪些", "这个", "那个",
  "以及", "说明", "需要", "可以", "应该", "我们", "你们", "他们", "一些", "这样",
  "那样", "通过", "进行", "相关", "主要", "目前", "现在", "然后", "因为", "所以",
  "如果", "但是", "同时", "其中", "以上", "以下", "例如", "比如", "之类", "等等",
]);

/**
 * 中文切词（无词典版）：用虚词与高频动词做分隔符，把句子切成短语块。
 * 比二元组靠谱得多——「落地现状的综述」会切成「落地现状 / 综述」，
 * 而不是「地现 / 现状 / 状的」这种碎片。
 */
const DELIMITERS = new Set(
  "的了和与及或在对为从到把被让给将就都也还又很更最之其此该等且则乃并而讲说写做看查找想要谈评论述介绍分析有哪吗呢吧啊呀啥怎高低多少是些什么篇个条种次位何里".split(
    "",
  ),
);

function extractTerms(text: string, limit: number): string[] {
  const terms: string[] = [];

  for (const word of text.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? []) {
    if (!FUNCTION_WORDS.has(word)) terms.push(word);
  }

  for (const run of text.match(/[\u4e00-\u9fa5]+/g) ?? []) {
    let buffer = "";
    const flush = () => {
      let segment = buffer;
      buffer = "";

      // 先剥掉「关于 / 整理 / 一份」这类不承载语义的前缀
      let stripped = true;
      while (stripped) {
        stripped = false;
        for (const prefix of ["关于", "对于", "整理", "一份", "一篇", "一个", "一些", "比较", "以及"]) {
          if (segment.startsWith(prefix)) {
            segment = segment.slice(prefix.length);
            stripped = true;
          }
        }
      }

      while (segment.length > 0 && FUNCTION_START.has(segment[0])) {
        segment = segment.slice(1);
      }
      while (segment.length > 0 && TRAILING.has(segment[segment.length - 1])) {
        segment = segment.slice(0, -1);
      }

      if (segment.length < 2) return;
      if (FUNCTION_WORDS.has(segment) || USELESS.has(segment)) return;
      terms.push(segment);
    };
    for (const char of run) {
      if (DELIMITERS.has(char)) flush();
      else buffer += char;
    }
    flush();
  }

  return [...new Set(terms)].slice(0, limit);
}

/** 从一段文本里抽关键词（用于缺口检测的目标拆解，无 LLM 版本） */
export function keywords(text: string, limit = 8): string[] {
  return extractTerms(text, limit);
}

export function summarize(text: string, limit = 3): string {
  const sentences = text
    .split(/(?<=[。！？\n])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
  return sentences.slice(0, limit).join("");
}

export function estimateTags(title: string, text: string): string[] {
  const pool = keywords(`${title} ${text}`, 24);
  const preferred = [
    "agent",
    "rag",
    "mcp",
    "成本",
    "失败",
    "架构",
    "评测",
    "知识管理",
    "模型",
    "检索",
    "协议",
    "长上下文",
  ];
  const picked = pool.filter((token) =>
    preferred.some((word) => token.includes(word)),
  );
  return [...new Set(picked)].slice(0, 4);
}
