"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Play, X } from "lucide-react";

const STEPS = [
  {
    title: "1 · 收藏时先问一句「为什么」",
    body:
      "添加素材必须说明用在哪。写不出来就进收件箱，橙色角标一直提醒你——收藏是最便宜的自我安慰。",
    image: "/demo/library.png",
    alt: "知识库列表",
  },
  {
    title: "2 · 写作前先做一次体检",
    body:
      "写下一句目标，它告诉你哪几个方向没有证据、哪个方向只有一条来源。覆盖率不是打分，是缺口清单。",
    image: "/demo/gaps.png",
    alt: "缺口检测",
  },
  {
    title: "3 · 看看材料之间在说什么",
    body:
      "3D 关系图谱由云端模型判定：支持、矛盾、重复、相关。点一条关系，只亮出那一对。",
    image: "/demo/graph.png",
    alt: "关联图谱",
  },
  {
    title: "4 · 矛盾必须处理，不能略过",
    body:
      "模型标出互相矛盾的两条材料，你必须选择采纳哪一方、或登记为「并存」。不处理，简报就是锁死的。",
    image: "/demo/conflicts.png",
    alt: "冲突处理",
  },
];

export function DemoModal() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const go = (delta: number) =>
    setIndex((current) => (current + delta + STEPS.length) % STEPS.length);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const step = STEPS[index];

  return (
    <>
      <button
        onClick={() => {
          setIndex(0);
          setOpen(true);
        }}
        className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-6 py-3 text-sm font-medium text-white ring-1 ring-white/[0.08] transition-colors duration-200 hover:bg-white/[0.1]"
      >
        <Play size={13} className="fill-white text-white" aria-hidden="true" />
        查看产品演示
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm sm:p-6"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="产品演示"
        >
          <div
            className="relative flex h-[92vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-neutral-950"
            onClick={(event) => event.stopPropagation()}
          >
            {/* 顶栏 */}
            <div className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] px-5 py-3">
              <span className="text-sm font-medium text-white">产品演示</span>
              <span className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-2xs text-white/45">
                {index + 1} / {STEPS.length}
              </span>
              <button
                onClick={() => setOpen(false)}
                className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1.5 text-2xs text-white/45 transition-colors hover:bg-white/5 hover:text-white"
                aria-label="关闭"
              >
                <X size={15} />
                关闭
              </button>
            </div>

            {/* 图片区：尽量占满，两侧翻页按钮常驻 */}
            <div className="relative min-h-0 flex-1 bg-black">
              <Image
                src={step.image}
                alt={step.alt}
                fill
                sizes="(max-width: 1180px) 100vw, 1180px"
                className="object-contain"
                priority
              />

              <button
                onClick={() => go(-1)}
                className="absolute top-1/2 left-3 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/25 backdrop-blur transition-all hover:bg-white hover:text-black"
                aria-label="上一步"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                onClick={() => go(1)}
                className="absolute top-1/2 right-3 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/25 backdrop-blur transition-all hover:bg-white hover:text-black"
                aria-label="下一步"
              >
                <ChevronRight size={22} />
              </button>
            </div>

            {/* 说明区 */}
            <div className="shrink-0 border-t border-white/[0.07] px-5 py-4 sm:px-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-white">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/50">
                    {step.body}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {STEPS.map((item, i) => (
                    <button
                      key={item.title}
                      onClick={() => setIndex(i)}
                      className={
                        i === index
                          ? "h-2 w-6 rounded-full bg-white transition-all"
                          : "h-2 w-2 rounded-full bg-white/25 transition-all hover:bg-white/50"
                      }
                      aria-label={`第 ${i + 1} 步`}
                    />
                  ))}

                  <button
                    onClick={() => go(1)}
                    className="ml-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-xs text-white/75 transition-colors hover:border-white/35 hover:text-white"
                  >
                    下一步
                    <ChevronRight size={13} />
                  </button>

                  <Link
                    href="/kb"
                    className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-medium text-black transition-colors hover:bg-white/90"
                  >
                    进入知识库
                    <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
