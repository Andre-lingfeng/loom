# 设计系统（DESIGN SYSTEM）

> 状态：v2 · 2026-10-28（按 `app/globals.css` 实际令牌重写，v1 中的 `text-ui` / `radius-card` 为臆造，已废止）
> 唯一来源：`app/globals.css` 的 `@theme` 块。改视觉 = 改这个文件，不在组件里写死。

---

## 1. 风格定位

**三个词**：工具型、高密度、克制。

| 原则 | 落地 |
|---|---|
| 信息优先 | 一屏内同时看到步骤、耗时、状态；行高紧凑，字号 10–13px 为主 |
| 层级靠底色 | `canvas → surface → raised` 三阶明度，**不用阴影**（全站零 `shadow-*`） |
| 单点强调 | 全站一个强调色（`accent` 紫），只用于「可操作 / 进行中」，面积 < 5% |

**禁止**：大面积渐变、毛玻璃、emoji 当图标、第二个强调色、装饰性动画、亮色主题（明确放弃）。

---

## 2. 色彩（14 个语义令牌，零裸色值）

| Token | 值 | 用途 | 对比度 |
|---|---|---|---|
| `canvas` | `#0b0b0d` | 页面底色 | — |
| `surface` | `#121216` | 卡片、面板 | — |
| `raised` | `#17171d` | 输入框、次级卡片、徽标底 | — |
| `line` | `#26262e` | 分隔线与边框 | — |
| `hover` | `#ffffff0d`（5% 白） | 所有 hover 底色，**替代 `bg-white/5`** | — |
| `scrim` | `#000000a6` | 抽屉遮罩，**替代 `bg-black/60`** | — |
| `ink` | `#ecedf1` | 正文、标题 | 15:1 AAA |
| `muted` | `#9a9ba6` | 次要说明、标签 | ~6.8:1 AA |
| `faint` | `#7a7b88` | 元信息（时间、计数、参数） | 4.7:1 AA（v1 的 #6b6c78 只有 3.8:1，已修） |
| `accent` | `#7c6cff` | 主行动、进行中、链接 | 用于深底白字按钮 |
| `accent-dim` | `#241f3d` | 强调色的低饱和衬底 | — |
| `ok` | `#3ecf8e` | 成功、在线 | — |
| `warn` | `#f0b429` | 等待确认、写操作 | — |
| `danger` | `#ff5d5d` | 失败、错误、危险操作 | — |

**规则**：语义色只表达状态，不表达装饰；`faint` 不用于正文；不允许 `bg-white/5`、`text-[#fff]` 这类裸值（`audit:ui` 强制）。

> **当前唯一的设计系统：Aurora 色阶**
> 全站（落地页 / 知识库 / 设置）统一使用纯黑画布 + 白色透明度层次 + 紫色强调。
> 旧的「语义 token」体系已随 Agent 演示一并删除，本文件前面的颜色表保留作为历史对照。
> 约束：颜色必须来自 `app/kb/kb.css` 的 `--kb-*` 变量或 `components/kb/theme.ts`，**禁止裸 hex**（`audit:ui` 强制）。

---

## 3. 排版（7 档定义，5 档在用）

| Token | 字号 / 行高 | 用途 |
|---|---|---|
| `text-3xs` | 10px / 14px | 徽标文字、代码内联、计数 |
| `text-2xs` | 11px / 16px | 元信息、参数说明、次要标签 |
| `text-xs` | 12px / 18px | 按钮 sm、代码块、列表项 |
| `text-sm` | **13px / 22px** | **正文**（消息气泡、步骤标题、输入框） |
| `text-base` | 14px / 24px | 长段落（当前未使用，保留） |
| `text-lg` | 16px / 24px | 面板大标题 |
| `text-xl` | 20px / 28px | 空态主标题 |

> 实测浏览器 computed font-size 集合：`10 / 11 / 12 / 13 / 16px`，共 5 档，符合标准。

**规则**：禁止 `text-[13px]` 任意值（`audit:ui` = 0 处）；数字（耗时/token/成本）用 `font-mono`；中文不加字距。

---

## 4. 圆角与间距

| Token | 值 | 用途 |
|---|---|---|
| `rounded-sm` | 6px | 徽标、小标签 |
| `rounded-md` | 8px | 按钮、小容器 |
| `rounded-lg` | 12px | 卡片内块、代码块、按钮组 |
| `rounded-xl` | 16px | 主卡片、消息气泡、输入框 |
| `rounded-full` | 999px | 头像、状态点（形状，不计入档位） |

