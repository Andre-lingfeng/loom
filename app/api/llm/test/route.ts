import { NextResponse } from "next/server";

import { explainProviderError } from "@/lib/server/errors";

export const dynamic = "force-dynamic";

/**
 * 连接测试：用 1 个 token 的请求验证 baseUrl / apiKey / model 是否可用。
 * 注意：密钥只在本次请求内使用，不落库、不回显、不打日志。
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
      { ok: false, error: "Base URL、API Key、模型名都不能为空" },
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

  /** 列出该端点可用的模型（只在模型名疑似写错时才调用） */
  const listModels = async (): Promise<string[]> => {
    try {
      const res = await fetch(`${baseUrl}/models`, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { data?: { id?: string }[] };
      return (data.data ?? [])
        .map((item) => item.id)
        .filter((id): id is string => Boolean(id))
        .slice(0, 20);
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
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 8,
        temperature: 0,
        stream: false,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      const text = await response.text();
      const looksLikeModelIssue =
        /model/i.test(text) || response.status === 404 || response.status === 400;
      const suggestions = looksLikeModelIssue ? await listModels() : [];

      // 把状态码翻译成"该怎么办"，比丢一段英文报错有用
      // Key 形态与平台不匹配时，直接指出问题在哪
      const keyHint =
        baseUrl.includes("deepseek") && !apiKey.startsWith("sk-")
          ? "DeepSeek 的 Key 以 sk- 开头；当前填的不像 DeepSeek Key，检查是不是复制了别的平台的"
          : baseUrl.includes("bigmodel") && !apiKey.includes(".")
            ? "智谱的 API Key 形如「id.secret」（中间有个点）；只复制了一半会 401"
            : baseUrl.includes("dashscope") && !apiKey.startsWith("sk-")
              ? "通义的 Key 以 sk- 开头，检查是否复制完整"
              : baseUrl.includes("openai") && !apiKey.startsWith("sk-")
                ? "OpenAI 的 Key 以 sk- 开头，检查是否复制完整"
                : "";

      const codeHint = explainProviderError(response.status, text);

      const reason =
        response.status === 401 || response.status === 403
          ? "Key 无效或没有权限：检查是否复制完整、是否过期、是否和这个平台对应"
          : response.status === 404
            ? "接口地址不对：Base URL 通常要以 /v1 结尾（如 https://api.deepseek.com/v1）"
            : response.status === 429
              ? "请求太频繁或额度用完了：稍后再试，或检查账户余额"
              : response.status === 400 && /model/i.test(text)
                ? "模型名不存在：从下方可用模型里选一个"
                : `上游返回 ${response.status}，检查地址、Key 与模型名`;

      return NextResponse.json({
        ok: false,
        latencyMs,
        status: response.status,
        endpoint,
        reason: codeHint || reason,
        keyHint,
        detail: text.slice(0, 120),
        suggestions,
      });
    }

    const data = (await response.json()) as {
      model?: string;
      usage?: { total_tokens?: number };
    };

    return NextResponse.json({
      ok: true,
      latencyMs,
      model: data.model ?? model,
      tokens: data.usage?.total_tokens ?? null,
    });
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const name = error instanceof Error ? error.name : "Error";
    const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)/i.test(baseUrl);
    const message =
      name === "TimeoutError"
        ? "连接超时：地址可能被墙或不响应。国内访问 OpenAI 需要代理；DeepSeek / 智谱 / 通义可直连"
        : isLocal
          ? "连不上这个本地地址：对应的服务可能没启动，确认端口是否在监听"
          : "连不上这个地址：检查 Base URL 拼写，以及本机网络能不能访问它";
    return NextResponse.json({ ok: false, latencyMs, error: message });
  }
}
