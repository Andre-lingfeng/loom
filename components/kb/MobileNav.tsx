"use client";

import { useEffect, useRef } from "react";

import { useKb } from "@/lib/kb/store";
import { cn } from "@/lib/utils";

import { NAV_ITEMS } from "./nav";

/** 移动端横向标签条：< md 时替代侧栏 */
export function MobileNav() {
  const view = useKb((s) => s.view);
  const setView = useKb((s) => s.setView);
  const sources = useKb((s) => s.sources);
  const conflicts = useKb((s) => s.conflicts);

  const stripRef = useRef<HTMLDivElement>(null);

  // 切换视图时把当前标签滚进可视区，避免「点了但看不到选中项」
  useEffect(() => {
    const strip = stripRef.current;
    const active = strip?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [view]);

  const backlog = sources.filter((source) => !source.intent).length;
  const counts: Partial<Record<string, number>> = {
    library: sources.length,
    inbox: backlog,
    conflicts: conflicts.filter((c) => c.status === "pending").length,
  };

  return (
    <div className="relative md:hidden">
      <nav
        ref={stripRef}
        className="scrollbar-thin relative z-20 flex gap-1.5 overflow-x-auto px-3 pb-2"
      >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = view === item.key;
        const count = counts[item.key];
        return (
          <button
            key={item.key}
            data-active={active}
            onClick={() => setView(item.key)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-white text-black"
                : "bg-white/[0.05] text-white/55 hover:text-white",
            )}
          >
            <Icon size={13} className={active ? "text-black" : "text-white/45"} />
            {item.label}
            {count !== undefined && count > 0 && (
              <span
                className={cn(
                  "rounded px-1 text-2xs tabular-nums",
                  active ? "bg-black/10 text-black/60" : "bg-white/10 text-white/45",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
      </nav>

      {/* 右侧渐隐：提示还能横向滑动 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[var(--kb-bg)] to-transparent"
      />
    </div>
  );
}
