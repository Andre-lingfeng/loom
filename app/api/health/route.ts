import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 部署后的健康检查：确认页面、模型配置与运行时都正常。
 * 不返回任何密钥内容，只说"有 / 没有"。
 */
export async function GET() {
  const textKey = Boolean(process.env.DEEPSEEK_API_KEY);
  const visionKey = Boolean(process.env.VISION_API_KEY || process.env.DEEPSEEK_API_KEY);
  const visionModel = Boolean(process.env.VISION_MODEL);

  return NextResponse.json(
    {
      ok: true,
      time: new Date().toISOString(),
      runtime: process.env.VERCEL ? "vercel" : "node",
      features: {
        localOnly: ["检索", "缺口检测", "简报", "图谱（本地算法）"],
        cloud: {
          relations: textKey,
          generate: textKey,
          vision: visionKey && visionModel,
        },
      },
      hint: textKey
        ? "云端能力已就绪"
        : "未配置服务端 Key：云端功能会提示用户自行填 Key，本地功能不受影响",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
