import { NextResponse } from "next/server";

import {
  clientIp,
  consumeQuota,
  resolveTextModel,
} from "@/lib/server/model";

export const dynamic = "force-dynamic";
// 云端分析可能跑 20s 以上，Vercel 默认超时不够
export const maxDuration = 60;

const KINDS = ["supports", "contradicts", "duplicates", "related"] as const;

/** 只保留前 N 条，避免超长上下文与费用失控 */
const MAX_SOURCES = 24;
const MAX_CHARS = 520;

interface IncomingSource {
  id: string;
  title: string;
  text: string;
}

function buildPrompt(sources: IncomingSource[]) {
  const list = sources
    .map(
      (source, index) =>
        `[${index + 1}] id=${source.id}\n标题：${source.title}\n正文：${source.text
          .replace(/\s+/g, " ")
          .slice(0, MAX_CHARS)}`,
    )
    .join("\n\n");

  return `你是一个知识图谱构建器。下面有 ${sources.length} 条知识素材。

任务：判断它们之间**真实存在**的关联，只输出 JSON。

规则：
1. 只输出确实有内容依据的关联，宁缺勿滥。泛泛而谈（比如都提到了 AI）不算关联。
2. kind 只能是以下四种之一：
   - "supports"：一条为另一条提供证据/支持
   - "contradicts"：结论或数据相互矛盾
   - "duplicates"：讲的是同一件事，内容高度重复
   - "related"：同一主题下的不同侧面，互相补充
3. strength 取 0–1，表示关联强度；低于 0.45 的不要输出。
4. reason 用不超过 30 个字的中文说清"为什么相关"，必须具体到内容，不要写"主题相似"。
5. 每条素材最多出现在 3 条关系里。
6. 严格按下面的格式输出，不要代码块，不要多余文字：

{"relations":[{"a":"来源id","b":"目标id","kind":"supports","strength":0.82,"reason":"两篇都引用同一份 62% 失败率数据"}]}

素材列表：

${list}`;
}

