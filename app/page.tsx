import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import { DemoModal } from "@/components/landing/DemoModal";
import { NebulaMount } from "@/components/landing/NebulaMount";

export const metadata: Metadata = {
  title: "织识 Loom · 把碎片织成结构",
  description: "带引用的检索、关系图谱与缺口检测——把散落的材料连成一张可追问的网。",
};

const BRAND = "织识 Loom";

const NAV_ITEMS = ["知识库", "关联图谱", "智能检索", "缺口检测", "关于我们"];

const STATS = [
  { value: "8", unit: "篇", label: "真实公开材料" },
  { value: "4", unit: "类", label: "关系判定" },
  { value: "1", unit: "张", label: "可拖拽知识图谱" },
];

export default function HomePage() {
  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-black text-white">
      {/* 整页通栏的星空背景：左侧用渐变压暗，保证文案可读 */}
      <div className="absolute inset-0" aria-hidden="true">
        <NebulaMount />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black to-transparent" />
      </div>

      {/* 顶部一层极淡的紫蓝辉光，压住纯黑的死板 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-70"
        style={{
          background:
            "radial-gradient(60% 100% at 70% 0%, rgba(90,110,255,0.14), transparent 70%)",
        }}
      />

      {/* ---------- 顶部导航 ---------- */}
      <header className="relative z-30 mx-auto flex h-20 w-full max-w-[1440px] items-center gap-4 px-6">
        <div className="flex items-center gap-2.5 rounded-2xl bg-white/[0.05] px-3 py-2 ring-1 ring-white/[0.07]">
          <span
            aria-hidden="true"
            className="h-6 w-6 rounded-full bg-gradient-to-br from-sky-300 via-blue-500 to-white ring-1 ring-white/50"
          />
          <span className="text-base font-semibold tracking-tight">{BRAND}</span>
        </div>

        <nav className="mx-auto hidden items-center gap-1 rounded-full bg-white/[0.04] px-2 py-1.5 ring-1 ring-white/[0.06] lg:flex">
          {NAV_ITEMS.map((item) => (
            <button
              key={item}
              className="rounded-full px-4 py-1.5 text-sm text-white/55 transition-colors duration-200 hover:bg-white/[0.07] hover:text-white"
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button className="flex items-center gap-2 rounded-full bg-white/[0.05] py-1.5 pr-4 pl-1.5 ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.09]">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-cyan-300/85 text-2xs font-semibold text-slate-900">
              AI
            </span>
            <span className="text-sm text-white/75">我的空间</span>
          </button>
        </div>
      </header>

      {/* ---------- 主体：左文案 + 右视觉 ---------- */}
      <div className="relative z-10 mx-auto grid w-full max-w-[1440px] grid-cols-1 items-stretch gap-6 px-6 pb-16 lg:grid-cols-[minmax(0,540px)_minmax(0,1fr)] lg:gap-0 lg:pb-0">
        <section className="flex flex-col justify-center gap-9 lg:min-h-[calc(100dvh-5rem)] lg:pr-6 lg:pb-20">
          <div className="flex items-center gap-2 text-xs text-white/45">
            <Sparkles size={13} className="text-sky-300" aria-hidden="true" />
            <span>连接碎片与洞见的 AI 知识平台</span>
            <ArrowRight size={12} aria-hidden="true" />
          </div>

          <h1 className="text-5xl leading-[1.14] font-semibold tracking-tight sm:text-6xl sm:leading-[1.1]">
            让每一条碎片，
            <br />
            织成知识的网。
          </h1>

          <p className="max-w-[420px] text-sm leading-relaxed text-white/40">
            从收集、检索到关联与输出——织识 Loom 把散落的材料连成一张可追溯、可追问的网。
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/kb"
              className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition-all duration-200 hover:bg-white/90 active:scale-[0.98]"
            >
              进入知识库
              <ArrowRight
                size={15}
                className="transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>

            <DemoModal />
          </div>

          <div className="mt-4 flex items-end gap-10 border-t border-white/[0.07] pt-7">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl leading-none font-semibold tracking-tight">
                    {stat.value}
                  </span>
                  <span className="text-xs text-white/40">{stat.unit}</span>
                </div>
                <div className="mt-2 text-2xs text-white/35">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 右侧留白，视觉由整页背景承担 */}
        <div className="hidden lg:block lg:min-h-[calc(100dvh-5rem)]" aria-hidden="true" />
      </div>
    </main>
  );
}
