import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

export const createUser = internalMutation({
  args: { provider: v.literal("password"), providerAccountId: v.string(), profile: v.object({ username: v.string() }) },
  returns: v.id("users"),
  handler: (ctx, args) => ctx.db.insert("users", { name: args.profile.username }),
});
export const createUserBeta = internalMutation({
  args: { provider: v.object({ name: v.literal("password"), accountId: v.string(), profile: v.object({}) }) },
  returns: v.id("users"),
  handler: (ctx) => ctx.db.insert("users", { name: "Rehearsal account" }),
});

// The only app-data endpoint: authenticated, scoped to the current user, read-only.
export const me = query({
  args: {},
  returns: v.union(v.null(), v.object({
    id: v.id("users"), name: v.string(),
    clubs: v.array(v.object({ id: v.id("clubs"), name: v.string() })),
    recentCheckins: v.array(v.object({ day: v.string(), status: v.string() })),
  })),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = ctx.db.normalizeId("users", identity.subject);
    const user = userId && await ctx.db.get("users", userId);
    if (!user) return null;
    const memberships = await ctx.db.query("memberships").withIndex("userId", q => q.eq("userId", user._id)).take(101);
    if (memberships.length > 100) throw new Error("Rehearsal membership limit exceeded");
    const clubs = [];
    for (const membership of memberships) {
      const club = await ctx.db.get("clubs", membership.clubId);
      if (club) clubs.push({ id: club._id, name: club.name });
    }
    const checkins = await ctx.db.query("checkins").withIndex("userDay", q => q.eq("userId", user._id)).order("desc").take(5);
    return { id: user._id, name: user.name, clubs, recentCheckins: checkins.map(c => ({ day: c.day, status: c.status })) };
  },
});
