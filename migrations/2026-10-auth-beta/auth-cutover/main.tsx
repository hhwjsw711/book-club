import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Authenticated, AuthLoading, Unauthenticated, ConvexReactClient, useQuery } from "convex/react";
import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";
import { useSignInWithUsernamePassword } from "@convex-dev/auth/methods/username-password/react";
import { ConvexAuthProvider as OldProvider, useAuthActions as useOldActions } from "@convex-dev/auth-legacy/react";
import { useSignInWithPassword } from "@convex-dev/auth-legacy/providers/password/react";
import { api } from "../convex/_generated/api";
import "./style.css";

const old = new URLSearchParams(location.search).get("client") === "alpha";
const client = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);
function Credentials({ signIn, pending }: { signIn: (args: { username: string; password: string }) => Promise<boolean>; pending: boolean }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  return <form onSubmit={event => {
    event.preventDefault(); setError("");
    void signIn({ username, password }).then(ok => { if (!ok) setError("Sign-in failed. Check your credentials, or wait a minute before trying again."); }).catch(() => setError("Could not sign in. Please try again."));
  }}>
    <h2>Sign in to the snapshot</h2>
    <label>Username<input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required disabled={pending} /></label>
    <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required disabled={pending} /></label>
    {error && <p role="alert" className="error">{error}</p>}
    <button disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
  </form>;
}
function ModernLogin() {
  const { signIn, pending } = useSignInWithUsernamePassword(api.authBeta);
  return <Credentials pending={pending} signIn={async args => (await signIn(args)).status === "complete"} />;
}
function OldLogin() {
  const { signIn, pending } = useSignInWithPassword(api.auth.signInWithPassword);
  return <Credentials pending={pending} signIn={async args => (await signIn(args)).success} />;
}
function Account({ signOut }: { signOut: () => Promise<void> }) {
  const me = useQuery(api.users.me);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  if (!me) return <p role="status">Loading your copied profile…</p>;
  return <section className="signed-in">
    <h2>You’re signed in.</h2><p>{me.name}</p><p className="note">Your original user ID</p><code>{me.id}</code>
    <h2>Your clubs</h2><ul>{me.clubs.map(club => <li key={club.id}>{club.name}</li>)}</ul>
    <h2>Recent check-ins</h2><ul>{me.recentCheckins.map(c => <li key={c.day}>{c.day}: {c.status}</li>)}</ul>
    <button disabled={pending} onClick={() => { setPending(true); void signOut().catch(() => setError("Could not sign out. Please try again.")).finally(() => setPending(false)); }}>{pending ? "Signing out…" : "Sign out"}</button>
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}
function ModernAccount() { return <Account signOut={useAuthActions().signOut} />; }
function OldAccount() { return <Account signOut={useOldActions().signOut} />; }
function App() {
  return <main><header><a href="/">Book Club</a><span>{old ? "Old-client check" : "Migration rehearsal"}</span></header>
    <h1>Your login.<br />A fresh session.</h1>
    <p className="intro">This separate backend holds a copy of the October 20 snapshot. Use your existing club username and password to check the migration.</p>
    <p className="note">Your live club is unchanged. This page only reads your copied profile and history; it cannot send reminders or change your club data.</p>
    <AuthLoading><p role="status">Restoring your test session…</p></AuthLoading>
    <Unauthenticated>{old ? <OldLogin /> : <ModernLogin />}</Unauthenticated>
    <Authenticated>{old ? <OldAccount /> : <ModernAccount />}</Authenticated>
    <footer><a href={old ? "/" : "/?client=alpha"}>{old ? "Switch to the beta client" : "Switch to the old client"}</a><p>Temporary rehearsal backend. Passkeys are in the separate login trial.</p></footer>
  </main>;
}
createRoot(document.getElementById("root")!).render(old
  ? <OldProvider client={client} api={{ refreshSession: api.auth.refreshSession, signOut: api.auth.signOut }}><App /></OldProvider>
  : <ConvexAuthProvider client={client} api={{ refreshSession: api.authBeta.refreshSession, signOut: api.authBeta.signOut }}><App /></ConvexAuthProvider>);
