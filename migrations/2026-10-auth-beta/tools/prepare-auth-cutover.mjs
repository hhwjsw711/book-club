import { cp, mkdir, readFile, writeFile, symlink, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const stage = process.argv[2];
if (stage !== "alpha" && stage !== "beta") throw new Error("Usage: node migrations/2026-10-auth-beta/tools/prepare-auth-cutover.mjs alpha|beta");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const dest = resolve(root, ".context/auth-cutover");
await mkdir(resolve(dest, "convex/lib"), { recursive: true });
await mkdir(resolve(dest, "src"), { recursive: true });
try { await symlink(resolve(root, "node_modules"), resolve(dest, "node_modules"), "dir"); }
catch (error) { if (error.code !== "EEXIST") throw error; }
for (const file of ["schema.ts", "auth.config.ts", "tsconfig.json", "lib/authContracts.ts"]) {
  await cp(resolve(root, "convex", file), resolve(dest, "convex", file));
}
for (const [source, target] of [
  [`config.${stage}.ts`, "convex/convex.config.ts"],
  [`auth.${stage}.ts`, "convex/auth.ts"],
  ["users.ts", "convex/users.ts"],
  ["main.tsx", "src/main.tsx"],
]) await cp(resolve(root, "migrations/2026-10-auth-beta/auth-cutover", source), resolve(dest, target));
if (stage === "beta") await cp(resolve(root, "auth-cutover/authBeta.beta.ts"), resolve(dest, "convex/authBeta.ts"));
else await rm(resolve(dest, "convex/authBeta.ts"), { force: true });
for (const file of ["tsconfig.json", "vite.config.ts", "index.html"]) await cp(resolve(root, "migrations/2026-10-auth-beta/auth-lab", file), resolve(dest, file));
await cp(resolve(root, "migrations/2026-10-auth-beta/auth-lab/src/style.css"), resolve(dest, "src/style.css"));
const project = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
await writeFile(resolve(dest, "package.json"), JSON.stringify({ name: "book-club-auth-cutover", private: true, type: "module", scripts: { build: "tsc --noEmit && vite build" }, dependencies: project.dependencies, devDependencies: project.devDependencies }, null, 2) + "\n");
console.log(`Prepared ${stage} at ${dest}; no deployment selected or changed.`);
