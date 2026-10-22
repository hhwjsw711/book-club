import { defineApp } from "convex/server";
import { v } from "convex/values";
import core from "@convex-dev/auth-legacy/core/convex.config.js";
import password from "@convex-dev/auth-legacy/providers/password/convex.config.js";
import username from "@convex-dev/auth-legacy/username/convex.config.js";
import staticHosting from "@convex-dev/static-hosting/convex.config.js";

const app = defineApp({ httpPrefix: "/api", env: { AUTH_PRIVATE_KEY: v.string(), AUTH_JWKS: v.string() } });
app.use(core, { name: "core", httpPrefix: "/auth", env: { AUTH_PRIVATE_KEY: app.env.AUTH_PRIVATE_KEY, AUTH_JWKS: app.env.AUTH_JWKS } });
app.use(password, { name: "authPasswordProvider" });
app.use(username, { name: "authUsername" });
app.use(staticHosting, { httpPrefix: "/" });
export default app;
