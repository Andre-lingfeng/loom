"use client";

import { useMemo } from "react";
import { Search } from "lucide-react";

import { useKb } from "@/lib/kb/store";
import { rank } from "@/lib/kb/text";
import type { Source } from "@/lib/kb/types";
import { cn } from "@/lib/utils";

import { card, cardHover, chip } from "./theme";
import { Badge } from "./ui";

const fmt = (ts: number) =>
  new Date(ts).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });

export function LibraryView() {
  const sources = useKb((s) => s.sources);
  const query = useKb((s) => s.query);
  const setQuery = useKb((s) => s.setQuery);
  const select = useKb((s) => s.select);
  const selectedId = useKb((s) => s.selectedId);

  // 已被并入其他素材的材料不单独列出，它们跟随被采纳的那一条
  const list = useMemo(() => {
    if (!query.trim()) return [...sources].sort((a, b) => b.createdAt - a.createdAt);
    return rank(query, sources)
      .map((item) => sources.find((source) => source.id === item.sourceId))
      .filter((source): source is Source => source !== undefined);
  }, [query, sources]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-6">
      <div className="mb-5 flex h-11 items-center gap-2 rounded-xl bg-[var(--kb-surface-2)] px-4 ring-1 ring-white/[0.07] transition-shadow focus-within:ring-white/20">
        <Search size={15} className="shrink-0 text-white/30" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="在知识库里搜：Agent 失败率、RAG 成本、知识管理…"
          className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/25"
        />
        {query && (
          <span className="shrink-0 text-2xs text-white/30">{list.length} 条命中</span>
        )}
      </div>

      <div className="space-y-2">
        {list.map((source) => (
          <button
            key={source.id}
            onClick={() => select(source.id)}
            className={cn(
              card,
              cardHover,
              "block w-full p-4 text-left",
              selectedId === source.id && "ring-white/25",
            )}
          >
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {source.title}
              </span>
              {!source.intent && <Badge tone="warn">未消化</Badge>}
              {source.disputesWith && source.disputesWith.length > 0 && (
                <span className="shrink-0 rounded bg-amber-400/15 px-1.5 py-0.5 text-2xs text-amber-300">
                  有分歧
                </span>
              )}
              <span className="shrink-0 text-2xs text-white/25">
                {fmt(source.createdAt)}
              </span>
            </div>

            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-white/40">
              {source.summary}
            </p>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {source.tags.slice(0, 3).map((tag) => (
                <span key={tag} className={chip}>
                  {tag}
                </span>
              ))}
              {source.intent && (
                <span className="truncate text-2xs text-white/30">
                  · {source.intent}
                </span>
              )}
            </div>
          </button>
        ))}

        {list.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
            <p className="text-sm text-white/50">没有命中</p>
            <p className="mt-1 text-2xs text-white/25">
              换个说法，或先去「添加素材」补一条
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
