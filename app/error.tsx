"use client";

import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-black px-6 text-white">
      <div className="w-full max-w-md text-center">
        <div className="text-5xl font-semibold tracking-tight">出错了</div>
        <p className="mt-3 text-sm leading-relaxed text-white/45">
          页面渲染时发生异常。你的本地数据没有丢失，重试通常就能恢复。
        </p>

        {error.message && (
          <p className="mt-4 rounded-xl bg-white/[0.04] px-3 py-2 font-mono text-2xs leading-relaxed break-all text-white/35">
            {error.message}
          </p>
        )}

        <div className="mt-7 flex justify-center gap-2">
          <button
            onClick={reset}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-white/90"
          >
            重试
          </button>
          <Link
            href="/"
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/70 transition-colors hover:border-white/30 hover:text-white"
          >
            返回入口
          </Link>
        </div>
      </div>
    </main>
  );
}
