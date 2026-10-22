import { cp, mkdir, readFile, writeFile, symlink } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const target = resolve(root, ".context/auth-lab");
await mkdir(target, { recursive: true });
await cp(resolve(root, "migrations/2026-10-auth-beta/auth-lab"), target, { recursive: true });
try {
  await symlink(
    resolve(root, "node_modules"),
    resolve(target, "node_modules"),
    "dir",
  );
} catch (error) {
  if (error.code !== "EEXIST") throw error;
}
const project = JSON.parse(
  await readFile(resolve(root, "package.json"), "utf8"),
);
await writeFile(
  resolve(target, "package.json"),
  JSON.stringify(
    {
      name: "book-club-auth-lab",
      private: true,
      type: "module",
      scripts: { build: "tsc --noEmit && vite build" },
      dependencies: project.dependencies,
      devDependencies: project.devDependencies,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Prepared ${target}. No deployment was selected or changed.`);
