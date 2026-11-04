import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * /api/* 下未匹配的地址返回 JSON 404。
 * 页面路由的兜底在 app/[...slug]/page.tsx（重定向到入口），两者互不干扰。
 */
const notFound = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

export {
  notFound as GET,
  notFound as POST,
  notFound as PUT,
  notFound as PATCH,
  notFound as DELETE,
};
