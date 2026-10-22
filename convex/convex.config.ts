import { defineApp } from "convex/server";
import { v } from "convex/values";
import core from "@convex-dev/auth/convex.config.js";
import passwordProvider from "@convex-dev/auth/components/password/convex.config.js";
import username from "@convex-dev/auth/components/username/convex.config.js";
import pushNotifications from "@convex-dev/expo-push-notifications/convex.config.js";
import staticHosting from "@convex-dev/static-hosting/convex.config.js";

// The static hosting component owns "/" so the SPA is served at the root.
// Any app-owned convex/http.ts routes live under "/api"; the auth component
// keeps its explicit "/auth" prefix (longest-prefix match wins).
const app = defineApp({
  httpPrefix: "/api",
  env: {
    AUTH_PRIVATE_KEY: v.string(),
    AUTH_JWKS: v.string(),
  },
});

app.use(staticHosting, { httpPrefix: "/" });

// Beta uses its default component name, `auth`, at the existing JWKS URL.
app.use(core, {
  httpPrefix: "/auth",
  env: {
    AUTH_PRIVATE_KEY: app.env.AUTH_PRIVATE_KEY,
    AUTH_JWKS: app.env.AUTH_JWKS,
  },
});
// These schemas are unchanged; explicit names preserve credentials and usernames.
app.use(passwordProvider, { name: "authPasswordProvider" });
// Usernames live in their own component rather than in the core `accounts`
// table, so a username identifies a *user* and not one provider's account.
app.use(username);

// Expo push notifications for the mobile app (see convex/notifications.ts).
app.use(pushNotifications);

export default app;
