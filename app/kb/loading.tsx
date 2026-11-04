export default function KnowledgeLoading() {
  return (
    <div className="aurora-root relative flex h-dvh flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="aurora-glow pointer-events-none absolute inset-x-0 top-0 h-[460px]"
      />

      <header className="relative z-20 flex h-16 shrink-0 items-center gap-3 px-5">
        <span className="h-4 w-4 rounded-full bg-white/70" />
        <span className="h-4 w-24 rounded bg-white/10" />
        <div className="ml-auto flex gap-2">
          <span className="h-6 w-16 rounded-md bg-white/[0.07]" />
          <span className="h-8 w-24 rounded-xl bg-white/15" />
        </div>
      </header>

      <div className="relative z-10 mx-3 mb-3 flex min-h-0 flex-1 gap-0 overflow-hidden rounded-3xl border border-white/[0.07] bg-black/55">
        <div className="hidden w-56 shrink-0 flex-col gap-2 border-r border-white/[0.06] p-3 md:flex">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-9 animate-pulse rounded-xl bg-white/[0.05]"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>

        <div className="flex-1 space-y-2 p-6">
          <div className="mb-5 h-11 w-full animate-pulse rounded-xl bg-white/[0.06]" />
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl bg-white/[0.04]"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
