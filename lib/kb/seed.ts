import type { Source } from "./types";

const HOUR = 3_600_000;

/**
 * 预置素材：全部为**真实公开材料**，标题、日期、链接均可核对。
 * 正文是按原文整理的中文摘要（含关键数字），不是逐字翻译；
 * 引用时请以链接原文为准。UI 中每条都显示来源链接。
 */
export function seedSources(): Source[] {
  const now = Date.now();
  const base = { openedAt: now - 2 * HOUR };

  return [
    {
      ...base,
      id: "s1",
      kind: "url",
      title: "MIT 报告：95% 的企业生成式 AI 试点没有可衡量回报",
      url: "https://fortune.com/2025/08/18/mit-report-95-percent-generative-ai-pilots-at-companies-failing-cfo/",
      createdAt: now - 3 * HOUR,
      intent: "写「Agent 落地现状」一节时要引用的反方数据",
      tags: ["agent", "落地", "失败率"],
      summary:
        "MIT NANDA 的《The GenAI Divide》调查了 150 位管理者、350 名员工和 300 个公开部署，结论是约 5% 的试点带来快速收入增长，其余 95% 基本没有可衡量的损益影响。",
      text: "MIT 媒体实验室 NANDA 计划的报告《The GenAI Divide: State of AI in Business 2025》（Fortune 2025 年 8 月 18 日报道）给出的核心结论是：企业生成式 AI 试点中，约 5% 实现了快速收入增长，其余 95% 没有产生可衡量的损益影响。\n\n研究方法包括 150 位企业领导者的访谈、350 名员工的问卷，以及对 300 个公开 AI 部署案例的分析。\n\n报告主笔 Aditya Challapally 的解释并不指向模型能力：跑出来的团队往往只挑一个痛点、执行到位，并与工具提供方形成配合；而多数项目试图一次性改造太多流程。\n\n报告原文的表述是「95% 的失败率是企业 AI 解决方案中 GenAI 鸿沟最清晰的体现」。",
    },
    {
      ...base,
      id: "s2",
      kind: "url",
      title: "Anthropic 开源 Model Context Protocol（2024-11-25）",
      url: "https://www.anthropic.com/news/model-context-protocol",
      createdAt: now - 6 * HOUR,
      intent: "解释「为什么工具接入突然标准化了」",
      tags: ["mcp", "协议", "工具"],
      summary:
        "MCP 是连接 AI 助手与数据源的开放标准，用一套协议替代「每个数据源各写一个连接器」的碎片化集成，早期采用者包括 Block、Apollo，开发工具方有 Zed、Replit 等。",
      text: "Anthropic 于 2024 年 11 月 25 日开源 Model Context Protocol（MCP），定位是「连接 AI 助手与数据所在系统」的通用开放标准，覆盖内容仓库、业务工具和开发环境。\n\n它要解决的问题写得很直白：模型能力在快速进步，但仍受限于与数据的隔离——数据被锁在信息孤岛和遗留系统里，每接一个新数据源就要写一套自定义实现，系统难以规模化。\n\nMCP 的做法是用一套协议同时定义服务端（暴露数据）与客户端（AI 应用），并配套提供规范、SDK、Claude Desktop 的本地服务端支持，以及一个开源的服务端仓库。\n\n早期采用者包括 Block 和 Apollo；开发工具侧有 Zed、Replit、Codeium、Sourcegraph 在接入。",
    },
    {
      ...base,
      id: "s3",
      kind: "url",
      title: "RAG 原始论文：检索增强生成（NeurIPS 2020）",
      url: "https://arxiv.org/abs/2005.11401",
      createdAt: now - 26 * HOUR,
      intent: "给「为什么要引用」找理论依据",
      tags: ["rag", "检索", "引用"],
      summary:
        "RAG 把参数化记忆（预训练模型）与非参数化记忆（稠密向量索引）结合，在三个开放域问答任务上取得当时最好结果，并让「给出处」成为可能。",
      text: "Lewis 等人的《Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks》2020 年 5 月提交，后被 NeurIPS 2020 接收。\n\n论文指出的两个痛点：预训练模型把事实知识存在参数里，但对知识的访问与精确操作能力有限；同时「为决策提供出处（provenance）」和「更新世界知识」仍是开放问题。\n\nRAG 的方案是混合记忆——参数化记忆用预训练的 seq2seq 模型，非参数化记忆用 Wikipedia 的稠密向量索引，再配一个预训练神经检索器。\n\n结果是在三个开放域问答任务上达到当时最好水平，超过纯参数化模型和任务专用的检索-抽取架构；生成任务上，RAG 的输出比纯参数化基线更具体、更多样、更符合事实。",
    },
    {
      ...base,
      id: "s4",
      kind: "url",
      title: "Lost in the Middle：长上下文模型并不擅长用中间信息（TACL 2023）",
      url: "https://arxiv.org/abs/2307.03172",
      createdAt: now - 30 * HOUR,
      intent: "和「长上下文足够用」的乐观说法对照",
      tags: ["长上下文", "检索", "评测"],
      summary:
        "在多文档问答和键值检索任务上，相关信息出现在输入开头或结尾时表现最好，落在中间时性能显著下降——即便是明确的长上下文模型。",
      text: "Liu 等人的《Lost in the Middle: How Language Models Use Long Contexts》2023 年 7 月提交，后被 TACL 2023 接收。\n\n论文的出发点是一个被忽略的问题：模型能接受长上下文输入，不代表它能用好长上下文。作者设计了两个需要「在输入中定位相关信息」的任务——多文档问答与键值检索。\n\n实验发现，仅仅改变相关信息在输入中的位置，性能就会显著变化：信息在开头或结尾时表现最好，必须访问长上下文中部时明显退化，而且在明确支持长上下文的模型上同样成立。\n\n作者的结论是，当前模型并不能稳健地利用长输入中的信息，这也给后续长上下文模型提供了新的评测协议。",
    },
    {
      ...base,
      id: "s5",
      kind: "url",
      title: "Gemini 1.5：百万级 token 上下文的多模态模型（2024）",
      url: "https://arxiv.org/abs/2403.05530",
      createdAt: now - 4 * 86_400_000,
      // 故意不写意图：用于演示「收件箱」的待消化状态
      tags: ["长上下文", "多模态", "gemini"],
      summary:
        "Google 的 Gemini 1.5 技术报告，主题是跨数百万 token 上下文的多模态理解，是「把整本书直接塞进上下文」这条路线的重要节点。",
      text: "Gemini Team 的《Gemini 1.5: Unlocking multimodal understanding across millions of tokens of context》2024 年 3 月首次提交，最新修订于 2024 年 12 月。\n\n报告的标题本身说明了方向：跨数百万 token 上下文的多模态理解能力——把长文档、长音视频直接作为上下文输入，而不是先切片检索再拼接。\n\n这条路线与 RAG 形成对照：RAG 假设「先检索再生成」，长上下文路线假设「上下文足够长就不必检索」。\n\n值得注意的是，长上下文能力与「能否可靠利用上下文中的信息」是两个问题，后者需要独立评测。",
    },
    {
      ...base,
      id: "s6",
      kind: "url",
      title: "Test-enhanced Learning：检索练习为何比重复阅读更有效",
      url: "https://www.psychologicalscience.org/observer/test-enhanced-learning",
      createdAt: now - 6 * 86_400_000,
      intent: "「逼你输出」这一产品主张的心理学依据",
      tags: ["学习", "记忆", "输出"],
      summary:
        "美国心理科学协会（APS）关于「以测代学」的综述：主动检索（自测、复述、写作）比反复阅读更能带来长期保持，尽管阅读时主观上更「流畅」。",
      text: "美国心理科学协会（APS）的 Observer 栏目有一篇关于 test-enhanced learning 的综述，梳理 Roediger 与 Karpicke 等人关于「检索练习」的研究脉络。\n\n核心结论是：把时间花在主动检索上（自测、复述、写作），比反复阅读更能形成长期记忆；而重复阅读会带来「流畅感」，让人误以为自己已经掌握。\n\n这解释了一个常见现象：收藏了很多材料、读得很顺，真正要用的时候却调不出来——因为整个过程缺少检索与输出环节。\n\n对知识管理工具的含义是：只做「收藏 + 阅读」的产品，实际上在强化流畅错觉；真正的价值在于逼用户检索、复述、建立连接。",
    },
    {
      ...base,
      id: "s7",
      kind: "url",
      title: "GitHub Copilot 对照实验：任务完成时间缩短 55.8%（2023）",
      url: "https://arxiv.org/abs/2302.06590",
      createdAt: now - 8 * 86_400_000,
      intent: "和「AI 拖慢开发」那篇对着看，正好是一对反证",
      tags: ["编程", "生产力", "评测"],
      summary:
        "Peng 等人的受控实验：让开发者用 JavaScript 写一个 HTTP 服务，有 AI 结对编程的一组比对照组快 55.8%，并观察到对新人入行的帮助更明显。",
      text: "《The Impact of AI on Developer Productivity: Evidence from GitHub Copilot》由 Sida Peng 等人在 2023 年 2 月提交到 arXiv。\n\n实验设计是一场受控实验：招募开发者，任务是「尽快用 JavaScript 实现一个 HTTP 服务器」，随机分为使用 GitHub Copilot 的实验组和对照组。\n\n结果是：实验组完成任务的速度比对照组快 55.8%。论文还报告了异质性效应，认为 AI 结对编程可能对想转入软件开发行业的人帮助更大。\n\n需要注意的边界：任务是单一、结构清晰的编码任务，被试不是长期维护同一代码库的资深开发者——这一点和后出的 METR 研究恰好构成对照。",
    },
    {
      ...base,
      id: "s8",
      kind: "url",
      title: "METR 随机对照实验：资深开发者用 AI 反而慢了 19%（2025）",
      url: "https://arxiv.org/abs/2507.09089",
      createdAt: now - 9 * 86_400_000,
      intent: "写「AI 提效」这一节时必须处理的反对证据",
      tags: ["编程", "生产力", "反证"],
      summary:
        "METR 的随机对照试验：16 位资深开源开发者在自己维护 5 年以上的成熟项目里完成 246 个任务，允许用 AI 时实际耗时反而增加 19%；而他们事前预测能快 24%、事后自评快 20%。",
      text: "《Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity》由 Becker、Rush、Barnes、Rein 在 2025 年 7 月提交。\n\n方法是一场随机对照试验（RCT）：16 位有中等 AI 使用经验的开发者，在平均熟悉 5 年的成熟开源项目里完成 246 个任务，每个任务随机决定是否允许使用早期 2025 年的 AI 工具（主要用 Cursor Pro 与 Claude 3.5/3.7 Sonnet）。\n\n关键数字：开发者事前预测 AI 能缩短 24% 的时间，事后自评缩短 20%，而实测结果是完成任务时间增加了 19%——AI 让这些人变慢了。这个结果也推翻了经济学专家（预测快 39%）与机器学习专家（预测快 38%）的判断。\n\n作者逐一检查了 20 种可能解释（项目规模、质量标准、使用经验等），认为虽然无法完全排除实验设计的影响，但减速效应在各种分析下都稳健。",
    },
  ];
}
