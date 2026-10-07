import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./portal-refresh.css";
import { withBasePath } from "../../shared/githubPagesRoute";

// GitHub Pages serves 404.html for direct SPA routes. The fallback redirects
// here with the original path so Wouter can render it after the 200 response.
if (typeof window !== "undefined") {
  const route = new URLSearchParams(window.location.search).get("route");
  if (route) window.history.replaceState({}, "", withBasePath(route, import.meta.env.BASE_URL));
}

// Recover automatically from stale Vite chunk/module caches after a new GitHub Pages deployment.
if (typeof window !== "undefined") {
  const storageKey = "steward-tz-module-recovery-v1";
  const isChunkLoadError = (value: unknown) => /failed to fetch dynamically imported module|importing a module script failed|loading chunk|chunkloaderror/i.test(value instanceof Error ? value.message : String(value ?? ""));
  const recover = (event: Event) => {
    const reason = event instanceof ErrorEvent ? event.error ?? event.message : (event as PromiseRejectionEvent).reason;
    if (!isChunkLoadError(reason) || sessionStorage.getItem(storageKey) === "1") return;
    sessionStorage.setItem(storageKey, "1");
    const url = new URL(window.location.href);
    url.searchParams.set("__refresh", String(Date.now()));
    window.location.replace(url.toString());
  };
  window.addEventListener("error", recover);
  window.addEventListener("unhandledrejection", recover);
}

// Register the PWA service worker on the GitHub Pages project scope.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}

// Production bootstrap v2: the portal uses Firebase Authentication, Firestore,
// Firebase Storage for legacy file uploads, and the Cloudflare Worker API. GitHub Pages is a static host, so do not create
// the old tRPC client here: it would incorrectly request /api/trpc from the
// Pages origin and show an "API haipatikani" error.
createRoot(document.getElementById("root")!).render(<App />);
