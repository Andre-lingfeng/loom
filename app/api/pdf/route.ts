import { NextResponse } from "next/server";

import { clientIp, consumeFetchQuota } from "@/lib/server/model";
import { withMetrics } from "@/lib/server/metrics";
import { extractText, getDocumentProxy } from "unpdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 线上平台（Vercel / 多数 serverless）单请求上限 4.5MB，这里留出富余
const MAX_BYTES = process.env.VERCEL ? 4 * 1024 * 1024 : 20 * 1024 * 1024;
const MAX_PAGES = 300;

/**
 * PDF 文本抽取。
 * 只处理**文本型 PDF**；扫描件（图片页）抽不出文字时明确提示改用图片入库。
 */
async function handle(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "请以 multipart/form-data 上传文件" }, { status: 400 });
  }

  const quota = consumeFetchQuota(clientIp(request));
  if (!quota.ok) {
    return NextResponse.json({ error: quota.reason }, { status: 429 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "没有收到文件" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `PDF 太大（${(file.size / 1024 / 1024).toFixed(1)}MB），上限 ${Math.round(
          MAX_BYTES / 1024 / 1024,
        )}MB`,
      },
      { status: 413 },
    );
  }

  const startedAt = Date.now();

  try {
    const buffer = new Uint8Array(await file.arrayBuffer());

    // 文件头校验：避免把改了后缀名的 txt 当 PDF 丢给解析器
    const head = new TextDecoder().decode(buffer.slice(0, 5));
    if (head !== "%PDF-") {
      return NextResponse.json(
        { error: "这不是有效的 PDF 文件（文件头不是 %PDF-）" },
        { status: 400 },
      );
    }
    const pdf = await getDocumentProxy(buffer);

    if (pdf.numPages > MAX_PAGES) {
      return NextResponse.json(
        { error: `页数过多（${pdf.numPages} 页），上限 ${MAX_PAGES} 页` },
        { status: 413 },
      );
    }

    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    const cleaned = String(text ?? "")
      .replace(/\u0000/g, "")
      // 兼容区汉字（康熙部首 / CJK 兼容表意文字）归一，否则搜索匹配不到
      .replace(/[\u2E80-\u2FDF\uF900-\uFAFF]/g, (ch) => ch.normalize("NFKC"))
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (cleaned.length < 40) {
      return NextResponse.json(
        {
          error:
            "这份 PDF 抽不出文字，可能是扫描件。请改用「图片」入库，或先用 OCR 转成文本。",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      text: cleaned,
      pages: totalPages,
      chars: cleaned.length,
      tookMs: Date.now() - startedAt,
      filename: file.name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "解析失败";
    return NextResponse.json(
      { error: `PDF 解析失败：${message.slice(0, 120)}` },
      { status: 422 },
    );
  }
}

// 自动记录耗时与状态码，供 /api/metrics 聚合
export const POST = withMetrics("pdf", handle);
