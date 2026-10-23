/**
 * Standalone before/after demo for import-graph impact (no path aliases).
 * Mirrors logic in impact + decision-engine modules.
 */

function extractImportSpecifiers(source) {
  const cleaned = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  const found = new Set();
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(cleaned)) !== null) found.add(m[1].trim());
  }
  return [...found];
}

function resolveImportBase(importerPath, specifier) {
  const dir = importerPath.includes("/")
    ? importerPath.slice(0, importerPath.lastIndexOf("/"))
    : "";
  let target;
  if (specifier.startsWith("@/")) target = `src/${specifier.slice(2)}`;
  else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const parts = (dir ? dir.split("/") : []).concat(specifier.split("/"));
    const stack = [];
    for (const part of parts) {
      if (!part || part === ".") continue;
      if (part === "..") stack.pop();
      else stack.push(part);
    }
    target = stack.join("/");
  } else return null;
  return target.replace(/\/+/g, "/");
}

function resolveToExisting(base, pathSet) {
  const b = base.replace(/\.(tsx?|jsx?)$/i, "");
  for (const c of [
    b,
    `${b}.ts`,
    `${b}.tsx`,
    `${b}.js`,
    `${b}/index.ts`,
    `${b}/index.tsx`,
  ]) {
    if (pathSet.has(c)) return c;
  }
  return null;
}

function buildReverse(files) {
  const pathSet = new Set(files.keys());
  const reverse = new Map();
  for (const [importer, source] of files) {
    for (const spec of extractImportSpecifiers(source)) {
      if (!(spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("@/")))
        continue;
      const base = resolveImportBase(importer, spec);
      if (!base) continue;
      const target = resolveToExisting(base, pathSet);
      if (!target || target === importer) continue;
      if (!reverse.has(target)) reverse.set(target, new Set());
      reverse.get(target).add(importer);
    }
  }
  return reverse;
}

function dependents(reverse, file, maxDepth = 3) {
  const direct = new Set(reverse.get(file) ?? []);
  const all = new Set(direct);
  let frontier = [...direct];
  for (let d = 1; d < maxDepth; d++) {
    const next = [];
    for (const node of frontier) {
      for (const dep of reverse.get(node) ?? []) {
        if (all.has(dep)) continue;
        all.add(dep);
        next.push(dep);
      }
    }
    frontier = next;
  }
  return {
    direct: [...direct].sort(),
    all: [...all].sort(),
  };
}

function escalateOneLevel(d) {
  if (d === "LOW") return "REVIEW_RECOMMENDED";
  if (d === "REVIEW_RECOMMENDED") return "REVIEW_REQUIRED";
  if (d === "REVIEW_REQUIRED") return "BLOCKED";
  return "BLOCKED";
}

function decide(risk, scope, impact) {
  // simplified matrix: LOW+HIGH_COMPLIANCE → LOW
  let base = "REVIEW_RECOMMENDED";
  if (risk === "LOW" && scope === "HIGH_COMPLIANCE") base = "LOW";
  if (risk === "HIGH" && scope === "LOW_COMPLIANCE") base = "BLOCKED";
  if (risk === "HIGH" && scope === "PARTIAL") base = "REVIEW_REQUIRED";
  let final = base;
  let rule = `risk-${risk}-scope-${scope}`;
  if (impact === "HIGH") {
    const esc = escalateOneLevel(final);
    if (esc !== final) {
      rule += "+high-impact-escalation";
      final = esc;
    }
  }
  return { final, rule, base };
}

const files = new Map([
  ["src/lib/auth/session.ts", "export function getSession() { return null }"],
  ["src/lib/auth/actions.ts", "import { getSession } from './session'"],
  ["src/middleware.ts", "import { getSession } from './lib/auth/session'"],
  ["src/app/api/users/route.ts", "import { getSession } from '@/lib/auth/session'"],
  ["src/app/api/orders/route.ts", "import { getSession } from '@/lib/auth/session'"],
  ["src/app/api/payments/route.ts", "import { getSession } from '../../../lib/auth/session'"],
  ["src/app/admin/page.tsx", "import { getSession } from '@/lib/auth/session'"],
  ["src/app/dashboard/page.tsx", "import { getSession } from '@/lib/auth/session'"],
  ["src/components/user-menu.tsx", "import { getSession } from '@/lib/auth/session'"],
  // 8th importer → HIGH band (≥8 direct)
  ["src/app/settings/page.tsx", "import { getSession } from '@/lib/auth/session'"],
]);

const reverse = buildReverse(files);
const deps = dependents(reverse, "src/lib/auth/session.ts");
const direct = deps.direct.length;
const impact =
  direct >= 8 || deps.all.length >= 15
    ? "HIGH"
    : direct >= 3 || deps.all.length >= 5
      ? "MEDIUM"
      : "LOW";

console.log("Changed: src/lib/auth/session.ts");
console.log("Direct dependents:", direct);
console.log(deps.direct.map((d) => "  - " + d).join("\n"));
console.log("Impact:", impact, "| confidence: 0.81");
console.log("Explanation: This file is imported by", direct, "other modules.");

const oldStub = decide("LOW", "HIGH_COMPLIANCE", "LOW"); // stub never produced HIGH from graph
const neuGraph = decide("LOW", "HIGH_COMPLIANCE", impact);

console.log("\nBEFORE (sensitivity stub, impact not independent):");
console.log("  impact=LOW (ignored graph) → decision", oldStub.final, `(${oldStub.rule})`);

console.log("\nAFTER (import graph):");
console.log("  impact=" + impact + " → decision", neuGraph.final, `(${neuGraph.rule})`);
console.log("  base risk×scope was", neuGraph.base, "then HIGH escalated one level");
