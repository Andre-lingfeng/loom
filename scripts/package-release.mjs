/**
 * 打包提交材料：整理成网盘可直接上传的目录 + 一个 zip。
 *
 *   pnpm package
 *
 * 产出：
 *   release/织识-Loom-作品包/          ← 目录（视频可手动放进去）
 *   release/织识-Loom-作品包-YYYYMMDD.zip
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "release");
const NAME = "织识-Loom-作品包";
const DIR = path.join(OUT, NAME);
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

const log = (message) => console.log(`▸ ${message}`);

/* ---------- 1. 清空并重建目录 ---------- */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(DIR, "01-作品文档"), { recursive: true });
fs.mkdirSync(path.join(DIR, "02-源码"), { recursive: true });
fs.mkdirSync(path.join(DIR, "03-演示材料"), { recursive: true });

/* ---------- 2. 拷贝文档 ---------- */
const copyIfExists = (from, to) => {
  const source = path.join(ROOT, from);
  if (!fs.existsSync(source)) {
    log(`跳过（不存在）: ${from}`);
    return null;
  }
  fs.copyFileSync(source, path.join(DIR, to));
  const kb = Math.round(fs.statSync(source).size / 1024);
  log(`${to}（${kb} KB）`);
  return kb;
};

const docs = [
  ["docs/report/织识-Loom-作品介绍.pdf", "01-作品文档/作品介绍-织识Loom.pdf"],
  ["docs/report/织识-Loom-技术报告.pdf", "01-作品文档/技术报告-织识Loom.pdf"],
  ["docs/report/织识-Loom-演示稿.pdf", "03-演示材料/演示稿.pdf"],
  ["docs/report/织识-Loom-演示视频脚本.pdf", "03-演示材料/视频分镜脚本.pdf"],
];

for (const [from, to] of docs) copyIfExists(from, to);

/* ---------- 3. 源码（git archive，不含 node_modules / .next） ---------- */
try {
  const tar = execSync("git archive --format=zip --prefix=loom/ HEAD", {
    cwd: ROOT,
    maxBuffer: 200 * 1024 * 1024,
  });
  fs.writeFileSync(path.join(DIR, "02-源码/loom-source.zip"), tar);
  log(`02-源码/loom-source.zip（${Math.round(tar.length / 1024 / 1024)} MB）`);
} catch {
  log("跳过源码打包：git archive 失败");
}

/* ---------- 4. 说明文件 ---------- */
const videoExists = fs.existsSync(path.join(DIR, "03-演示材料/演示视频.mp4"));

const readme = `织识 Loom · 个人知识库助手
作品包说明
生成日期：${stamp}

────────────────────────────
在线演示（无需安装，直接打开）
  http://8.163.104.134

代码仓库
  https://github.com/Andre-lingfeng/loom

────────────────────────────
目录说明

01-作品文档/
  作品介绍-织识Loom.pdf      按提交要求 7 个小节撰写（首推阅读）
  技术报告-织识Loom.pdf      更详细的技术版：架构、关键实现、评测数据

02-源码/
  loom-source.zip            完整源码（不含依赖，解压后按 README 运行）

03-演示材料/
  ${videoExists ? "演示视频.mp4             5–8 分钟，1080p" : "演示视频.mp4             录制完成后放入本目录"}
  演示稿.pdf                 对着界面逐步操作的现场演示稿
  视频分镜脚本.pdf           录制用的分镜与逐字口播

────────────────────────────
本地运行

  pnpm install
  pnpm dev          # http://localhost:3000

不需要 API Key 也能完整使用：检索、缺口检测、简报、图谱均在本地运行。
如需云端能力（关系判定、冲突分析、问答综述、图片识别），
在 /kb/settings 填一个 OpenAI 兼容端点的 Key。

────────────────────────────
技术栈

  Next.js 15（App Router）+ React 19 + TypeScript strict
  Tailwind v4 + Zustand + three.js
  pdfjs-dist（浏览器端解析）+ unpdf（服务端兜底）
  模型：OpenAI 兼容端点，默认 DeepSeek-V4.1-Flash

────────────────────────────
关于源码包

  loom-source.zip 只含源码（约 1.5 MB），不含依赖、构建产物、截图与 PDF。
  文档里的图片都在两个 PDF 内。
  解压后执行 pnpm install && pnpm dev 即可运行。

────────────────────────────
说明

数据只存在浏览器 localStorage，不上传、不需要账号。
内置 8 条素材均为真实公开材料（Fortune / Anthropic / arXiv / APS 等），
其中两条是刻意选的一对矛盾证据，用于演示冲突检测。
`;

fs.writeFileSync(path.join(DIR, "00-说明.txt"), readme, "utf8");
log("00-说明.txt");

/* ---------- 5. 压缩 ---------- */
const zipPath = path.join(OUT, `${NAME}-${stamp}.zip`);
try {
  execSync(
    `powershell.exe -NoProfile -Command "Compress-Archive -Path '${DIR}' -DestinationPath '${zipPath}' -Force"`,
    { stdio: "pipe" },
  );
  const mb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
  log(`压缩完成：release/${path.basename(zipPath)}（${mb} MB）`);
} catch {
  log("压缩失败：可手动右键「${NAME}」文件夹 → 压缩为 zip");
}

/* ---------- 6. 清单 ---------- */
console.log("\n=== 作品包内容 ===");
const walk = (dir, prefix = "") => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      console.log(`${prefix}${entry.name}/`);
      walk(full, `${prefix}  `);
    } else {
      const kb = Math.round(fs.statSync(full).size / 1024);
      console.log(`${prefix}${entry.name}  (${kb} KB)`);
    }
  }
};
walk(DIR);
