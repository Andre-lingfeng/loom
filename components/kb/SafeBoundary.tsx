"use client";

import { Component, type ReactNode } from "react";

/**
 * 局部错误边界：设置页即使读到坏配置，也只降级成一块提示，
 * 不至于整页白屏或跳到全局错误页。
 */
export class SafeBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="mx-auto w-full max-w-2xl px-6 py-16">
          <div className="rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-6">
            <p className="text-sm font-medium text-red-200">这一页读到了损坏的配置</p>
            <p className="mt-2 text-xs leading-relaxed text-white/45">
              多半是浏览器里旧版本留下的数据格式不兼容。重置后重新填一次即可，不会影响知识库里的素材。
            </p>
            <button
              onClick={() => {
                this.props.onReset();
                this.setState({ failed: false });
              }}
              className="mt-4 rounded-xl bg-white px-4 py-2 text-xs font-medium text-black transition-colors hover:bg-white/90"
            >
              重置模型配置
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
