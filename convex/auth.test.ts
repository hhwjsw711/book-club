import { registerCore } from "@convex-dev/auth/test";
import { registerCore as registerLegacyCore } from "@convex-dev/auth-legacy/providers/testing/core";
import { registerPasswordProvider } from "@convex-dev/auth/components/password/test";
import { registerUsername } from "@convex-dev/auth/components/username/test";
import { convexTest } from "convex-test";
import { componentsGeneric, createFunctionHandle } from "convex/server";
import {
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  jwtVerify,
  importJWK,
} from "jose";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { api, components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const legacyComponents = componentsGeneric() as unknown as {
  core: import("@convex-dev/auth-legacy/core/_generated/component.js").ComponentApi<"core">;
};

const modules = import.meta.glob("./**/*.ts");
const password = "river-lantern-october-58";
const issuer = "https://auth-test.convex.site";
let publicJwk: Awaited<ReturnType<typeof exportJWK>>;

beforeAll(async () => {
  const keys = await generateKeyPair("RS256", { extractable: true });
  publicJwk = { ...(await exportJWK(keys.publicKey)), kid: "test" };
  process.env.AUTH_PRIVATE_KEY = btoa(await exportPKCS8(keys.privateKey));
  process.env.AUTH_JWKS = JSON.stringify({ keys: [publicJwk] });
  process.env.CONVEX_SITE_URL = issuer;
});
afterEach(() => vi.useRealTimers());

function backend() {
  const t = convexTest(schema, modules);
  registerLegacyCore(t, "core");
  registerCore(t, "auth");
  registerPasswordProvider(t, "authPasswordProvider");
  registerUsername(t);
  return t;
}

async function alphaAccount(
  t: ReturnType<typeof backend>,
  username = "reader",
) {
  // Mint a real alpha.1 session, including its old component schema and callback.
  return await t.run(async (ctx) => {
    const tokens = await ctx.runMutation(legacyComponents.core.public.signUp, {
      claims: {
        provider: "password",
        providerAccountId: "",
        profile: { username },
      },
      createUserHandle: await createFunctionHandle(internal.users.createUser),
      issuer,
      accessTokenTtlSeconds: 3600,
    });
    await ctx.runMutation(components.authUsername.public.setUsername, {
      userId: tokens.userId,
      username,
    });
    await ctx.runMutation(components.authPasswordProvider.public.setPassword, {
      userId: tokens.userId,
      password,
    });
    return tokens;
  });
}

describe("alpha → beta auth transition", () => {
  test("old refresh sessions are rejected through both client envelopes", async () => {
    const t = backend();
    const original = await alphaAccount(t);
    expect(await t.mutation(api.auth.refreshSession, {
      refreshToken: original.refreshToken,
    })).toBeNull();
    expect(await t.mutation(api.authBeta.refreshSession, {
      refreshToken: original.refreshToken,
    })).toEqual({ kind: "noSession" });
    expect((await t.run((ctx) => ctx.db.get("users", original.userId as Id<"users">)))?.name).toBe("reader");
  });

  test("password-authenticated migration preserves identity, profile and memberships", async () => {
    const t = backend();
    const original = await alphaAccount(t);
    const userId = original.userId as Id<"users">;
    const clubId = await t.run(async (ctx) => {
      await ctx.db.patch("users", userId, {
        name: "A Reader",
        timezone: "America/Los_Angeles",
      });
      const clubId = await ctx.db.insert("clubs", {
        name: "Original club",
        createdBy: userId,
      });
      await ctx.db.insert("memberships", { userId, clubId });
      return clubId;
    });
    const modern = await t.mutation(api.authBeta.signInWithUsernamePassword, {
      username: "READER",
      password,
    });
    expect(modern.status).toBe("complete");
    if (modern.status !== "complete") throw new Error("Expected login");
    expect(modern.tokens.userId).toBe(userId);
    const { payload } = await jwtVerify(
      modern.tokens.accessToken,
      await importJWK(publicJwk, "RS256"),
      {
        issuer,
        audience: "convex",
      },
    );
    expect(payload.sub).toBe(userId);
    expect(payload.exp! - payload.iat!).toBe(3600);
    const signedIn = t.withIdentity({ subject: userId });
    expect((await signedIn.query(api.clubs.mine))[0]._id).toBe(clubId);
    expect(
      (await signedIn.query(api.users.me, { viewerDay: "2026-10-20" }))?.name,
    ).toBe("A Reader");
    expect((await t.run((ctx) => ctx.db.query("users").take(10))).length).toBe(
      1,
    );
    // A second login uses the existing beta account and can come from an old phone.
    const old = await t.mutation(api.auth.signInWithPassword, {
      username: "reader",
      password,
    });
    expect(old.success).toBe(true);
    if (!old.success) throw new Error("Expected login");
    expect(old.tokens.userId).toBe(userId);
    expect(
      await t.mutation(api.auth.refreshSession, {
        refreshToken: modern.tokens.refreshToken,
      }),
    ).not.toBeNull();
  });

  test("new accounts work in both clients and retain username-based display names", async () => {
    const t = backend();
    const created = await t.mutation(api.authBeta.signUpWithUsernamePassword, {
      username: "newreader",
      password,
    });
    expect(created.status).toBe("complete");
    if (created.status !== "complete") throw new Error("Expected signup");
    const old = await t.mutation(api.auth.signInWithPassword, {
      username: "newreader",
      password,
    });
    expect(old.success).toBe(true);
    if (!old.success) throw new Error("Expected login");
    expect(old.tokens.userId).toBe(created.tokens.userId);
    const profile = await t
      .withIdentity({ subject: old.tokens.userId })
      .query(api.users.me, { viewerDay: "2026-10-20" });
    expect(profile?.name).toBe("newreader");
    expect(
      await t.mutation(api.auth.signUpWithPassword, {
        username: "NEWREADER",
        password,
      }),
    ).toEqual({ success: false, userError: { error: "USERNAME_TAKEN" } });
    const oldSignup = await t.mutation(api.auth.signUpWithPassword, {
      username: "olderphone",
      password,
    });
    expect(oldSignup.success).toBe(true);
  });

  test("wrong passwords never link an alpha account and remain rate limited", async () => {
    const t = backend();
    const original = await alphaAccount(t);
    for (let i = 0; i < 5; i++) {
      expect(
        await t.mutation(api.authBeta.signInWithUsernamePassword, {
          username: "reader",
          password: "wrong-password",
        }),
      ).toEqual({
        status: "error",
        userError: { error: "INVALID_CREDENTIALS" },
      });
    }
    const limited = await t.mutation(api.auth.signInWithPassword, {
      username: "reader",
      password,
    });
    expect(limited).toMatchObject({
      success: false,
      userError: { error: "RATE_LIMITED" },
    });
    expect(
      await t.run((ctx) =>
        ctx.runQuery(components.auth.public.getUserIdByAccount, {
          provider: "password",
          providerAccountId: original.userId,
        }),
      ),
    ).toBeNull();
  });

  test("invalid signup does not leave a user, username or session", async () => {
    const t = backend();
    const result = await t.mutation(api.authBeta.signUpWithUsernamePassword, {
      username: "reader",
      password: "x",
    });
    expect(result).toMatchObject({
      status: "error",
      userError: { error: "PASSWORD_TOO_SHORT" },
    });
    expect(await t.run((ctx) => ctx.db.query("users").take(10))).toEqual([]);
    expect(
      await t.mutation(api.auth.signInWithPassword, {
        username: "reader",
        password,
      }),
    ).toEqual({ success: false, userError: { error: "USER_NOT_FOUND" } });
  });

  test("a lost beta refresh response can be retried after sleeping, through an old client", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = backend();
    const login = await t.mutation(api.auth.signUpWithPassword, {
      username: "reader",
      password,
    });
    if (!login.success) throw new Error("Expected signup");
    await t.mutation(api.auth.refreshSession, {
      refreshToken: login.tokens.refreshToken,
    }); // response lost
    vi.setSystemTime(Date.now() + 60_000);
    const recovered = await t.mutation(api.auth.refreshSession, {
      refreshToken: login.tokens.refreshToken,
    });
    expect(recovered?.userId).toBe(login.tokens.userId);
    expect(
      (
        await t.mutation(api.authBeta.refreshSession, {
          refreshToken: recovered!.refreshToken,
        })
      ).kind,
    ).toBe("rotated");
  });

  test("replaying a spent beta token revokes the session", async () => {
    const t = backend();
    const login = await t.mutation(api.auth.signUpWithPassword, {
      username: "reader",
      password,
    });
    if (!login.success) throw new Error("Expected signup");
    const next = await t.mutation(api.auth.refreshSession, {
      refreshToken: login.tokens.refreshToken,
    });
    const latest = await t.mutation(api.auth.refreshSession, {
      refreshToken: next!.refreshToken,
    });
    expect(
      await t.mutation(api.auth.refreshSession, {
        refreshToken: login.tokens.refreshToken,
      }),
    ).toBeNull();
    expect(
      await t.mutation(api.authBeta.refreshSession, {
        refreshToken: latest!.refreshToken,
      }),
    ).toEqual({ kind: "noSession" });
  });

  test("unknown tokens and unauthenticated requests grant no access", async () => {
    const t = backend();
    expect(
      await t.mutation(api.authBeta.refreshSession, {
        refreshToken: "invented",
      }),
    ).toEqual({ kind: "noSession" });
    expect(
      await t.mutation(api.auth.refreshSession, { refreshToken: "invented" }),
    ).toBeNull();
    expect(await t.query(api.auth.isAuthenticated)).toBe(false);
    expect(await t.query(api.users.me, { viewerDay: "2026-10-20" })).toBeNull();
    expect(
      await t.mutation(api.authBeta.changePassword, {
        currentPassword: password,
        newPassword: "another-valid-passphrase",
      }),
    ).toMatchObject({ success: false, userError: { error: "NOT_SIGNED_IN" } });
  });

  test("either client's sign-out revokes beta sessions", async () => {
    const t = backend();
    const login = await t.mutation(api.authBeta.signUpWithUsernamePassword, {
      username: "reader",
      password,
    });
    if (login.status !== "complete") throw new Error("Expected signup");
    await t.mutation(api.auth.signOut, {
      refreshToken: login.tokens.refreshToken,
    });
    expect(
      await t.mutation(api.authBeta.refreshSession, {
        refreshToken: login.tokens.refreshToken,
      }),
    ).toEqual({ kind: "noSession" });
    const second = await t.mutation(api.auth.signInWithPassword, {
      username: "reader",
      password,
    });
    if (!second.success) throw new Error("Expected login");
    await t.mutation(api.authBeta.signOut, {
      refreshToken: second.tokens.refreshToken,
    });
    expect(
      await t.mutation(api.auth.refreshSession, {
        refreshToken: second.tokens.refreshToken,
      }),
    ).toBeNull();
  });

  test("expired alpha and beta sessions cannot be revived", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = backend();
    const alpha = await alphaAccount(t);
    const beta = await t.mutation(api.authBeta.signInWithUsernamePassword, {
      username: "reader",
      password,
    });
    if (beta.status !== "complete") throw new Error("Expected login");
    vi.setSystemTime(Date.now() + 31 * 24 * 60 * 60 * 1000);
    for (const refreshToken of [alpha.refreshToken, beta.tokens.refreshToken]) {
      expect(
        await t.mutation(api.authBeta.refreshSession, { refreshToken }),
      ).toEqual({ kind: "noSession" });
      expect(
        await t.mutation(api.auth.refreshSession, { refreshToken }),
      ).toBeNull();
    }
  });

  test("password changes require the current password and work in either client", async () => {
    const t = backend();
    const original = await alphaAccount(t);
    const signedIn = t.withIdentity({ subject: original.userId });
    const newPassword = "forest-lantern-november-92";
    expect(
      await signedIn.mutation(api.authBeta.changePassword, {
        currentPassword: "wrong-password",
        newPassword,
      }),
    ).toEqual({ success: false, userError: { error: "INVALID_CREDENTIALS" } });
    expect(
      await signedIn.mutation(api.authBeta.changePassword, {
        currentPassword: password,
        newPassword,
      }),
    ).toEqual({ success: true });
    expect(
      await t.mutation(api.auth.signInWithPassword, {
        username: "reader",
        password,
      }),
    ).toMatchObject({
      success: false,
      userError: { error: "INVALID_CREDENTIALS" },
    });
    expect(
      await t.mutation(api.authBeta.signInWithUsernamePassword, {
        username: "reader",
        password: newPassword,
      }),
    ).toMatchObject({
      status: "complete",
      tokens: { userId: original.userId },
    });
  });
});
