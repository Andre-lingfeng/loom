"use client";

import { ArrowUpRight, Loader2, Plus, Search, Sparkles, TriangleAlert } from "lucide-react";

import { useKb } from "@/lib/kb/store";

import { card, primary } from "./theme";

const SUGGESTIONS = [
  "Agent 落地的失败率有多高",
  "RAG 的成本优势体现在哪",
  "知识管理为什么要强调输出",
];

/** 补材料区块：推荐真实材料，用户决定是否入库 */
function SuggestBlock() {
  const suggestions = useKb((s) => s.suggestions);
  const suggestStatus = useKb((s) => s.suggestStatus);
  const suggestError = useKb((s) => s.suggestError);
  const suggestAdding = useKb((s) => s.suggestAdding);
  const findMissingSources = useKb((s) => s.findMissingSources);
  const addSuggested = useKb((s) => s.addSuggested);

  return (
    <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xs text-white/55">这块证据库里没有，要补吗？</span>
        <button
          onClick={() => void findMissingSources()}
          disabled={suggestStatus === "loading"}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-2xs text-white/50 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50"
        >
          {suggestStatus === "loading" ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Sparkles size={11} />
          )}
          {suggestStatus === "loading" ? "正在找…" : "让模型找几篇能补上的材料"}
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-3 space-y-2">
          {suggestions.map((item, index) => (
            <div key={`${item.title}-${index}`} className="rounded-xl bg-white/[0.04] p-3">
              <div className="text-xs font-medium text-white/80">{item.title}</div>
              {item.reason && <div className="mt-0.5 text-2xs text-white/35">{item.reason}</div>}
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block truncate text-2xs text-violet-300/70 hover:text-violet-200"
                >
                  {item.url}
                </a>
              )}
              <button
                onClick={() => void addSuggested(index)}
                disabled={suggestAdding === index}
                className="mt-2 flex items-center gap-1.5 rounded-lg bg-white/[0.08] px-2.5 py-1 text-2xs text-white/65 transition-colors hover:bg-white/[0.14] hover:text-white disabled:opacity-50"
              >
                {suggestAdding === index ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Plus size={11} />
                )}
                {suggestAdding === index ? "抓取中…" : "抓取正文并加入知识库"}
              </button>
            </div>
          ))}
        </div>
      )}

      {suggestError && <p className="mt-2 text-2xs text-red-300/80">{suggestError}</p>}

      {suggestions.length === 0 && suggestStatus === "idle" && !suggestError && (
        <p className="mt-2 text-2xs leading-relaxed text-white/40">
          模型只会推荐真实存在的公开材料；加不加由你决定，抓不到正文的会明确提示。
        </p>
      )}
    </div>
  );
}

