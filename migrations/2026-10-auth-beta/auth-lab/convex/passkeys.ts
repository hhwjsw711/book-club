import { setupUsernamePasskey } from "@convex-dev/auth/methods/username-passkey/server";
import { components, internal } from "./_generated/api";
import { betaCore } from "./lib/auth";
const origin = process.env.CONVEX_SITE_URL!;
export const {
  startSignInWithUsernamePasskey,
  startAutofillSignInWithUsernamePasskey,
  finishSignInWithUsernamePasskey,
  finishSignUpWithUsernamePasskey,
  listPasskeys,
  startAddPasskey,
  verifyAddPasskey,
  finishAddPasskey,
  startRemovePasskey,
  finishRemovePasskey,
  renamePasskey,
} = setupUsernamePasskey(betaCore, {
  component: components.authPasskey,
  usernameComponent: components.passkeyUsernames,
  rpId: new URL(origin).hostname,
  origin,
  rpName: "Book Club login trial",
}).attachUserCallbacks({ createUser: internal.users.createPasskeyUser });
