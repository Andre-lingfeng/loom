/**
 * 服务端专用：模型凭证解析 + 简易限流。
 * 只在 route handler 里引用，绝不能从客户端组件 import。
 *
 * 策略：优先用请求带来的 Key（用户自己的），没有才回落到服务端环境变量（演示共享 Key）。
 * 只有用共享 Key 时才限流 —— 用户自己的 Key 不该被限制。
 */

export interface ResolvedModel {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** true = 用的是服务端共享 Key */
  shared: boolean;
}

const clean = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function resolveTextModel(payload: {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}): ResolvedModel | null {
  const clientKey = clean(payload.apiKey);
  if (clientKey && clean(payload.baseUrl) && clean(payload.model)) {
    return {
      baseUrl: clean(payload.baseUrl).replace(/\/+$/, ""),
      apiKey: clientKey,
      model: clean(payload.model),
      shared: false,
    };
  }

  const envKey = clean(process.env.DEEPSEEK_API_KEY);
  if (!envKey) return null;

  return {
    baseUrl: (clean(process.env.DEEPSEEK_BASE_URL) || "https://api.deepseek.com/v1").replace(
      /\/+$/,
      "",
    ),
    apiKey: envKey,
    model: clean(process.env.DEEPSEEK_MODEL) || "deepseek-chat",
    shared: true,
  };
}

export function resolveVisionModel(payload: {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}): ResolvedModel | null {
  const clientKey = clean(payload.apiKey);
  if (clientKey && clean(payload.baseUrl) && clean(payload.model)) {
    return {
      baseUrl: clean(payload.baseUrl).replace(/\/+$/, ""),
      apiKey: clientKey,
      model: clean(payload.model),
      shared: false,
    };
  }

  const envKey = clean(process.env.VISION_API_KEY) || clean(process.env.DEEPSEEK_API_KEY);
  if (!envKey) return null;

  return {
    baseUrl: (
      clean(process.env.VISION_BASE_URL) ||
      clean(process.env.DEEPSEEK_BASE_URL) ||
      "https://api.deepseek.com/v1"
    ).replace(/\/+$/, ""),
    apiKey: envKey,
    model: clean(process.env.VISION_MODEL),
    shared: true,
  };
}

/* ------------------------------------------------------------------ */
/* 限流：内存计数，只对本进程有效（serverless 多实例下是近似值）        */
/* ------------------------------------------------------------------ */

const PER_IP_PER_DAY = Number(process.env.DEMO_QUOTA_PER_IP ?? 20);
const GLOBAL_PER_DAY = Number(process.env.DEMO_QUOTA_GLOBAL ?? 300);

type Bucket = { day: string; count: number };

const perIp = new Map<string, Bucket>();
let global: Bucket = { day: "", count: 0 };

const today = () => new Date().toISOString().slice(0, 10);

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "local";
}

const FETCH_PER_IP_PER_DAY = Number(process.env.FETCH_PER_IP_PER_DAY ?? 60);
const FETCH_GLOBAL_PER_DAY = Number(process.env.FETCH_GLOBAL_PER_DAY ?? 600);

let fetchGlobal: Bucket = { day: "", count: 0 };
const fetchPerIp = new Map<string, Bucket>();

/** 抓取 / 解析类接口的额度（与模型额度分开计数） */
export function consumeFetchQuota(
  ip: string,
): { ok: true } | { ok: false; reason: string } {
  const day = today();

  if (fetchGlobal.day !== day) fetchGlobal = { day, count: 0 };
  if (fetchGlobal.count >= FETCH_GLOBAL_PER_DAY) {
    return { ok: false, reason: "今天全站的抓取次数已用完，明天再试或改用「粘贴」" };
  }

  const bucket = fetchPerIp.get(ip);
  const count = bucket && bucket.day === day ? bucket.count : 0;
  if (count >= FETCH_PER_IP_PER_DAY) {
    return { ok: false, reason: `今天的抓取次数已用完（${FETCH_PER_IP_PER_DAY} 次），改用「粘贴」不受影响` };
  }

  fetchPerIp.set(ip, { day, count: count + 1 });
  fetchGlobal.count += 1;

  if (fetchPerIp.size > 2000) {
    for (const [key, value] of fetchPerIp) {
      if (value.day !== day) fetchPerIp.delete(key);
    }
  }

  return { ok: true };
}

export function consumeQuota(ip: string): { ok: true } | { ok: false; reason: string } {
  const day = today();

  if (global.day !== day) global = { day, count: 0 };
  if (global.count >= GLOBAL_PER_DAY) {
    return { ok: false, reason: "今日演示额度已用完，可在「模型接入」填自己的 Key 继续使用" };
  }

  const bucket = perIp.get(ip);
  const count = bucket && bucket.day === day ? bucket.count : 0;
  if (count >= PER_IP_PER_DAY) {
    return { ok: false, reason: "今天的演示额度已用完，可在「模型接入」填自己的 Key 继续使用" };
  }

  perIp.set(ip, { day, count: count + 1 });
  global.count += 1;

  // 简单的内存回收，避免 Map 无限增长
  if (perIp.size > 2000) {
    for (const [key, value] of perIp) {
      if (value.day !== day) perIp.delete(key);
    }
  }

  return { ok: true };
}