export function AskView() {
  const question = useKb((s) => s.question);
  const setQuestion = useKb((s) => s.setQuestion);
  const submit = useKb((s) => s.submitQuestion);
  const answer = useKb((s) => s.answer);
  const select = useKb((s) => s.select);
  const answerCloud = useKb((s) => s.answerCloud);
  const answerStatus = useKb((s) => s.answerStatus);
  const answerError = useKb((s) => s.answerError);
  const generateCloudAnswer = useKb((s) => s.generateCloudAnswer);
  const suggestions = useKb((s) => s.suggestions);
  const suggestStatus = useKb((s) => s.suggestStatus);
  const suggestError = useKb((s) => s.suggestError);
  const suggestAdding = useKb((s) => s.suggestAdding);
  const findMissingSources = useKb((s) => s.findMissingSources);
  const addSuggested = useKb((s) => s.addSuggested);

  const ask = (value: string) => {
    setQuestion(value);
    submit();
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-6">
      <div className="mb-5">
        <h2 className="text-xl font-medium tracking-tight">问答</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-white/35">
          先只答库里的内容，每条结论带出处；库里没有的，可以让模型补充并明确标出来。
        </p>
      </div>

      <div className={`${card} p-2`}>
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder="问点具体的，比如：有哪些证据支持 Agent 已可规模化落地？"
          className="w-full resize-none bg-transparent px-3 py-2 text-sm leading-relaxed text-white outline-none placeholder:text-white/25"
        />
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-2xs text-white/25">Shift + Enter 换行</span>
          <button
            onClick={() => submit()}
            disabled={!question.trim()}
            className={primary}
          >
            <Search size={13} />
            检索
          </button>
        </div>
      </div>

      {!answer && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((item) => (
            <button
              key={item}
              onClick={() => ask(item)}
              className="rounded-lg border border-white/10 px-2.5 py-1 text-2xs text-white/45 transition-colors hover:border-white/25 hover:text-white"
            >
              {item}
            </button>
          ))}
        </div>
      )}

      {answer?.empty && (
        <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-10 text-center">
          <p className="text-sm text-white/50">库里没有相关内容</p>
          <p className="mt-1 text-2xs text-white/25">
            这不是坏消息——去「缺口」看看该补哪一块，比硬编一个答案好。
          </p>
          <button
            onClick={() => void generateCloudAnswer()}
            disabled={answerStatus === "loading"}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.08] px-3 py-1.5 text-2xs font-medium text-amber-200 transition-colors hover:border-amber-300/45 hover:bg-amber-400/[0.16] disabled:opacity-50"
          >
            {answerStatus === "loading" ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Sparkles size={11} />
            )}
            {answerStatus === "loading" ? "生成中…" : "让模型补充背景"}
          </button>
          <p className="mt-1.5 text-2xs text-white/20">
            库里的材料答不了，但模型可能知道——补充内容会被单独标出来
          </p>
        </div>
      )}

      {(answerCloud || (answer && !answer.empty)) && (
        <div className="mt-5 space-y-3">
          <div className={`${card} p-5`}>
            {answerCloud && (
              <div className="mb-4 flex items-center gap-2 text-2xs">
                <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-violet-300">
                  云端模型生成
                </span>
                {answerCloud.tokens ? (
                  <span className="text-white/20">{answerCloud.tokens} tokens</span>
                ) : null}
              </div>
            )}

            <div className="text-sm leading-relaxed whitespace-pre-wrap text-white/85">
              {answerCloud
                ? answerCloud.text || "库里没有能直接支撑这个问题的材料。"
                : (answer?.text ?? "")}
            </div>

            {answerCloud?.extra ? (
              <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3">
                <div className="flex items-center gap-1.5 text-2xs text-amber-300/90">
                  <TriangleAlert size={11} />
                  库外补充 · 以下内容不在你的素材里
                </div>
                <div className="mt-1.5 text-xs leading-relaxed whitespace-pre-wrap text-white/70">
                  {answerCloud.extra}
                </div>
                <p className="mt-2 text-2xs text-white/25">
                  来自模型自身知识，没有出处。需要证据时去「缺口」看看该补什么。
                </p>
              </div>
            ) : null}

            {answerCloud?.extra ? <SuggestBlock /> : null}

            {answerCloud && !answerCloud.extra ? (
              <p className="mt-3 text-2xs leading-relaxed text-white/25">
                本次回答全部来自库内材料，模型没有补充库外内容。
                <span className="text-white/20">（问库里没有的东西时，这里会出现「库外补充」）</span>
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-3">
              <span className="text-2xs text-white/25">
                {answerCloud
                  ? answerCloud.extra
                    ? "综述已拆成两段：有出处的 + 库外的"
                    : "以上为模型综述，全部有出处"
                  : "下面是原文片段，可直接作为证据引用"}
              </span>
              <button
                onClick={() => void generateCloudAnswer()}
                disabled={answerStatus === "loading"}
                className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-2xs text-white/45 transition-colors hover:text-white disabled:opacity-40"
              >
                {answerStatus === "loading" ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Sparkles size={11} />
                )}
                {answerStatus === "loading"
                  ? "生成中…"
                  : answerCloud
                    ? "重新生成"
                    : "让模型补充背景"}
              </button>
            </div>

            {answerError && (
              <p className="mt-2 text-2xs text-red-300/80">云端生成失败：{answerError}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-2xs text-white/25">出处</span>
            {(answer?.citations ?? []).map((citation) => (
              <button
                key={citation.index}
                onClick={() => select(citation.sourceId)}
                className="flex max-w-full items-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1 text-2xs text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                <span className="shrink-0 text-violet-300">[{citation.index}]</span>
                <span className="max-w-[220px] truncate">{citation.title}</span>
                <ArrowUpRight size={11} className="shrink-0 opacity-50" />
              </button>
            ))}
          </div>
        </div>
      )}

      {!answerCloud?.extra && answer && answer.empty ? <SuggestBlock /> : null}
    </div>
  );
}
