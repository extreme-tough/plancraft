import type { NextConfig } from "next";
import { STATIC_SECURITY_HEADERS } from "./src/server/security/csp";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: [...STATIC_SECURITY_HEADERS] }];
  },
};

export default nextConfig;
