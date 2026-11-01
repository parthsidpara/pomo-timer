import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["firebase-admin"],
  outputFileTracingIncludes: {
    "/api/mcp": ["./mcp-apps/dist/**/*.html"],
  },
};

export default nextConfig;
