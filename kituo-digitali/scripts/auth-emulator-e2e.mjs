import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const appUrl = "http://127.0.0.1:5173";
const userDataDir = await mkdtemp(path.join(os.tmpdir(), "huduma-auth-e2e-"));
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5173", "--strictPort"], {
  env: { ...process.env, VITE_FIREBASE_EMULATOR: "true" }, stdio: ["ignore", "pipe", "pipe"],
});
let browserContext;
let page;
const phone = `067${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
const password = `AuthTest-${Math.random().toString(36).slice(2, 10)}!`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Vite exited with code ${server.exitCode}`);
    try { const response = await fetch(appUrl); if (response.ok) return; } catch { /* server is starting */ }
    await wait(300);
  }
  throw new Error("Vite did not become ready within 60 seconds.");
}
async function register(page, number) {
  await page.getByRole("button", { name: "Ingia / Jisajili", exact: true }).click();
  await page.getByRole("button", { name: "Jisajili", exact: true }).click();
  await page.getByLabel("Jina la kwanza").fill("AuthTest");
  await page.getByLabel("Jina la mwisho").fill("E2E");
  await page.getByLabel("Namba ya simu").fill(number);
  await page.getByPlaceholder("Password", { exact: true }).fill(password);
  await page.getByPlaceholder("Thibitisha password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "TENGENEZA AKAUNTI" }).click();
}
async function logout(page) {
  await page.goto(`${appUrl}/account`);
  await page.getByRole("button", { name: "Toka kwenye akaunti" }).click();
  await page.getByRole("button", { name: "Ingia / Jisajili", exact: true }).waitFor({ state: "visible" });
}

try {
  await waitForServer();
  // Use only isolated emulator project `huduma-za-mtandaoni-b1c0c`; delete all test identities between runs.
  const reset = await fetch("http://127.0.0.1:9099/emulator/v1/projects/huduma-za-mtandaoni-b1c0c/accounts", { method: "DELETE" });
  if (!reset.ok) throw new Error(`Auth Emulator reset failed (${reset.status}). Is project huduma-za-mtandaoni-b1c0c running?`);

  const launchOptions = { headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] };
  browserContext = await chromium.launchPersistentContext(userDataDir, launchOptions);
  page = browserContext.pages()[0] ?? await browserContext.newPage();
  page.setDefaultTimeout(15_000);
  await page.goto(appUrl);

  // Register using local format.
  await register(page, phone);
  await page.locator(".auth-modal").waitFor({ state: "detached" });
  await page.locator(".header-user").waitFor({ state: "visible" });
  assert.match(await page.locator(".header-user").innerText(), /AuthTest/);
  console.log("PASS 1: register with a new Tanzania phone number");

  // Sign out, then verify a differently formatted version resolves to the same Firebase Auth identity.
  await logout(page);
  const groupedPhone = `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`;
  await register(page, groupedPhone);
  await page.getByRole("alert").getByText("Namba hii tayari imesajiliwa. Tafadhali ingia kwenye akaunti yako.", { exact: true }).waitFor({ state: "visible" });
  console.log("PASS 2: reject duplicate phone despite different formatting");

  // Login using the international prefix for that same local number.
  await page.getByRole("button", { name: "Ingia", exact: true }).click();
  await page.getByLabel("Namba ya simu").fill(`+255${phone.slice(1)}`);
  await page.getByPlaceholder("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "INGIA", exact: true }).click();
  await page.locator(".auth-modal").waitFor({ state: "detached" });
  await page.locator(".header-user").waitFor({ state: "visible" });
  console.log("PASS 3: login using +255 phone format and password");

  await page.reload();
  await page.locator(".header-user").waitFor({ state: "visible" });
  console.log("PASS 4: session persists after refresh");

  await page.locator(".portal-sidebar-wrap").getByRole("link", { name: "Chat", exact: true }).click();
  await page.locator(".header-user").waitFor({ state: "visible" });
  await page.locator(".portal-sidebar-wrap").getByRole("link", { name: "Huduma zote", exact: true }).click();
  await page.locator(".header-user").waitFor({ state: "visible" });
  console.log("PASS 5: session persists across navigation");

  // Closing and reopening the Chromium profile verifies Firebase browser-local persistence.
  await browserContext.close();
  browserContext = await chromium.launchPersistentContext(userDataDir, launchOptions);
  page = browserContext.pages()[0] ?? await browserContext.newPage();
  page.setDefaultTimeout(15_000);
  await page.goto(appUrl);
  await page.locator(".header-user").waitFor({ state: "visible", timeout: 20_000 });
  console.log("PASS 6: session persists after closing/reopening the browser profile");

  await logout(page);
  await page.reload();
  await page.getByRole("button", { name: "Ingia / Jisajili", exact: true }).waitFor({ state: "visible" });
  console.log("PASS 7: logout clears session across reload");
  console.log("AUTH_EMULATOR_E2E_OK");
} catch (error) {
  console.error("E2E_CURRENT_URL", page?.url());
  console.error("E2E_HEADER_TEXT", await page?.locator(".header-actions").innerText().catch(() => "<missing>") ?? "<missing>");
  const authError = await page?.locator(".auth-error-alert").innerText().catch(() => "") ?? "";
  if (authError) console.error("AUTH_MODAL_ERROR", authError);
  console.error("AUTH_EMULATOR_E2E_FAILED", error?.stack ?? error);
  process.exitCode = 1;
} finally {
  await browserContext?.close().catch(() => undefined);
  server.kill("SIGTERM");
  await rm(userDataDir, { recursive: true, force: true });
}
