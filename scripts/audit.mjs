#!/usr/bin/env node
/**
 * 工程健康度量表 —— 让「标准」可执行、可回归。
 * 用法：pnpm audit:ui
 *
 * 每条规则都必须能用 grep 判定，不能判定的不算标准。
 * 配色规则随设计语言更新：允许 white/black 透明度（Aurora 基础色阶），
 * 但禁止裸 hex —— 所有色值必须来自 theme.ts 或 CSS 变量。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "lib"];
const SKIP = new Set(["node_modules", ".next", "docs"]);

const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(name)) files.push(full);
  }
}
for (const d of SCAN_DIRS) {
  try {
    walk(join(ROOT, d));
  } catch {
    /* 目录不存在时跳过 */
  }
}

const rel = (f) => relative(ROOT, f).replace(/\\/g, "/");
const source = files.map((f) => ({ path: rel(f), text: readFileSync(f, "utf8") }));
const all = source.map((s) => s.text).join("\n");

const count = (re) => (all.match(re) ?? []).length;

// metadata 的 themeColor 是浏览器 UI 颜色，不是样式令牌，单独豁免
const HEX_SKIP = new Set(["app/layout.tsx"]);
const hexFiles = source.filter((s) => !HEX_SKIP.has(s.path));
const countHex = () =>
  hexFiles.reduce(
    (n, s) => n + (s.text.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length,
    0,
  );
const filesWith = (re) => source.filter((s) => re.test(s.text)).length;
const occurrences = (re) =>
  source.flatMap((s) =>
    [...s.text.matchAll(re)].map((m) => ({ file: s.path, match: m[0] })),
  );

const tests = source.filter((s) => /\.test\.tsx?$/.test(s.path)).length;
const client = filesWith(/^"use client"/m);
const loc = all.split("\n").length;

const rules = [
  {
    name: "裸字号（text-[11px]）",
    standard: "字号只允许走 5 档令牌",
    value: count(/text-\[\d+px\]/g),
    limit: 0,
    unit: "处",
  },
  {
    name: "裸 hex 色值",
    standard: "颜色只能来自 theme.ts 或 CSS 变量",
    value: countHex(),
    limit: 0,
    unit: "处",
  },
  {
    name: "any / ts-ignore",
    standard: "strict 模式零豁免",
    value: count(/:\s*any\b|as any|@ts-ignore/g),
    limit: 0,
    unit: "处",
  },
  {
    name: "组件直连 store",
    standard: "组件经 hooks 层访问状态",
    value: source.filter(
      (s) => s.path.startsWith("components/") && /@\/lib\/store/.test(s.text),
    ).length,
    limit: 0,
    unit: "个文件",
  },
  {
    name: "重复卡片配方",
    standard: "卡片样式只能定义一次（三次法则）",
    value:
      count(/rounded-xl border border-line bg-surface/g) +
      count(/rounded-2xl bg-\[var\(--kb-surface\)\] ring-1 ring-white/g),
    limit: 2,
    unit: "处",
  },
  {
    name: "遗留 console.log",
    standard: "提交代码不含调试输出",
    value: count(/\bconsole\.(log|debug)\(/g),
    limit: 0,
    unit: "处",
  },
  {
    name: "测试文件",
    standard: "至少覆盖建图算法与文本处理",
    value: tests,
    limit: 1,
    unit: "个",
    gte: true,
  },
  {
    name: "客户端组件占比",
    standard: "RSC 优先，use client 占比 ≤ 55%",
    value: Math.round((client / files.length) * 100),
    limit: 55,
    unit: "%",
  },
];

const rows = rules.map((r) => {
  const ok = r.gte ? r.value >= r.limit : r.value <= r.limit;
  return { ...r, ok };
});

const passed = rows.filter((r) => r.ok).length;

console.log("");
console.log("  工程健康度  " + `${passed}/${rows.length}` + " 项通过");
console.log("  扫描        " + `${files.length} 个文件 / ${loc} 行`);
console.log("");
console.log("  ✓/✗  指标                      实际   阈值   依据");
console.log("  " + "-".repeat(78));
for (const r of rows) {
  const mark = r.ok ? " ✓ " : " ✗ ";
  const name = r.name.padEnd(24, " ");
  const value = `${r.value}${r.unit}`.padStart(6, " ");
  const limit = `${r.gte ? "≥" : "≤"}${r.limit}${r.unit}`.padStart(7, " ");
  console.log(`  ${mark} ${name} ${value} ${limit}   ${r.standard}`);
}
console.log("");

const violations = rows.filter((r) => !r.ok);
if (violations.length > 0) {
  console.log("  待修复项明细：");
  for (const r of violations) {
    if (r.name === "组件直连 store") {
      for (const s of source) {
        if (s.path.startsWith("components/") && /@\/lib\/store/.test(s.text)) {
          console.log("    · " + s.path);
        }
      }
    }
    if (r.name === "裸 hex 色值") {
      for (const o of occurrences(/#[0-9a-fA-F]{3,8}\b/g).filter((o) => !HEX_SKIP.has(o.file))) {
        console.log(`    · ${o.file}: ${o.match}`);
      }
    }
  }
  console.log("");
}

process.exit(violations.length > 0 ? 1 : 0);
