import { createRoot } from "react-dom/client";
import { useState } from "react";
import {
  Authenticated,
  Unauthenticated,
  AuthLoading,
  ConvexReactClient,
  useQuery,
  useMutation,
} from "convex/react";
import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";
import {
  useSignInWithUsernamePassword,
  useSignUpWithUsernamePassword,
} from "@convex-dev/auth/methods/username-password/react";
import { useSignInWithUsernamePasskey } from "@convex-dev/auth/methods/username-passkey/react";
import {
  ConvexAuthProvider as LegacyProvider,
  useAuthActions as useLegacyActions,
} from "@convex-dev/auth-legacy/react";
import {
  useSignInWithPassword,
  useSignUpWithPassword,
} from "@convex-dev/auth-legacy/providers/password/react";
import { api } from "../convex/_generated/api";
import "./style.css";

const client = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);
const legacy = new URLSearchParams(location.search).get("client") === "alpha";

function PasswordForm({ old = false }: { old?: boolean }) {
  const modernIn = useSignInWithUsernamePassword(api.authBeta);
  const modernUp = useSignUpWithUsernamePassword(api.authBeta);
  return (
    <Credentials
      old={old}
      signIn={modernIn.signIn}
      signUp={modernUp.signUp}
      pending={modernIn.pending || modernUp.pending}
    />
  );
}
function LegacyPasswordForm() {
  const logIn = useSignInWithPassword(api.auth.signInWithPassword);
  const register = useSignUpWithPassword(api.legacy.signUpWithPassword);
  return (
    <Credentials
      old
      signIn={async (args) => {
        const result = await logIn.signIn(args);
        return result.success
          ? { status: "complete" }
          : { status: "error", userError: result.userError };
      }}
      signUp={async (args) => {
        const result = await register.signUp(args);
        return result.success
          ? { status: "complete" }
          : { status: "error", userError: result.userError };
      }}
      pending={logIn.pending || register.pending}
    />
  );
}
type Result = { status: string; userError?: { error: string } };
type CredentialsArgs = { username: string; password: string };
function Credentials({
  old,
  signIn,
  signUp,
  pending,
}: {
  old?: boolean;
  signIn: (args: CredentialsArgs) => Promise<Result>;
  signUp: (args: CredentialsArgs) => Promise<Result>;
  pending: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        const data = new FormData(event.currentTarget);
        const args = {
          username: String(data.get("username")).trim(),
          password: String(data.get("password")),
        };
        try {
          const result = await (creating ? signUp : signIn)(args);
          if (result.status !== "complete")
            setError(errorMessage(result.userError?.error));
        } catch {
          setError("Couldn’t connect. Please try again.");
        }
      }}
    >
      <h2>{creating ? "Create a test account" : "Sign in with a password"}</h2>
      <p>
        {old
          ? "This uses the old app’s login library. New test accounts start with an original alpha session."
          : "Use a test account created here or in the old-client trial."}
      </p>
      <label>
        Username
        <input
          name="username"
          autoComplete="username"
          required
          disabled={pending}
        />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete={creating ? "new-password" : "current-password"}
          required
          disabled={pending}
        />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button disabled={pending}>
        {pending ? "One moment…" : creating ? "Create test account" : "Sign in"}
      </button>
      <button
        type="button"
        className="quiet"
        disabled={pending}
        onClick={() => {
          setCreating(!creating);
          setError("");
        }}
      >
        {creating
          ? "Already have a test account? Sign in"
          : "Create a test account"}
      </button>
    </form>
  );
}
function errorMessage(code?: string) {
  switch (code) {
    case "USER_NOT_FOUND":
      return "No test account has that username. Create one below.";
    case "USERNAME_TAKEN":
      return "That username is taken. Sign in, or choose another.";
    case "INVALID_CREDENTIALS":
      return "That password didn’t match. Please try again.";
    case "RATE_LIMITED":
      return "Too many attempts. Wait a minute, then try again.";
    case "PASSWORD_TOO_SHORT":
      return "Choose a password with at least 8 characters.";
    case "PASSWORD_TOO_COMMON":
      return "Choose a less common test password.";
    case "USER_CANCELLED":
      return "Passkey sign-in was cancelled. You can try again.";
    default:
      return "Couldn’t complete sign-in. Check your details and try again.";
  }
}
function PasskeyForm() {
  const { signIn, pending } = useSignInWithUsernamePasskey(api.passkeys);
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        const username = String(
          new FormData(event.currentTarget).get("username"),
        ).trim();
        try {
          const result = await signIn({ username });
          if (result.status !== "complete")
            setError(errorMessage(result.userError.error));
        } catch {
          setError(
            "Passkeys aren’t available here. Try Safari or Chrome on your device.",
          );
        }
      }}
    >
      <h2>Try a passkey</h2>
      <p>
        Choose a test username. Your device will offer to create a passkey, or
        use one you’ve already saved.
      </p>
      <label>
        Test username
        <input
          name="username"
          autoComplete="username webauthn"
          required
          disabled={pending}
        />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button disabled={pending}>
        {pending ? "Follow your device’s prompt…" : "Continue with a passkey"}
      </button>
      <p className="note">
        Passkey test accounts are separate from password accounts. These
        passkeys work only on this test site.
      </p>
    </form>
  );
}
function Account({ signOut }: { signOut: () => Promise<void> }) {
  const me = useQuery(api.users.me);
  const [error, setError] = useState("");
  return (
    <section className="signed-in">
      <h2>You’re signed in.</h2>
      <p>
        {me
          ? `Welcome, ${me.username ?? me.name}.`
          : "Loading your test profile…"}
      </p>
      {me && (
        <>
          <p className="note">
            Your account ID stays the same when you switch clients:
          </p>
          <code>{me.id}</code>
        </>
      )}
      <p>
        Reload this page to check that your session survives. Then switch
        clients without signing out.
      </p>
      <a className="button" href={legacy ? "/" : "/?client=alpha"}>
        Switch to the {legacy ? "beta" : "old"} client
      </a>
      <button
        className="quiet"
        onClick={() => {
          void signOut().catch(() =>
            setError("Couldn’t sign out. Please try again."),
          );
        }}
      >
        Sign out
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!legacy && me?.method === "password" && <ChangePassword />}
    </section>
  );
}
function ChangePassword() {
  const change = useMutation(api.authBeta.changePassword);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <details>
      <summary>Try changing your password</summary>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          setPending(true);
          setMessage("");
          try {
            const result = await change({
              currentPassword: String(data.get("current")),
              newPassword: String(data.get("new")),
            });
            setMessage(
              result.success
                ? "Password changed. Try signing in with it in either client."
                : errorMessage(result.userError.error),
            );
            if (result.success) form.reset();
          } catch {
            setMessage("Couldn’t change your password. Please try again.");
          } finally {
            setPending(false);
          }
        }}
      >
        <label>
          Current password
          <input
            name="current"
            type="password"
            autoComplete="current-password"
            required
            disabled={pending}
          />
        </label>
        <label>
          New password
          <input
            name="new"
            type="password"
            autoComplete="new-password"
            required
            disabled={pending}
          />
        </label>
        <button disabled={pending}>
          {pending ? "Saving…" : "Change password"}
        </button>
        {message && <p role="status">{message}</p>}
      </form>
    </details>
  );
}
function ModernAccount() {
  return <Account signOut={useAuthActions().signOut} />;
}
function LegacyAccount() {
  return <Account signOut={useLegacyActions().signOut} />;
}
function App() {
  const [method, setMethod] = useState<"password" | "passkey">("password");
  return (
    <main>
      <header>
        <a href="/">Book Club</a>
        <span>{legacy ? "Old-client trial" : "Beta login trial"}</span>
      </header>
      <h1>
        A simpler way back
        <br />
        to the club.
      </h1>
      <p className="intro">
        Try the new login without touching your club account. Create a fresh
        test account here; your real password won’t work on this separate site.
      </p>
      <AuthLoading>
        <p role="status">Opening your test session…</p>
      </AuthLoading>
      <Unauthenticated>
        {!legacy && (
          <nav aria-label="Sign-in method">
            <button
              className={method === "password" ? "selected" : "quiet"}
              aria-pressed={method === "password"}
              onClick={() => setMethod("password")}
            >
              Password
            </button>
            <button
              className={method === "passkey" ? "selected" : "quiet"}
              aria-pressed={method === "passkey"}
              onClick={() => setMethod("passkey")}
            >
              Passkey
            </button>
          </nav>
        )}
        {legacy ? (
          <LegacyPasswordForm />
        ) : method === "password" ? (
          <PasswordForm />
        ) : (
          <PasskeyForm />
        )}
      </Unauthenticated>
      <Authenticated>
        {legacy ? <LegacyAccount /> : <ModernAccount />}
      </Authenticated>
      <footer>
        <a href={legacy ? "/" : "/?client=alpha"}>
          {legacy ? "Open the beta client" : "Try upgrading an old session"}
        </a>
        <p>No club history, reminders or notifications are connected.</p>
      </footer>
    </main>
  );
}

// Each branch is explicit so TypeScript checks both protocol versions.
createRoot(document.getElementById("root")!).render(
  legacy ? (
    <LegacyProvider
      client={client}
      api={{
        refreshSession: api.auth.refreshSession,
        signOut: api.auth.signOut,
      }}
    >
      <App />
    </LegacyProvider>
  ) : (
    <ConvexAuthProvider
      client={client}
      api={{
        refreshSession: api.authBeta.refreshSession,
        signOut: api.authBeta.signOut,
      }}
    >
      <App />
    </ConvexAuthProvider>
  ),
);
