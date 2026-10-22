import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";

// Convex functions run in an in-memory backend; mobile utility tests are pure
// TypeScript and can share its edge runtime without native Expo dependencies.
export default defineConfig({
  // Match Convex's WASM loader so auth tests exercise the real Argon2 hashes.
  plugins: [
    {
      name: "auth-wasm",
      enforce: "pre",
      load(id) {
        if (!id.endsWith(".wasm")) return null;
        const encoded = JSON.stringify(readFileSync(id).toString("base64"));
        return `export default new WebAssembly.Module(Uint8Array.from(atob(${encoded}), c => c.charCodeAt(0)));`;
      },
    },
  ],
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts", "mobile/src/**/*.test.ts"],
    server: { deps: { inline: ["convex-test", "argon2id-wasm"] } },
  },
});
