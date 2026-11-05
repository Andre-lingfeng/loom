import { NextResponse } from "next/server";

import {
  clientIp,
  consumeQuota,
  recordTokens,
  resolveTextModel,
} from "@/lib/server/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_SOURCES = 8;
const MAX_CHARS = 900;

interface Incoming {
  task?: "brief" | "answer" | "intent" | "conflict" | "discuss" | "reflect" | "suggest";
  question?: string;
  /** 额外约束，例如两条素材之间存在已确认分歧 */
  notes?: string[];
  /** 冲突追问的对话历史 */
  history?: { role: "user" | "assistant"; text: string }[];
  stats?: { label: string; value: string }[];
  sources?: { id: string; title: string; text: string }[];
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

const ANSWER_PROMPT = `你是个人知识库的问答助手。回答必须分成两段，用固定标记隔开：

【库中依据】
只使用下面提供的素材。每句结论后面标注来源编号，格式如 [1]、[2]。
素材里没有的，一个字都不要写进来。

【库外补充】
素材没覆盖、但这个问题确实需要时，用你自己的知识补一段。
开头必须写明「以下内容库中没有出处」，并且不许编造来源编号。
如果素材已经足够回答，就整段写「无」。

其他规则：
1. 两段都不许编造数字、人名、论文标题；不确定就说不确定。
2. 库外补充要具体，能直接帮上忙，不要「建议查阅相关资料」这种空话。
3. 用中文，整体 3–8 句话，不要客套话，不要重复问题。
4. 严格按「库中依据」「库外补充」两个标记输出，不要加别的标题。`;

const SUGGEST_PROMPT = `用户的知识库里没有能回答这个问题的材料。请推荐 3 篇确实存在、值得收藏的材料，帮他补上这块证据。

规则：
1. 只推荐你有把握真实存在的公开材料：论文（arxiv / 期刊）、官方文档、机构报告。
2. url 必须是你能确认的稳定地址；不确定就留空字符串，不要编造编号或路径。
3. title 写材料的正式标题（不超过 40 字），不要写"某某文章"。
4. reason 用一句话说清它补的是哪个缺口（不超过 30 字）。
5. 只输出 JSON，不要代码块、不要解释：
{"sources":[{"title":"...","url":"https://...","reason":"..."}]}`;

const BRIEF_PROMPT = `你是个人知识库的日报编辑。根据下面给出的统计与素材标题，写一段 3–5 句的中文总结。

规则：
1. 只能依据给定的统计数字与标题，不要编造任何数据。
2. 指出「今天最值得注意的一件事」，以及「下一步该补什么」。
3. 语气克制、具体，不要空话和鼓励式表达。
4. 直接输出总结正文，不要加标题。`;

const INTENT_PROMPT = `你在帮用户回忆「当初为什么收藏这条材料」。

根据标题与正文，输出两件事：
1. understand：一句话说清这条材料的核心主张（不超过 30 字）
2. intents：3 个可能的收藏理由，每个不超过 18 字，角度必须不同
   （写作时要引用的证据 / 做判断时的依据 / 需要反驳的对立观点 / 给别人讲时的例子）

要求：具体，不要「学习知识」这类空话；只输出 JSON，不要代码块、不要解释。
格式：{"understand":"...","intents":["...","...","..."]}`;

/** 从模型输出里抠出 JSON（有的模型会加代码块或前后缀） */
function parseJson(raw: string): {
  understand?: string;
  intents?: string[];
  substance?: string;
  difference?: string;
  question?: string;
  sources?: unknown;
} | null {
  const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as {
      understand?: string;
      intents?: string[];
      substance?: string;
      difference?: string;
      question?: string;
    };
  } catch {
    return null;
  }
}

const CONFLICT_PROMPT = `两条素材被判定为存在矛盾。请帮用户看清分歧的实质，输出三样东西：

1. substance：它们到底在争什么（不超过 60 字，点名具体的事实或判断）
2. difference：分歧的性质，只能选一个——数据 / 定义 / 前提 / 时间范围 / 价值取向
3. question：一句能让用户自问的话（不超过 30 字），帮助他决定采纳哪一方

要求：不要站队，不要编造素材里没有的信息；只输出 JSON，不要代码块。
格式：{"substance":"...","difference":"...","question":"..."}`;

const DISCUSS_PROMPT = `用户在判断两条互相矛盾的材料。你要帮他看清分歧，而不是替他站队。

规则：
1. 只用下面两份材料里的内容回答；材料里没有的，明确说「材料里没有提到」。
2. 回答控制在 3 句以内，直接说结论，不要客套。
3. 如果用户的追问需要超出材料的信息，指出这一点，并说明还需要什么证据。
4. 不要重复已经说过的分析，除非用户明确要求。`;

const REFLECT_PROMPT = `用户在回忆「这条材料为什么值得收藏、能用在什么地方」。你要帮他找到用途，而不是替他决定。

规则：
1. 只用这份材料的内容回答；材料里没有的，说「材料里没有提到」。
2. 回答控制在 3 句以内，给具体场景，不要「可以用于学习」这类空话。
3. 用户问「这条和什么有关」时，从材料里找主题，不要编造库里其他素材。
4. 如果材料本身信息不足，指出缺什么。`;

function buildUserMessage(payload: Incoming): string {
  const lines: string[] = [];

  if (payload.question) lines.push(`问题：${payload.question}`);

  if (payload.notes?.length) {
    lines.push("", "【必须遵守的约束】");
    for (const note of payload.notes.slice(0, 6)) lines.push(`- ${note}`);
  }

  if (payload.stats?.length) {
    lines.push("统计：");
    for (const stat of payload.stats) lines.push(`- ${stat.label}：${stat.value}`);
  }

  lines.push("素材：");
  for (const [index, source] of (payload.sources ?? []).entries()) {
    lines.push(`[${index + 1}] ${source.title}`);
    lines.push(source.text.slice(0, MAX_CHARS));
  }

  return lines.join("\n");
}

