import { v } from "convex/values";
import { mutation } from "./_generated/server";
import * as auth from "./lib/auth";
import {
  credentials,
  legacySignInResult,
  legacySignUpResult,
  tokenBundle,
} from "./lib/authContracts";

// Preserve these names, mutation kinds and response shapes for alpha clients.
// All NEW logins use beta sessions, including logins from older phone bundles.
export const { isAuthenticated } = auth.betaCore;
export const signInWithPassword = mutation({
  args: credentials,
  returns: legacySignInResult,
  handler: async (ctx, args) => {
    const result = await auth.signIn(ctx, args);
    return result.status === "complete"
      ? { success: true as const, tokens: result.tokens }
      : { success: false as const, userError: result.userError };
  },
});
export const signUpWithPassword = mutation({
  args: credentials,
  returns: legacySignUpResult,
  handler: async (ctx, args) => {
    const result = await auth.signUp(ctx, args);
    return result.status === "complete"
      ? { success: true as const, tokens: result.tokens }
      : { success: false as const, userError: result.userError };
  },
});
export const refreshSession = mutation({
  args: { refreshToken: v.string() },
  returns: v.union(tokenBundle, v.null()),
  handler: auth.refresh,
});
export const signOut = mutation({
  args: { refreshToken: v.string() },
  returns: v.null(),
  handler: auth.signOut,
});
