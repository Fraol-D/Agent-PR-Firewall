import fs from "fs";
import path from "path";

const envPath = path.join(process.cwd(), ".env.local");
const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
for (const line of lines) {
  if (!line || line.trim().startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i < 0) continue;
  const k = line.slice(0, i).trim();
  let v = line.slice(i + 1);
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  process.env[k] = v;
}

const p = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
if (!p) {
  console.log({ ok: false, reason: "GITHUB_APP_PRIVATE_KEY_PATH missing" });
  process.exit(1);
}
const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
const exists = fs.existsSync(abs);
if (!exists) {
  console.log({ ok: false, reason: "file not found", path: abs });
  process.exit(1);
}
const t = fs.readFileSync(abs, "utf8");
const ok =
  t.includes("BEGIN") &&
  t.includes("PRIVATE KEY") &&
  t.includes("END") &&
  t.length > 500;
console.log({
  ok,
  path: p,
  abs,
  len: t.length,
  hasBegin: t.includes("BEGIN"),
  hasEnd: t.includes("END"),
});
process.exit(ok ? 0 : 1);
