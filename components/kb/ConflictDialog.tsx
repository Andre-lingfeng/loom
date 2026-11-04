"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Loader2, Send, Sparkles, X } from "lucide-react";

import {
  analyzeConflict,
  askAboutConflict,
  type ChatTurn,
  type ConflictAnalysis,
} from "@/lib/kb/conflict";
import type { Source } from "@/lib/kb/types";
import { cn } from "@/lib/utils";

import { input, primary } from "./theme";

const SUGGESTIONS = [
  "哪一条更可信？为什么？",
  "如果两条都对，各自成立的前提是什么？",
  "要确认这件事，我还需要找什么证据？",
];

export function ConflictDialog({
  a,
  b,
  reason,
  initial,
  onAnalysis,
  onClose,
}: {
  a: Source;
  b: Source;
  reason: string;
  initial: ConflictAnalysis | null;
  onAnalysis: (analysis: ConflictAnalysis) => void;
  onClose: () => void;
}) {
  const [analysis, setAnalysis] = useState<ConflictAnalysis | null>(initial);
  const [analyzing, setAnalyzing] = useState(!initial);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const run = useCallback(async () => {
    setAnalyzing(true);
    setError("");
    try {
      const result = await analyzeConflict(a, b, reason);
      setAnalysis(result);
      onAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败");
    } finally {
      setAnalyzing(false);
    }
  }, [a, b, reason, onAnalysis]);

  useEffect(() => {
    if (!initial) void run();
  }, [initial, run]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ask = async (question: string) => {
    const value = question.trim();
    if (!value || asking) return;
    if (!analysis) return;

    setAsking(true);
    setError("");
    const nextTurns: ChatTurn[] = [...turns, { role: "user", text: value }];
    setTurns(nextTurns);
    setDraft("");

    try {
      const answer = await askAboutConflict(a, b, analysis, turns, value);
      setTurns([...nextTurns, { role: "assistant", text: answer }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "追问失败");
      setTurns(nextTurns);
    } finally {
      setAsking(false);
    }
  };

  if (!mounted) return null;

  const panel = (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-3 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="冲突分析"
    >
      <div
        className="flex h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[var(--kb-modal)]"
        onClick={(event) => event.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-5 py-3.5">
          <AlertTriangle size={15} className="text-amber-300" />
          <span className="text-sm font-medium">看清这处分歧</span>
          <button
            onClick={onClose}
            className="ml-auto rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {/* 两条素材 */}
          <div className="flex flex-col gap-2 sm:flex-row">
            {[
              { label: "素材 A", source: a },
              { label: "素材 B", source: b },
            ].map((item) => (
              <div key={item.label} className="min-w-0 flex-1 rounded-xl bg-white/[0.04] p-3">
                <div className="text-2xs text-white/30">{item.label}</div>
                <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/70">
                  {item.source.title}
                </div>
              </div>
            ))}
          </div>

          <p className="rounded-xl bg-amber-400/[0.07] px-3 py-2 text-2xs leading-relaxed text-amber-200/70">
            模型判定：{reason}
          </p>

          {/* 分析结果 */}
          {analyzing && (
            <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-3 text-2xs text-white/45">
              <Loader2 size={12} className="animate-spin" />
              正在对比两条素材…
            </div>
          )}

          {analysis && (
            <div className="rounded-xl bg-violet-400/[0.08] p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-2xs text-violet-200">
                  分歧实质
                </span>
                {analysis.difference && (
                  <span className="text-2xs text-white/35">性质：{analysis.difference}</span>
                )}
                {analysis.tokens ? (
                  <span className="ml-auto text-2xs text-white/20">{analysis.tokens} tokens</span>
                ) : null}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-white/80">{analysis.substance}</p>
              {analysis.question && (
                <p className="mt-2 text-2xs leading-relaxed text-violet-200/70">
                  先问自己：{analysis.question}
                </p>
              )}
            </div>
          )}

          {/* 对话 */}
          {analysis && turns.length === 0 && (
            <div className="space-y-2">
              <div className="text-2xs text-white/30">可以继续追问 · 模型只看这两份材料</div>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((item) => (
                  <button
                    key={item}
                    onClick={() => void ask(item)}
                    className="rounded-lg border border-white/10 px-2.5 py-1 text-2xs text-white/50 transition-colors hover:border-white/25 hover:text-white"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn, index) => (
            <div
              key={index}
              className={cn(
                "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap",
                turn.role === "user"
                  ? "ml-auto bg-violet-500/20 text-white/85"
                  : "bg-white/[0.05] text-white/70",
              )}
            >
              {turn.text}
            </div>
          ))}

          {asking && (
            <div className="flex items-center gap-2 text-2xs text-white/35">
              <Loader2 size={11} className="animate-spin" />
              模型正在回答…
            </div>
          )}

          {error && <p className="text-2xs text-red-300/80">{error}</p>}
        </div>

        {/* 输入 */}
        <div className="shrink-0 border-t border-white/[0.07] p-3">
          <div className="flex items-center gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void ask(draft);
                }
              }}
              placeholder={analysis ? "追问：这两条到底差在哪？" : "正在分析…"}
              disabled={!analysis || asking}
              className={cn(input, "h-10 text-xs")}
            />
            <button
              onClick={() => void ask(draft)}
              disabled={!draft.trim() || !analysis || asking}
              className={cn(primary, "shrink-0")}
            >
              <Send size={12} />
              追问
            </button>
          </div>
          {analysis && (
            <p className="mt-2 flex items-center gap-1.5 text-2xs text-white/20">
              <Sparkles size={10} />
              回答只基于这两份材料，超出范围会明确告诉你
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(
    panel,
    document.querySelector(".aurora-root") ?? document.body,
  );
}
