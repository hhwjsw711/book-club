import { defineApp } from "convex/server";
import { v } from "convex/values";
import legacy from "@convex-dev/auth-legacy/core/convex.config.js";
import core from "@convex-dev/auth/convex.config.js";
import password from "@convex-dev/auth/components/password/convex.config.js";
import username from "@convex-dev/auth/components/username/convex.config.js";
import passkey from "@convex-dev/auth/components/passkey/convex.config.js";
import staticHosting from "@convex-dev/static-hosting/convex.config.js";

// This app has no club schema, crons, push component or production credentials.
const app = defineApp({
  httpPrefix: "/api",
  env: { AUTH_PRIVATE_KEY: v.string(), AUTH_JWKS: v.string() },
});
const env = {
  AUTH_PRIVATE_KEY: app.env.AUTH_PRIVATE_KEY,
  AUTH_JWKS: app.env.AUTH_JWKS,
};
app.use(staticHosting, { httpPrefix: "/" });
app.use(legacy, { name: "core", httpPrefix: "/auth", env });
app.use(core, { httpPrefix: "/auth-beta", env });
app.use(password, { name: "authPasswordProvider" });
app.use(username, { name: "authUsername" });
app.use(passkey, { name: "authPasskey" });
// Separate test identities: beta.0 cannot yet enroll a first passkey on a
// password-only account through its stock management flow.
app.use(username, { name: "passkeyUsernames" });
export default app;
