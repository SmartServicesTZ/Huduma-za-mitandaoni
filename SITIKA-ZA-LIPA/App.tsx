import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Router as WouterRouter, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import WebsiteHealthMonitor from "./components/WebsiteHealthMonitor";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import LipaQrStudioPage from "./pages/LipaQrStudioPage";

function Router() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/services"} component={Home} />
        <Route path="/lipa-qr-studio" component={LipaQrStudioPage} />
        <Route path="/workbench" component={Home} />
        <Route path="/chat" component={Home} />
        <Route path="/service/:slug" component={Home} />
        <Route path="/history" component={Home} />
        <Route path={"/tokens"} component={Home} />
        <Route path={"/account"} component={Home} />
        <Route path={"/admin"} component={Home} />
        <Route path={"/admin/users"} component={Home} />
        <Route path={"/admin/tokens"} component={Home} />
        <Route path={"/admin/services"} component={Home} />
        <Route path={"/admin/videos"} component={Home} />
        <Route path={"/admin/transactions"} component={Home} />
        <Route path={"/admin/announcements"} component={Home} />
        <Route path={"/admin/cms"} component={Home} />
        <Route path={"/admin/licenses"} component={Home} />
        <Route path={"/admin/security"} component={Home} />
        <Route path={"/admin/settings"} component={Home} />
        <Route path={"/admin/roles"} component={Home} />
        <Route path={"/admin/messages"} component={Home} />
        <Route path={"/admin/ads"} component={Home} />
        <Route path={"/admin/analytics"} component={Home} />
        <Route path={"/admin/appearance"} component={Home} />
        <Route path={"/admin/audit"} component={Home} />
        <Route path="/admin/:panel" component={Home} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </WouterRouter>
  );
}

function DownloadProgressNotice() {
  const [download, setDownload] = useState<{ name: string; progress: number; status: "working" | "done" | "error" } | null>(null);
  useEffect(() => {
    const start = (event: Event) => { const d = (event as CustomEvent<{ name?: string; progress?: number }>).detail ?? {}; setDownload({ name: d.name ?? "Faili", progress: d.progress ?? 0, status: "working" }); };
    const progress = (event: Event) => { const d = (event as CustomEvent<{ name?: string; progress?: number }>).detail ?? {}; setDownload((v) => v ? { ...v, name: d.name ?? v.name, progress: d.progress ?? v.progress, status: "working" } : null); };
    const done = (event: Event) => { const d = (event as CustomEvent<{ name?: string }>).detail ?? {}; setDownload((v) => ({ name: d.name ?? v?.name ?? "Faili", progress: 100, status: "done" })); window.setTimeout(() => setDownload((v) => v?.status === "done" ? null : v), 3500); };
    const failed = (event: Event) => { const d = (event as CustomEvent<{ name?: string }>).detail ?? {}; setDownload((v) => ({ name: d.name ?? v?.name ?? "Faili", progress: v?.progress ?? 0, status: "error" })); window.setTimeout(() => setDownload((v) => v?.status === "error" ? null : v), 6000); };
    window.addEventListener("smartservicestz-download-start", start); window.addEventListener("smartservicestz-download-progress", progress); window.addEventListener("smartservicestz-download-complete", done); window.addEventListener("smartservicestz-download-error", failed);
    return () => { window.removeEventListener("smartservicestz-download-start", start); window.removeEventListener("smartservicestz-download-progress", progress); window.removeEventListener("smartservicestz-download-complete", done); window.removeEventListener("smartservicestz-download-error", failed); };
  }, []);
  if (!download) return null;
  return <div role="status" aria-live="polite" style={{ position: "fixed", zIndex: 99999, left: 14, right: 14, bottom: "max(18px, env(safe-area-inset-bottom))", maxWidth: 520, margin: "0 auto", padding: "15px 17px", borderRadius: 16, color: "#f8fafc", background: "#0f172a", border: "1px solid #334155", boxShadow: "0 12px 38px #0008" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span aria-hidden="true" style={{ fontSize: 22 }}>{download.status === "done" ? "✓" : download.status === "error" ? "!" : "↓"}</span><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 14 }}>{download.status === "done" ? "Upakuaji umekamilika" : download.status === "error" ? "Upakuaji umeshindikana" : "Inapakua faili..."}</div><div style={{ fontSize: 12, opacity: .8, overflowWrap: "anywhere" }}>{download.name}</div></div>{download.status === "working" ? <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 13 }}>{download.progress}%</span> : null}</div>
    <div style={{ height: 6, borderRadius: 99, background: "#334155", overflow: "hidden", marginTop: 12 }}><div style={{ height: "100%", width: download.progress + "%", borderRadius: 99, background: download.status === "error" ? "#f87171" : download.status === "done" ? "#34d399" : "#60a5fa", transition: "width .18s ease" }} /></div>
  </div>;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <WebsiteHealthMonitor />
          <DownloadProgressNotice />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
