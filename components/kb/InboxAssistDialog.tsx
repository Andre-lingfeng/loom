"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, RefreshCw, Send, Sparkles, X } from "lucide-react";

import {
  askAboutSource,
  suggestIntents,
  type AssistTurn,
  type IntentSuggestion,
} from "@/lib/kb/intent";
import type { Source } from "@/lib/kb/types";
import { cn } from "@/lib/utils";

import { input, primary } from "./theme";

const SUGGESTIONS = [
  "这条能用在什么地方？",
  "如果我要反驳它，从哪里下手？",
  "它和我的写作主题有什么关系？",
];

export function InboxAssistDialog({
  source,
  onPick,
  onClose,
}: {
  source: Source;
  onPick: (value: string) => void;
  onClose: () => void;
}) {
  const [help, setHelp] = useState<IntentSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [turns, setTurns] = useState<AssistTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const think = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setHelp(await suggestIntents(source));
    } catch (err) {
      setError(err instanceof Error ? err.message : "模型没有给出建议");
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => {
    void think();
  }, [think]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ask = async (question: string) => {
    const value = question.trim();
    if (!value || asking || !help) return;

    setAsking(true);
    setError("");
    const next: AssistTurn[] = [...turns, { role: "user", text: value }];
    setTurns(next);
    setDraft("");

    try {
      const answer = await askAboutSource(source, help.understand, turns, value);
      setTurns([...next, { role: "assistant", text: answer }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "追问失败");
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
      aria-label="让模型帮我想"
    >
      <div
        className="flex h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[var(--kb-modal)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-5 py-3.5">
          <Sparkles size={15} className="text-violet-300" />
          <span className="text-sm font-medium">让模型帮我想</span>
          <button
            onClick={onClose}
            className="ml-auto rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-xl bg-white/[0.04] p-3">
            <div className="text-2xs text-white/30">这条材料</div>
            <div className="mt-1 text-xs leading-relaxed font-medium text-white/80">
              {source.title}
            </div>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-2xs text-white/45">
              <Loader2 size={12} className="animate-spin" />
              正在读这条材料…
            </div>
          )}

          {help && (
            <div className="rounded-xl bg-violet-400/[0.08] p-3.5">
              <div className="flex items-center gap-2">
                <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-2xs text-violet-200">
                  模型理解
                </span>
                {help.tokens ? (
                  <span className="ml-auto text-2xs text-white/20">{help.tokens} tokens</span>
                ) : null}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-white/75">{help.understand}</p>

              <div className="mt-3 text-2xs text-white/30">可能的收藏理由（点击采用）</div>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {help.intents.map((item) => (
                  <button
                    key={item}
                    onClick={() => {
                      onPick(item);
                      onClose();
                    }}
                    className="flex items-center gap-2 rounded-lg bg-white/[0.05] px-2.5 py-2 text-left text-xs text-white/65 transition-colors hover:bg-white/[0.1] hover:text-white"
                  >
                    <Check size={12} className="shrink-0 text-violet-300" />
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}

          {help && turns.length === 0 && (
            <div className="space-y-2">
              <div className="text-2xs text-white/30">可以继续追问 · 模型只看这条材料</div>
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

        <div className="shrink-0 border-t border-white/[0.07] p-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => void think()}
              disabled={loading}
              className="flex shrink-0 items-center gap-1.5 rounded-xl px-2 py-2 text-2xs text-white/45 transition-colors hover:text-violet-300 disabled:opacity-40"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              换一批
            </button>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void ask(draft);
                }
              }}
              placeholder={help ? "追问：这条能用在什么地方？" : "正在读…"}
              disabled={!help || asking}
              className={cn(input, "h-10 text-xs")}
            />
            <button
              onClick={() => void ask(draft)}
              disabled={!draft.trim() || !help || asking}
              className={cn(primary, "shrink-0")}
            >
              <Send size={12} />
              追问
            </button>
          </div>
          <p className="mt-2 text-2xs text-white/20">
            答案只基于这条材料；采用建议后仍可自己改写
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.querySelector(".aurora-root") ?? document.body);
}
