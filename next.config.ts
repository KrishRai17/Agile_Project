import os from "node:os";
import type { NextConfig } from "next";

const localIps = Object.values(os.networkInterfaces())
  .flatMap((ifaces) => ifaces ?? [])
  .filter((iface) => iface.family === "IPv4" && !iface.internal)
  .map((iface) => iface.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: Array.from(
    new Set([
      "10.47.139.183",
      "192.168.0.8",
      "192.168.0.13",
      "localhost",
      "127.0.0.1",
      ...localIps,
    ])
  ),
};

export default nextConfig;
