import { buildBrief } from "./brief";
import { loadConfig } from "./llm";
import type { Source } from "./types";

/**
 * 云端生成：总结与回答。
 * 素材编号与前端展示的引用编号保持一致（1 起），否则模型标注的 [1] 会指错。
 */
export interface GenerateResult {
  text: string;
  tokens: number | null;
}

function usable(sources: Source[], limit: number): Source[] {
  return sources.filter((source) => !source.supersededBy && !source.absorbedBy).slice(0, limit);
}

async function post(body: Record<string, unknown>): Promise<GenerateResult> {
  const config = loadConfig();
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...body,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
    }),
  });

  const data = (await response.json()) as {
    text?: string;
    tokens?: number | null;
    error?: string;
  };

  if (!response.ok || !data.text) {
    throw new Error(data.error ?? "生成失败");
  }

  return { text: data.text, tokens: data.tokens ?? null };
}

/** 日报总结：把本地统计交给模型，让它写出人话 */
export function generateBrief(sources: Source[]): Promise<GenerateResult> {
  const brief = buildBrief(sources);
  const local = brief.headline;

  const stats = [
    { label: "素材总数", value: String(sources.length) },
    { label: "今天新增", value: String(brief.newToday.length) },
    { label: "待消化", value: String(brief.backlog.length) },
    { label: "超过 7 天未打开", value: String(brief.stale.length) },
    { label: "本地简报原文", value: local },
  ];

  return post({
    task: "brief",
    stats,
    sources: usable(sources, 6).map((source) => ({
      id: source.id,
      title: source.title,
      text: `${source.summary} ${source.intent ? `（收藏原因：${source.intent}）` : ""}`,
    })),
  });
}

/** 回答：用检索到的素材生成带引用的回答 */
/** 把模型输出拆成「库中依据」与「库外补充」 */
export function splitAnswer(raw: string): { grounded: string; extra: string } {
  const text = raw.trim();
  const groundedMatch = text.match(/【库中依据】([\s\S]*?)(?=【库外补充】|$)/);
  const extraMatch = text.match(/【库外补充】([\s\S]*)$/);

  // 模型没按格式输出时，整段当依据，避免把内容丢掉
  if (!groundedMatch && !extraMatch) {
    return { grounded: text, extra: "" };
  }

  const grounded = (groundedMatch?.[1] ?? "").trim();
  const extra = (extraMatch?.[1] ?? "").trim();

  return {
    grounded,
    extra: /^无[。.]?$/.test(extra) ? "" : extra,
  };
}

export function generateAnswer(
  question: string,
  picked: Source[],
): Promise<GenerateResult> {
  // 已确认并存的分歧要在提示里点名，否则模型会把两种说法缝成一段自洽的错误结论
  const notes: string[] = [];
  for (const [index, source] of picked.entries()) {
    for (const otherId of source.disputesWith ?? []) {
      const otherIndex = picked.findIndex((item) => item.id === otherId);
      if (otherIndex < 0) continue;
      notes.push(
        `[${index + 1}] 与 [${otherIndex + 1}] 存在已确认的分歧：请分别陈述双方说法，并明确指出矛盾，不要合并成一个结论。`,
      );
    }
  }

  return post({
    task: "answer",
    question,
    notes: [...new Set(notes)],
    sources: picked.map((source) => ({
      id: source.id,
      title: source.title,
      text: source.text,
    })),
  });
}
