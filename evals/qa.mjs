/**
 * 问答质量抽测：4 个问题，覆盖「库内可答 / 库内不可答 / 跨材料综合」。
 * 直接调用线上 /api/generate（task=answer），把结果打印出来人工判定。
 */
const ENDPOINT = process.env.EVAL_ENDPOINT ?? "http://127.0.0.1:3000/api/generate";

const CASES = [
  {
    name: "A 库内可答（矛盾对比）",
    question: "Copilot 和 METR 的实验结论为什么相反？",
    sources: [
      { id: "a1", title: "GitHub Copilot 对照实验", text: "受控实验中，使用 Copilot 的任务完成时间比对照组缩短 55.8%。" },
      { id: "a2", title: "METR 随机对照实验", text: "资深开源开发者在真实仓库任务中使用 AI 工具，完成时间反而增加 19%。" },
    ],
    expect: "应引用 [1][2] 并指出实验条件不同",
  },
  {
    name: "B 库内可答（单材料）",
    question: "检索增强生成的主要收益是什么？",
    sources: [
      { id: "d1", title: "RAG 原始论文", text: "检索增强生成在知识密集型任务上显著优于纯参数化模型，并让引用出处成为可能。" },
    ],
    expect: "应引用 [1]，不应编造论文外的数据",
  },
  {
    name: "C 库内不可答",
    question: "Transformer 自注意力的计算复杂度是多少？",
    sources: [
      { id: "a1", title: "GitHub Copilot 对照实验", text: "受控实验中任务完成时间缩短 55.8%。" },
      { id: "a2", title: "METR 随机对照实验", text: "资深开发者使用 AI 反而慢 19%。" },
    ],
    expect: "库中依据应说明没有相关材料，复杂度信息只能出现在库外补充",
  },
  {
    name: "D 跨材料综合",
    question: "长上下文真的能替代 RAG 吗？",
    sources: [
      { id: "b1", title: "Lost in the Middle", text: "长上下文模型对中间位置信息利用率下降，即使窗口足够。" },
      { id: "b2", title: "长上下文够用论", text: "单文档单次任务下，全文入上下文足以替代 RAG。" },
      { id: "f4", title: "长上下文的成本", text: "批量检索场景下，长上下文推理成本明显高于向量检索加片段注入。" },
    ],
    expect: "应分述两种立场与成本差异，不合并成单一结论",
  },
];

const startedAt = Date.now();

for (const item of CASES) {
  const t0 = Date.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      task: "answer",
      question: item.question,
      sources: item.sources,
    }),
  });
  const data = await res.json();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\n=== ${item.name} ===`);
  console.log(`问题：${item.question}`);
  console.log(`期望：${item.expect}`);
  console.log(`耗时：${elapsed}s · tokens：${data.tokens ?? "?"}`);

  if (!res.ok) {
    console.log(`失败：${data.error}`);
    continue;
  }

  const text = String(data.text ?? "");
  const hasCitation = /\[\d\]/.test(text);
  const hasGround = text.includes("库中依据");
  const hasExtra = text.includes("库外补充");
  console.log(`引用编号：${hasCitation ? "有" : "无"} · 两段结构：${hasGround && hasExtra ? "有" : "无"}`);
  console.log("--- 输出 ---");
  console.log(text.slice(0, 700));
}

console.log(`\n总耗时：${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
