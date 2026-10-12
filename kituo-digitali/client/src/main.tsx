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

// Register the service worker without clearing all browser caches or forcing a
// full page reload. The worker fetches the app shell from the network, so new
// deployments remain current while cached media can stay available offline.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  }, { once: true });
}

// Production bootstrap v2: the portal uses Firebase Authentication, Firestore,
// Firebase Storage for legacy file uploads, and the Cloudflare Worker API. GitHub Pages is a static host, so do not create
// the old tRPC client here: it would incorrectly request /api/trpc from the
// Pages origin and show an "API haipatikani" error.

/**
 * Shared send-button motion for the whole portal.
 * This is visual-only: it never reports a request as successful.
 * Existing React/Firebase handlers remain responsible for real submission state.
 */
if (typeof window !== "undefined" && typeof document !== "undefined") {
  const sendActionPattern = /\b(tuma|send|submit|maombi|ujumbe|message)\b/i;
  const activeSendButtons = new WeakSet<HTMLButtonElement>();

  const isSendAction = (button: HTMLButtonElement) => {
    if (button.dataset.noSendAnimation === "true") return false;
    const label = [
      button.innerText,
      button.getAttribute("aria-label"),
      button.getAttribute("title"),
      button.dataset.sendAction,
      button.form?.getAttribute("aria-label"),
    ].filter(Boolean).join(" ");
    return sendActionPattern.test(label);
  };

  const animateSendButton = (button: HTMLButtonElement | null) => {
    if (!button || !isSendAction(button) || button.disabled || activeSendButtons.has(button)) return;
    activeSendButtons.add(button);
    button.classList.remove("send-motion-active");
    // Force a style recalculation so the same animation can replay on later sends.
    void button.offsetWidth;
    button.classList.add("send-motion-active");
    window.setTimeout(() => {
      button.classList.remove("send-motion-active");
      activeSendButtons.delete(button);
    }, 1050);
  };

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    animateSendButton(target.closest("button"));
  }, true);

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const submitter = (event as SubmitEvent).submitter;
    if (submitter instanceof HTMLButtonElement) animateSendButton(submitter);
    else animateSendButton(form.querySelector<HTMLButtonElement>(
      'button[type="submit"], button:not([type]), input[type="submit"]'
    ));
  }, true);
}

createRoot(document.getElementById("root")!).render(<App />);
