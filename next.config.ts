import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Silence multi-lockfile workspace root inference on this machine
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
};

export default nextConfig;
