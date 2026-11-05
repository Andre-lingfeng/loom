import { NextResponse } from "next/server";

import { snapshot } from "@/lib/server/metrics";

export const dynamic = "force-dynamic";

/**
 * 运行时指标（只读）。
 * 设置 METRICS_TOKEN 后需要 ?token=xxx 才能读；否则返回聚合数字。
 * 无论哪种模式，都不返回任何用户内容。
 */
export async function GET(request: Request) {
  const expected = process.env.METRICS_TOKEN?.trim();

  if (expected) {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== expected) {
      return NextResponse.json({ error: "需要访问口令" }, { status: 401 });
    }
  }

  return NextResponse.json(snapshot(), {
    headers: { "cache-control": "no-store" },
  });
}
