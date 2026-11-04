import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-black px-6 text-white">
      <div className="w-full max-w-md text-center">
        <div className="text-6xl font-semibold tracking-tight">404</div>
        <p className="mt-4 text-sm leading-relaxed text-white/45">
          这个地址不存在，可能已经删除或改名。
        </p>

        <Link
          href="/"
          className="mt-7 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-white/90"
        >
          返回入口
        </Link>

        <p className="mt-6 font-mono text-2xs text-white/20">/ · /kb · /kb/settings</p>
      </div>
    </main>
  );
}
