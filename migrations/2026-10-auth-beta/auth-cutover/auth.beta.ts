import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { components } from "./_generated/api";
import { credentials, legacySignInResult, tokenBundle } from "./lib/authContracts";
import { setupConvexAuth } from "@convex-dev/auth/server";
const core = setupConvexAuth({ component: components.core, accessTokenTtlSeconds: 3600 });
const options = () => ({ issuer: process.env.CONVEX_SITE_URL!, accessTokenTtlSeconds: 3600 });
export const { signOut, isAuthenticated } = core;
// Only protocol wrappers for older clients; the only session store is beta.
export const signInWithPassword = mutation({
  args: credentials, returns: legacySignInResult,
  handler: async (ctx, args) => {
    const userId = await ctx.runQuery(components.authUsername.public.getUserIdByUsername, { username: args.username });
    if (userId === null) return { success: false as const, userError: { error: "USER_NOT_FOUND" as const } };
    const checked = await ctx.runMutation(components.authPasswordProvider.public.verifyPassword, { userId, password: args.password });
    if (!checked.success) return checked;
    return { success: true as const, tokens: await ctx.runMutation(components.core.public.signIn, {
      ...options(), claims: { providerName: "password", providerAccountId: userId, profile: {} },
    }) };
  },
});
export const refreshSession = mutation({
  args: { refreshToken: v.string() }, returns: v.union(tokenBundle, v.null()),
  handler: async (ctx, args) => {
    const result = await ctx.runMutation(components.core.public.refresh, { ...options(), ...args });
    return result.kind === "rotated" ? result.tokens : null;
  },
});
