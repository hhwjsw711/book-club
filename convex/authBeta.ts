import { v } from "convex/values";
import { mutation } from "./_generated/server";
import * as auth from "./lib/auth";
import {
  credentials,
  signInResult,
  signUpResult,
  refreshResult,
} from "./lib/authContracts";

export const { isAuthenticated } = auth.betaCore;
export const { changePassword } = auth.passwordMethod;
export const signInWithUsernamePassword = mutation({
  args: credentials,
  returns: signInResult,
  handler: auth.signIn,
});
export const signUpWithUsernamePassword = mutation({
  args: credentials,
  returns: signUpResult,
  handler: auth.signUp,
});
export const refreshSession = mutation({
  args: { refreshToken: v.string() },
  returns: refreshResult,
  handler: async (ctx, args) => {
    const tokens = await auth.refresh(ctx, args);
    return tokens === null
      ? { kind: "noSession" as const }
      : { kind: "rotated" as const, tokens };
  },
});
export const signOut = mutation({
  args: { refreshToken: v.string() },
  returns: v.null(),
  handler: auth.signOut,
});
