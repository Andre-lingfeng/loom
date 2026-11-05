/**
 * 关系判定评测：20 条人工设计素材，含已知矛盾、重复、支持与无关项。
 * 直接调用线上 /api/relations，统计准确率、耗时与 token。
 */
const ENDPOINT = process.env.EVAL_ENDPOINT ?? "http://127.0.0.1:3000/api/relations";
const RUNS = Number(process.env.EVAL_RUNS ?? 4);

/** 素材：id → { title, text } */
const SOURCES = [
  // A 组：已知矛盾（Copilot 提速 vs METR 变慢）
  ["a1", "GitHub Copilot 对照实验", "在受控实验中，使用 Copilot 的任务完成时间比对照组缩短 55.8%。样本是在线编程任务。"],
  ["a2", "METR 随机对照实验", "资深开源开发者在真实仓库任务中使用 AI 工具，完成时间反而增加 19%。"],

  // B 组：已知矛盾（长上下文能否替代 RAG）
  ["b1", "Lost in the Middle", "长上下文模型对位于中间位置的信息利用率显著下降，即使上下文窗口足够。检测其原文。"],
  ["b2", "长上下文够用论", "在单文档、单次任务的场景下，把全文放进上下文足以替代 RAG，RAG 会退化为成本优化手段。"],

  // C 组：同一份报告的两种表述（重复）
  ["c1", "MIT NANDA 报告", "约 95% 的企业生成式 AI 试点没有产生可衡量的损益影响。"],
  ["c2", "同一报告的补充说法", "该报告同时指出，只有约 5% 的试点带来了可测量的收益。"],

  // D 组：支持关系
  ["d1", "RAG 原始论文", "检索增强生成在知识密集型任务上显著优于纯参数化模型，并让引用出处成为可能。"],
  ["d2", "RAG 落地实践", "某团队接入检索增强后，客服问答的事实准确率提升，编造回答的比例下降。"],

  // E 组：学习方法的无关项（彼此之间不应被判为强关联）
  ["e1", "番茄工作法", "每 25 分钟专注工作后休息 5 分钟，四个循环后长休息一次。"],
  ["e2", "睡眠与记忆", "深睡阶段对陈述性记忆的巩固起关键作用，睡眠剥夺会削弱回忆表现。"],
  ["e3", "咖啡因代谢", "咖啡因在人体内的半衰期约为 5 小时，个体差异较大。"],
  ["e4", "康奈尔笔记法", "把页面分为线索、笔记、总结三栏，课后用线索栏自我提问。"],
  ["e5", "费曼技巧", "用尽量简单的语言把概念讲给外行，讲不通的地方就是理解的缺口。"],
  ["e6", "间隔重复", "把复习分散到多天进行，长期保持率显著优于集中突击。"],
  ["e7", "测试效应", "主动回忆比重复阅读更能提升长期记忆，测验本身就是学习。"],

  // F 组：工程类（相关性弱，用于测误报）
  ["f1", "MCP 协议", "模型上下文协议统一了 AI 助手与外部数据源的连接方式，替代每家自写的适配器。"],
  ["f2", "MCP 接入实践", "某公司把三个内部系统接入 MCP 后，工具调用的适配工作量从 N×M 降到 N+M。"],
  ["f3", "百万级上下文模型", "新一代模型把上下文窗口提升到 100 万 token，可直接放入整本书。"],
  ["f4", "长上下文的成本", "在批量检索场景下，长上下文方案的推理成本明显高于向量检索加片段注入。"],
  ["f5", "结构化输出经验", "要求模型只输出 JSON 并给出示例，能显著降低解析失败率。"],
];

/** 人工标注的真值：只标注确定成立的关系 */
const TRUTH = {
  contradicts: [
    ["a1", "a2"],
    ["b1", "b2"],
  ],
  duplicates: [["c1", "c2"]],
  supports: [
    ["d1", "d2"],
    ["e6", "e7"],
  ],
};

const key = (a, b) => [a, b].sort().join("|");
const truthPairs = new Set([
  ...TRUTH.contradicts.map(([a, b]) => key(a, b)),
  ...TRUTH.duplicates.map(([a, b]) => key(a, b)),
  ...TRUTH.supports.map(([a, b]) => key(a, b)),
]);

const sources = SOURCES.map(([id, title, text]) => ({ id, title, text }));

async function runOnce(index) {
  const startedAt = Date.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sources }),
  });
  const elapsed = Date.now() - startedAt;
  const data = await res.json();

  if (!res.ok) {
    console.log(`第 ${index + 1} 次失败：`, data.error);
    return null;
  }

  const relations = data.relations ?? [];
  return { relations, tokens: data.tokens ?? 0, elapsed };
}

