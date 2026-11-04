"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, Loader2, Sparkles, TriangleAlert } from "lucide-react";

import { analyzeConflict, type ConflictAnalysis } from "@/lib/kb/conflict";

import { ConflictDialog } from "./ConflictDialog";
import { useKb } from "@/lib/kb/store";
import type { Conflict, ConflictResolution, Source } from "@/lib/kb/types";
import { cn } from "@/lib/utils";

import { card, ghost, input, primary } from "./theme";

const RESOLUTIONS: { key: ConflictResolution; label: string; hint: string }[] = [
  { key: "a", label: "采纳前者", hint: "后者并入前者，作为反方证据保留" },
  { key: "b", label: "采纳后者", hint: "前者并入后者，作为反方证据保留" },
  { key: "both", label: "保留双方", hint: "两条并列，回答里会点明分歧" },
];

function SideCard({ source, label }: { source?: Source; label: string }) {
  if (!source) {
    return (
      <div className="flex-1 rounded-xl bg-white/[0.03] p-3 text-2xs text-white/30">
        {label}：素材已删除
      </div>
    );
  }
  return (
    <div className="min-w-0 flex-1 rounded-xl bg-white/[0.03] p-3">
      <div className="text-2xs text-white/30">{label}</div>
      <div className="mt-1 line-clamp-2 text-xs leading-relaxed font-medium text-white/85">
        {source.title}
      </div>
      <div className="mt-1.5 line-clamp-2 text-2xs leading-relaxed text-white/35">
        {source.summary || source.text.slice(0, 60)}
      </div>
      {source.absorbedBy && (
        <div className="mt-2 inline-flex items-center gap-1 rounded bg-violet-400/15 px-1.5 py-0.5 text-2xs text-violet-200/80">
          已并入对方
        </div>
      )}
      {source.absorbed && source.absorbed.length > 0 && (
        <div className="mt-2 inline-flex items-center gap-1 rounded bg-violet-400/15 px-1.5 py-0.5 text-2xs text-violet-200/80">
          吸收了 {source.absorbed.length} 条
        </div>
      )}
    </div>
  );
}

