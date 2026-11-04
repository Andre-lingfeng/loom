import { redirect } from "next/navigation";

/**
 * 兜底路由：所有未匹配的地址（含已删除的 /workspace）直接回到入口页。
 * 显式路由（/、/kb、/kb/settings、/api/*）优先级更高，不会被这里捕获。
 */
export default function CatchAllPage() {
  redirect("/");
}
