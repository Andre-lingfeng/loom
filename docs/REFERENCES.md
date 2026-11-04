# 可借鉴的开源项目（REFERENCES）

> 状态：v1 · 2026-10-28
> 用法：**读架构、学交互范式，不搬代码**。总时间盒 **≤ 4 小时**，超过就是浪费时间。
> 合规底线见本文 §5——赛道明确禁止「直接使用开源项目包装参赛」。

---

## 1. 第一梯队：直接对标你的核心难点（共约 2 小时）

### ① CopilotKit — 人工确认（HITL）与生成式 UI 的声明式写法

| | |
|---|---|
| 仓库 | `CopilotKit/CopilotKit` |
| 许可 | MIT |
| 看什么 | 前端如何**声明**一个 agent 可调用的动作、如何在前端挂起等待用户确认、如何让 agent 直接渲染 UI 组件 |
| 对应你的 | `ToolCallCard` 的确认门、P2 的生成式 UI |
| 不要抄 | 整套 runtime。它会把你绑定在它的 provider 上，22 天内改不动 |

**读法**：只找 `useCopilotAction` / `useCopilotReadable` 这两个 hook 的实现，看它怎么把「前端函数」暴露成「agent 工具」，以及 `render` 回调怎么返回 React 组件。**这是「生成式 UI」最省力的实现路径**——你的 Agent 不需要返回 HTML，只需要返回组件名 + props。

### ② assistant-ui — 消息与工具调用的数据模型

| | |
|---|---|
| 仓库 | `assistant-ui/assistant-ui` |
| 许可 | MIT |
| 看什么 | 一条消息如何被拆成 parts（text / tool-call / tool-result / reasoning）、如何流式渲染 |
| 对应你的 | `TimelineItem` 的类型设计、`ToolCallCard` 的渲染 |
| 不要抄 | 组件库本身（你的 4 个原语已经够用） |

**读法**：看它的 `Message` / `Thread` 原语类型定义。重点回答一个问题：**它为什么把 tool-call 和 tool-result 分成两个 part，而你是合在一个 step 里？** 想清楚再决定要不要改——你现在合并是对的（步骤更短），但要知道取舍在哪。

### ③ Vercel AI Chatbot — 全栈骨架与流式协议

| | |
|---|---|
| 仓库 | `vercel/ai-chatbot` |
| 许可 | MIT（以仓库 LICENSE 为准） |
| 看什么 | `app/api/chat/route.ts` 的服务端流式写法、`useChat` 的客户端消费、artifact 面板的布局 |
| 对应你的 | P0 的 `route.ts` 实现、SSE 消费 |
| 不要抄 | 整个项目。它是「聊天产品」，抄多了会把你的作品拉回聊天框 |

**读法**：只看 route 里 `streamText` 的调用参数和 `toDataStreamResponse()` 的用法，20 分钟够。

---

## 2. 第二梯队：解决「Agent 跑不完 / 看不见」（约 2 小时）

### ④ LangGraph.js — 可中断、可恢复的状态机

| | |
|---|---|
| 仓库 | `langchain-ai/langgraphjs` |
| 许可 | MIT |
| 看什么 | `interrupt()` 的语义：如何把一次运行**挂起**、持久化、再由外部恢复 |
| 对应你的 | 你的 `confirm()` 现在是 Promise 挂起，**进程一重启就全丢**。它的 checkpoint 思路是 P1「会话持久化」的正解 |
| 不要抄 | 整个框架。你的 `RunContext` 已经是它的极简版，够用 |

**这一条最有价值的概念**：`run 不是函数调用，是一个可恢复的状态`。想通这一点，你的「拒绝 → 终止」「失败 → 重规划」都会写得更干净。

### ⑤ Langfuse — trace 面板的信息架构

| | |
|---|---|
| 仓库 | `langfuse/langfuse` |
| 许可 | MIT（核心；企业功能另有许可） |
| 看什么 | 一次 trace 的层级（trace → span → generation）、时间轴怎么画、失败如何高亮 |
| 对应你的 | 右栏 `TracePanel` + `StepTimeline` |
| 不要抄 | 它的后端与 SDK。你是自建轻量版 |

