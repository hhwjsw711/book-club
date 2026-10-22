import { Infer, v } from "convex/values";

// The beta and installed alpha clients use different envelopes around the same
// token bundle. Keep the old wire contract until those clients are retired.
export const tokenBundle = v.object({
  accessToken: v.string(),
  accessTokenExpiresAt: v.number(),
  refreshToken: v.string(),
  refreshTokenExpiresAt: v.number(),
  userId: v.string(),
});
export type TokenBundle = Infer<typeof tokenBundle>;
export const credentials = { username: v.string(), password: v.string() };
const passwordFormatError = v.union(
  v.object({
    error: v.literal("PASSWORD_TOO_SHORT"),
    minimumLength: v.number(),
  }),
  v.object({
    error: v.literal("PASSWORD_TOO_LONG"),
    maximumLength: v.number(),
  }),
  v.object({ error: v.literal("PASSWORD_HAS_SURROUNDING_WHITESPACE") }),
);
export const signInError = v.union(
  passwordFormatError,
  v.object({ error: v.literal("INVALID_CREDENTIALS") }),
  v.object({ error: v.literal("RATE_LIMITED"), retryAfterMs: v.number() }),
  v.object({ error: v.literal("USER_NOT_FOUND") }),
);
export const signUpError = v.union(
  passwordFormatError,
  v.object({ error: v.literal("PASSWORD_TOO_COMMON") }),
  v.object({ error: v.literal("USERNAME_TAKEN") }),
  v.object({
    error: v.literal("USERNAME_TOO_SHORT"),
    minimumLength: v.number(),
  }),
  v.object({ error: v.literal("USERNAME_HAS_SURROUNDING_WHITESPACE") }),
  v.object({ error: v.literal("USERNAME_HAS_INVALID_CHARACTERS") }),
);
const complete = v.object({
  status: v.literal("complete"),
  tokens: tokenBundle,
});
export const signInResult = v.union(
  complete,
  v.object({ status: v.literal("error"), userError: signInError }),
);
export const signUpResult = v.union(
  complete,
  v.object({ status: v.literal("error"), userError: signUpError }),
);
export const refreshResult = v.union(
  v.object({ kind: v.literal("rotated"), tokens: tokenBundle }),
  v.object({ kind: v.literal("noSession") }),
);
export const legacySignInResult = v.union(
  v.object({ success: v.literal(true), tokens: tokenBundle }),
  v.object({ success: v.literal(false), userError: signInError }),
);
export const legacySignUpResult = v.union(
  v.object({ success: v.literal(true), tokens: tokenBundle }),
  v.object({ success: v.literal(false), userError: signUpError }),
);
