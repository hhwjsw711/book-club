// TEST BACKEND ONLY: mint authentic alpha.1 sessions to rehearse the transition.
import { setupCore } from "@convex-dev/auth-legacy/core/setup";
import { setupUsernamePassword } from "@convex-dev/auth-legacy/providers/password/setup";
import { components, internal } from "./_generated/api";
const core = setupCore({
  component: components.core,
  accessTokenTtlSeconds: 3600,
});
export const { signInWithPassword, signUpWithPassword } = setupUsernamePassword(
  core,
  {
    component: components.authPasswordProvider,
    usernameComponent: components.authUsername,
  },
).attachUserCallbacks({ createUser: internal.users.createUser });
