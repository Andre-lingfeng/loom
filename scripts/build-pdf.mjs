/**
 * 把 Markdown 渲染成可提交的 PDF。
 *
 *   pnpm build:pdf                          # 技术报告（默认）
 *   node scripts/build-pdf.mjs <md> <pdf>   # 任意文件
 *   node scripts/build-pdf.mjs <md> <pdf> --no-cover --title "标题"
 *
 * 过程：Markdown → 带打印样式的 HTML → Chrome 无头打印（A4、页码、图片嵌入）
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { marked } from "marked";

const ROOT = process.cwd();

/* ---------- 参数 ---------- */
const args = process.argv.slice(2);
const flags = new Set(args.filter((item) => item.startsWith("--")));
const positional = args.filter((item) => !item.startsWith("--"));

const flagValue = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")
    ? args[index + 1]
    : fallback;
};

const MD = path.resolve(ROOT, positional[0] ?? "docs/TECH-REPORT.md");
const PDF = path.resolve(
  ROOT,
  positional[1] ?? "docs/report/织识-Loom-技术报告.pdf",
);
const WITH_COVER = !flags.has("--no-cover");
const HEADER = flagValue("title", "织识 Loom · 技术报告");

const OUT_DIR = path.dirname(PDF);
const HTML = path.join(OUT_DIR, `${path.basename(PDF, ".pdf")}.html`);

const CHROME =
  process.env.CHROME_PATH ??
  [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((candidate) => fs.existsSync(candidate));

if (!CHROME) {
  console.error("找不到 Chrome，可用 CHROME_PATH 指定");
  process.exit(1);
}

const markdown = fs.readFileSync(MD, "utf8");

let cleaned = markdown.replace(/^## 目录[\s\S]*?(?=\n## 1\.)/m, "");
// 有封面时，正文里去掉重复的标题与元信息块
if (WITH_COVER) {
  cleaned = cleaned.replace(/^# [^\n]*\n+>[\s\S]*?\n---\n/, "");
}

marked.setOptions({ gfm: true, breaks: false });
let body = marked.parse(cleaned);

/* 图片：相对路径转绝对 file:// */
body = body.replace(/src="([^"]+)"/g, (match, src) => {
  if (/^(https?:|data:|file:)/.test(src)) return match;
  const abs = path.resolve(path.dirname(MD), src).replace(/\\/g, "/");
  return `src="file:///${abs}"`;
});

const css = `
  @page { size: A4; margin: 18mm 16mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
    font-size: 10.5pt; line-height: 1.75; color: #1a1a1f;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1 { font-size: 20pt; margin: 0 0 6pt; letter-spacing: -.01em; }
  h2 { font-size: 14pt; margin: 22pt 0 8pt; padding-top: 8pt; border-top: 1.5pt solid #6d28d9; color: #2b2b33; break-after: avoid; }
  h3 { font-size: 11.5pt; margin: 14pt 0 5pt; color: #3b3b45; break-after: avoid; }
  p { margin: 0 0 7pt; }
  ul, ol { margin: 0 0 8pt; padding-left: 16pt; }
  li { margin-bottom: 3pt; }
  blockquote { margin: 8pt 0; padding: 7pt 10pt; background: #f6f4ff; border-left: 3pt solid #8b5cf6; border-radius: 3pt; color: #3c3c48; }
  blockquote p { margin: 0; }
  code { font-family: "Cascadia Mono", Consolas, monospace; font-size: 9pt; background: #f1f0f6; padding: 1pt 4pt; border-radius: 3pt; color: #5b21b6; }
  pre { background: #f7f6fb; border: .5pt solid #e2e0ea; border-radius: 5pt; padding: 8pt 10pt; margin: 8pt 0; overflow: hidden; break-inside: avoid; }
  pre code { background: none; padding: 0; color: #26262e; font-size: 8.8pt; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin: 8pt 0 10pt; font-size: 9.5pt; break-inside: avoid; }
  th, td { border: .5pt solid #d8d6e2; padding: 4pt 7pt; text-align: left; vertical-align: top; }
  th { background: #f4f2fb; font-weight: 600; }
  th:nth-child(2), td:nth-child(2) { min-width: 42pt; }
  hr { border: none; border-top: .5pt solid #dddbe6; margin: 16pt 0; }
  img { display: block; width: 100%; max-width: 100%; margin: 10pt 0 4pt; border-radius: 4pt; border: .5pt solid #e6e4ef; break-inside: avoid; }
  p:has(> sub) { margin: 0 0 12pt; }
  sub { font-size: 8.5pt; color: #6b6b78; }
  a { color: #6d28d9; text-decoration: none; word-break: break-all; }
  .cover { text-align: left; padding-top: 60mm; break-after: page; }
  .cover .kicker { font-size: 9pt; letter-spacing: .18em; color: #8b5cf6; text-transform: uppercase; }
  .cover h1 { font-size: 30pt; margin: 8pt 0 10pt; }
  .cover .lead { font-size: 12pt; color: #4a4a55; line-height: 1.8; }
  .cover .meta { margin-top: 30mm; font-size: 9.5pt; color: #6b6b78; line-height: 2; }
  .pagebreak { break-after: page; }
`;

const cover = WITH_COVER
  ? `
  <div class="cover">
    <div class="kicker">传智杯 AI Web 开发挑战赛</div>
    <h1>织识 Loom</h1>
    <div class="lead">个人知识库助手<br>AI 负责让你看清，不负责替你想清楚</div>
    <div class="meta">
      作品类型：Web 应用（Next.js 全栈）<br>
      线上演示：http://8.163.104.134<br>
      代码仓库：https://github.com/Andre-lingfeng/loom<br>
      提交日期：2025 年 11 月
    </div>
  </div>
  <div class="pagebreak"></div>
`
  : "";

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>${HEADER}</title>
<style>${css}</style>
</head><body>
${cover}
${body}
</body></html>`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(HTML, html, "utf8");
console.log("HTML 已生成:", path.relative(ROOT, HTML));

/* ---------- Chrome 打印 ---------- */
const port = 12400 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "loom-pdf-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--hide-scrollbars",
    "--remote-allow-origins=*",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--allow-file-access-from-files",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const page = await (async () => {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      const list = await res.json();
      const found = list.find((item) => item.type === "page");
      if (found?.webSocketDebuggerUrl) return found;
    } catch {
      /* 启动中 */
    }
    await sleep(300);
  }
  throw new Error("连不上 Chrome");
})();

const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();

ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});

await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));

const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

await send("Page.enable");
await send("Page.navigate", { url: `file:///${HTML.replace(/\\/g, "/")}` });
await sleep(2000);

await send("Runtime.evaluate", {
  expression: `Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; })))`,
  awaitPromise: true,
});

const result = await send("Page.printToPDF", {
  landscape: false,
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: `<div style="font-size:7pt; color:#9a9aa5; width:100%; padding:0 16mm;">${HEADER}</div>`,
  footerTemplate:
    '<div style="font-size:7pt; color:#9a9aa5; width:100%; padding:0 16mm; text-align:right;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  preferCSSPageSize: true,
  marginTop: 0,
  marginBottom: 0,
  marginLeft: 0,
  marginRight: 0,
});

fs.writeFileSync(PDF, Buffer.from(result.result.data, "base64"));

ws.close();
chrome.kill();
await sleep(400);
try {
  fs.rmSync(profile, { recursive: true, force: true });
} catch {
  /* 占用时忽略 */
}

const size = (fs.statSync(PDF).size / 1024 / 1024).toFixed(1);
console.log(`PDF 已生成: ${PDF}（${size}MB）`);
