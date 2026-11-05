"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, ImageIcon, Link2, Loader2, Type, X } from "lucide-react";

import { isVisionConfigured, loadConfig, resolveVision } from "@/lib/kb/llm";
import { useKb } from "@/lib/kb/store";
import { extractImageText } from "@/lib/kb/vision";
import { cn } from "@/lib/utils";

import { ErrorNote } from "./ErrorNote";
import { input, primary } from "./theme";

type Tab = "text" | "file" | "image" | "url";

const TABS: { key: Tab; label: string; icon: typeof Type }[] = [
  { key: "text", label: "粘贴", icon: Type },
  { key: "file", label: "文件", icon: FileText },
  { key: "image", label: "图片", icon: ImageIcon },
  { key: "url", label: "链接", icon: Link2 },
];

export function AddSourceDialog({ onClose }: { onClose: () => void }) {
  const addSource = useKb((s) => s.addSource);
  const setView = useKb((s) => s.setView);

  const [tab, setTab] = useState<Tab>("text");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [intent, setIntent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [visionModel, setVisionModel] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [pdfProgress, setPdfProgress] = useState<{ page: number; total: number } | null>(null);
  const [pdfTotal, setPdfTotal] = useState(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const config = loadConfig();
    setVisionModel(isVisionConfigured(config) ? resolveVision(config).model : "");
  }, []);

  /** 读 PDF：优先在浏览器里解析（无体积上限），失败再走服务端 */
  const loadPdf = async (file: File) => {
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    setError("");
    setLoading(true);
    setPdfProgress(null);

    try {
      const { extractPdfText } = await import("@/lib/kb/pdf");
      const result = await extractPdfText(file, (page, total) => {
        setPdfProgress({ page, total });
      });

      if (result.text.length >= 40) {
        setBody(result.text);
        setPdfTotal(result.text.length);
        return;
      }

      // 抽不出文字：扫描件，明确告诉用户换路径
      setBody("");
      setError(
        `这份 PDF 共 ${result.pages} 页，但没有文字层（可能是扫描件）。用「图片」页签导入前几页，或先用 OCR 转成文本。`,
      );
      return;
    } catch {
      // 本地解析失败（加密/损坏/浏览器兼容）→ 退回服务端，但受 4MB 限制
      if (file.size > 4 * 1024 * 1024) {
        setBody("");
        setError(
          `这份 PDF 有 ${(file.size / 1024 / 1024).toFixed(1)}MB，本地解析失败且超过服务端 4MB 上限。可以先压缩，或拆成几份。`,
        );
        return;
      }

      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/pdf", { method: "POST", body: form });
        const data = (await res.json()) as { text?: string; error?: string };

        if (!res.ok || !data.text) {
          setBody("");
          setError(data.error ?? "PDF 解析失败");
          return;
        }
        setBody(data.text);
      } catch {
        setBody("");
        setError("PDF 解析请求失败，检查网络后重试");
      }
    } finally {
      setLoading(false);
      setPdfProgress(null);
    }
  };

  const canSubmit =
    !loading &&
    (tab === "url"
      ? url.trim().length > 8
      : tab === "image"
        ? Boolean(imageFile)
        : body.trim().length > 20);

  /** 正文入库前的体积保护：localStorage 约 5MB，超长文档保留头部即可检索 */
  const LIMIT = 40_000;
  const clamp = (value: string) => {
    const text = value.trim();
    if (text.length <= LIMIT) return { text, truncated: 0 };
    return { text: text.slice(0, LIMIT), truncated: text.length };
  };

  /** 只要一行、且是 http(s) 链接，就当作链接处理 */
  const looksLikeUrl = (value: string) => {
    const text = value.trim();
    return /^https?:\/\/\S+$/i.test(text) && !/\s/.test(text);
  };

  /** 抓取网页正文并入库；链接页签与粘贴页签共用 */
  const ingestUrl = async (target: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const data = (await res.json()) as {
        title?: string;
        text?: string;
        error?: string;
      };
      if (!res.ok || !data.text) {
        setError(data.error ?? "抓取失败，请改用粘贴");
        return;
      }
      const safe = clamp(data.text);
      addSource({
        kind: "url",
        title: data.title || target,
        text: safe.text,
        url: target,
        intent:
          intent || (safe.truncated ? `原文 ${safe.truncated} 字，已保留前 4 万字` : ""),
      });
    } catch {
      setError("网络异常，请改用粘贴");
      return;
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    setError("");

    if (tab === "url") {
      await ingestUrl(url.trim());
    } else if (tab === "text" && looksLikeUrl(body)) {
      // 直接粘网址进「粘贴」框：自动按链接抓取，而不是把网址当正文存下
      await ingestUrl(body.trim());
    } else if (tab === "image") {
      if (!imageFile) return;
      setLoading(true);
      try {
        const result = await extractImageText(imageFile);
        addSource({
          kind: "image",
          title: title.trim() || imageFile.name.replace(/\.[^.]+$/, ""),
          text: result.text,
          thumbnail: result.thumb,
          intent,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "图片识别失败");
        return;
      } finally {
        setLoading(false);
      }
    } else {
      const safe = clamp(body);
      addSource({
        kind: tab === "file" ? "file" : "text",
        title,
        text: safe.text,
        intent:
          intent || (safe.truncated ? `原文 ${safe.truncated} 字，已保留前 4 万字` : ""),
      });
    }

    setView("graph");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-[var(--kb-modal)]">
        <div className="flex items-start justify-between border-b border-white/[0.07] px-5 py-4">
          <div>
            <div className="text-sm font-medium">添加素材</div>
            <div className="mt-0.5 text-2xs text-white/30">
              写完一句「为什么存它」，这条素材才算消化过
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/35 transition-colors hover:bg-white/5 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1 px-4 pt-4">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors duration-200",
                  active
                    ? "bg-white text-black"
                    : "text-white/40 hover:bg-white/5 hover:text-white/70",
                )}
              >
                <Icon size={13} />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="space-y-3 p-5">
          {tab === "url" ? (
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://… 文章链接"
              className={input}
            />
          ) : tab === "image" ? (
            <>
              <input
                ref={imageRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;

                  const isPdf =
                    file.type === "application/pdf" ||
                    file.name.toLowerCase().endsWith(".pdf");

                  // 误选 PDF：自动切到「文件」页签并按 PDF 解析，不用重新选
                  if (isPdf) {
                    setTab("file");
                    setError("");
                    await loadPdf(file);
                    return;
                  }

                  if (!file.type.startsWith("image/")) {
                    setError(
                      `「${file.name}」不是图片。文档用「文件」页签，网页用「链接」，纯文本用「粘贴」。`,
                    );
                    return;
                  }

                  setImageFile(file);
                  setImagePreview(URL.createObjectURL(file));
                  if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
                  setError("");
                }}
              />

              <button
                onClick={() => imageRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 py-6 text-xs text-white/35 transition-colors hover:border-white/30 hover:text-white/70"
              >
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imagePreview}
                    alt="待识别图片"
                    className="max-h-40 rounded-lg object-contain"
                  />
                ) : (
                  <>
                    <ImageIcon size={14} />
                    选择截图 / 白板 / 论文页（PNG · JPG · WebP）
                  </>
                )}
              </button>

              {imageFile && (
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="标题（默认用文件名）"
                  className={input}
                />
              )}

              <p className="text-2xs leading-relaxed text-white/30">
                {visionModel ? (
                  <>将用视觉模型「{visionModel}」把图片里的文字转录成正文，再入库。</>
                ) : (
                  <>
                    还没配置能看图的模型。
                    <a href="/kb/settings" className="text-violet-300 hover:underline">
                      去配置
                    </a>
                  </>
                )}
              </p>
            </>
          ) : tab === "text" ? (
            <>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={7}
              placeholder="把正文粘贴进来…"
              className="scrollbar-thin w-full resize-none rounded-xl bg-[var(--kb-input)] px-4 py-3 text-sm leading-relaxed text-white outline-none placeholder:text-white/25 focus:ring-2 focus:ring-white/20"
            />
            {looksLikeUrl(body) && (
              <p className="text-2xs text-violet-300/80">
                检测到链接：入库时会抓取网页正文，而不是把这行网址存下来
              </p>
            )}
            </>
          ) : (
            <>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="标题（可留空自动命名）"
                className={input}
              />

              <input
                ref={fileRef}
                type="file"
                accept=".md,.txt,.text,.pdf,text/plain,application/pdf"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setError("");

                  const isPdf =
                    file.type === "application/pdf" ||
                    file.name.toLowerCase().endsWith(".pdf");

                  if (!isPdf) {
                    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
                    setBody(await file.text());
                    return;
                  }

                  await loadPdf(file);
                }}
              />

              <button
                onClick={() => fileRef.current?.click()}
                className="w-full rounded-xl border border-dashed border-white/10 py-8 text-xs text-white/35 transition-colors hover:border-white/30 hover:text-white/70"
              >
                {pdfProgress
                  ? `正在解析第 ${pdfProgress.page} / ${pdfProgress.total} 页…`
                  : body
                    ? `已读取 ${body.length} 字，点击可更换文件`
                    : "选择 .md / .txt / PDF 文件"}
              </button>

              <p className="text-2xs leading-relaxed text-white/25">
                PDF 在浏览器内解析，不受上传大小限制；扫描件没有文字层时会提示改用图片。
                {pdfTotal > 40_000 && (
                  <span className="mt-1 block text-amber-300/70">
                    原文 {pdfTotal.toLocaleString()} 字，入库会保留前 4 万字（浏览器存储上限所限）。
                  </span>
                )}
              </p>
            </>
          )}

          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-2xs text-white/45">为什么存它？</span>
              <span className="text-2xs text-white/25">留空会进「未消化」</span>
            </div>
            <input
              value={intent}
              onChange={(event) => setIntent(event.target.value)}
              placeholder="例：写综述时要用的失败率数据"
              className={input}
            />
          </div>

          {error && (
            <ErrorNote
              message={error}
              hint="检查上面的地址与 Key；实在不行可以先把正文粘贴进来"
            />
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/[0.07] px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-xl px-3.5 py-2 text-sm text-white/45 transition-colors hover:text-white"
          >
            取消
          </button>
          <button onClick={submit} disabled={!canSubmit} className={primary}>
            {loading && <Loader2 size={12} className="animate-spin" />}
            {tab === "image" ? (loading ? "识别中…" : "识别并入库") : "入库"}
          </button>
        </div>
      </div>
    </div>
  );
}
