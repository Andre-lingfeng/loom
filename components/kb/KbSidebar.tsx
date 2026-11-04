"use client";

import Link from "next/link";

import { BackupActions } from "./BackupActions";
import {
  Settings,
  FolderOpen,
  Inbox,
  Newspaper,
  RotateCcw,
  Search,
  Share2,
  Target,
} from "lucide-react";

import { useKb } from "@/lib/kb/store";

import { NAV_ITEMS } from "./nav";
import type { View } from "@/lib/kb/types";
import { cn } from "@/lib/utils";

export function KbSidebar({ onAdd }: { onAdd: () => void }) {
  const view = useKb((s) => s.view);
  const setView = useKb((s) => s.setView);
  const sources = useKb((s) => s.sources);
  const conflicts = useKb((s) => s.conflicts);
  const reset = useKb((s) => s.reset);
  const showReset = useKb((s) => s.showReset);

  const backlog = sources.filter((source) => !source.intent).length;
  const pendingConflicts = conflicts.filter((c) => c.status === "pending").length;
  const counts: Partial<Record<View, number>> = {
    library: sources.length,
    inbox: backlog,
    conflicts: pendingConflicts,
  };

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-white/[0.06] bg-[var(--kb-panel)] p-3 md:flex">
      <nav className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = view === item.key;
          const count = counts[item.key];
          return (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={cn(
                "relative flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-all duration-200",
                active
                  ? "kb-nav-active text-white"
                  : "text-white/55 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon size={15} className={active ? "text-violet-200" : "text-white/40"} />
              <span className="flex-1 text-sm font-medium">{item.label}</span>
              {count !== undefined && count > 0 && (
                <span
                  className={cn(
                    "rounded-md px-1.5 text-2xs tabular-nums",
                    active ? "bg-white/15 text-white/80" : "bg-white/10 text-white/45",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2 pt-6">
        <button
          onClick={onAdd}
          className="w-full rounded-xl border border-dashed border-white/10 py-2 text-2xs text-white/35 transition-colors duration-200 hover:border-white/30 hover:text-white/70"
        >
          + 拖入 / 粘贴 / 链接
        </button>
        <p className="px-1 text-2xs text-white/25">数据存在浏览器本地，不上传</p>
        <Link
          href="/kb/settings"
          className="flex items-center gap-1 px-1 text-2xs text-white/45 transition-colors hover:text-white"
        >
          <Settings size={11} />
          模型接入
        </Link>
        <BackupActions />
        {showReset && (
          <button
            onClick={reset}
            className="flex items-center gap-1 px-1 text-2xs text-white/30 transition-colors hover:text-red-300"
          >
            <RotateCcw size={11} />
            恢复演示数据
          </button>
        )}
      </div>
    </aside>
  );
}