**读法**：只看 trace 详情页的组件结构，抄它的**信息层级**：顶层是 run，中层是 step，底层是 token/耗时/成本。你的右栏现在基本是这个结构，可以对照补「失败原因」和「重试关系」的视觉表达。

### ⑥ MCP 官方 servers — 快速把工具数做到 6+

| | |
|---|---|
| 仓库 | `modelcontextprotocol/servers` |
| 许可 | MIT |
| 用途 | 直接拿现成 server（filesystem / git / fetch / sqlite）当你的工具，**合法可商用** |
| 对应你的 | 评分表「MCP/工具集成 4%」——接 MCP 是这条最直接的证据 |

**注意**：这是唯一建议**直接使用**的代码，因为它是 MIT 且定位就是被集成。用的时候在 README 致谢即可。

---

## 3. 国内生态：只看 UI，不碰代码

| 项目 | 许可 | 只看什么 |
|---|---|---|
| **Dify** | Apache-2.0 + 附加条款 | 工作流编排画布的信息架构（节点、连线、运行态高亮） |
| **Coze Studio** | Apache-2.0 + 附加条款 | Agent/工作流的配置面板分层 |

**为什么只看不用**：附加条款对多租户 SaaS 与品牌有额外限制，比赛作品虽然不涉及，但没必要在这个时间点引入法律不确定性。而且它们都是 Python/Go 后端，22 天内搬不动。

---

## 4. 不建议参考的（会把你带偏）

| 项目 | 为什么 |
|---|---|
| LibreChat / Open WebUI | 「聊天产品」，功能密度极高但架构是聊天框思维；抄了会让你的作品变回「AI 助手套壳」 |
| AutoGPT / BabyAGI | 2023 年范式，无 HITL、无 UI、不可控，评审一看就知道是过时方案 |
| 各类「AI 简历/写作助手」模板 | 选题创新 10 分会直接归零 |
| shadcn/ui 整套 | 视觉体系已成型，引入等于重做（见 DESIGN-SYSTEM §5） |

---

## 5. 合规红线（务必遵守）

| 行为 | 判定 |
|---|---|
| 读代码后自己重写数据模型 / 交互 | ✅ 安全，README 致谢即可（非强制，但显专业） |
| 复制 < 20 行工具函数 | ⚠️ 保留版权头 + 记入 `THIRD_PARTY_NOTICES.md` |
| 复制 > 20 行或整个模块 | ⚠️ 必须保留 LICENSE、标注「已修改」、写清自研边界 |
| 整包 fork 改名字/配色提交 | ❌ 违规，可取消资格 |
| 用 GPL / AGPL / 无 LICENSE 的仓库代码 | ❌ 避开（GPL 会传染你的仓库，AGPL 连部署都算分发） |

**一句话判断**：删掉借鉴来的代码，你的作品还剩不剩核心价值？剩 = 借鉴；不剩 = 包装。

---

## 6. 读代码的 3 个固定问题

每次打开一个仓库，只回答这三个问题，答完就关：

1. **它的数据模型是什么？**（一条 run / 一条 message 长什么样）
2. **状态存在哪、怎么恢复？**（内存 / 数据库 / checkpoint）
3. **「等人确认」怎么表达？**（挂起 Promise / 状态机 interrupt / 队列）

这三个问题对应你作品里最值钱的三个设计点：轨迹可视化、会话恢复、HITL。

---

## 7. 时间盒建议

| 顺序 | 项目 | 时长 | 产出 |
|---|---|---|---|
| 1 | CopilotKit 的 action/render 机制 | 45 min | 生成式 UI 的实现路径定了 |
| 2 | Vercel AI Chatbot 的 route + useChat | 30 min | D1 接入照抄结构（不是代码） |
| 3 | LangGraph.js 的 interrupt 概念 | 30 min | 确认门 / 恢复方案定了 |
| 4 | Langfuse 的 trace 层级 | 30 min | 右栏补「重试关系」表达 |
| 5 | MCP servers | 45 min | 工具数 +2，拿到 4 分证据 |

**总计 3.5 小时**，一次做完，之后不再回头看。
