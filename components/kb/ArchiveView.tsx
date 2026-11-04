"use client";

import { useMemo } from "react";
import { FolderArchive, Link2 } from "lucide-react";

import { useKb } from "@/lib/kb/store";
import type { Source } from "@/lib/kb/types";

import { card } from "./theme";

function ItemRow({
  source,
  label,
  onOpen,
}: {
  source: Source;
  label?: string;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/[0.05]"
    >
      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-300/60" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-white/80">
          {source.title}
        </span>
        <span className="mt-0.5 line-clamp-1 block text-2xs text-white/30">
          {label ?? (source.summary || source.text.slice(0, 50))}
        </span>
      </span>
    </button>
  );
}

export function ArchiveView() {
  const sources = useKb((s) => s.sources);
  const conflicts = useKb((s) => s.conflicts);
  const select = useKb((s) => s.select);
  const setView = useKb((s) => s.setView);

  const groups = useMemo(() => {
    const byId = new Map(sources.map((source) => [source.id, source]));

    return sources
      .filter((source) => (source.absorbed?.length ?? 0) > 0)
      .map((winner) => ({
        winner,
        items: (winner.absorbed ?? [])
          .map((id) => byId.get(id))
          .filter((item): item is Source => Boolean(item)),
        note: conflicts.find(
          (conflict) =>
            conflict.status === "resolved" &&
            conflict.resolution !== "both" &&
            ((conflict.aId === winner.id && winner.absorbed?.includes(conflict.bId)) ||
              (conflict.bId === winner.id && winner.absorbed?.includes(conflict.aId))),
        )?.note,
      }));
  }, [sources, conflicts]);

  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6 sm:py-6">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-xl font-medium tracking-tight">
          <FolderArchive size={16} className="text-violet-300" />
          文件夹
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-white/35">
          被采纳一方吸收的材料存放在这里。
          <span className="text-white/50">它们没有消失，只是作为反方证据挂在结论下面</span>
          ——写作时随时可以翻出来对照。
        </p>
      </div>

      {groups.length === 0 ? (
        <div className={`${card} grid place-items-center px-6 py-16 text-center`}>
          <FolderArchive size={22} className="text-white/20" />
          <p className="mt-3 text-sm text-white/50">还没有并入了材料的结论</p>
          <p className="mt-1.5 max-w-sm text-2xs leading-relaxed text-white/25">
            去「冲突」页处理一处矛盾，选择采纳某一方，另一条就会打包进这里。
          </p>
          <button
            onClick={() => setView("conflicts")}
            className="mt-4 rounded-xl bg-white px-4 py-2 text-xs font-medium text-black transition-colors hover:bg-white/90"
          >
            去处理冲突
          </button>
        </div>
      ) : (
        <>
          <div className="mb-3 text-2xs text-white/30">
            {groups.length} 个结论 · 共收纳 {total} 条材料
          </div>

          <div className="space-y-3">
            {groups.map((group) => (
              <section key={group.winner.id} className={`${card} overflow-hidden`}>
                <div className="flex items-start gap-2.5 px-4 py-3">
                  <FolderArchive size={14} className="mt-0.5 shrink-0 text-violet-300" />
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => select(group.winner.id)}
                      className="block max-w-full truncate text-left text-sm font-medium text-white/90 transition-colors hover:text-white"
                    >
                      {group.winner.title}
                    </button>
                    {group.note && (
                      <p className="mt-1 line-clamp-2 text-2xs leading-relaxed text-white/35">
                        你的判断：{group.note}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-md bg-violet-400/15 px-1.5 py-0.5 text-2xs text-violet-200/80">
                    {group.items.length} 条并入
                  </span>
                </div>

                <div className="border-t border-white/[0.05] bg-black/20 px-2 py-1.5">
                  {group.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      source={item}
                      label={`作为反方证据保留${item.intent ? ` · ${item.intent}` : ""}`}
                      onOpen={() => select(item.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <p className="mt-4 flex items-center gap-1.5 text-2xs text-white/20">
            <Link2 size={10} />
            点任意一条可打开详情；详情里可以跳到它对应的冲突素材
          </p>
        </>
      )}
    </div>
  );
}
