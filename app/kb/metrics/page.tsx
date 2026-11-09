"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, Loader2, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";

import { card, ghost, input, primary } from "@/components/kb/theme";

interface RouteStat {
  route: string;
  count: number;
  ok: number;
  fail: number;
  p50: number;
  p95: number;
}

interface Metrics {
  uptimeMinutes: number;
  requests: { total: number; ok: number; fail: number; successRate: number | null };
  routes: RouteStat[];
  errors: Record<string, number>;
  tokensUsed: number;
  note: string;
}

const ERROR_LABEL: Record<string, string> = {
  auth: "鉴权失败",
  quota: "额度用尽",
  upstream: "上游异常",
  invalid: "请求不合法",
  other: "其他",
};

/** 耗时条：以 20 秒为满格 */
function LatencyBar({ value, tone }: { value: number; tone: "ok" | "warn" }) {
  const width = Math.min(100, Math.max(2, (value / 20000) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
      <div
        className={cn(
          "h-full rounded-full",
          tone === "ok" ? "bg-violet-400/70" : "bg-amber-400/70",
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export default function MetricsPage() {
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [needToken, setNeedToken] = useState(false);
  const [token, setToken] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const suffix = token ? `?token=${encodeURIComponent(token)}` : "";
      const res = await fetch(`/api/metrics${suffix}`, { cache: "no-store" });

      if (res.status === 401) {
        setNeedToken(true);
        setError("这个部署设置了访问口令");
        return;
      }
      if (!res.ok) {
        setError(`读取失败（${res.status}）`);
        return;
      }

      setNeedToken(false);
      setData((await res.json()) as Metrics);
    } catch {
      setError("网络异常，稍后再试");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const successRate = data?.requests.successRate ?? null;

  return (
    <div className="aurora-root relative min-h-dvh overflow-hidden">
      <div
        aria-hidden="true"
        className="aurora-glow pointer-events-none absolute inset-x-0 top-0 h-[420px]"
      />

      <div className="relative mx-auto w-full max-w-2xl px-6 py-10">
        <Link
          href="/kb"
          className="inline-flex items-center gap-1.5 text-2xs text-white/40 transition-colors hover:text-white"
        >
          <ArrowLeft size={12} />
          返回工作台
        </Link>

        <div className="mt-5 flex items-center gap-2">
          <Activity size={16} className="text-violet-300" />
          <h1 className="text-xl font-medium tracking-tight">运行指标</h1>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-2xs text-white/40 transition-colors hover:text-white disabled:opacity-50"
          >
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
            刷新
          </button>
        </div>

        <p className="mt-1.5 text-xs leading-relaxed text-white/35">
          只记录运行时健康度：路由、状态码、耗时、token。
          <span className="text-white/25">不含问题、素材、Key 与 IP。</span>
        </p>

        {needToken && (
          <div className={cn(card, "mt-4 flex items-center gap-2 p-3")}>
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="访问口令"
              className={cn(input, "h-9 flex-1 text-xs")}
            />
            <button onClick={() => void load()} className={primary}>
              读取
            </button>
          </div>
        )}

        {error && !needToken && <p className="mt-4 text-2xs text-red-300/80">{error}</p>}

        {loading && !data && (
          <div className="mt-6 flex items-center gap-2 text-2xs text-white/40">
            <Loader2 size={12} className="animate-spin" />
            正在读取…
          </div>
        )}

        {data && (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "运行时长", value: `${data.uptimeMinutes} 分` },
                { label: "请求总数", value: String(data.requests.total) },
                {
                  label: "成功率",
                  value:
                    successRate === null ? "—" : `${Math.round(successRate * 100)}%`,
                  tone:
                    successRate === null || successRate >= 0.9
                      ? "normal"
                      : successRate >= 0.7
                        ? "warn"
                        : "bad",
                },
                { label: "token 消耗", value: data.tokensUsed.toLocaleString() },
              ].map((item) => (
                <div key={item.label} className={cn(card, "p-3")}>
                  <div className="text-2xs text-white/30">{item.label}</div>
                  <div
                    className={cn(
                      "mt-1 text-lg font-medium tabular-nums",
                      item.tone === "bad"
                        ? "text-red-300"
                        : item.tone === "warn"
                          ? "text-amber-300"
                          : "text-white/85",
                    )}
                  >
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            <div className={cn(card, "mt-3 p-4")}>
              <div className="text-xs font-medium text-white/70">按接口</div>
              {data.routes.length === 0 ? (
                <p className="mt-2 text-2xs text-white/25">还没有请求</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {data.routes.map((item) => (
                    <div key={item.route}>
                      <div className="flex items-baseline gap-2 text-2xs">
                        <span className="font-mono text-white/70">{item.route}</span>
                        <span className="text-white/25">
                          {item.count} 次{item.fail > 0 ? ` · 失败 ${item.fail}` : ""}
                        </span>
                        <span className="ml-auto tabular-nums text-white/35">
                          P50 {item.p50}ms · P95 {item.p95}ms
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <LatencyBar
                          value={item.p95}
                          tone={item.p95 > 10000 ? "warn" : "ok"}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-2xs text-white/20">
                条形长度按 P95 计，满格 20 秒；超过 10 秒标黄。
              </p>
            </div>

            <div className={cn(card, "mt-3 p-4")}>
              <div className="text-xs font-medium text-white/70">错误分布</div>
              {Object.keys(data.errors).length === 0 ? (
                <p className="mt-2 text-2xs text-white/25">暂无错误</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(data.errors).map(([kind, count]) => (
                    <span
                      key={kind}
                      className="rounded-lg bg-red-400/[0.08] px-2 py-1 text-2xs text-red-200/80"
                    >
                      {ERROR_LABEL[kind] ?? kind} · {count}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <p className="mt-4 text-2xs leading-relaxed text-white/20">
              {data.note}。计数在进程内，服务重启后清零。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
