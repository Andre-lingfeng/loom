/**
 * 浏览器内解析 PDF：文件不上传，因此没有服务端请求体大小限制。
 * 只有解析失败（加密、损坏、扫描件）时才由调用方决定是否回退。
 */
export async function extractPdfText(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");

  // worker 由 scripts/copy-pdf-worker.mjs 复制到 public，固定路径最稳
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";

  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data, isEvalSupported: false });
  const doc = await task.promise;

  const chunks: string[] = [];
  const total = doc.numPages;

  for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();

    let line = "";
    const lines: string[] = [];

    for (const item of content.items) {
      if (!("str" in item)) continue;
      line += item.str;
      // hasEOL 标记换行；没有它就在行尾按宽度判断
      if (item.hasEOL) {
        lines.push(line);
        line = "";
      }
    }
    if (line) lines.push(line);

    chunks.push(lines.join("\n"));
    page.cleanup();
    onProgress?.(pageNumber, total);
  }

  // v6 里销毁要走 loadingTask，PDFDocumentProxy 上不再保证有 destroy
  await task.destroy();

  const text = chunks
    .join("\n\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text, pages: total };
}
