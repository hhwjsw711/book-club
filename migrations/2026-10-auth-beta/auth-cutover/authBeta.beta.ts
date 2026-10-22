import { setupConvexAuth } from "@convex-dev/auth/server";
import { setupUsernamePassword } from "@convex-dev/auth/methods/username-password/server";
import { components, internal } from "./_generated/api";
const core = setupConvexAuth({ component: components.core, accessTokenTtlSeconds: 3600 });
export const { refreshSession, signOut, isAuthenticated } = core;
// Use the stock beta sign-in: no lazy migration or legacy session fallback.
export const { signInWithUsernamePassword } = setupUsernamePassword(core, {
  component: components.authPasswordProvider, usernameComponent: components.authUsername,
}).attachUserCallbacks({ createUser: internal.users.createUserBeta });
