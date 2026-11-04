"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Maximize2, Minimize2, Trash2, X } from "lucide-react";

import { useKb } from "@/lib/kb/store";
import { tokenize } from "@/lib/kb/text";
import { cn } from "@/lib/utils";

import { card as cardCls } from "./theme";
import { Badge } from "./ui";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function Highlight({ text, query }: { text: string; query: string }) {
  const tokens = [...new Set(tokenize(query))]
    .filter((token) => token.length >= 2)
    .slice(0, 12);

  if (tokens.length === 0) return <>{text}</>;

  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, index) =>
        tokens.some((token) => part.toLowerCase() === token.toLowerCase()) ? (
          <mark key={index} className="rounded bg-violet-500/30 px-0.5 text-white">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

export function SourceDetail() {
  const sources = useKb((s) => s.sources);
  const selectedId = useKb((s) => s.selectedId);
  const select = useKb((s) => s.select);
  const query = useKb((s) => s.query);
  const setIntent = useKb((s) => s.setIntent);
  const removeSource = useKb((s) => s.removeSource);

  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [width, setWidth] = useState(384);
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(384);

  useEffect(() => {
    setMounted(true);
    const media = window.matchMedia("(max-width: 1023px)");
    const sync = () => setNarrow(media.matches);
    sync();
    media.addEventListener("change", sync);

    const saved = Number(localStorage.getItem("loom.detailWidth"));
    if (Number.isFinite(saved) && saved >= 320 && saved <= 900) {
      setWidth(saved);
      widthRef.current = saved;
    }

    return () => media.removeEventListener("change", sync);
  }, []);

  // 拖拽左缘调整宽度：夹在 320–900 之间，松手后记住
  const startDrag = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    setDragging(true);

    const move = (moveEvent: PointerEvent) => {
      const next = Math.min(
        900,
        Math.max(320, window.innerWidth - moveEvent.clientX),
      );
      widthRef.current = next;
      setWidth(next);
    };
    const stop = () => {
      setDragging(false);
      try {
        localStorage.setItem("loom.detailWidth", String(widthRef.current));
      } catch {
        /* ignore */
      }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }, []);

  // 把抽屉宽度写到根节点：主内容据此让出空间，列表最后一张卡也点得到
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".aurora-root");
    if (!root) return;
    if (narrow) {
      root.style.removeProperty("--kb-drawer");
      return;
    }
    root.style.setProperty("--kb-drawer", `${width}px`);
    return () => {
      root.style.removeProperty("--kb-drawer");
    };
  }, [width, narrow]);

  const source = sources.find((item) => item.id === selectedId);
  if (!source) return null;

  const date = new Date(source.createdAt).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });

  // 窄屏与全屏阅读都走覆盖层：靠 portal 挂到 body，避免被应用顶栏压住
  // 面板够宽时自动放大字号，避免「宽一栏、小字」的失衡
  const roomy = expanded || narrow || width >= 520;

  const panel = (
    <div className="flex h-full min-h-0 flex-col bg-[var(--kb-panel)]">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-white/[0.06] px-3">
        <span className="min-w-0 flex-1 truncate text-2xs text-white/30">
          素材详情
        </span>

        <button
          onClick={() => setExpanded((value) => !value)}
          title={expanded ? "收起" : "全屏阅读"}
          className="rounded-lg p-1.5 text-white/35 transition-colors hover:bg-white/5 hover:text-white"
        >
          {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>

        {source.url && (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            title="打开原文链接"
            className="rounded-lg p-1.5 text-white/35 transition-colors hover:bg-white/5 hover:text-white"
          >
            <ExternalLink size={13} />
          </a>
        )}

        <button
          onClick={() => {
            setExpanded(false);
            select(null);
          }}
          title="关闭"
          className="rounded-lg p-1.5 text-white/35 transition-colors hover:bg-white/5 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>

      <div
        className={cn(
          "scrollbar-thin min-h-0 flex-1 overflow-y-auto",
          roomy ? "px-5 py-6 sm:px-8" : "p-4",
        )}
      >
        <div className={roomy ? "mx-auto w-full max-w-2xl" : ""}>
          {source.disputesWith && source.disputesWith.length > 0 && (
            <p className="mb-3 rounded-xl bg-amber-400/[0.08] px-3 py-2 text-2xs leading-relaxed text-amber-200/70">
              这条素材与
              {source.disputesWith
                .map((id) => sources.find((item) => item.id === id)?.title ?? "另一条素材")
                .map((title) => `「${title}」`)
                .join("、")}
              存在<span className="text-amber-200">已确认的分歧</span>，两者并存。回答里如果同时引用，会明确点出矛盾。
            </p>
          )}

          {source.absorbedBy && (
            <p className="mb-3 rounded-xl bg-white/[0.05] px-3 py-2 text-2xs leading-relaxed text-white/45">
              这条素材已被并入「
              {sources.find((item) => item.id === source.absorbedBy)?.title ?? "另一条素材"}
              」，作为附属材料保留，不再单独参与检索。
            </p>
          )}

          {source.absorbed && source.absorbed.length > 0 && (
            <div className="mb-3 rounded-xl bg-violet-400/[0.08] px-3 py-2.5">
              <div className="text-2xs text-violet-200/80">
                这条素材吸收了 {source.absorbed.length} 条材料：
              </div>
              <ul className="mt-1.5 space-y-1">
                {source.absorbed.map((id) => {
                  const item = sources.find((entry) => entry.id === id);
                  return (
                    <li key={id} className="text-2xs leading-relaxed text-white/55">
                      · {item?.title ?? id}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-2xs text-white/30">
                它们作为反方证据一起保留，检索时不再单独引用。
              </p>
            </div>
          )}
          {(source.absorbedBy ||
            (source.disputesWith && source.disputesWith.length > 0) ||
            (source.absorbed && source.absorbed.length > 0)) && (
            <div className="mb-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
              <div className="text-2xs text-white/30">跳到对应的冲突素材</div>
              <div className="mt-1.5 flex flex-col gap-0.5">
                {source.absorbedBy && (
                  <button
                    onClick={() => select(source.absorbedBy ?? null)}
                    className="flex items-center gap-1.5 truncate rounded-lg px-1.5 py-1 text-left text-2xs text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
                  >
                    <span className="shrink-0 text-violet-300">被并入</span>
                    <span className="truncate">
                      {sources.find((item) => item.id === source.absorbedBy)?.title ??
                        "另一条素材"}
                    </span>
                  </button>
                )}

                {(source.disputesWith ?? []).map((id) => (
                  <button
                    key={id}
                    onClick={() => select(id)}
                    className="flex items-center gap-1.5 truncate rounded-lg px-1.5 py-1 text-left text-2xs text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
                  >
                    <span className="shrink-0 text-amber-300">存在分歧</span>
                    <span className="truncate">
                      {sources.find((item) => item.id === id)?.title ?? id}
                    </span>
                  </button>
                ))}

                {(source.absorbed ?? []).map((id) => (
                  <button
                    key={id}
                    onClick={() => select(id)}
                    className="flex items-center gap-1.5 truncate rounded-lg px-1.5 py-1 text-left text-2xs text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
                  >
                    <span className="shrink-0 text-violet-300">吸收了</span>
                    <span className="truncate">
                      {sources.find((item) => item.id === id)?.title ?? id}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {source.thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={source.thumbnail}
              alt=""
              className="mb-3 w-full rounded-xl object-cover ring-1 ring-white/[0.08]"
            />
          )}

          <h3
            className={cn(
              "leading-snug font-medium",
              roomy ? "text-xl sm:text-2xl" : "text-sm",
            )}
          >
            {source.title}
          </h3>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge>{date}</Badge>
            <Badge>
              {source.kind === "url"
                ? "链接"
                : source.kind === "file"
                  ? "文件"
                  : source.kind === "image"
                    ? "图片"
                    : "粘贴"}
            </Badge>
            {!source.intent && <Badge tone="warn">未消化</Badge>}
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            {source.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-2xs text-white/40"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className={cn(cardCls, "mt-4", roomy ? "p-4" : "p-3")}>
            <div className="mb-1.5 text-2xs text-white/30">为什么存它</div>
            {source.intent ? (
              <p
                className={cn(
                  "text-white/75",
                  roomy ? "text-sm leading-7" : "text-xs leading-relaxed",
                )}
              >
                {source.intent}
              </p>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && draft.trim()) {
                      setIntent(source.id, draft);
                      setDraft("");
                    }
                  }}
                  placeholder="补一句…"
                  className="w-full rounded-lg bg-[var(--kb-input)] px-2 py-1 text-2xs text-white outline-none placeholder:text-white/25 focus:ring-2 focus:ring-white/20"
                />
                <button
                  onClick={() => {
                    if (!draft.trim()) return;
                    setIntent(source.id, draft);
                    setDraft("");
                  }}
                  className="shrink-0 rounded-lg bg-white px-2 py-1 text-2xs font-medium text-black disabled:opacity-30"
                  disabled={!draft.trim()}
                >
                  存
                </button>
              </div>
            )}
          </div>

          <div className="mt-4">
            <div className="mb-1.5 text-2xs text-white/30">
              原文
              {roomy && source.text.length > 0 && (
                <span className="ml-2 text-white/20">{source.text.length} 字</span>
              )}
            </div>
            <div
              className={cn(
                "whitespace-pre-wrap",
                roomy
                  ? "text-sm leading-7 text-white/60"
                  : "text-2xs leading-relaxed text-white/45",
              )}
            >
              <Highlight text={source.text} query={query} />
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-white/[0.06] p-3">
        <div className={roomy ? "mx-auto w-full max-w-2xl" : ""}>
          <button
            onClick={() => {
              setExpanded(false);
              removeSource(source.id);
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-400/20 py-2 text-2xs text-red-300 transition-colors hover:bg-red-400/10"
          >
            <Trash2 size={12} />
            删除这条素材
          </button>
        </div>
      </div>
    </div>
  );

  if (mounted && expanded) {
    // 必须挂回 .aurora-root：--kb-* 变量定义在那里，挂到 body 会失去主题
    const host = document.querySelector(".aurora-root") ?? document.body;
    return createPortal(
      <div className="fixed inset-0 z-[80]">{panel}</div>,
      host,
    );
  }

  // 覆盖式抽屉：不挤占画布宽度，避免打开详情后整张图位移
  return (
    <div
      style={{ width: narrow ? "100%" : width }}
      className={cn(
        "fixed z-40 flex flex-col border-l border-white/[0.06] bg-[var(--kb-panel)] shadow-2xl shadow-black/60",
        narrow ? "inset-0" : "top-16 right-0 bottom-0",
      )}
    >
      <div
        onPointerDown={startDrag}
        onDoubleClick={() => {
          setWidth(384);
          widthRef.current = 384;
          try {
            localStorage.setItem("loom.detailWidth", "384");
          } catch {
            /* ignore */
          }
        }}
        title="拖拽调整宽度，双击恢复默认"
        className={cn(
          "absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize transition-colors hover:bg-violet-400/30",
          dragging && "bg-violet-400/40",
          narrow && "hidden",
        )}
      />
      {panel}
    </div>
  );
}
