// Build the intermediate deployment locally. Does not select, import or deploy.
// Original alpha endpoints remain active while the empty beta component is added.
import { cp, mkdir, readFile, writeFile, symlink, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const migration = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(migration, "../..");
const dest = resolve(root, ".context/live-auth-cutover/stage");
await mkdir(dest, { recursive: true });
await cp(resolve(root, "convex"), resolve(dest, "convex"), {
  recursive: true, filter: (source) => !source.endsWith(".test.ts"),
});
await cp(resolve(migration, "auth-cutover/auth.alpha.ts"), resolve(dest, "convex/auth.ts"));
await rm(resolve(dest, "convex/authBeta.ts"), { force: true });
let config = await readFile(resolve(root, "convex/convex.config.ts"), "utf8");
config = 'import legacyCore from "@convex-dev/auth-legacy/core/convex.config.js";\n' + config;
config = config.replace('app.use(core, {\n  httpPrefix: "/auth",', `app.use(legacyCore, {
  name: "core", httpPrefix: "/auth",
  env: { AUTH_PRIVATE_KEY: app.env.AUTH_PRIVATE_KEY, AUTH_JWKS: app.env.AUTH_JWKS },
});
app.use(core, {
  httpPrefix: "/auth-beta",`);
if (!config.includes('app.use(legacyCore,')) throw new Error("Config changed: review staging generator");
await writeFile(resolve(dest, "convex/convex.config.ts"), config);
await cp(resolve(root, "package.json"), resolve(dest, "package.json"));
try { await symlink(resolve(root, "node_modules"), resolve(dest, "node_modules"), "dir"); }
catch (error) { if (error.code !== "EEXIST") throw error; }
console.log(`Prepared ${dest}. Configure its .env.local explicitly before deploying.`);
