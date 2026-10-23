import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

/**
 * Pin Turbopack to THIS app directory.
 * A sibling Next.js project + package-lock.json live at C:\Users\fraol,
 * which makes Next infer the workspace root as the home folder. Using
 * process.cwd() is unsafe (cwd can be that inferred root). Nested App
 * Router pages then 404 even though the files exist.
 */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingRoot: projectRoot,
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