const results = [];
for (let i = 0; i < RUNS; i++) {
  process.stdout.write(`第 ${i + 1}/${RUNS} 次…`);
  const r = await runOnce(i);
  if (r) {
    results.push(r);
    console.log(` ${r.relations.length} 条关系 · ${r.tokens} tokens · ${(r.elapsed / 1000).toFixed(1)}s`);
  } else {
    console.log(" 跳过");
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
}

if (results.length === 0) {
  console.error("全部失败");
  process.exit(1);
}

/* ---------------- 统计 ---------------- */
const avg = (list) => list.reduce((sum, v) => sum + v, 0) / list.length;

function evaluate(run) {
  const byKind = (kind) => run.relations.filter((r) => r.kind === kind);
  const contradicts = byKind("contradicts");
  const duplicates = byKind("duplicates");

  const contradictionHit = contradicts.filter((r) =>
    TRUTH.contradicts.some(([a, b]) => key(a, b) === key(r.source, r.target)),
  ).length;
  const duplicationHit = duplicates.filter((r) =>
    TRUTH.duplicates.some(([a, b]) => key(a, b) === key(r.source, r.target)),
  ).length;

  const labelledHits = run.relations.filter((r) => truthPairs.has(key(r.source, r.target))).length;
  const total = run.relations.length;

  return {
    total,
    contradicts: contradicts.length,
    contradictionHit,
    duplicationHit,
    precision: total ? labelledHits / total : 0,
    recallPairs: labelledHits / truthPairs.size,
    tokens: run.tokens,
    elapsed: run.elapsed,
  };
}

const evaluated = results.map(evaluate);

/** 关键指标：只看「必须有」和「绝不能有」的两类，未标注的 related 不计入对错 */
function strictMetrics(run) {
  const contradicts = run.relations.filter((r) => r.kind === "contradicts");
  const duplicates = run.relations.filter((r) => r.kind === "duplicates");

  const truthContradicts = new Set(TRUTH.contradicts.map(([a, b]) => key(a, b)));
  const truthDuplicates = new Set(TRUTH.duplicates.map(([a, b]) => key(a, b)));

  const hitContradicts = contradicts.filter((r) => truthContradicts.has(key(r.source, r.target))).length;
  const falseContradicts = contradicts.length - hitContradicts;
  const hitDuplicates = duplicates.filter((r) => truthDuplicates.has(key(r.source, r.target))).length;

  // E 组是七条互不相关的学习方法，它们之间不该出现强关联
  const groupE = new Set(["e1", "e2", "e3", "e4", "e5", "e6", "e7"]);
  const eCross = run.relations.filter((r) => groupE.has(r.source) && groupE.has(r.target));

  return {
    矛盾召回: hitContradicts,
    矛盾误报: falseContradicts,
    重复召回: hitDuplicates,
    E组误连: eCross.length,
    关系数: run.relations.length,
  };
}

const strict = results.map(strictMetrics);

const summary = {
  矛盾召回: `${avg(strict.map((e) => e.矛盾召回)).toFixed(1)} / 2`,
  矛盾误报: avg(strict.map((e) => e.矛盾误报)).toFixed(1),
  重复召回: `${avg(strict.map((e) => e.重复召回)).toFixed(1)} / 1`,
  "E组误连（7 条无关素材间）": avg(strict.map((e) => e.E组误连)).toFixed(1),
  平均关系数: avg(strict.map((e) => e.关系数)).toFixed(1),
  平均耗时: `${(avg(evaluated.map((e) => e.elapsed)) / 1000).toFixed(1)}s`,
  平均tokens: Math.round(avg(evaluated.map((e) => e.tokens))),
};

console.log("\n=== 汇总 ===");
for (const [k, v] of Object.entries(summary)) console.log(`${k}: ${v}`);

console.log("\n=== 每次明细 ===");
evaluated.forEach((e, i) => {
  console.log(
    `#${i + 1} 关系${e.total} 矛盾${e.contradicts} 精度${(e.precision * 100).toFixed(0)}% ` +
      `tokens${e.tokens} ${(e.elapsed / 1000).toFixed(1)}s`,
  );
});

/* 输出误判明细，便于写进报告 */
const last = results[results.length - 1];
const wrong = last.relations.filter((r) => !truthPairs.has(key(r.source, r.target)));
console.log("\n=== 最后一次的未标注关系（人工复核用）===");
for (const r of wrong.slice(0, 12)) {
  console.log(`[${r.kind}] ${r.source} ↔ ${r.target} · ${r.reason}`);
}
