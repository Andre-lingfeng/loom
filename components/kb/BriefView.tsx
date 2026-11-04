"use client";

import { useMemo } from "react";
import {
  ArrowRight,
  Clock,
  Inbox,
  Loader2,
  Newspaper,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { buildBrief } from "@/lib/kb/brief";
import { useKb } from "@/lib/kb/store";
import type { Source } from "@/lib/kb/types";

import { PassCard } from "./PassCard";
import { card } from "./theme";
import { Badge } from "./ui";

function TitleList({
  items,
  onClick,
  empty,
}: {
  items: Source[];
  onClick: (id: string) => void;
  empty: string;
}) {
  if (items.length === 0) return <p className="text-2xs text-white/25">{empty}</p>;
  return (
    <ul className="space-y-1">
      {items.slice(0, 4).map((source) => (
        <li key={source.id}>
          <button
            onClick={() => onClick(source.id)}
            className="flex w-full items-center gap-1.5 text-left text-2xs text-white/45 transition-colors hover:text-white"
          >
            <span className="h-1 w-1 shrink-0 rounded-full bg-white/25" />
            <span className="truncate">{source.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function BriefView() {
  const sources = useKb((s) => s.sources);
  const select = useKb((s) => s.select);
  const setView = useKb((s) => s.setView);
  const conflicts = useKb((s) => s.conflicts);
  const briefCloud = useKb((s) => s.briefCloud);
  const briefStatus = useKb((s) => s.briefStatus);
  const briefError = useKb((s) => s.briefError);
  const generateBriefSummary = useKb((s) => s.generateBriefSummary);
  const pending = conflicts.filter((c) => c.status === "pending").length;
  const brief = useMemo(() => buildBrief(sources), [sources]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-6">
      <div className="mb-5 flex items-center gap-2">
        <Newspaper size={16} className="text-violet-300" />
        <h2 className="text-xl font-medium tracking-tight">今日简报</h2>
        <button
          onClick={() => void generateBriefSummary()}
          disabled={briefStatus === "loading" || pending > 0}
          className="ml-auto flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-2xs text-white/45 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {briefStatus === "loading" ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Sparkles size={11} />
          )}
          {briefStatus === "loading" ? "生成中…" : briefCloud ? "重新生成" : "用模型写总结"}
        </button>
      </div>

      {briefError && (
        <p className="mb-3 rounded-xl bg-red-500/10 px-3 py-2 text-2xs text-red-300/80">
          云端生成失败：{briefError}
        </p>
      )}

      {pending > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-5">
          <div className="flex items-center gap-2">
            <TriangleAlert size={15} className="text-amber-300" />
            <span className="text-sm font-medium text-amber-200">
              有 {pending} 处内容冲突未处理
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-amber-200/60">
            简报会同时引用互相矛盾的两条素材，生成出来就是自相矛盾的总结。
            先做出判断，简报才会解锁。
          </p>
          <button
            onClick={() => setView("conflicts")}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-amber-300 px-3.5 py-2 text-xs font-medium text-black transition-colors hover:bg-amber-200"
          >
            去处理冲突
            <ArrowRight size={12} />
          </button>
        </div>
      )}

      <div className={pending > 0 ? "pointer-events-none flex items-start gap-5 opacity-30 select-none" : "flex items-start gap-5"}>
        {pending > 0 && <span className="sr-only">简报已锁定</span>}
        <div className="min-w-0 flex-1">
          <div className={`${card} p-5`}>
            <div className="flex items-start gap-2.5">
              <Sparkles size={15} className="mt-0.5 shrink-0 text-violet-300" />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-relaxed text-white/85">
                  {briefCloud?.text ?? brief.headline}
                </p>
                <div className="mt-2 flex items-center gap-2 text-2xs">
                  <span
                    className={
                      briefCloud
                        ? "rounded bg-violet-500/20 px-1.5 py-0.5 text-violet-300"
                        : "rounded bg-white/[0.07] px-1.5 py-0.5 text-white/35"
                    }
                  >
                    {briefCloud ? "云端模型生成" : "本地模板"}
                  </span>
                  {briefCloud?.tokens ? (
                    <span className="text-white/20">{briefCloud.tokens} tokens</span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <section className={`${card} p-4`}>
              <div className="mb-2 flex items-center gap-1.5">
                <Sparkles size={12} className="text-emerald-400" />
                <span className="text-2xs text-white/45">今天新增</span>
                <Badge className="ml-auto">{brief.newToday.length}</Badge>
              </div>
              <TitleList items={brief.newToday} onClick={select} empty="今天还没有新素材" />
            </section>

            <section className={`${card} p-4`}>
              <div className="mb-2 flex items-center gap-1.5">
                <Inbox size={12} className="text-amber-300" />
                <span className="text-2xs text-white/45">等你消化</span>
                <Badge
                  tone={brief.backlog.length > 0 ? "warn" : "neutral"}
                  className="ml-auto"
                >
                  {brief.backlog.length}
                </Badge>
              </div>
              <TitleList items={brief.backlog} onClick={select} empty="全部消化完了" />
              {brief.backlog.length > 0 && (
                <button
                  onClick={() => setView("inbox")}
                  className="mt-2 flex items-center gap-1 text-2xs text-violet-300 hover:underline"
                >
                  去补一句为什么存 <ArrowRight size={11} />
                </button>
              )}
            </section>

            <section className={`${card} p-4`}>
              <div className="mb-2 flex items-center gap-1.5">
                <Clock size={12} className="text-white/30" />
                <span className="text-2xs text-white/45">超过 7 天没打开</span>
                <Badge className="ml-auto">{brief.stale.length}</Badge>
              </div>
              <TitleList items={brief.stale} onClick={select} empty="没有积灰的素材" />
            </section>

            <section className={`${card} p-4`}>
              <div className="mb-2 flex items-center gap-1.5">
                <span className="text-2xs text-white/45">只有单一来源的主题</span>
              </div>
              {brief.thinTopics.length === 0 ? (
                <p className="text-2xs text-white/25">每个主题都有多条支撑</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {brief.thinTopics.map((topic) => (
                    <span
                      key={topic.tag}
                      className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-2xs text-white/40"
                    >
                      {topic.tag}
                    </span>
                  ))}
                </div>
              )}
              <button
                onClick={() => setView("gaps")}
                className="mt-2 flex items-center gap-1 text-2xs text-violet-300 hover:underline"
              >
                看缺什么证据 <ArrowRight size={11} />
              </button>
            </section>
          </div>
        </div>

        <div className="hero-ticket hidden shrink-0 lg:block" aria-hidden="true">
          <PassCard
            data={{
              holder: "我",
              workspace: `${sources.length} 条`,
              status: "已同步",
              code: "LOOM-2026-0042",
              type: "知识库",
            }}
          />
        </div>
      </div>
    </div>
  );
}
