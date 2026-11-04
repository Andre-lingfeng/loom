"use client";

import dynamic from "next/dynamic";

/**
 * 客户端挂载点：页面是 Server Component，`ssr: false` 只能出现在客户端组件里。
 * three.js（约 150KB）由此按需加载，不进入首屏。
 */
export const NebulaMount = dynamic(
  () => import("./NebulaCanvas").then((m) => m.NebulaCanvas),
  {
    ssr: false,
    loading: () => <div className="absolute inset-0 bg-black" />,
  },
);