export async function POST(request: Request) {
  let payload: Incoming;
  try {
    payload = (await request.json()) as Incoming;
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }

  const task =
    payload.task === "answer"
      ? "answer"
      : payload.task === "intent"
        ? "intent"
        : payload.task === "conflict"
          ? "conflict"
          : payload.task === "discuss"
            ? "discuss"
            : payload.task === "reflect"
              ? "reflect"
              : payload.task === "suggest"
                ? "suggest"
                : "brief";
  const sources = (payload.sources ?? []).slice(0, MAX_SOURCES);

  if (task === "answer" && !payload.question?.trim()) {
    return NextResponse.json({ error: "缺少问题" }, { status: 400 });
  }
  // 只有「answer」允许零素材：此时全部内容都应落在库外补充里。
  // 其他任务（brief / intent / conflict）必须有素材，否则没有意义。
  // 允许零素材的任务：简报（只用统计）、问答与补充建议（内容落库外）
  if (sources.length === 0 && !["brief", "answer", "suggest"].includes(task)) {
    return NextResponse.json({ error: "没有可用的素材" }, { status: 400 });
  }

  const resolved = resolveTextModel(payload);
  if (!resolved) {
    return NextResponse.json({ error: "还没配置模型，先去「模型接入」填一个 Key" }, { status: 400 });
  }

  if (resolved.shared) {
    const quota = consumeQuota(clientIp(request));
    if (!quota.ok) {
      return NextResponse.json({ error: quota.reason }, { status: 429 });
    }
  }

  // discuss 是多轮追问，其余任务是单轮
  const context = buildUserMessage(payload);

  const messages: { role: string; content: string }[] =
    task === "discuss" || task === "reflect"
      ? [
          {
            role: "system",
            content: [
              task === "reflect" ? REFLECT_PROMPT : DISCUSS_PROMPT,
              "",
              ...(payload.notes ?? []),
              "",
              context,
            ].join("\n"),
          },
          ...(payload.history ?? []).slice(-8).map((item) => ({
            role: item.role,
            content: item.text,
          })),
          { role: "user", content: payload.question ?? "" },
        ]
      : [
          {
            role: "system",
            content:
              task === "suggest"
                ? SUGGEST_PROMPT
                : task === "answer"
                  ? ANSWER_PROMPT
                : task === "intent"
                  ? INTENT_PROMPT
                  : task === "conflict"
                    ? CONFLICT_PROMPT
                    : BRIEF_PROMPT,
          },
          { role: "user", content: context },
        ];
  try {
    const response = await fetch(`${resolved.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${resolved.apiKey}`,
      },
      body: JSON.stringify({
        model: resolved.model,
        temperature: 0.2,
        max_tokens: 1600,
        messages,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const body = await response.text();
      return NextResponse.json(
        { error: `模型返回 ${response.status}：${body.slice(0, 140)}` },
        { status: 502 },
      );
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };

    // 共享 Key 的消耗计入每日 token 预算
    if (resolved.shared) recordTokens(data.usage?.total_tokens ?? null);

    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (text.length < 8) {
      return NextResponse.json({ error: "模型没有返回内容，请重试" }, { status: 502 });
    }

    if (task === "conflict") {
      const parsed = parseJson(text);
      const substance = (parsed?.substance ?? "").trim();
      if (!substance) {
        return NextResponse.json(
          { error: "模型没有分析出分歧实质，稍后重试" },
          { status: 502 },
        );
      }
      return NextResponse.json({
        substance: substance.slice(0, 120),
        difference: (parsed?.difference ?? "").trim().slice(0, 20),
        question: (parsed?.question ?? "").trim().slice(0, 60),
        tokens: data.usage?.total_tokens ?? null,
        model: resolved.model,
      });
    }

    if (task === "suggest") {
      const parsed = parseJson(text);
      const list = Array.isArray(parsed?.sources) ? parsed.sources : [];

      const candidates = list
        .map((item) => {
          const row = item as Record<string, unknown>;
          const title = typeof row.title === "string" ? row.title.trim() : "";
          const url = typeof row.url === "string" ? row.url.trim() : "";
          const reason = typeof row.reason === "string" ? row.reason.trim() : "";
          return { title, url, reason };
        })
        .filter((item) => item.title.length > 0)
        .slice(0, 4);

      if (candidates.length === 0) {
        return NextResponse.json(
          { error: "模型没有给出可用的材料建议，稍后重试" },
          { status: 502 },
        );
      }

      return NextResponse.json({
        suggestions: candidates,
        tokens: data.usage?.total_tokens ?? null,
        model: resolved.model,
      });
    }

    if (task === "intent") {
      const parsed = parseJson(text);
      const intents = (parsed?.intents ?? [])
        .map((item) => String(item).trim())
        .filter((item) => item.length >= 2)
        .slice(0, 3);

      if (intents.length === 0) {
        return NextResponse.json(
          { error: "模型没有给出可用的收藏理由，换个模型再试" },
          { status: 502 },
        );
      }

      return NextResponse.json({
        understand: (parsed?.understand ?? "").trim().slice(0, 80),
        intents,
        tokens: data.usage?.total_tokens ?? null,
        model: resolved.model,
      });
    }

    return NextResponse.json({
      text,
      tokens: data.usage?.total_tokens ?? null,
      model: resolved.model,
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    return NextResponse.json(
      {
        error:
          name === "TimeoutError"
            ? "模型超时（60s），减少素材数量后重试"
            : "无法连接模型，检查 Base URL 与网络",
      },
      { status: 502 },
    );
  }
}
