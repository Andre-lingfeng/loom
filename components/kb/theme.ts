/**
 * Aurora 视觉令牌（Tailwind class 版）
 * 语言：纯黑底 + 白色透明度层次 + 紫色强调 + 大圆角。
 * 所有页面只从这里取视觉 class，避免样式散落。
 */

/** 卡片：深色面 + 极细白边 */
export const card =
  "kb-card rounded-2xl bg-[var(--kb-surface)] ring-1 ring-white/[0.06]";

/** 可交互卡片 */
export const cardHover =
  "kb-card-hover hover:bg-[var(--kb-surface-2)] hover:ring-white/15";

/** 输入框 */
export const input =
  "w-full rounded-xl bg-[var(--kb-input)] px-4 text-sm text-white outline-none transition-shadow duration-200 placeholder:text-white/25 focus:ring-2 focus:ring-white/20";

/** 主按钮：白底黑字（Aurora 的 CTA） */
export const primary =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-sm font-medium text-black transition-all duration-200 hover:bg-white/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-black/50";

/** 次按钮 */
export const ghost =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 px-3.5 py-2 text-sm font-medium text-white/60 transition-colors duration-200 hover:border-white/25 hover:text-white";

/** 标签碎片 */
export const chip = "rounded-md bg-white/[0.06] px-1.5 py-0.5 text-2xs text-white/45";

/** 弱化文字 */
export const muted = "text-white/45";

/** 极弱文字 */
export const faint = "text-white/30";

/** 表面次级色：侧栏、右栏 */
export const panel = "bg-[var(--kb-panel)]";
