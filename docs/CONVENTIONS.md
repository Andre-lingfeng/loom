# 工程约定（CONVENTIONS）

> 状态：v3 · 2026-11-02（旧 Agent 演示已删除，示例同步到当前代码）
> 所有规则尽量可判定：`pnpm audit:ui` 能查的写进脚本，查不了的写进评审清单。

---

## 1. 目录与归属

```
app/                    路由与页面（Server Component 优先）
components/
  landing/              落地页视觉：NebulaCanvas + NebulaMount
  kb/                   知识库视图与组件
lib/
  kb/                   领域逻辑（不依赖 React）
  utils.ts              cn 等纯函数
scripts/audit.mjs       工程健康度
docs/                   规范 + 截图
```

**归属三问**：

1. 含业务词（素材/关系/缺口）→ 进 `components/kb`。
2. 能在没有 React 的情况下测试 → 放 `lib/kb`。
3. 只有一处使用 → 先放页面同目录，第二处出现再提升。

---

## 2. 命名

| 对象 | 规则 | 示例 |
|---|---|---|
| 组件文件 | PascalCase | `GraphView.tsx` |
| 逻辑模块 | camelCase | `graph.ts` `relations.ts` |
| Hook | `use` 前缀，语义化 | `useKb` |
| 回调 props | `on*` | `onClose` |
| 布尔 props | `is/has/can` | `isPair` |
| store action | 动词 | `refreshEdges` `setView` |
| 类型 | 领域名词，无 `I` 前缀 | `GraphEdge` |
| 联合值 | 小写 | `"contradicts"` |
| CSS 变量 | `--kb-*` 语义命名 | `--kb-edge-strong` |

**导出**：组件一律具名导出；只有 `page.tsx` / `layout.tsx` 用 default。

---

## 3. 复用规则

**三次法则**：同一段样式或逻辑出现 3 次才抽象。

已沉淀的复用单元：

| 单元 | 位置 | 作用 |
|---|---|---|
| `card` / `cardHover` / `input` / `primary` / `ghost` | `components/kb/theme.ts` | 视觉配方，禁止在组件里复制 |
| `Badge` / `Button` | `components/kb/ui.tsx` | 原子组件 |
| `buildGraph` / `layoutGraph` | `lib/kb/graph.ts` | 建图与 3D 布局 |
| `tokenize` / `rank` / `summarize` | `lib/kb/text.ts` | 文本处理 |

**提升到 `components/kb/ui.tsx` 的门槛**：无业务语义、不依赖 store、props ≤ 6、已有 2 处使用。

---

## 4. 导入规范

```ts
// 顺序：react → 第三方 → @/lib → @/components → 相对
import { useEffect, useRef } from "react";
import * as THREE from "three";

import { useKb } from "@/lib/kb/store";
import { buildGraph } from "@/lib/kb/graph";

import { card } from "./theme";
```

- 一律 `@/` 别名，禁止三级以上相对路径。
- 纯类型导入用 `import type`。
- **颜色不许写在组件里**：一律 `var(--kb-*)` 或 `theme.ts`（`audit:ui` 拦截）。

### barrel 决策

只给零散文件多的目录建入口不划算，当前**不建 barrel**；`components/kb` 内部相对导入即可。

---

## 5. Git 与提交

**分支**：`main` + `feat/<scope>` / `fix/<scope>` / `docs/<scope>`，不超过 2 天。

**提交信息**：

```
feat(graph): 云端建联失败时回退本地
fix(gaps): 多字词做词根回退，避免误报空白
docs(arch): 删除 Agent 演示相关章节
```

**提交前**：

```bash
pnpm verify     # audit + typecheck + test
pnpm build
```

---

## 6. Definition of Done

- [ ] `pnpm verify` 通过（8/8 + 零类型错误 + 测试全绿）
- [ ] `pnpm build` 通过
- [ ] 手动跑通：入库 → 检索 → 缺口 → 图谱（含无 Key 的降级路径）
- [ ] 浏览器 console 零报错
- [ ] 视觉变化 → 更新 `docs/screenshots/`
- [ ] 改了数据结构 → 同步 `ARCHITECTURE.md`
- [ ] 新增依赖 → PR 写明用途与体积

---

## 7. 评审清单

1. 颜色/字号有没有绕过令牌？
2. 有没有把派生数据塞进 store 造成两份真相？
3. 外部依赖失败时，页面还能不能用？
4. 模型输出有没有被当成可信数据直接渲染？
5. 这段逻辑能不能在没有 React 的地方测？

---

## 8. 测试策略

| 层级 | 工具 | 覆盖 |
|---|---|---|
| 单元 | `node:test`（零依赖） | `lib/kb/graph.ts`：建边、无关不连、标签加成、布局边界 |
| 手动 | 浏览器 | 入库 → 检索 → 缺口 → 图谱 → 降级 |

**原则**：只测有判断价值的对象。`graph.test.ts` 里的四个用例都对应真实缺陷（其中「只有共同标签却没连边」就是被测试抓出来的）。
