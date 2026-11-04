import { NextResponse } from "next/server";

import { clientIp, consumeFetchQuota } from "@/lib/server/model";
import { assertPublicUrl, readLimitedText, safeFetch } from "@/lib/server/ssrf";

export const dynamic = "force-dynamic";
// 云端分析可能跑 20s 以上，Vercel 默认超时不够
export const maxDuration = 60;

/** 链接入库：服务端抓取并抽正文。失败时前端会提示改用粘贴。 */
export async function POST(request: Request) {
  let url = "";
  try {
    const body = (await request.json()) as { url?: string };
    url = (body.url ?? "").trim();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }

  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "请填写 http(s) 开头的链接" }, { status: 400 });
  }

  // 抓取是服务端替用户发请求，必须限流 + 拒绝内网地址（SSRF）
  const quota = consumeFetchQuota(clientIp(request));
  if (!quota.ok) {
    return NextResponse.json({ error: quota.reason }, { status: 429 });
  }

  try {
    await assertPublicUrl(url);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "链接不可访问" },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    // 每一跳都重新校验地址；响应体最多读 2MB
    const response = await safeFetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; LoomBot/0.1; +https://example.com/bot)",
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `目标站点返回 ${response.status}，请改用粘贴` },
        { status: 502 },
      );
    }

    const html = await readLimitedText(response, 2_000_000);
    const title =
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? url;

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{2,}/g, "\n")
      .trim()
      .slice(0, 20000);

    if (text.length < 80) {
      return NextResponse.json(
        { error: "没抓到正文（可能是动态渲染页面），请改用粘贴" },
        { status: 422 },
      );
    }

    return NextResponse.json({ title, text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const blocked = /内网|本机|端口|域名解析/.test(message);

    return NextResponse.json(
      {
        error: blocked
          ? message
          : "抓取超时或被拒绝，请改用粘贴",
      },
      { status: blocked ? 400 : 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
