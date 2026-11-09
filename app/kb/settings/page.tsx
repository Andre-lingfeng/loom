"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Eye, EyeOff, Loader2, ShieldCheck, Trash2, Zap } from "lucide-react";

import { useKb } from "@/lib/kb/store";

import { SafeBoundary } from "@/components/kb/SafeBoundary";
import {
  EMPTY_CONFIG,
  PROVIDERS,
  VISION_PRESETS,
  hasDedicatedVision,
  isVisionConfigured,
  resolveVision,
  clearConfig,
  isConfigured,
  loadConfig,
  maskKey,
  saveConfig,
  type LlmConfig,
} from "@/lib/kb/llm";
import { cn } from "@/lib/utils";

import { card, ghost, input, primary } from "@/components/kb/theme";

type TestResult =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; latencyMs: number; model: string }
  | {
      kind: "fail";
      error: string;
      latencyMs?: number;
      reason?: string;
      detail?: string;
      keyHint?: string;
    };

export default function ApiSettingsPage() {
  const [config, setConfig] = useState<LlmConfig>(EMPTY_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [renamedFrom, setRenamedFrom] = useState<string | null>(null);
  const [visionTest, setVisionTest] = useState<
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "ok"; latencyMs: number; model: string; answer: string }
    | { kind: "fail"; error: string; endpoint?: string; suggestions?: string[] }
  >({ kind: "idle" });

  const [result, setResult] = useState<TestResult>({ kind: "idle" });
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const autoRecompute = useKb((state) => state.autoRecompute);
  const setAutoRecompute = useKb((state) => state.setAutoRecompute);
  const showReset = useKb((state) => state.showReset);
  const setShowReset = useKb((state) => state.setShowReset);

  useEffect(() => {
    setConfig(loadConfig());
    setLoaded(true);
  }, []);

  const patch = (next: Partial<LlmConfig>) => {
    setConfig((current) => ({ ...current, ...next }));
    setSaved(false);
    setDirty(true);
    setResult({ kind: "idle" });
  };

  const pickProvider = (key: string) => {
    const provider = PROVIDERS.find((item) => item.key === key);
    if (!provider) return;
    setConfig((current) => ({
      ...current,
      provider: key,
      baseUrl: key === "custom" ? current.baseUrl : provider.baseUrl,
      model: key === "custom" ? current.model : provider.model,
    }));
    setSaved(false);
    setDirty(true);
    setResult({ kind: "idle" });
  };

  const test = async () => {
    setResult({ kind: "running" });
    setSuggestions([]);
    try {
      const res = await fetch("/api/llm/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model: config.model,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        latencyMs?: number;
        model?: string;
        error?: string;
        reason?: string;
        detail?: string;
        keyHint?: string;
        suggestions?: string[];
      };
      if (data.ok) {
        // 上游返回的真实模型名与填写的不一致时，以返回值为准（很多平台有别名）
        const actual = data.model?.trim();
        const renamed = Boolean(actual && actual !== config.model);
        setRenamedFrom(renamed ? config.model : null);

        const patchConfig =
          renamed && actual ? { ...config, model: actual } : config;

        if (patchConfig !== config) {
          setConfig(patchConfig);
          saveConfig(patchConfig);
        } else {
          saveConfig(config);
        }
        setSaved(true);
        setDirty(false);
        setResult({
          kind: "ok",
          latencyMs: data.latencyMs ?? 0,
          model: data.model ?? config.model,
        });
      } else {
        setSuggestions(data.suggestions ?? []);
        setResult({
          kind: "fail",
          error: data.error ?? "连接失败",
          latencyMs: data.latencyMs,
          reason: data.reason,
          detail: data.detail,
          keyHint: data.keyHint,
        });
      }
    } catch {
      setResult({ kind: "fail", error: "请求失败，检查网络后重试" });
    }
  };

  const vision = resolveVision(config);
  const visionReady = Boolean(vision.baseUrl && vision.apiKey && vision.model);

  const testVision = async () => {
    setVisionTest({ kind: "running" });

    try {
      const res = await fetch("/api/vision/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseUrl: vision.baseUrl,
          apiKey: vision.apiKey,
          model: vision.model,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        latencyMs?: number;
        model?: string;
        answer?: string;
        error?: string;
        endpoint?: string;
        suggestions?: string[];
      };

      if (data.ok) {
        setVisionTest({
          kind: "ok",
          latencyMs: data.latencyMs ?? 0,
          model: data.model ?? vision.model,
          answer: data.answer ?? "",
        });
      } else {
        setVisionTest({
          kind: "fail",
          error: data.error ?? "视觉测试失败",
          endpoint: data.endpoint,
          suggestions: data.suggestions ?? [],
        });
      }
    } catch {
      setVisionTest({ kind: "fail", error: "网络异常，无法请求测试接口" });
    }
  };

  const save = () => {
    saveConfig(config);
    setSaved(true);
    setDirty(false);
  };

  const reset = () => {
    clearConfig();
    setConfig(EMPTY_CONFIG);
    setResult({ kind: "idle" });
    setSaved(false);
    setDirty(false);
  };

  const active = PROVIDERS.find((item) => item.key === config.provider);
  const ready = isConfigured(config);

  if (!loaded) {
    return (
      <div className="aurora-root grid min-h-dvh place-items-center bg-black text-sm text-white/30">
        正在读取本地配置…
      </div>
    );
  }

  return (
    <SafeBoundary
      onReset={() => {
        clearConfig();
        window.location.reload();
      }}
    >
    <div className="aurora-root relative min-h-dvh overflow-hidden">
      <div
        aria-hidden="true"
        className="aurora-glow pointer-events-none absolute inset-x-0 top-0 h-[420px]"
      />

      <div className="relative z-10 mx-auto w-full max-w-2xl px-6 py-10">
        <Link
          href="/kb"
          className="inline-flex items-center gap-1.5 text-2xs text-white/35 transition-colors hover:text-white"
        >
          <ArrowLeft size={12} />
          返回工作台
        </Link>

        <header className="mt-5 mb-6">
          <h1 className="text-2xl font-medium tracking-tight">模型接入</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-white/40">
            填一个 OpenAI 兼容端点，知识库就能从「检索」升级成「分析、追问、精炼」。
            不填也能用，只是会退回本地规则。
          </p>
        </header>

        {/* 状态 */}
        <div className={cn(card, "mb-3 flex items-center gap-3 px-4 py-3")}>
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              ready ? "bg-emerald-400" : "bg-white/25",
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm">
              {ready ? "已配置，可以使用云端模型" : "未配置，当前为本地规则模式"}
            </div>
            <div className="mt-0.5 truncate text-2xs text-white/30">
              {ready
                ? `${active?.label ?? config.provider} · ${config.model} · ${maskKey(config.apiKey)}`
                : "填写下方任意一家即可启用"}
            </div>
          </div>
          {dirty ? (
            <span className="shrink-0 rounded-md bg-amber-400/15 px-1.5 py-0.5 text-2xs text-amber-300">
              未保存
            </span>
          ) : saved ? (
            <span className="flex items-center gap-1 text-2xs text-emerald-400">
              <Check size={11} /> 已保存
            </span>
          ) : null}
        </div>

        {/* 表单 */}
        <div className={cn(card, "p-5")}>
          <div className="mb-5">
            <div className="mb-2 text-2xs text-white/35">服务商</div>
            <div className="flex flex-wrap gap-1.5">
              {PROVIDERS.map((provider) => {
                const selected = provider.key === config.provider;
                return (
                  <button
                    key={provider.key}
                    onClick={() => pickProvider(provider.key)}
                    className={cn(
                      "rounded-xl px-3 py-1.5 text-xs font-medium transition-colors duration-200",
                      selected
                        ? "bg-white text-black"
                        : "text-white/45 ring-1 ring-white/10 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    {provider.label}
                  </button>
                );
              })}
            </div>
            {active?.note && (
              <p className="mt-2 text-2xs text-white/25">{active.note}</p>
            )}
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-2xs text-white/35">Base URL</span>
              <input
                value={config.baseUrl}
                onChange={(event) => patch({ baseUrl: event.target.value })}
                placeholder="https://api.deepseek.com/v1"
                spellCheck={false}
                className={cn(input, "font-mono text-xs")}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-2xs text-white/35">模型名</span>
              <input
                value={config.model}
                onChange={(event) => patch({ model: event.target.value })}
                placeholder="deepseek-flash"
                spellCheck={false}
                className={cn(input, "font-mono text-xs")}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-center justify-between text-2xs text-white/35">
                API Key
                <span className="text-white/20">只存在本机浏览器</span>
              </span>
              <div className="relative">
                <input
                  value={config.apiKey}
                  onChange={(event) => patch({ apiKey: event.target.value })}
                  type={showKey ? "text" : "password"}
                  placeholder="sk-…"
                  spellCheck={false}
                  autoComplete="off"
                  className={cn(input, "pr-11 font-mono text-xs")}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((value) => !value)}
                  aria-label={showKey ? "隐藏密钥" : "显示密钥"}
                  className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md p-1 text-white/30 transition-colors hover:text-white"
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              onClick={test}
              disabled={!ready || result.kind === "running"}
              className={ghost}
            >
              {result.kind === "running" ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Zap size={13} />
              )}
              测试连接
            </button>
            <button onClick={save} disabled={!ready} className={primary}>
              保存配置
            </button>
            <button
              onClick={reset}
              className="ml-auto inline-flex items-center gap-1 text-2xs text-white/25 transition-colors hover:text-red-300"
            >
              <Trash2 size={11} />
              清除
            </button>
          </div>

          {result.kind === "ok" && (
            <div className="mt-3 space-y-1">
              <p className="flex items-center gap-1.5 text-2xs text-emerald-400">
                <Check size={12} />
                连接成功 · {result.latencyMs}ms · {result.model}
              </p>
              {renamedFrom ? (
                <p className="text-2xs text-white/25">
                  你填的是「{renamedFrom}」，上游实际返回「{result.model}」，已写回配置
                </p>
              ) : null}
            </div>
          )}
          {result.kind === "fail" && (
            <div className="mt-3 space-y-2">
              <div className="space-y-1">
                <p className="text-2xs text-red-300">✗ {result.error}</p>
                {result.reason && (
                  <p className="text-2xs leading-relaxed text-white/45">{result.reason}</p>
                )}
                {result.keyHint && (
                  <p className="rounded-lg bg-amber-400/10 px-2 py-1.5 text-2xs leading-relaxed text-amber-200/80">
                    {result.keyHint}
                  </p>
                )}
                {result.detail && (
                  <p className="break-all font-mono text-2xs text-white/20">{result.detail}</p>
                )}
              </div>

              {suggestions.length > 0 && (
                <div>
                  <p className="text-2xs text-white/30">
                    该端点可用的模型（点击填入）：
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {suggestions.map((id) => (
                      <button
                        key={id}
                        onClick={() => patch({ model: id })}
                        className="rounded-lg bg-white/[0.06] px-2 py-1 font-mono text-2xs text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 自动重算 */}
        <div className={cn(card, "mt-3 flex items-start gap-3 p-5")}>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">添加素材后自动重算关系</div>
            <p className="mt-1.5 text-2xs leading-relaxed text-white/30">
              每存入一条素材，自动跑一次云端分析，省掉手动点「云端重算」。
              会消耗额度（约 ¥0.01/次），连续添加多条会合并成一次。
            </p>
          </div>
          <button
            onClick={() => setAutoRecompute(!autoRecompute)}
            aria-pressed={autoRecompute}
            className={cn(
              "relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors",
              autoRecompute ? "bg-violet-500" : "bg-white/15",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
                autoRecompute ? "left-[22px]" : "left-0.5",
              )}
            />
          </button>
        </div>

        {/* 演示选项 */}
        <div className={cn(card, "mt-3 flex items-start gap-3 p-5")}>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">显示「恢复演示数据」入口</div>
            <p className="mt-1.5 text-2xs leading-relaxed text-white/30">
              默认隐藏，避免误触把库里内容清空。需要重置时打开它，
              侧边栏底部会出现「恢复演示数据」，用完再关掉即可。
            </p>
          </div>
          <button
            onClick={() => setShowReset(!showReset)}
            aria-pressed={showReset}
            aria-label="显示恢复演示数据入口"
            className={cn(
              "relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors",
              showReset ? "bg-violet-500" : "bg-white/15",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
                showReset ? "left-[22px]" : "left-0.5",
              )}
            />
          </button>
        </div>

        {/* 视觉模型 */}
        <div className={cn(card, "mt-3 p-5")}>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium">视觉模型（可选）</span>
            <span className="text-2xs text-white/25">用于图片入库</span>
          </div>
          <p className="mb-3 text-2xs leading-relaxed text-white/30">
            主模型如果本身支持图片，这里全部留空即可复用；
            只有主模型看不了图时（如纯文本模型），才需要单独指定一个视觉模型。
          </p>

          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {VISION_PRESETS.map((preset) => {
              const selected = config.visionModel === preset.model;
              return (
                <button
                  key={preset.key}
                  title={preset.baseUrl}
                  onClick={() =>
                    patch({
                      visionBaseUrl: preset.baseUrl,
                      visionModel: preset.model,
                    })
                  }
                  className={cn(
                    "rounded-xl px-3 py-1.5 text-xs font-medium transition-colors duration-200",
                    selected
                      ? "bg-white text-black"
                      : "text-white/45 ring-1 ring-white/10 hover:bg-white/5 hover:text-white",
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
            <button
              onClick={() => patch({ visionBaseUrl: "", visionModel: "", visionApiKey: "" })}
              className="rounded-xl px-3 py-1.5 text-xs text-white/30 transition-colors hover:text-white"
            >
              关闭
            </button>
          </div>

          <p className="mb-3 text-2xs text-white/25">
            预设的模型名可能随厂商更新变动，以「测试视觉模型」的结果为准。
          </p>

          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-2xs text-white/35">
                Base URL
                <span className="ml-2 text-white/20">
                  服务商文档里的接口地址，去掉 /chat/completions
                </span>
              </span>
              <input
                value={config.visionBaseUrl}
                onChange={(event) => patch({ visionBaseUrl: event.target.value })}
                placeholder="留空则复用主模型的 Base URL"
                spellCheck={false}
                className={cn(input, "font-mono text-xs")}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-2xs text-white/35">视觉模型名</span>
              <input
                value={config.visionModel}
                onChange={(event) => patch({ visionModel: event.target.value })}
                placeholder="留空则复用主模型（如 glm-4v-flash / qwen-vl-plus）"
                spellCheck={false}
                className={cn(input, "font-mono text-xs")}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-2xs text-white/35">视觉模型 Key（可选）</span>
              <input
                value={config.visionApiKey}
                onChange={(event) => patch({ visionApiKey: event.target.value })}
                type="password"
                placeholder="留空则复用上方的 Key"
                spellCheck={false}
                className={cn(input, "font-mono text-xs")}
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => void testVision()}
              disabled={visionTest.kind === "running" || !visionReady}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-white/55 ring-1 ring-white/10 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {visionTest.kind === "running" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Zap size={12} />
              )}
              {visionTest.kind === "running" ? "测试中…" : "测试视觉模型"}
            </button>

            {visionTest.kind === "ok" && (
              <span className="flex items-center gap-1.5 text-2xs text-emerald-400">
                <Check size={12} />
                支持图片 · {visionTest.latencyMs}ms · {visionTest.model}
                {visionTest.answer ? ` · 回答了「${visionTest.answer}」` : ""}
              </span>
            )}
            {visionTest.kind === "fail" && (
              <div className="min-w-0">
                <span className="break-all text-2xs text-red-300">
                  ✗ {visionTest.error}
                </span>
                {visionTest.endpoint && (
                  <span className="mt-1 block break-all font-mono text-2xs text-white/25">
                    实际请求：{visionTest.endpoint}
                  </span>
                )}
              </div>
            )}

            {visionTest.kind === "fail" &&
              visionTest.suggestions &&
              visionTest.suggestions.length > 0 && (
                <div className="w-full">
                  <p className="mt-1 text-2xs text-white/30">
                    这个账号可用的视觉模型（点击填入）：
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {visionTest.suggestions.map((id) => (
                      <button
                        key={id}
                        onClick={() => patch({ visionModel: id })}
                        className="rounded-lg bg-white/[0.06] px-2 py-1 font-mono text-2xs text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                </div>
              )}
          </div>

          <p className="mt-3 text-2xs text-white/25">
            {hasDedicatedVision(config)
              ? `图片入库将使用视觉模型「${resolveVision(config).model}」`
              : isConfigured(config)
                ? `图片入库将直接使用主模型「${resolveVision(config).model}」——它支持图片就能用`
                : "还没配置模型，图片入库暂不可用"}
          </p>
        </div>

        {/* 安全说明 */}
        <div className={cn(card, "mt-3 p-4")}>
          <div className="flex items-start gap-2.5">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-400" />
            <div className="text-2xs leading-relaxed text-white/40">
              <p className="text-white/60">密钥怎么存的？</p>
              <p className="mt-1">
                仅存入本机 localStorage，随请求发送到本项目的服务端转发，不经过任何第三方；
                换浏览器或清除浏览器数据即失效。公开部署时请改用服务端环境变量（
                <code className="rounded bg-white/[0.06] px-1">DEEPSEEK_API_KEY</code>
                ），不要把它写进前端。
              </p>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-2xs leading-relaxed text-white/20">
          未配置时，入库分析会使用本地规则（抽要点、找数字、查相似素材），同样能跑完整流程。
          <br />
          线上演示环境可能由服务端提供共享 Key（有每日额度）；这里填自己的 Key 不受限。
        </p>
      </div>
    </div>
    </SafeBoundary>
  );
}
