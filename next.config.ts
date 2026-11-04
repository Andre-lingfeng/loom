import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 演示录屏时不要右下角的开发指示器
  devIndicators: false,
  // 父目录存在别的 lockfile，显式指定追踪根，避免 Next 误判工作区
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
