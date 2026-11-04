import { NextResponse } from "next/server";

import {
  clientIp,
  consumeQuota,
  resolveVisionModel,
} from "@/lib/server/model";

export const dynamic = "force-dynamic";
// 云端分析可能跑 20s 以上，Vercel 默认超时不够
export const maxDuration = 60;

const PROMPT = `你是文档转录助手。请处理这张图片：

1. 完整转录图片中的所有文字，保留段落与层级（标题、列表、表格按原样组织）。
2. 如果图中有图表，用文字描述关键数据（坐标轴含义、趋势、极值）。
3. 看不清的内容用〔无法识别〕标记，**不要猜测或编造**。
4. 只输出转录结果，不要加任何解释性开场白。`;

interface Incoming {
  image?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export async function POST(request: Request) {
  let payload: Incoming;
  try {
    payload = (await request.json()) as Incoming;
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }

  const image = payload.image ?? "";

  if (!image.startsWith("data:image/")) {
    return NextResponse.json(
      { error: "图片格式不支持，请上传 JPG / PNG / WebP" },
      { status: 400 },
    );
  }
  // 校验图片头：仅看 data URL 前缀不够，base64 可能已被截断
  const comma = image.indexOf(",");
  const head = Buffer.from(image.slice(comma + 1, comma + 33), "base64");
  const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const isPng =
    head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const isWebp =
    head.slice(0, 4).toString("ascii") === "RIFF" &&
    head.slice(8, 12).toString("ascii") === "WEBP";

  if (!isJpeg && !isPng && !isWebp) {
    return NextResponse.json(
      { error: "图片数据不完整或格式不支持，请换一张 JPG / PNG 再试" },
      { status: 400 },
    );
  }

  if (image.length > 8_000_000) {
    return NextResponse.json({ error: "图片过大（上限约 6MB）" }, { status: 413 });
  }
  const resolved = resolveVisionModel(payload);
  if (!resolved || !resolved.model) {
    return NextResponse.json(
      { error: "还没配置视觉模型，先去「模型接入」选一个" },
      { status: 400 },
    );
  }

  if (resolved.shared) {
    const quota = consumeQuota(clientIp(request));
    if (!quota.ok) {
      return NextResponse.json({ error: quota.reason }, { status: 429 });
    }
  }

  const { baseUrl, apiKey, model } = resolved;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      const text = await response.text();

      if (/could not be decoded|decode|invalid image|unsupported image/i.test(text)) {
        return NextResponse.json(
          {
            error:
              "模型无法解码这张图片：内容可能已损坏，或格式不受支持。换成 JPG / PNG 截图再试",
          },
          { status: 422 },
        );
      }
      // 模型不支持图片输入时，上游一般返回 400 且提到 image / content
      const looksUnsupported =
        response.status === 400 &&
        /image|vision|content|multimodal/i.test(text);

      return NextResponse.json(
        {
          error: looksUnsupported
            ? "当前模型不支持图片输入。去「模型接入」把视觉模型换成支持图片的（如 glm-4v-flash、qwen-vl-plus）"
            : `视觉模型返回 ${response.status}：${text.slice(0, 140)}`,
        },
        { status: 502 },
      );
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string | { text?: string }[] } }[];
      usage?: { total_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content;
    const text =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.map((part) => part.text ?? "").join("")
          : "";

    if (text.trim().length < 10) {
      return NextResponse.json(
        { error: "没识别出文字，换一张更清晰的图片试试" },
        { status: 422 },
      );
    }

    return NextResponse.json({
      text: text.trim(),
      model,
      tokens: data.usage?.total_tokens ?? null,
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    return NextResponse.json(
      {
        error:
          name === "TimeoutError"
            ? "视觉模型超时（90s），图片可能太大"
            : "无法连接视觉模型，检查 Base URL 与网络",
      },
      { status: 502 },
    );
  }
}
