import os from "node:os";
import type { NextConfig } from "next";
import { buildCsp } from "./lib/csp";

const localIps = Object.values(os.networkInterfaces())
  .flatMap((ifaces) => ifaces ?? [])
  .filter((iface) => iface.family === "IPv4" && !iface.internal)
  .flatMap((iface) => [iface.address, `${iface.address}:3000`]);

const envDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .flatMap((origin) => [origin, `${origin}:3000`])
  .filter(Boolean);

const cspHeader = buildCsp({ isDev: process.env.NODE_ENV === "development" });

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  allowedDevOrigins: Array.from(
    new Set([
      "localhost",
      "localhost:3000",
      "127.0.0.1",
      "127.0.0.1:3000",
      ...envDevOrigins,
      ...localIps,
    ])
  ),
  async headers() {
    return [
      {
        // Pages receive a per-request nonce CSP from proxy.ts. API routes (not matched by the proxy)
        // get this static, nonce-less CSP. Never set both on the same response: browsers enforce
        // every CSP header, so a second static policy would block the nonce'd scripts.
        source: "/api/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: cspHeader,
          },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
