import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const provider = v.object({
  name: v.literal("password"),
  accountId: v.string(),
  profile: v.object({}),
});

export const createUser = internalMutation({
  args: { provider },
  returns: v.id("users"),
  handler: async (ctx) => {
    // The signup wrapper sets the initial display name in the SAME transaction.
    return await ctx.db.insert("users", { name: "New member" });
  },
});

// Only the trusted password-verification path creates a handle to this
// callback. Never expose account linking by user id to an unauthenticated client.
export const existingUser = internalMutation({
  args: { provider },
  returns: v.id("users"),
  handler: async (ctx, { provider }) => {
    const userId = ctx.db.normalizeId("users", provider.accountId);
    if (userId === null || (await ctx.db.get("users", userId)) === null) {
      throw new Error("The authenticated account has no user.");
    }
    return userId;
  },
});
