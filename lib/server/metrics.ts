/**
 * 服务端宏观指标：请求数、成功率、延迟分位、错误分类、token 消耗。
 *
 * 只记录「运行时健康度」，**不记录任何用户内容**：
 * 没有提问、没有素材、没有 Key、没有 IP。这是产品「数据不出浏览器」主张的一部分。
 *
 * 计数挂在 globalThis 上——Next 的每个路由是独立模块，
 * 模块级变量在路由之间不共享（做 token 预算时踩过这个坑）。
 */

interface RouteStat {
  count: number;
  ok: number;
  fail: number;
  /** 最近 200 次耗时（ms），用于算分位数 */
  samples: number[];
}

interface MetricsStore {
  startedAt: number;
  routes: Record<string, RouteStat>;
  errors: Record<string, number>;
  tokens: number;
}

const globals = globalThis as typeof globalThis & { __loomMetrics?: MetricsStore };

export const metrics: MetricsStore = (globals.__loomMetrics ??= {
  startedAt: Date.now(),
  routes: {},
  errors: {},
  tokens: 0,
});

/** 按状态码归类错误，便于看「坏在哪一层」 */
function classify(status: number): string | null {
  if (status < 400) return null;
  if (status === 429) return "quota";
  if (status === 401 || status === 403) return "auth";
  if (status >= 500) return "upstream";
  if (status === 400 || status === 422) return "invalid";
  return "other";
}

export function record(route: string, status: number, ms: number): void {
  const stat = (metrics.routes[route] ??= { count: 0, ok: 0, fail: 0, samples: [] });

  stat.count += 1;
  if (status < 400) stat.ok += 1;
  else stat.fail += 1;

  stat.samples.push(Math.round(ms));
  if (stat.samples.length > 200) stat.samples.shift();

  const kind = classify(status);
  if (kind) metrics.errors[kind] = (metrics.errors[kind] ?? 0) + 1;
}

export function addTokens(count: number | null | undefined): void {
  if (!count || !Number.isFinite(count)) return;
  metrics.tokens += Math.floor(count);
}

const percentile = (samples: number[], p: number): number => {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
};

/** 包装一个路由处理器，自动记录耗时与状态 */
export function withMetrics(
  route: string,
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const startedAt = Date.now();
    try {
      const response = await handler(request);
      record(route, response.status, Date.now() - startedAt);
      return response;
    } catch (error) {
      record(route, 500, Date.now() - startedAt);
      throw error;
    }
  };
}

export function snapshot() {
  const routes = Object.entries(metrics.routes)
    .map(([route, stat]) => ({
      route,
      count: stat.count,
      ok: stat.ok,
      fail: stat.fail,
      p50: percentile(stat.samples, 50),
      p95: percentile(stat.samples, 95),
    }))
    .sort((a, b) => b.count - a.count);

  const total = routes.reduce((sum, item) => sum + item.count, 0);
  const ok = routes.reduce((sum, item) => sum + item.ok, 0);

  return {
    uptimeMinutes: Math.round((Date.now() - metrics.startedAt) / 60000),
    requests: {
      total,
      ok,
      fail: total - ok,
      successRate: total === 0 ? null : Number((ok / total).toFixed(3)),
    },
    routes,
    errors: metrics.errors,
    tokensUsed: metrics.tokens,
    note: "只含运行时聚合数据：不含问题、素材、Key 与 IP",
  };
}
