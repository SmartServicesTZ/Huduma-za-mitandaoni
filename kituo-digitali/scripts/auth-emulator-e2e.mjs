import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

const appUrl = "http://127.0.0.1:5173";
const userDataDir = await mkdtemp(path.join(os.tmpdir(), "huduma-auth-e2e-"));
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5173", "--strictPort"], {
  env: { ...process.env, VITE_FIREBASE_EMULATOR: "true" }, stdio: ["ignore", "pipe", "pipe"],
});
let browserContext;
let page;
let rulesEnv;
let registeredUid;
let passwordChangeMockCalls = 0;
let workerMockError = "";
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

function tokenUid(authorization) {
  const token = /^Bearer (.+)$/.exec(authorization ?? "")?.[1];
  if (!token) throw new Error("Worker test route received no Firebase ID token.");
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  return String(payload.sub ?? payload.user_id ?? "");
}

async function installWorkerTestRoutes(context) {
  await context.route("**/call/claimRegistrationPhone", async (route) => {
    const body = route.request().postDataJSON();
    const uid = tokenUid(route.request().headers().authorization);
    const phone = body?.data?.phone;
    if (typeof phone !== "string" || !uid) return route.fulfill({ status: 400, body: "invalid test request" });
    registeredUid = uid;
    await rulesEnv.withSecurityRulesDisabled(async (testContext) => {
      await setDoc(doc(testContext.firestore(), "phoneRegistry", phone), { uid, phone, createdAt: serverTimestamp() });
    });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { ok: true } }) });
  });
  await context.route("**/call/changeOwnPassword", async (route) => {
    if (!registeredUid) return route.fulfill({ status: 400, body: "missing test user" });
    try {
      await rulesEnv.withSecurityRulesDisabled(async (testContext) => {
        await updateDoc(doc(testContext.firestore(), "users", registeredUid), { mustChangePassword: false, updatedAt: serverTimestamp() });
      });
      passwordChangeMockCalls += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { ok: true } }) });
    } catch (error) {
      workerMockError = String(error?.message ?? error);
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "internal", message: "Worker test mock failed." } }) });
    }
  });
}

