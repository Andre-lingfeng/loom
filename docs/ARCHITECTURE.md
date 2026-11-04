# 架构设计（ARCHITECTURE）

> 状态：v3 · 2026-11-02（旧的「办公 Agent 演示」已删除，本文档只描述当前产品）
> 校验命令：`pnpm verify`（工程健康度 + 类型 + 单元测试）

---

## 1. 技术选型

| 决策点 | 选择 | 理由 | 放弃 |
|---|---|---|---|
| 框架 | Next.js 15 App Router | 落地页保持 Server Component，只有交互区进客户端 | Vite SPA |
| 语言 | TypeScript strict | 关系/图谱数据结构复杂，弱类型必然出错 | JS |
| 样式 | Tailwind v4 + CSS 变量 | 颜色单一来源，换主题改 6 行 | CSS-in-JS |
| 状态 | Zustand 单 store | 无 Provider，selector 精准订阅 | Redux / Jotai |
| 3D | three.js（按需） | 真 bloom / 轨道控制 / 着色器粒子 | Canvas 2D 手写（已淘汰） |
| 模型 | 任意 OpenAI 兼容端点 | 不绑定厂商，评审环境可换 | 官方 SDK 绑定 |

**依赖准入**：运行时依赖 7 个（next / react / react-dom / zustand / three / clsx / lucide-react）。新增依赖须写明用途与 gzip 体积。

---

## 2. 分层与依赖方向

```
app/               路由与页面（Server Component 优先）
components/
  landing/         落地页视觉（客户端，three.js 按需）
  kb/              知识库全部视图（客户端）
lib/
  kb/              领域逻辑：分词、建图、缺口、简报、建联、状态
  utils.ts         纯函数
```

```
app  ──▶ components ──▶ lib/kb ──▶ lib/utils
                              └─▶ 外部 API（经 app/api 转发）
```

| 规则 | 强制方式 |
|---|---|
| 颜色只能来自 CSS 变量，禁止裸 hex | `audit:ui` |
| 字号只能走令牌，禁止 `text-[13px]` | `audit:ui` |
| 卡片配方只定义一次（`theme.ts`） | `audit:ui` |
| 组件不得直接 `create()` store，只能 `useKb(...)` | `audit:ui` |
| `lib/kb` 不依赖 `components` / `app` | 人工评审 |

---

## 3. 状态管理边界

| 状态 | 位置 | 例子 |
|---|---|---|
| 跨视图共享 | `lib/kb/store.ts` | `sources` `edges` `view` `selectedId` |
| 单组件交互 | `useState` | 图谱的 `mode`、对话框开关 |
| 派生数据 | 现算，不落地 | `topEdges`、`backlog` |
| 模型配置 | `localStorage`（`lib/kb/llm.ts`） | baseUrl / model / apiKey |

**硬约束**：`sources` 是唯一真相来源；`edges` 是从它派生的缓存，增删素材时必须重置为本地结果。

---

## 4. 两条建联路径

```
增删素材
   ↓
buildGraph(sources)            ← 本地：IDF 加权余弦 + 标签加成，永远可用
   ↓
edges（edgeSource = "local"）
   ↓ 用户点「云端重算」
POST /api/relations
   ├─ 成功 → edges（edgeSource = "cloud"，带 kind + reason）
   └─ 失败 → 保留本地 edges + edgeStatus = "error" + 原因
```

### 数据结构

```ts
interface GraphEdge {
  source: string;
  target: string;
  strength: number;              // 0–1，本地为批内归一化，云端为模型判断
  level: "strong" | "mid" | "weak";
  kind?: "supports" | "contradicts" | "duplicates" | "related"; // 仅云端
  reason?: string;               // 仅云端，一句话理由
  shared: string[];              // 仅本地，共同词
}
```

### 云端建联的四条约束（防幻觉）

1. 只输出有内容依据的关系，泛泛而谈不算
2. 每条素材最多 3 条关系（防止全连接）
3. `strength < 0.45` 丢弃
4. 服务端二次校验：id 必须存在、kind 白名单、去重

输入侧限流：最多 24 条素材、每条截断 520 字，单次请求 `timeout 60s`。

---

## 5. 错误与降级

| 场景 | 表现 |
|---|---|
| 未配置模型 | 提示「先去模型接入填 Key」，图保持本地结果 |
| 模型返回非 JSON | 502 + 「返回的 JSON 无法解析」，不写入任何边 |
| 模型超时 | 提示减少素材数量后重试 |
| WebGL 不可用 | 图谱区显示「当前环境不支持 WebGL」，其余功能正常 |
| 链接抓取失败 | 提示改用粘贴，不阻塞入库 |

**原则**：任何外部依赖失败都不能让页面失去已有能力。

---

## 6. 性能预算

| 指标 | 预算 | 当前 |
|---|---|---|
| `/` 首屏 JS | ≤ 120KB | 107KB |
| `/kb` 首屏 JS | ≤ 150KB | 126KB |
| three.js | 按需加载 | `dynamic(ssr:false)`，两处 |
| 图谱节点上限 | 50 个以内 60fps | 布局 O(n²)，超过需换空间网格 |
| 客户端组件占比 | ≤ 55% | 42% |

---

## 7. 安全基线

1. API Key 只存浏览器 `localStorage`，经本项目服务端转发，不进任何第三方
2. 公开部署时应改用环境变量，不要走前端配置
3. 对外请求（链接抓取 / 模型调用）都有超时与状态码校验
4. 模型输出视为不可信数据：解析、白名单校验后才写入状态

---

## 8. 演进方向

| 信号 | 动作 |
|---|---|
| 素材 > 50 条 | 图谱布局换空间网格分区，或改用 GPU 实例化 |
| 需要冲突检测闭环 | 把 `kind === "contradicts"` 接到「采纳 / 保留 / 并存」三选一 |
| 需要多端同步 | store 落 IndexedDB + 服务端快照 |
| 模型调用变多 | 加请求队列与 token 计量面板 |
