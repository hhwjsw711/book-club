import { setupConvexAuth } from "@convex-dev/auth/server";
import { setupUsernamePassword } from "@convex-dev/auth/methods/username-password/server";
import type {
  SignInResult,
  SignUpResult,
} from "@convex-dev/auth/methods/username-password/server";
import { createFunctionHandle } from "convex/server";
import { components, internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import type { TokenBundle } from "./authContracts";

export function sessionOptions() {
  const issuer = process.env.CONVEX_SITE_URL;
  if (!issuer) throw new Error("CONVEX_SITE_URL is required");
  return { issuer, accessTokenTtlSeconds: 60 * 60 };
}

export const betaCore = setupConvexAuth({
  component: components.auth,
  accessTokenTtlSeconds: 60 * 60,
});
export const passwordMethod = setupUsernamePassword(betaCore, {
  component: components.authPasswordProvider,
  usernameComponent: components.authUsername,
}).attachUserCallbacks({ createUser: internal.authCallbacks.createUser });

export async function signUp(
  ctx: MutationCtx,
  args: { username: string; password: string },
): Promise<SignUpResult> {
  // Reuse the library's complete transaction, including validation and hashing.
  // _handler is the Convex RegisteredMutation handler; the enclosing public
  // mutation supplies the same args/returns validators.
  const method = passwordMethod.signUpWithUsernamePassword as unknown as {
    _handler: (
      ctx: MutationCtx,
      args: { username: string; password: string },
    ) => Promise<SignUpResult>;
  };
  const result = await method._handler(ctx, args);
  if (result.status === "complete") {
    const userId = ctx.db.normalizeId("users", result.tokens.userId);
    if (userId === null) throw new Error("Invalid newly created user.");
    await ctx.db.patch("users", userId, { name: args.username });
  }
  return result;
}

export async function signIn(
  ctx: MutationCtx,
  args: { username: string; password: string },
): Promise<SignInResult> {
  const userId = await ctx.runQuery(
    components.authUsername.public.getUserIdByUsername,
    { username: args.username },
  );
  if (userId === null)
    return { status: "error", userError: { error: "USER_NOT_FOUND" } };
  // Keep the component's password validation, hashing and rate limiter.
  const verified = await ctx.runMutation(
    components.authPasswordProvider.public.verifyPassword,
    { userId, password: args.password },
  );
  if (!verified.success)
    return { status: "error", userError: verified.userError };
  const user = ctx.db.normalizeId("users", userId);
  if (user === null || (await ctx.db.get("users", user)) === null) {
    return { status: "error", userError: { error: "USER_NOT_FOUND" } };
  }
  const claims = {
    providerName: "password",
    providerAccountId: userId,
    profile: {},
  };
  const existing = await ctx.runQuery(
    components.auth.public.getUserIdByAccount,
    {
      provider: "password",
      providerAccountId: userId,
    },
  );
  // Lazy account migration only AFTER a valid password. Both paths use the
  // original app user id; membership/history/profile data never moves.
  const tokens =
    existing === null
      ? await ctx.runMutation(components.auth.public.signUp, {
          ...sessionOptions(),
          claims,
          createUserHandle: await createFunctionHandle(
            internal.authCallbacks.existingUser,
          ),
        })
      : await ctx.runMutation(components.auth.public.signIn, {
          ...sessionOptions(),
          claims,
        });
  return { status: "complete", tokens };
}

export async function refresh(
  ctx: MutationCtx,
  args: { refreshToken: string },
): Promise<TokenBundle | null> {
  const beta = await ctx.runMutation(components.auth.public.refresh, {
    ...sessionOptions(),
    ...args,
  });
  if (beta.kind === "rotated") return beta.tokens;
  // Existing alpha sessions stay on their original refresh path until the next
  // sign-in. An exchange here could lose the session if its response was lost.
  return await ctx.runMutation(components.core.public.refresh, {
    ...sessionOptions(),
    ...args,
  });
}

export async function signOut(
  ctx: MutationCtx,
  args: { refreshToken: string },
) {
  await ctx.runMutation(components.auth.public.signOut, args);
  await ctx.runMutation(components.core.public.signOut, args);
  return null;
}