**存量债务**：`MessageBubble` 仍用 `rounded-2xl`（1 处），P0 收敛到 `rounded-xl`。

**间距**：4 的倍数。组件内 `p-2`(8)/`p-3`(12)；块间 `gap-2`/`gap-3`；页面 `p-4`(16)。禁止 `p-[13px]`。布局尺寸（`w-[340px]`）允许任意值，属排版而非 token。

---

## 5. 组件库

**结论：自建 `components/ui` + 按需引入 Radix 无头组件。**

| 方案 | 判定 | 理由 |
|---|---|---|
| Ant Design / Element Plus | ❌ | 默认视觉与暗色工具风冲突，覆盖成本 > 自研；体积大 |
| shadcn/ui 整套 | ❌ | 会带进 30+ 文件与大量未用变体，22 天内维护成本高 |
| 自建 4 个原语 | ✅ 现在 | 总量 < 200 行，零依赖，样式完全可控 |
| Radix primitives | ✅ 按需 | Dialog / Tooltip / Toast / Tabs 的无障碍与焦点管理自写不划算，用到再引（各约 20KB，不带样式） |

### 现有原语（4/7）

| 组件 | API | 约定 |
|---|---|---|
| `Button` | `variant: primary\|ghost\|outline\|danger`、`size: sm\|md\|icon` | 变体用联合类型，禁止 `isPrimary` 布尔组合 |
| `Badge` | `tone: neutral\|accent\|ok\|warn\|danger` + `RunStatusBadge` | `RUN_STATUS_MAP` 是状态文案与色调的**唯一来源** |
| `StatusIcon` | `status: StepStatus`、`size` | 状态 → 图标/颜色的唯一映射，其他组件不得自行判断 |
| `Card` | `cardClass` 常量 + `<Card>` | 任何「边框 + surface + 圆角」容器必须引用 `cardClass`，不允许复制这串 class（`audit:ui` 强制） |

### 待补原语（P1）

`Input` · `Dialog` · `Tooltip` · `Toast` · `Tabs` —— 触发条件：出现第 2 处使用，或写操作确认需要模态。

**引入新库门槛**：解决一个自研成本 > 2 天的交互，且 PR 里给出 gzip 体积对比。

---

## 6. 动效

| 场景 | 时长 | 缓动 |
|---|---|---|
| hover / 颜色 | 120ms | ease-out |
| 展开折叠 | 200ms | ease-out |
| 抽屉滑入 | 280ms | cubic-bezier(.2,.8,.2,1) |
| 流式光标 / 运行脉冲 | 1000–1600ms | ease-in-out 循环 |

只允许 `spin`（加载）、`pulse-soft`（运行中）、`caret-blink`（流式）三类可见动画。只动 `transform`/`opacity`/`color`。

---

## 7. 图标

lucide-react，线性，`stroke-width` 默认 2。尺寸三档：`12`（内联）、`13–14`（默认）、`17`（导航）。纯图标按钮必须有 `aria-label`。

---

## 8. 无障碍

1. 全局 `:focus-visible` 轮廓（2px accent + 2px offset），已内置。
2. 正文对比度 ≥ 4.5:1；`faint` 已从 3.8:1 修到 4.7:1。
3. 状态不只靠颜色：成功/失败同时有图标（`StatusIcon`）。
4. 纯图标按钮补 `aria-label`（TopBar 的抽屉按钮已加）。
5. 待补：`prefers-reduced-motion`、Esc 关闭抽屉、Tab 顺序走查。

---

## 9. 标准 → 判定方式

| 编号 | 标准 | 判定 |
|---|---|---|
| V1 | 三层表面 + 单一强调色，零阴影 | `grep shadow-` = 0 |
| V2 | 状态色唯一来源 | `RUN_STATUS_MAP` 仅 1 处 |
| V3 | 字号落在档位内 | `audit:ui` 裸字号 = 0 |
| V4 | 圆角 ≤ 4 档（+full） | `grep rounded-` 去重 ≤ 5 |
| V5 | 颜色零裸值 | `audit:ui` 原始色 = 0 |
| V6 | 焦点可见、对比度达标 | 键盘走查 + WCAG 计算 |
