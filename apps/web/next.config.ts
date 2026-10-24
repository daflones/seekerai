import type { NextConfig } from "next";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(path.join(process.cwd(), "../.."), process.env.NODE_ENV === "development", console, true);

const config: NextConfig = {
  distDir: process.env.NODE_ENV === "development"
    ? process.env.SEEKERAI_DEV_DIST_DIR === ".next-auth-test" ? ".next-auth-test" : ".next-dev"
    : ".next",
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  poweredByHeader: false,
  logging: { incomingRequests: { ignore: [/\/auth\/(?:confirm|callback)/] } },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ...(process.env.NODE_ENV === "production"
          ? [{ key: "Strict-Transport-Security", value: "max-age=15552000" }]
          : []),
      ],
    }, {
      source: "/auth/:path*",
      headers: [
        { key: "Cache-Control", value: "no-store" },
        { key: "Referrer-Policy", value: "no-referrer" },
      ],
    }, {
      source: "/api/auth/:path*",
      headers: [{ key: "Cache-Control", value: "no-store" }],
    }];
  },
};

export default config;
