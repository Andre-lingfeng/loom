"use client";

import { useState } from "react";
import { Check, Sparkles } from "lucide-react";


import { useKb } from "@/lib/kb/store";
import type { Source } from "@/lib/kb/types";

import { InboxAssistDialog } from "./InboxAssistDialog";
import { card, input, primary } from "./theme";
import { Badge } from "./ui";

function InboxRow({ source }: { source: Source }) {
  const setIntent = useKb((s) => s.setIntent);
  const select = useKb((s) => s.select);

  const [value, setValue] = useState("");
  const [assist, setAssist] = useState(false);

  const save = () => {
    if (!value.trim()) return;
    setIntent(source.id, value);
    setValue("");
  };



  return (
    <div className={`${card} p-4`}>
      <div className="flex items-start gap-2">
        <button
          onClick={() => select(source.id)}
          className="min-w-0 flex-1 truncate text-left text-sm font-medium transition-colors hover:text-white/70"
        >
          {source.title}
        </button>
        <Badge tone="warn">未消化</Badge>
      </div>

      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-white/40">
        {source.summary}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") save();
          }}
          placeholder="补一句：我为什么存它、打算用在哪"
          className={`${input} h-9 text-xs`}
        />
        <button
          onClick={save}
          disabled={!value.trim()}
          className={`${primary} shrink-0 py-1.5 text-xs`}
        >
          <Check size={12} />
          消化
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => setAssist(true)}
          className="flex items-center gap-1.5 rounded-lg border border-violet-400/25 bg-violet-400/[0.08] px-2.5 py-1.5 text-2xs font-medium text-violet-100 transition-colors hover:border-violet-300/45 hover:bg-violet-400/[0.16]"
        >
          <Sparkles size={11} />
          让模型帮我想 · 可追问
        </button>
      </div>

      {assist && (
        <InboxAssistDialog
          source={source}
          onPick={(text) => setValue(text)}
          onClose={() => setAssist(false)}
        />
      )}
    </div>
  );
}

export function InboxView() {
  const sources = useKb((s) => s.sources);
  const backlog = sources.filter((source) => !source.intent);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-6">
      <div className="mb-5">
        <h2 className="text-xl font-medium tracking-tight">收件箱</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-white/35">
          收藏是零成本的安慰剂。这里每一张卡都欠一句话——写下它为什么值得占你一格记忆。
        </p>
      </div>

      {backlog.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center">
          <p className="text-sm text-white/50">全部消化完了</p>
          <p className="mt-1 text-2xs text-white/25">
            可以去「缺口」看看，下一步该补什么
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {backlog.map((source) => (
            <InboxRow key={source.id} source={source} />
          ))}
        </div>
      )}
    </div>
  );
}
