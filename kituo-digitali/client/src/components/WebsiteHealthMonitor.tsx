import { useEffect } from "react";
import { recordWebsiteHealthReport } from "@/lib/firebase";

const SESSION_KEY = "smartservicestz-health-report-cache";
const REPORT_COOLDOWN_MS = 5 * 60 * 1000;

type ReportInput = {
  kind: "javascript" | "promise" | "blank-page" | "firebase";
  message: string;
  source?: string;
  stack?: string;
};

function clean(value: unknown, max = 1200) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function reportKey(input: ReportInput) {
  return `${input.kind}:${clean(input.message, 240)}:${location.pathname}`;
}

function canReport(key: string) {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const cache = raw ? JSON.parse(raw) as Record<string, number> : {};
    const previous = Number(cache[key] ?? 0);
    if (Date.now() - previous < REPORT_COOLDOWN_MS) return false;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...cache, [key]: Date.now() }));
  } catch {
    // Reporting must never interfere with the website when storage is unavailable.
  }
  return true;
}

function sendReport(input: ReportInput) {
  const message = clean(input.message);
  if (!message) return;
  const payload = { ...input, message, source: clean(input.source, 300), stack: clean(input.stack, 1600) };
  const key = reportKey(payload);
  if (!canReport(key)) return;
  void recordWebsiteHealthReport(payload).catch(() => undefined);
}

export default function WebsiteHealthMonitor() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => sendReport({
      kind: "javascript",
      message: event.message || event.error?.message || "JavaScript error",
      source: event.filename,
      stack: event.error?.stack,
    });
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      sendReport({ kind: "promise", message: reason?.message ?? String(reason ?? "Unhandled promise rejection"), stack: reason?.stack });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    const blankPageTimer = window.setTimeout(() => {
      const root = document.getElementById("root");
      if (root && !root.textContent?.trim() && !root.querySelector("canvas, img, svg")) {
        sendReport({ kind: "blank-page", message: "Root container is empty after the application load window." });
      }
    }, 5000);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.clearTimeout(blankPageTimer);
    };
  }, []);
  return null;
}
