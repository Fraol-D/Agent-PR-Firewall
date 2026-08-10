/**
 * Static import/require parsing for TS/JS/TSX/JSX.
 * Relative imports (+ simple @/ → src/) only — no full tsconfig paths.
 */

/** Match ESM import/export-from and CommonJS require / dynamic import. */
const IMPORT_PATTERNS: RegExp[] = [
  /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /\bexport\s+(?:type\s+)?[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

const CODE_EXT = /\.(tsx?|jsx?|mjs|cjs)$/i;
const SKIP_DIRS =
  /(^|\/)(node_modules|\.next|dist|build|coverage|\.git|out|\.turbo)(\/|$)/i;

export function isSourceCodePath(path: string): boolean {
  const p = path.replace(/\\/g, "/");
  if (SKIP_DIRS.test(p)) return false;
  return CODE_EXT.test(p);
}

/**
 * Extract raw module specifiers from source text.
 */
export function extractImportSpecifiers(source: string): string[] {
  // Strip block comments to reduce false positives
  const cleaned = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  const found = new Set<string>();
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(cleaned)) !== null) {
      const spec = m[1]?.trim();
      if (spec) found.add(spec);
    }
  }
  return Array.from(found);
}

/**
 * Whether a specifier is a relative or simple path-alias import we resolve.
 */
export function isResolvableSpecifier(spec: string): boolean {
  if (spec.startsWith("./") || spec.startsWith("../")) return true;
  if (spec.startsWith("@/")) return true;
  // package imports — skip
  return false;
}

/**
 * Resolve a relative/@/ import to a repo-relative path key (no extension yet).
 */
export function resolveImportBase(
  importerPath: string,
  specifier: string,
): string | null {
  const importer = importerPath.replace(/\\/g, "/");
  const dir = importer.includes("/")
    ? importer.slice(0, importer.lastIndexOf("/"))
    : "";

  let target: string;
  if (specifier.startsWith("@/")) {
    target = `src/${specifier.slice(2)}`;
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    target = joinPath(dir, specifier);
  } else {
    return null;
  }

  return normalizePath(target);
}

function joinPath(dir: string, rel: string): string {
  const parts = (dir ? dir.split("/") : []).concat(rel.split("/"));
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join("/");
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

/**
 * Map a resolved base path to an existing file key in the path set.
 * Tries extensions and /index variants.
 */
export function resolveToExistingFile(
  basePath: string,
  pathSet: Set<string>,
): string | null {
  const base = normalizePath(basePath).replace(/\.(tsx?|jsx?|mjs|cjs)$/i, "");
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`,
  ];

  // Also try if pathSet stores without stripping
  for (const c of candidates) {
    if (pathSet.has(c)) return c;
  }
  // Case-insensitive fallback for Windows-style repos
  const lowerMap = new Map(
    [...pathSet].map((p) => [p.toLowerCase(), p] as const),
  );
  for (const c of candidates) {
    const hit = lowerMap.get(c.toLowerCase());
    if (hit) return hit;
  }
  return null;
}
