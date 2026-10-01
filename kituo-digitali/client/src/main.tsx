import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// GitHub Pages serves 404.html for direct SPA routes. The fallback redirects
// here with the original path so Wouter can render it after the 200 response.
if (typeof window !== "undefined") {
  const route = new URLSearchParams(window.location.search).get("route");
  if (route) window.history.replaceState({}, "", decodeURIComponent(route));
}

// Production bootstrap v2: the portal uses Firebase Authentication, Firestore, Storage and
// callable Cloud Functions. GitHub Pages is a static host, so do not create
// the old tRPC client here: it would incorrectly request /api/trpc from the
// Pages origin and show an "API haipatikani" error.
createRoot(document.getElementById("root")!).render(<App />);