function ConflictItem({
  conflict,
  sources,
}: {
  conflict: Conflict;
  sources: Source[];
}) {
  const resolveConflict = useKb((s) => s.resolveConflict);
  const [choice, setChoice] = useState<ConflictResolution | null>(
    conflict.resolution ?? null,
  );
  const [note, setNote] = useState(conflict.note ?? "");
  const [editing, setEditing] = useState(false);
  const [analysis, setAnalysis] = useState<ConflictAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const a = sources.find((source) => source.id === conflict.aId);
  const b = sources.find((source) => source.id === conflict.bId);
  const resolved = conflict.status === "resolved";
  const ready = note.trim().length >= 6;

  const runAnalysis = async () => {
    if (!a || !b) return;
    setAnalyzing(true);
    setAnalysisError("");
    try {
      setAnalysis(await analyzeConflict(a, b, conflict.reason));
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "分析失败");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div
      className={cn(
        card,
        "p-4",
        resolved && !editing && "opacity-80",
        (!resolved || editing) && "ring-1 ring-amber-400/20",
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <TriangleAlert
          size={13}
          className={resolved ? "text-white/30" : "text-amber-300"}
        />
        <span className="text-2xs text-white/45">
          {resolved ? "已处理" : "待处理"}
        </span>
        <span className="ml-auto text-2xs text-white/25">
          {resolved && conflict.resolution
            ? RESOLUTIONS.find((item) => item.key === conflict.resolution)?.label
            : "必须给出判断才能关闭"}
        </span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <SideCard source={a} label="素材 A" />
        <div className="grid shrink-0 place-items-center text-white/20">
          <ArrowRight size={13} className="hidden sm:block" />
        </div>
        <SideCard source={b} label="素材 B" />
      </div>

      <p className="mt-3 rounded-xl bg-amber-400/[0.07] px-3 py-2 text-2xs leading-relaxed text-amber-200/70">
        模型判定：{conflict.reason}
      </p>

      {dialogOpen && a && b && (
        <ConflictDialog
          a={a}
          b={b}
          reason={conflict.reason}
          initial={analysis}
          onAnalysis={setAnalysis}
          onClose={() => setDialogOpen(false)}
        />
      )}

      {!resolved && (
        <div className="mt-3">
          <button
            onClick={() => {
              setDialogOpen(true);
              if (!analysis) void runAnalysis();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-400/30 bg-violet-400/[0.10] px-4 py-2.5 text-xs font-medium text-violet-100 transition-colors hover:border-violet-300/50 hover:bg-violet-400/[0.18] sm:w-auto"
          >
            <Sparkles size={14} />
            让模型说清分歧，并可追问
          </button>
          {analyzing && (
            <p className="mt-2 flex items-center gap-1.5 text-2xs text-white/35">
              <Loader2 size={11} className="animate-spin" />
              正在对比两条素材…
            </p>
          )}

          {analysisError && (
            <p className="mt-1 text-2xs text-red-300/80">{analysisError}</p>
          )}

          {analysis && (
            <div className="mt-2 rounded-xl bg-violet-400/[0.07] px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-2xs text-violet-200">
                  分歧实质
                </span>
                {analysis.difference && (
                  <span className="text-2xs text-white/35">
                    性质：{analysis.difference}
                  </span>
                )}
                {analysis.tokens ? (
                  <span className="ml-auto text-2xs text-white/20">
                    {analysis.tokens} tokens
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-white/75">
                {analysis.substance}
              </p>
              {analysis.question && (
                <p className="mt-2 text-2xs leading-relaxed text-violet-200/70">
                  先问自己：{analysis.question}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {resolved && !editing ? (
        <div className="mt-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-2xs text-white/60">
              {RESOLUTIONS.find((item) => item.key === conflict.resolution)?.label}
            </span>
            <span className="text-2xs text-white/25">
              {RESOLUTIONS.find((item) => item.key === conflict.resolution)?.hint}
            </span>
            <button
              onClick={() => setEditing(true)}
              className="ml-auto rounded-lg px-2 py-1 text-2xs text-white/45 transition-colors hover:text-white"
            >
              改判
            </button>
          </div>
          <p className="mt-2 text-2xs leading-relaxed text-white/40">
            <span className="text-white/25">你的判断：</span>
            {conflict.note}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {RESOLUTIONS.map((item) => (
              <button
                key={item.key}
                onClick={() => setChoice(item.key)}
                title={item.hint}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-2xs font-medium transition-colors",
                  choice === item.key
                    ? "bg-white text-black"
                    : "text-white/50 ring-1 ring-white/10 hover:text-white",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {choice && (
            <p className="mt-2 text-2xs leading-relaxed text-white/30">
              {RESOLUTIONS.find((item) => item.key === choice)?.hint}
            </p>
          )}

          {choice && (
            <div className="mt-3 space-y-2">
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder="写一句你的判断：为什么这样处理？这句话会记在素材上。"
                className="scrollbar-thin w-full resize-none rounded-xl bg-[var(--kb-input)] px-3 py-2 text-xs leading-relaxed text-white outline-none placeholder:text-white/25 focus:ring-2 focus:ring-white/20"
              />
              <div className="flex items-center justify-between">
                <span className="text-2xs text-white/25">
                  {ready ? "已记录，可以确认" : `还差 ${Math.max(0, 6 - note.trim().length)} 个字`}
                </span>
                <div className="flex items-center gap-2">
                  {editing && (
                    <button
                      onClick={() => {
                        setEditing(false);
                        setChoice(conflict.resolution ?? null);
                        setNote(conflict.note ?? "");
                      }}
                      className="text-2xs text-white/35 transition-colors hover:text-white"
                    >
                      取消
                    </button>
                  )}
                  <button
                    disabled={!ready}
                    onClick={() => {
                      resolveConflict(conflict.id, choice, note);
                      setEditing(false);
                    }}
                    className={primary}
                  >
                    <Check size={12} />
                    {editing ? "确认改判" : "记录判断并关闭"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function ConflictView() {
  const conflicts = useKb((s) => s.conflicts);
  const sources = useKb((s) => s.sources);
  const edgeSource = useKb((s) => s.edgeSource);
  const setView = useKb((s) => s.setView);

  const { pending, done } = useMemo(() => {
    return {
      pending: conflicts.filter((item) => item.status === "pending"),
      done: conflicts.filter((item) => item.status === "resolved"),
    };
  }, [conflicts]);

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col px-4 py-5 sm:px-6 sm:py-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-xl font-medium tracking-tight">
            <TriangleAlert size={16} className="text-amber-300" />
            内容冲突
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-white/35">
            两条素材说法不一致时，它们会出现在这里。
            <span className="text-white/50">不做出判断，简报就无法生成</span>
            ——因为自相矛盾的总结没有意义。
          </p>
        </div>
        <div className="shrink-0 rounded-xl bg-white/[0.05] px-3 py-1.5 text-center">
          <div className="text-lg leading-none font-semibold tabular-nums">
            {pending.length}
          </div>
          <div className="mt-1 text-2xs text-white/35">待处理</div>
        </div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto pb-2">
        {conflicts.length === 0 ? (
          <div className={cn(card, "grid place-items-center px-6 py-16 text-center")}>
            <TriangleAlert size={22} className="text-white/20" />
            <p className="mt-3 text-sm text-white/50">还没有检测到内容冲突</p>
            <p className="mt-1.5 max-w-sm text-2xs leading-relaxed text-white/25">
              {edgeSource === "cloud"
                ? "当前这批复材里，模型没有发现互相矛盾的说法。"
                : "冲突需要模型判断语义，请先在「关联」页点「云端重算」。"}
            </p>
            {edgeSource !== "cloud" && (
              <button onClick={() => setView("graph")} className={cn(ghost, "mt-4")}>
                去关联页运行云端分析
              </button>
            )}
          </div>
        ) : (
          <>
            {pending.map((conflict) => (
              <ConflictItem
                key={conflict.id}
                conflict={conflict}
                sources={sources}
              />
            ))}

            {done.length > 0 && (
              <div className="pt-3 text-2xs text-white/25">
                已处理 {done.length} 处
              </div>
            )}
            {done.map((conflict) => (
              <ConflictItem
                key={conflict.id}
                conflict={conflict}
                sources={sources}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
