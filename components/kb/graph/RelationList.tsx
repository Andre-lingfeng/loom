"use client";

import { card } from "../theme";
import { Badge } from "../ui";

import type { RelationKind } from "@/lib/kb/graph";

type Tone = "accent" | "danger" | "neutral" | "ok";

const KIND_TEXT: Record<RelationKind, string> = {
  supports: "支持",
  contradicts: "矛盾",
  duplicates: "重复",
  related: "相关",
};

const KIND_TONE: Record<RelationKind, Tone> = {
  supports: "accent",
  contradicts: "danger",
  duplicates: "neutral",
  related: "ok",
};

const LEVEL_TEXT = {
  strong: "强关联",
  mid: "相关",
  weak: "弱关联",
} as const;

export interface RelationEntry {
  source: string;
  target: string;
  kind?: RelationKind;
  level: keyof typeof LEVEL_TEXT;
  reason?: string;
  shared: string[];
}

export function RelationList({
  title,
  entries,
  nodes,
  onPick,
  onHover,
  action,
}: {
  title: string;
  entries: RelationEntry[];
  nodes: { id: string; title: string }[];
  onPick: (edge: RelationEntry) => void;
  onHover: (edge: RelationEntry | null) => void;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <aside className="flex w-full shrink-0 flex-col gap-2 lg:w-64">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-2xs text-white/30">{title}</div>
        {action ? (
          <button
            onClick={action.onClick}
            className="shrink-0 rounded-md bg-white/[0.07] px-1.5 py-0.5 text-2xs text-white/50 hover:text-white"
          >
            {action.label}
          </button>
        ) : null}
      </div>

      {entries.length === 0 && (
        <p className="rounded-xl border border-dashed border-white/10 p-3 text-2xs text-white/25">
          还没有算出关系
        </p>
      )}

      {entries.map((edge, index) => {
        const from = nodes.find((node) => node.id === edge.source);
        const to = nodes.find((node) => node.id === edge.target);

        return (
          <button
            key={`${edge.source}-${edge.target}`}
            onClick={() => onPick(edge)}
            onMouseEnter={() => onHover(edge)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(edge)}
            onBlur={() => onHover(null)}
            title="悬停可在图上高亮这一对"
            className={`${card} p-3 text-left transition-colors hover:bg-[var(--kb-surface-2)]`}
          >
            <div className="flex items-center justify-between">
              {edge.kind ? (
                <Badge tone={KIND_TONE[edge.kind]}>{KIND_TEXT[edge.kind]}</Badge>
              ) : (
                <Badge tone="neutral">词面相似</Badge>
              )}
              <span className="text-2xs text-white/30">
                #{index + 1} · {LEVEL_TEXT[edge.level]}
              </span>
            </div>
            <div className="mt-1.5 line-clamp-2 text-2xs leading-relaxed text-white/60">
              {from?.title}
            </div>
            <div className="line-clamp-2 text-2xs leading-relaxed text-white/60">
              ↔ {to?.title}
            </div>
            {edge.reason ? (
              <div className="mt-1 line-clamp-2 text-2xs leading-relaxed text-white/35">
                {edge.reason}
              </div>
            ) : edge.shared.length > 0 ? (
              <div className="mt-1 truncate text-2xs text-white/25">
                共同词：{edge.shared.join(" · ")}
              </div>
            ) : null}
          </button>
        );
      })}
    </aside>
  );
}
