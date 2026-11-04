"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Circle, Plus } from "lucide-react";

import { useKb } from "@/lib/kb/store";

import { AddSourceDialog } from "./AddSourceDialog";
import { ArchiveView } from "./ArchiveView";
import { AskView } from "./AskView";
import { BriefView } from "./BriefView";
import { ConflictView } from "./ConflictView";
import { GapView } from "./GapView";
import { InboxView } from "./InboxView";
import { KbSidebar } from "./KbSidebar";
import { LibraryView } from "./LibraryView";
import { MobileNav } from "./MobileNav";
import { SourceDetail } from "./SourceDetail";
import { Badge, Button } from "./ui";

// 3D 图谱依赖 three.js（约 150KB），只在打开「关联」时加载
const GraphView = dynamic(() => import("./GraphView").then((m) => m.GraphView), {
  ssr: false,
  loading: () => (
    <div className="p-8 text-sm text-white/30">正在加载 3D 视图…</div>
  ),
});

export function KbShell() {
  const hydrated = useKb((s) => s.hydrated);
  const hydrate = useKb((s) => s.hydrate);
  const view = useKb((s) => s.view);
  const loadServerCloud = useKb((s) => s.loadServerCloud);
  const sources = useKb((s) => s.sources);
  const selectedId = useKb((s) => s.selectedId);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    void loadServerCloud();
  }, [loadServerCloud]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const backlog = sources.filter((source) => !source.intent).length;

  return (
    <div className="aurora-root relative flex h-dvh flex-col overflow-hidden">
      {/* 顶部极光：纯 CSS 渐变，不额外加载图片 */}
      <div
        aria-hidden="true"
        className="aurora-glow pointer-events-none absolute inset-x-0 top-0 h-[460px]"
      />

      <div aria-hidden="true" className="kb-ambient">
        <span className="kb-ambient__blob kb-ambient__blob--a" />
        <span className="kb-ambient__blob kb-ambient__blob--b" />
        <span className="kb-ambient__blob kb-ambient__blob--c" />
        <span className="kb-ambient__grain" />
      </div>

      <header className="relative z-20 flex h-16 shrink-0 items-center gap-3 px-5">
        <Circle className="h-4 w-4 fill-white text-white" aria-hidden="true" />
        <div className="leading-tight">
          <div className="text-base font-semibold tracking-tight">织识 Loom</div>
          <div className="hidden text-2xs text-white/30 sm:block">
            个人知识库 · 把碎片织成结构
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-1.5 sm:flex">
            <Badge>{sources.length} 条素材</Badge>
            {backlog > 0 && <Badge tone="warn">{backlog} 条未消化</Badge>}
          </div>
          <Button onClick={() => setAdding(true)}>
            <Plus size={14} />
            添加素材
          </Button>
        </div>
      </header>

      <MobileNav />

      <div className="kb-panel relative z-10 mx-3 mb-3 flex min-h-0 flex-1 overflow-hidden rounded-3xl border border-white/[0.07] bg-black/40 lg:pr-[var(--kb-drawer,0px)]">
        <KbSidebar onAdd={() => setAdding(true)} />

        <main className="scrollbar-thin min-w-0 flex-1 overflow-y-auto">
          {!hydrated ? (
            <div className="p-8 text-sm text-white/30">正在载入本地知识库…</div>
          ) : (
            <>
              {view === "library" && <LibraryView />}
              {view === "inbox" && <InboxView />}
              {view === "ask" && <AskView />}
              {view === "gaps" && <GapView />}
              {view === "conflicts" && <ConflictView />}
              {view === "archive" && <ArchiveView />}
              {view === "graph" && <GraphView />}
              {view === "brief" && <BriefView />}
            </>
          )}
        </main>

        {selectedId && <SourceDetail />}
      </div>

      {adding && <AddSourceDialog onClose={() => setAdding(false)} />}
    </div>
  );
}
