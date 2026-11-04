"use client";

import { useMemo } from "react";
import { AlertTriangle, Check, Target, X } from "lucide-react";

import { analyzeGaps } from "@/lib/kb/gaps";
import { useKb } from "@/lib/kb/store";
import type { GapLevel } from "@/lib/kb/types";
import { cn } from "@/lib/utils";

import { card } from "./theme";
import { Badge } from "./ui";

const LEVEL_META: Record<
  GapLevel,
  { icon: typeof Check; label: string; className: string; tone: "ok" | "warn" | "danger" }
> = {
  ok: { icon: Check, label: "有支撑", className: "text-emerald-400", tone: "ok" },
  weak: { icon: AlertTriangle, label: "证据偏薄", className: "text-amber-300", tone: "warn" },
  missing: { icon: X, label: "空白", className: "text-red-400", tone: "danger" },
};

export function GapView() {
  const goal = useKb((s) => s.goal);
  const setGoal = useKb((s) => s.setGoal);
  const sources = useKb((s) => s.sources);
  const select = useKb((s) => s.select);

  const report = useMemo(
    () => (goal.trim().length > 1 ? analyzeGaps(goal, sources) : null),
    [goal, sources],
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-6">
      <div className="mb-5">
        <h2 className="text-xl font-medium tracking-tight">写到哪儿卡住了？</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-white/35">
          写下你打算写的东西，我先告诉你库里缺哪块证据——别等写到一半才发现没材料。
        </p>
      </div>

      <textarea
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
        rows={2}
        placeholder="例：写一篇 AI Agent 落地现状的综述"
        className="w-full resize-none rounded-2xl bg-[var(--kb-surface-2)] px-4 py-3 text-sm leading-relaxed text-white ring-1 ring-white/[0.07] outline-none transition-shadow placeholder:text-white/25 focus:ring-white/20"
      />

      {!report && (
        <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-12 text-center">
          <Target size={18} className="mx-auto text-white/25" />
          <p className="mt-2 text-sm text-white/50">输入一句目标就会自动体检</p>
          <p className="mt-1 text-2xs text-white/25">不联网、不生成，纯本地覆盖度计算</p>
        </div>
      )}

      {report && (
        <div className="mt-5 space-y-3">
          <div className={`${card} p-5`}>
            <div className="flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    report.coverage >= 67
                      ? "bg-emerald-400"
                      : report.coverage >= 34
                        ? "bg-amber-300"
                        : "bg-red-400",
                  )}
                  style={{ width: `${Math.max(report.coverage, 4)}%` }}
                />
              </div>
              <span className="shrink-0 text-2xs text-white/40">
                覆盖 {report.coverage}%
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-white/85">
              {report.verdict}
            </p>
          </div>

          <div className="space-y-1.5">
            {report.terms.map((term) => {
              const meta = LEVEL_META[term.level];
              const Icon = meta.icon;
              return (
                <div
                  key={term.term}
                  className={`${card} flex items-start gap-3 px-4 py-3`}
                >
                  <Icon size={15} className={cn("mt-0.5 shrink-0", meta.className)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-white/85">{term.term}</span>
                      <Badge tone={meta.tone}>
                        {meta.label} · {term.count} 条
                      </Badge>
                    </div>

                    {term.sourceIds.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {term.sourceIds.map((id) => {
                          const source = sources.find((item) => item.id === id);
                          if (!source) return null;
                          return (
                            <button
                              key={id}
                              onClick={() => select(id)}
                              className="max-w-full truncate rounded-md bg-white/[0.06] px-1.5 py-0.5 text-2xs text-white/45 transition-colors hover:bg-white/10 hover:text-white"
                            >
                              {source.title}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-1 text-2xs text-white/25">
                        库里没有任何材料覆盖这个词，去补一条再来
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="px-1 text-2xs leading-relaxed text-white/20">
            说明：MVP 用关键词覆盖度判断，能找出「完全空白」和「单一来源」。接入模型后会把目标拆成语义论点，判定更准，接口不变。
          </p>
        </div>
      )}
    </div>
  );
}