export async function POST(request: Request) {
  let payload: {
    sources?: IncomingSource[];
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  };
  let parsed: { relations?: unknown } | null = null;
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }

  const sources = (payload.sources ?? []).slice(0, MAX_SOURCES);

  if (sources.length < 2) {
    return NextResponse.json({ error: "至少需要 2 条素材" }, { status: 400 });
  }

  const resolved = resolveTextModel(payload);
  if (!resolved) {
    return NextResponse.json({ error: "未配置模型，无法使用云端分析" }, { status: 400 });
  }

  // 只有用服务端共享 Key 时才消耗额度；用户自己的 Key 不限
  if (resolved.shared) {
    const quota = consumeQuota(clientIp(request));
    if (!quota.ok) {
      return NextResponse.json({ error: quota.reason }, { status: 429 });
    }
  }

  const { baseUrl, apiKey, model } = resolved;

  const ask = (messages: { role: string; content: string }[]) =>
    fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 2200,
        messages,
      }),
      signal: AbortSignal.timeout(60_000),
    });

  const baseMessages = [
    {
      role: "system",
      content:
        "你是一个严谨的知识图谱构建器，只输出合法 JSON，不输出任何解释性文字。",
    },
    { role: "user", content: buildPrompt(sources) },
  ];

  try {
    let response = await ask(baseMessages);

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `模型返回 ${response.status}：${text.slice(0, 120)}` },
        { status: 502 },
      );
    }

    const data = (await response.json()) as {
      choices?: {
        finish_reason?: string;
        message?: { content?: string; reasoning_content?: string };
      }[];
      usage?: { total_tokens?: number };
    };

    const choice = data.choices?.[0];
    const raw = choice?.message?.content ?? "";
    const reasoning = choice?.message?.reasoning_content ?? "";

    // 模型可能用 ```json 围栏、或前后带解释文字，按括号深度截取最外层的对象
    const unfenced = raw.replace(/```(?:json)?/gi, "").trim();

    const sliceBalanced = (text: string, open: string, close: string) => {
      const from = text.indexOf(open);
      if (from < 0) return "";
      let depth = 0;
      let inString = false;
      let escaped = false;

      for (let i = from; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === "\\") escaped = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') inString = true;
        else if (ch === open) depth++;
        else if (ch === close) {
          depth--;
          if (depth === 0) return text.slice(from, i + 1);
        }
      }
      return "";
    };

    const candidate =
      sliceBalanced(unfenced, "{", "}") || sliceBalanced(raw, "{", "}");

    // 第一次没给 JSON：把要求再说一遍（很多模型被提醒一次就照做了）
    if (!candidate) {
      const retry = await ask([
        ...baseMessages,
        {
          role: "user",
          content:
            '上一次没有按要求输出。这次只输出一个 JSON 对象，形如 {"relations":[{"source":"s1","target":"s2","kind":"supports","strength":0.7,"reason":"..."}]}，不要任何解释、不要代码围栏。',
        },
      ]);

      if (retry.ok) {
        const retryData = (await retry.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const retryRaw = retryData.choices?.[0]?.message?.content ?? "";
        const retryCandidate =
          sliceBalanced(retryRaw.replace(/```(?:json)?/gi, "").trim(), "{", "}") ||
          sliceBalanced(retryRaw, "{", "}");

        if (retryCandidate) {
          try {
            parsed = JSON.parse(retryCandidate) as { relations?: unknown };
          } catch {
            parsed = null;
          }
        }
      }
    }

    if (!parsed && !candidate) {
      const reason =
        choice?.finish_reason === "length"
          ? "模型输出被长度限制截断（max_tokens 不够），稍后重试或减少素材条数"
          : reasoning
            ? "模型把内容都写进了推理过程，没有输出正文。换一个非推理模型，或稍后重试"
            : `模型没有返回 JSON（返回内容开头：${(raw || reasoning).slice(0, 60) || "空"}）`;

      return NextResponse.json({ error: reason }, { status: 502 });
    }

    try {
      if (!parsed) parsed = JSON.parse(candidate) as { relations?: unknown };
    } catch {
      return NextResponse.json(
        { error: `模型返回的 JSON 不完整：${candidate.slice(0, 80)}…` },
        { status: 502 },
      );
    }

    const ids = new Set(sources.map((source) => source.id));
    const seen = new Set<string>();
    const relations: {
      source: string;
      target: string;
      kind: string;
      strength: number;
      reason: string;
    }[] = [];

    const list = Array.isArray(parsed?.relations) ? parsed.relations : [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const pick = (...keys: string[]) => {
        for (const key of keys) {
          const value = row[key];
          if (typeof value === "string" && value) return value;
        }
        return "";
      };

      const a = pick("a", "source", "from");
      const b = pick("b", "target", "to");
      if (!ids.has(a) || !ids.has(b) || a === b) continue;

      const ALIASES: Record<string, (typeof KINDS)[number]> = {
        support: "supports",
        supported: "supports",
        contradict: "contradicts",
        contradiction: "contradicts",
        conflict: "contradicts",
        duplicate: "duplicates",
        same: "duplicates",
        similar: "related",
        overlap: "related",
        relate: "related",
      };

      const rawKind = typeof row.kind === "string" ? row.kind.toLowerCase() : "";
      const kind = KINDS.includes(rawKind as (typeof KINDS)[number])
        ? rawKind
        : (ALIASES[rawKind] ?? "related");
      const strength = Math.max(0, Math.min(1, Number(row.strength) || 0));
      if (strength < 0.45) continue;

      const key = [a, b].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);

      relations.push({
        source: a,
        target: b,
        kind,
        strength: Number(strength.toFixed(3)),
        reason: typeof row.reason === "string" ? row.reason.slice(0, 40) : "",
      });
    }

    if (list.length > 0 && relations.length === 0) {
      return NextResponse.json(
        {
          error: `模型返回了 ${list.length} 条关联，但格式不符合要求（需要 a/b 两个素材 id 与 kind）`,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      relations,
      tokens: data.usage?.total_tokens ?? null,
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    const message =
      name === "TimeoutError"
        ? "模型响应超时（60s），可减少素材数量后重试"
        : "无法连接到模型接口，检查 Base URL 与网络";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
