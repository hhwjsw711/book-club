import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { components } from "./_generated/api";

export const createUser = internalMutation({
  args: {
    provider: v.literal("password"),
    providerAccountId: v.string(),
    profile: v.object({ username: v.string() }),
  },
  returns: v.id("users"),
  handler: (ctx, args) =>
    ctx.db.insert("users", { name: args.profile.username }),
});
export const createPasskeyUser = internalMutation({
  args: {
    provider: v.object({
      name: v.literal("passkey"),
      accountId: v.string(),
      profile: v.object({}),
    }),
  },
  returns: v.id("users"),
  handler: (ctx) => ctx.db.insert("users", { name: "Passkey tester" }),
});
export const me = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("users"),
      name: v.string(),
      username: v.union(v.string(), v.null()),
      method: v.union(v.literal("password"), v.literal("passkey")),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const id = ctx.db.normalizeId("users", identity.subject);
    const user = id && (await ctx.db.get("users", id));
    if (!user) return null;
    const username = await ctx.runQuery(
      components.authUsername.public.getUsername,
      { userId: user._id },
    );
    const passkeyName =
      username === null
        ? await ctx.runQuery(components.passkeyUsernames.public.getUsername, {
            userId: user._id,
          })
        : null;
    return {
      id: user._id,
      name: user.name,
      username: username ?? passkeyName,
      method: username === null ? ("passkey" as const) : ("password" as const),
    };
  },
});
