import { addTokens } from "./metrics";

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
    model: clean(process.env.DEEPSEEK_MODEL) || "deepseek-flash",
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

interface QuotaStore {
  perIp: Map<string, Bucket>;
  global: Bucket;
  token: Bucket;
  fetchPerIp: Map<string, Bucket>;
  fetchGlobal: Bucket;
}

// 关键：挂在 globalThis 上，否则每个 API 路由各有一份独立计数
const store = ((globalThis as typeof globalThis & { __loomQuota?: QuotaStore }).__loomQuota ??= {
  perIp: new Map(),
  global: { day: "", count: 0 },
  token: { day: "", count: 0 },
  fetchPerIp: new Map(),
  fetchGlobal: { day: "", count: 0 },
});

const today = () => new Date().toISOString().slice(0, 10);

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "local";
}

const TOKEN_BUDGET_PER_DAY = Number(process.env.DEMO_TOKEN_BUDGET ?? 900_000);

/** 共享 Key 当天已消耗的 token（进程内计数，重启清零） */


const FETCH_PER_IP_PER_DAY = Number(process.env.FETCH_PER_IP_PER_DAY ?? 60);
const FETCH_GLOBAL_PER_DAY = Number(process.env.FETCH_GLOBAL_PER_DAY ?? 600);



/** 抓取 / 解析类接口的额度（与模型额度分开计数） */
export function consumeFetchQuota(
  ip: string,
): { ok: true } | { ok: false; reason: string } {
  const day = today();

  if (store.fetchGlobal.day !== day) store.fetchGlobal = { day, count: 0 };
  if (store.fetchGlobal.count >= FETCH_GLOBAL_PER_DAY) {
    return { ok: false, reason: "今天全站的抓取次数已用完，明天再试或改用「粘贴」" };
  }

  const bucket = store.fetchPerIp.get(ip);
  const count = bucket && bucket.day === day ? bucket.count : 0;
  if (count >= FETCH_PER_IP_PER_DAY) {
    return { ok: false, reason: `今天的抓取次数已用完（${FETCH_PER_IP_PER_DAY} 次），改用「粘贴」不受影响` };
  }

  store.fetchPerIp.set(ip, { day, count: count + 1 });
  store.fetchGlobal.count += 1;

  if (store.fetchPerIp.size > 2000) {
    for (const [key, value] of store.fetchPerIp) {
      if (value.day !== day) store.fetchPerIp.delete(key);
    }
  }

  return { ok: true };
}

/** 共享 Key 的 token 预算是否还有余量 */
export function tokenBudgetLeft(): number {
  const day = today();
  if (store.token.day !== day) store.token = { day, count: 0 };
  return Math.max(0, TOKEN_BUDGET_PER_DAY - store.token.count);
}

/** 调用结束后记账；只统计共享 Key 的消耗 */
export function recordTokens(tokens: number | null | undefined): void {
  if (!tokens || !Number.isFinite(tokens)) return;
  const day = today();
  if (store.token.day !== day) store.token = { day, count: 0 };
  store.token.count += Math.floor(tokens);
  // 同步到运行时指标，供 /api/metrics 读取
  addTokens(tokens);
}

export function tokenBudgetState(): { used: number; total: number; left: number } {
  const day = today();
  if (store.token.day !== day) store.token = { day, count: 0 };
  return {
    used: store.token.count,
    total: TOKEN_BUDGET_PER_DAY,
    left: Math.max(0, TOKEN_BUDGET_PER_DAY - store.token.count),
  };
}

export function consumeQuota(ip: string): { ok: true } | { ok: false; reason: string } {
  const day = today();

  if (store.global.day !== day) store.global = { day, count: 0 };
  if (store.global.count >= GLOBAL_PER_DAY) {
    return { ok: false, reason: "今日演示额度已用完，可在「模型接入」填自己的 Key 继续使用" };
  }

  if (tokenBudgetLeft() <= 0) {
    return {
      ok: false,
      reason: "今日演示额度已用完，可在「模型接入」填自己的 Key 继续使用",
    };
  }

  const bucket = store.perIp.get(ip);
  const count = bucket && bucket.day === day ? bucket.count : 0;
  if (count >= PER_IP_PER_DAY) {
    return { ok: false, reason: "今天的演示额度已用完，可在「模型接入」填自己的 Key 继续使用" };
  }

  store.perIp.set(ip, { day, count: count + 1 });
  store.global.count += 1;

  // 简单的内存回收，避免 Map 无限增长
  if (store.perIp.size > 2000) {
    for (const [key, value] of store.perIp) {
      if (value.day !== day) store.perIp.delete(key);
    }
  }

  return { ok: true };
}
