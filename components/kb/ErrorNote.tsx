"use client";

import { useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * 统一的错误提示：一句话说清 + 一键复制诊断信息。
 * 复制内容是「能直接发给别人定位问题」的上下文，不是给人看的文案。
 */
export function ErrorNote({
  message,
  hint,
  route,
  status,
  className,
}: {
  message: string;
  /** 用户能立刻做的事 */
  hint?: string;
  /** 例如 "POST /api/relations" */
  route?: string;
  status?: number;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const lines = [
      `时间    ${new Date().toLocaleString("zh-CN")}`,
      `页面    ${typeof window === "undefined" ? "-" : window.location.pathname}`,
      route ? `接口    ${route}` : null,
      status ? `状态    ${status}` : null,
      `错误    ${message}`,
      `浏览器  ${typeof navigator === "undefined" ? "-" : navigator.userAgent}`,
    ].filter(Boolean);

    const text = lines.join("\n");

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 老浏览器 / 非 https 时的兜底
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("rounded-xl border border-red-400/20 bg-red-400/[0.06] p-2.5", className)}>
      <div className="flex items-start gap-2">
        <TriangleAlert size={12} className="mt-0.5 shrink-0 text-red-300/80" />
        <div className="min-w-0 flex-1">
          <p className="text-2xs leading-relaxed break-words text-red-200/90">{message}</p>
          {hint && <p className="mt-0.5 text-2xs leading-relaxed text-white/40">{hint}</p>}
        </div>
        <button
          onClick={() => void copy()}
          className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs text-white/35 transition-colors hover:bg-white/5 hover:text-white/70"
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
    </div>
  );
}
