import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { getConvexUrl } from "@convex-dev/static-hosting";
import { ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { api } from "../convex/_generated/api";
import { App } from "./App";
import "./index.css";

const convex = new ConvexReactClient(
  import.meta.env.VITE_CONVEX_URL ?? getConvexUrl(),
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexAuthProvider
      client={convex}
      api={{
        refreshSession: api.authBeta.refreshSession,
        signOut: api.authBeta.signOut,
      }}
    >
      <App />
    </ConvexAuthProvider>
  </StrictMode>,
);
