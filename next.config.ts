import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.FINANCE_BUILD_DIR || '.next',
  // 本地开发时允许 localhost / 127.0.0.1 混用，避免客户端脚本被拦截后页面无法水合。
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  // 隐藏左下角 Next.js 开发调试浮层（编译/运行错误仍会正常报告）。
  devIndicators: false,
};

export default nextConfig;
