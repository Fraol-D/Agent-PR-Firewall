import fs from "fs";
import path from "path";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

// Load .env.local
const envPath = path.join(process.cwd(), ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
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

const appId = process.env.GITHUB_APP_ID;
const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
const privateKey = keyPath
  ? fs.readFileSync(path.join(process.cwd(), keyPath), "utf8")
  : process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!appId || !privateKey) {
  console.error("Missing app id or private key");
  process.exit(1);
}

const octokit = new Octokit({
  authStrategy: createAppAuth,
  auth: { appId, privateKey },
});

const installs = await octokit.paginate(
  octokit.rest.apps.listInstallations,
  { per_page: 100 },
);

console.log(`Found ${installs.length} installation(s):`);
for (const inst of installs) {
  console.log({
    id: inst.id,
    account: inst.account?.login,
    type: inst.account?.type,
    suspended: Boolean(inst.suspended_at),
    repository_selection: inst.repository_selection,
  });

  const installationOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey, installationId: inst.id },
  });

  const { data } =
    await installationOctokit.rest.apps.listReposAccessibleToInstallation({
      per_page: 100,
    });
  console.log(
    "  repos:",
    data.repositories.map((r) => r.full_name).join(", ") || "(none)",
  );
}
