import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  componentDidCatch(error: Error) {
    // A stale or partially cached lazy-loaded module can resolve without its default export.
    // Retry once with a cache-busting URL; keep the error screen if the same failure repeats.
    if (!/Cannot read properties of undefined \\(reading ['"]default['"]\\)/i.test(error?.message ?? "")) return;
    const key = "smartservicestz-default-module-recovery-at";
    try {
      const lastAttempt = Number(sessionStorage.getItem(key) || "0");
      if (Date.now() - lastAttempt < 60000) return;
      sessionStorage.setItem(key, String(Date.now()));
      const url = new URL(window.location.href);
      url.searchParams.set("__module_recovery", String(Date.now()));
      window.location.replace(url.toString());
    } catch {
      // If storage is unavailable, leave the manual recovery screen visible.
    }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">An unexpected error occurred.</h2>

            <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
              <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                {this.state.error?.stack}
              </pre>
            </div>

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
