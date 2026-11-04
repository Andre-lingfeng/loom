import { NextResponse } from "next/server";

import { explainProviderError } from "@/lib/server/errors";

export const dynamic = "force-dynamic";

/**
 * 64×64 纯红 PNG（136 字节）。
 * 不能更小：Qwen 3 VL 等模型要求边长 > 28px，用 1×1 会被直接拒绝。
 */
const TEST_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsItz/fMYxgi+hcEKLNO+FgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQGBywLzk8EPlvGqjQAAAABJRU5ErkJggg==";

/**
 * 视觉模型连接测试。
 * 与纯文本测试的区别：真的带上一张图片，能测出「模型支不支持图片输入」。
 */
export async function POST(request: Request) {
  let payload: { baseUrl?: string; apiKey?: string; model?: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ ok: false, error: "请求格式不正确" }, { status: 400 });
  }

  // 容错：有人会把完整的 /chat/completions 粘进来，这里自动去掉
  let baseUrl = (payload.baseUrl ?? "").trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(baseUrl)) {
    baseUrl = baseUrl.replace(/\/chat\/completions$/i, "");
  }
  const apiKey = (payload.apiKey ?? "").trim();
  const model = (payload.model ?? "").trim();

  if (!baseUrl || !apiKey || !model) {
    return NextResponse.json(
      { ok: false, error: "需要 Base URL、API Key 和视觉模型名" },
      { status: 400 },
    );
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    return NextResponse.json(
      { ok: false, error: "Base URL 需要以 http(s):// 开头" },
      { status: 400 },
    );
  }

  const startedAt = Date.now();

  /** 只挑看起来是视觉模型的 id，避免一次列几百个 */
  const listVisionModels = async (): Promise<string[]> => {
    try {
      const res = await fetch(`${baseUrl}/models`, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { data?: { id?: string }[] };
      return (data.data ?? [])
        .map((item) => item.id)
        .filter((id): id is string => typeof id === "string" && /vl|vision|multimodal/i.test(id))
        .slice(0, 12);
    } catch {
      return [];
    }
  };

  try {
    const endpoint = `${baseUrl}/chat/completions`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 4,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "这张图片是什么颜色？只回答颜色，两个汉字以内。" },
              { type: "image_url", image_url: { url: TEST_IMAGE } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      const text = await response.text();
      const looksUnsupported =
        response.status === 400 && /image|vision|multimodal|content/i.test(text);

      // 模型名不对 / 没有权限时，顺手把这个账号能用的视觉模型列出来
      const needsSuggestions =
        /model/i.test(text) || response.status === 403 || response.status === 404;
      const suggestions = needsSuggestions ? await listVisionModels() : [];

      const baseHint = explainProviderError(response.status, text);

      return NextResponse.json({
        ok: false,
        latencyMs,
        endpoint,
        error: looksUnsupported
          ? "这个模型不接受图片输入，换一个视觉模型"
          : baseHint || `上游返回 ${response.status}：${text.slice(0, 120)}`,
        suggestions,
      });
    }

    const data = (await response.json()) as {
      model?: string;
      choices?: { message?: { content?: unknown } }[];
      usage?: { total_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content;
    const answer =
      typeof content === "string"
        ? content.trim()
        : Array.isArray(content)
          ? content
              .map((part) => (typeof part === "object" && part && "text" in part ? String(part.text) : ""))
              .join("")
              .trim()
          : "";

    return NextResponse.json({
      ok: true,
      latencyMs,
      model: data.model ?? model,
      answer: answer.slice(0, 60),
      tokens: data.usage?.total_tokens ?? null,
    });
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const name = error instanceof Error ? error.name : "Error";
    return NextResponse.json({
      ok: false,
      latencyMs,
      error:
        name === "TimeoutError"
          ? "连接超时（30s），检查 Base URL 或网络"
          : "无法连接到该地址，检查 Base URL 是否可访问",
    });
  }
}
