/**
 * Minimal resolver hook for running production TypeScript modules under
 * Node's native type stripping (Node >= 22.18 / 24) without a bundler.
 *
 * - Maps the tsconfig alias `@/*` → `./src/*`.
 * - Resolves extensionless relative/alias specifiers to .ts/.tsx/.js files
 *   or `index.*` files, mirroring `moduleResolution: "bundler"`.
 *
 * Usage:
 *   node --no-warnings --import ./scripts/ts-test-loader.mjs --test <files>
 */

import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "src");
const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs"];

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function resolveFile(base) {
  if (isFile(base)) return base;
  for (const ext of EXTENSIONS) {
    if (isFile(base + ext)) return base + ext;
  }
  if (existsSync(base)) {
    for (const ext of EXTENSIONS) {
      const candidate = path.join(base, `index${ext}`);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let base = null;
    if (specifier.startsWith("@/")) {
      base = path.join(srcDir, specifier.slice(2));
    } else if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file:")
    ) {
      base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    }
    if (base) {
      const file = resolveFile(base);
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
