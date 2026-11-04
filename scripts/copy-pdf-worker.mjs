import fs from "node:fs";
import path from "node:path";

/**
 * 把 pdfjs 的 worker 复制到 public/。
 * pdfjs 在浏览器里必须能拿到 worker 文件，否则会退化成“fake worker”并报错。
 * postinstall 与 prebuild 都会执行，部署时同样生效。
 */
const source = path.join(
  process.cwd(),
  "node_modules",
  "pdfjs-dist",
  "build",
  "pdf.worker.mjs",
);
const target = path.join(process.cwd(), "public", "pdf.worker.mjs");

if (!fs.existsSync(source)) {
  console.warn("[pdf-worker] 未找到 pdfjs-dist，跳过复制");
  process.exit(0);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);

const size = Math.round(fs.statSync(target).size / 1024);
console.log(`[pdf-worker] 已复制到 public/pdf.worker.mjs（${size}KB）`);
