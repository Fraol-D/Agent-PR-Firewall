import type { FileCategory } from "@/lib/analysis/types";

const AUTH_PATH =
  /(^|\/)(auth|authentication|session|login|oauth|permission|middleware)(\/|$)/i;
const DB_PATH =
  /(^|\/)(migrations?|prisma|drizzle|supabase|schema|models?|database|sql)(\/|$)/i;
const INFRA_PATH =
  /(^|\/)(\.github|docker|infra|terraform|k8s|kubernetes|deploy|ci|cd)(\/|$)/i;
const CONFIG_PATH =
  /(^|\/)(\.env|\.env\.|config|settings)(\.|\/|$)/i;
const TEST_PATH =
  /(^|\/)(__tests__|tests?|spec|e2e|cypress|playwright)(\/|$)|(\.|_)(test|spec)\.[^.]+$/i;
const DOC_PATH =
  /(^|\/)(docs?|documentation)(\/|$)|(^|\/)readme(\.|$)|\.mdx?$/i;
const FRONTEND_PATH =
  /(^|\/)(components?|pages?|app|views?|ui|styles?|css|public|assets?)(\/|$)/i;
const FRONTEND_EXT = /\.(tsx|jsx|css|scss|sass|less|vue|svelte|html)$/i;
const BACKEND_PATH =
  /(^|\/)(api|server|services?|routes?|controllers?|handlers?|lib|src)(\/|$)/i;
const BACKEND_EXT = /\.(ts|js|mjs|cjs|py|go|rb|java|rs)$/i;
const DEP_FILES =
  /^(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|composer\.json|go\.sum|Cargo\.(toml|lock)|requirements.*\.txt|Pipfile(\.lock)?|poetry\.lock)$/i;

/**
 * Deterministic file classification from path/extension/name.
 */
export function classifyFilePath(filePath: string): FileCategory {
  const path = filePath.replace(/\\/g, "/");
  const base = path.split("/").pop() ?? path;

  if (DEP_FILES.test(base)) return "dependencies";
  if (TEST_PATH.test(path)) return "tests";
  if (DOC_PATH.test(path) || DOC_PATH.test(base)) return "documentation";
  if (
    CONFIG_PATH.test(path) ||
    /^\.env/i.test(base) ||
    base.endsWith(".config.ts") ||
    base.endsWith(".config.js") ||
    base === "tsconfig.json" ||
    base === "next.config.ts" ||
    base === "next.config.js"
  ) {
    return "configuration";
  }
  if (
    INFRA_PATH.test(path) ||
    /^(Dockerfile|docker-compose.*|Makefile|Procfile)$/i.test(base) ||
    base.endsWith(".yml") ||
    base.endsWith(".yaml")
  ) {
    // workflow yml often infrastructure
    if (path.includes(".github/workflows") || !DOC_PATH.test(path)) {
      return "infrastructure";
    }
  }
  if (AUTH_PATH.test(path)) return "authentication";
  if (DB_PATH.test(path) || /\.sql$/i.test(base)) return "database";
  if (FRONTEND_EXT.test(base) || FRONTEND_PATH.test(path)) {
    // API routes under app/api are backend even with tsx sometimes
    if (/(^|\/)(api|route\.ts|route\.js)(\/|$)/i.test(path)) {
      return "backend";
    }
    return "frontend";
  }
  if (BACKEND_EXT.test(base) || BACKEND_PATH.test(path)) return "backend";

  return "unknown";
}

export function isSensitiveCategory(category: FileCategory): boolean {
  return (
    category === "authentication" ||
    category === "database" ||
    category === "configuration" ||
    category === "infrastructure" ||
    category === "dependencies"
  );
}

export function sensitiveAreaLabel(category: FileCategory): string | null {
  switch (category) {
    case "authentication":
      return "Authentication";
    case "database":
      return "Database";
    case "configuration":
      return "Configuration";
    case "infrastructure":
      return "Infrastructure";
    case "dependencies":
      return "Dependencies";
    default:
      return null;
  }
}