try {
  await waitForServer();
  // Use only isolated emulator project `huduma-za-mtandaoni-b1c0c`; delete all test identities between runs.
  const reset = await fetch("http://127.0.0.1:9099/emulator/v1/projects/huduma-za-mtandaoni-b1c0c/accounts", { method: "DELETE" });
  if (!reset.ok) throw new Error(`Auth Emulator reset failed (${reset.status}). Is project huduma-za-mtandaoni-b1c0c running?`);
  rulesEnv = await initializeTestEnvironment({ projectId: "huduma-za-mtandaoni-b1c0c", firestore: { host: "127.0.0.1", port: 8080 } });

  const launchOptions = { headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] };
  browserContext = await chromium.launchPersistentContext(userDataDir, launchOptions);
  await installWorkerTestRoutes(browserContext);
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

  await page.goto(`${appUrl}/account`);
  const bio = `E2E profile ${Date.now()}`;
  await page.waitForFunction(() => { const field = document.querySelector(".profile-form textarea"); return field instanceof HTMLTextAreaElement && !field.disabled; });
  await page.locator(".profile-form textarea").fill(bio);
  assert.equal(await page.locator(".profile-form textarea").inputValue(), bio);
  await page.getByRole("button", { name: /Hifadhi wasifu/ }).click();
  await page.getByText("Wasifu wako umehifadhiwa.").waitFor({ state: "visible" });
  await page.reload();
  await page.locator(".profile-form textarea").waitFor({ state: "visible" });
  await page.waitForFunction((expected) => document.querySelector(".profile-form textarea")?.value === expected, bio);
  console.log("PASS 4: editable profile bio is stored in Firestore and survives reload");

  await page.goto(`${appUrl}/chat`);
  const originalMessage = `CHAT-E2E-${Date.now()}`;
  const editedMessage = `${originalMessage}-EDITED`;
  await page.getByPlaceholder("Andika ujumbe wa jumuiya…").fill(originalMessage);
  await page.getByRole("button", { name: "Tuma ujumbe", exact: true }).click();
  await page.getByText(originalMessage, { exact: true }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Hariri ujumbe", exact: true }).click();
  await page.locator(".chat-edit-box textarea").fill(editedMessage);
  await page.getByRole("button", { name: "Hifadhi", exact: true }).click();
  await page.getByText(editedMessage, { exact: true }).waitFor({ state: "visible" });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Futa ujumbe", exact: true }).click();
  await page.getByText(editedMessage, { exact: true }).waitFor({ state: "detached" });
  console.log("PASS 5: public chat send, own-message edit, and delete");

  await page.reload();
  await page.locator(".header-user").waitFor({ state: "visible" });
  console.log("PASS 6: session persists after refresh");

  await page.locator(".portal-sidebar-wrap").getByRole("link", { name: "Chat", exact: true }).click();
  await page.locator(".header-user").waitFor({ state: "visible" });
  await page.locator(".portal-sidebar-wrap").getByRole("link", { name: "Huduma zote", exact: true }).click();
  await page.locator(".header-user").waitFor({ state: "visible" });
  console.log("PASS 7: session persists across navigation");

  // Closing and reopening the Chromium profile verifies Firebase browser-local persistence.
  await browserContext.close();
  browserContext = await chromium.launchPersistentContext(userDataDir, launchOptions);
  await installWorkerTestRoutes(browserContext);
  page = browserContext.pages()[0] ?? await browserContext.newPage();
  page.setDefaultTimeout(15_000);
  await page.goto(appUrl);
  await page.locator(".header-user").waitFor({ state: "visible", timeout: 20_000 });
  console.log("PASS 8: session persists after closing/reopening the browser profile");

  await rulesEnv.withSecurityRulesDisabled(async (testContext) => {
    await updateDoc(doc(testContext.firestore(), "users", registeredUid), { accessMode: "read_only", accountStatus: "active", allowedActions: [], restrictionReason: "E2E read-only restriction" });
  });
  await page.reload();
  await page.getByText(/Akaunti yako iko kwenye hali ya kusoma tu/).waitFor({ state: "visible" });
  console.log("PASS 9: read-only restriction is visible after auth refresh");

  await rulesEnv.withSecurityRulesDisabled(async (testContext) => {
    await updateDoc(doc(testContext.firestore(), "users", registeredUid), { accessMode: "denied", accountStatus: "blocked", restrictionReason: "E2E full access restriction", restrictionMessage: "Ujumbe maalum wa jaribio la kufungiwa." });
  });
  await page.reload();
  await page.getByRole("heading", { name: "Ufikiaji wa akaunti umezuiwa" }).waitFor({ state: "visible" });
  await page.getByText("E2E full access restriction", { exact: false }).waitFor({ state: "visible" });
  await page.getByText("Ujumbe maalum wa jaribio la kufungiwa.", { exact: true }).waitFor({ state: "visible" });
  await page.getByRole("link", { name: "0698232313" }).waitFor({ state: "visible" });
  console.log("PASS 10: full restriction blocks the portal and displays the custom message, reason and support contact");

  await rulesEnv.withSecurityRulesDisabled(async (testContext) => {
    await updateDoc(doc(testContext.firestore(), "users", registeredUid), { accessMode: "active", accountStatus: "active", allowedActions: [], restrictionReason: "", restrictionMessage: "" });
    await setDoc(doc(testContext.firestore(), "messages", "e2e-account-restriction"), {
      recipientId: registeredUid, subject: "Taarifa ya kufungiwa", body: "Ujumbe maalum wa arifa ya jaribio.", type: "accountRestriction", createdAt: serverTimestamp(),
    });
    await setDoc(doc(testContext.firestore(), "messages", "e2e-all-users-broadcast"), {
      recipientId: "", broadcast: true, subject: "Arifa kwa watumiaji wote", body: "Ujumbe wa jumla wa jaribio.", type: "adminMessage", createdAt: serverTimestamp(),
    });
  });
  await page.reload();
  await page.locator(".header-user").waitFor({ state: "visible" });
  await page.goto(`${appUrl}/account`);
  await page.getByText("Ujumbe maalum wa arifa ya jaribio.", { exact: true }).waitFor({ state: "visible" });
  await page.getByText("Ujumbe wa jumla wa jaribio.", { exact: true }).waitFor({ state: "visible" });
  console.log("PASS 11: account notification inbox displays personal and all-users broadcast messages");

  await rulesEnv.withSecurityRulesDisabled(async (testContext) => {
    await updateDoc(doc(testContext.firestore(), "users", registeredUid), { mustChangePassword: true });
  });
  await page.reload();
  await page.getByRole("heading", { name: "Weka password yako mpya" }).waitFor({ state: "visible" });
  const newPassword = `E2E-confirm-${Date.now()}!`;
  await page.locator(".password-gate input").nth(0).fill(newPassword);
  await page.locator(".password-gate input").nth(1).fill(newPassword);
  await page.getByRole("button", { name: "Weka password mpya", exact: true }).click();
  await page.getByRole("heading", { name: "Weka password yako mpya" }).waitFor({ state: "detached" });
  let updatedProfile;
  await rulesEnv.withSecurityRulesDisabled(async (testContext) => {
    updatedProfile = await getDoc(doc(testContext.firestore(), "users", registeredUid));
  });
  assert.equal(updatedProfile.data()?.mustChangePassword, false);
  assert.equal(Object.hasOwn(updatedProfile.data() ?? {}, "password"), false);
  console.log("PASS 12: forced-password gate completes once and does not save password to profile");

  await logout(page);
  await page.reload();
  await page.getByRole("button", { name: "Ingia / Jisajili", exact: true }).waitFor({ state: "visible" });
  console.log("PASS 13: logout clears session across reload");
  console.log("AUTH_EMULATOR_E2E_OK");
} catch (error) {
  console.error("E2E_CURRENT_URL", page?.url());
  console.error("E2E_HEADER_TEXT", await page?.locator(".header-actions").innerText().catch(() => "<missing>") ?? "<missing>");
  const authError = await page?.locator(".auth-error-alert").innerText().catch(() => "") ?? "";
  if (authError) console.error("AUTH_MODAL_ERROR", authError);
  if (workerMockError) console.error("PASSWORD_WORKER_MOCK_ERROR", workerMockError);
  console.error("PASSWORD_WORKER_MOCK_CALLS", passwordChangeMockCalls);
  console.error("AUTH_EMULATOR_E2E_FAILED", error?.stack ?? error);
  process.exitCode = 1;
} finally {
  await browserContext?.close().catch(() => undefined);
  await rulesEnv?.cleanup().catch(() => undefined);
  server.kill("SIGTERM");
  await rm(userDataDir, { recursive: true, force: true });
}
