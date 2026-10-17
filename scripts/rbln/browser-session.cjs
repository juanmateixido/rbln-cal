const { appendFileSync, mkdirSync } = require("node:fs");
const { resolve } = require("node:path");
const process = require("node:process");

const evidence = resolve(__dirname, "../../rbln/evidence/agent-sessions.jsonl");
const thread = process.env.CAL_AGENT_THREAD || "mcp:24a58046-c320-41d1-8c3f-c397d443a597";
function audit(record) {
  mkdirSync(resolve(__dirname, "../../rbln/evidence"), { recursive: true });
  appendFileSync(evidence, `${JSON.stringify({ at: new Date().toISOString(), thread, ...record })}\n`);
}

async function closeSession(context, browser, base, sessionId, purpose) {
  let verified = false;
  try {
    const csrfResponse = await context.request.get(`${base}/api/auth/csrf`);
    if (!csrfResponse.ok()) throw new Error("CSRF unavailable");
    const { csrfToken } = await csrfResponse.json();
    const response = await context.request.post(`${base}/api/auth/signout`, {
      form: { csrfToken, callbackUrl: `${base}/auth/login`, json: "true" },
    });
    if (!response.ok()) throw new Error("Signout rejected");
    const check = await context.request.get(`${base}/api/auth/session`);
    verified = check.ok() && !(await check.json()).user;
  } catch {
    verified = false;
  }
  const cleared = await context.clearCookies().then(
    () => true,
    () => false
  );
  const closed = await context.close().then(
    () => true,
    () => false
  );
  const stopped = await browser.close().then(
    () => true,
    () => false
  );
  audit({
    sessionId,
    purpose,
    event: "closed",
    verified: verified && cleared && closed && stopped,
    logoutVerified: verified,
    cookiesCleared: cleared,
    contextClosed: closed,
    browserClosed: stopped,
    method: "NextAuth POST signout; GET session must have no user; clear cookies; close context/browser",
  });
  return verified && cleared && closed && stopped;
}

async function withSession(purpose, task) {
  const base = process.env.NEXT_PUBLIC_WEBAPP_URL;
  if (
    !["https://cal-web-production-6281.up.railway.app", "https://agenda.rebelion.training"].includes(base)
  ) {
    throw new Error("Unapproved Cal origin");
  }
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "es-PY", timezoneId: "America/Asuncion" });
  context.setDefaultTimeout(30000);
  const page = await context.newPage();
  const sessionId = require("node:crypto").randomUUID();
  audit({ sessionId, purpose, event: "opened", method: "isolated Playwright context; no persisted storage" });
  let closed = false;
  let result;
  let failure;
  try {
    result = await task({ page, context, base });
  } catch (error) {
    failure = error;
  } finally {
    closed = await closeSession(context, browser, base, sessionId, purpose);
  }
  if (failure) throw failure;
  if (!closed) throw new Error("Session closure could not be verified");
  return result;
}

async function login({ page, context, base }) {
  await page.goto(`${base}/auth/login`);
  await page.locator('input[name="email"]').fill(process.env.CAL_ADMIN_EMAIL);
  await page.locator('input[name="password"]').fill(process.env.CAL_ADMIN_INITIAL_PASSWORD);
  const response = page.waitForResponse((r) => r.url().includes("/api/auth/callback/credentials"));
  await page.locator('[data-testid="login-form"] button[type="submit"]').click();
  const result = await response;
  const payload = await result.json();
  const session = await (await context.request.get(`${base}/api/auth/session`)).json();
  return {
    authenticated: session.user?.email?.toLowerCase() === process.env.CAL_ADMIN_EMAIL.toLowerCase(),
    rejected:
      typeof payload.url === "string" && /[?&]error=incorrect-(?:email-)?password(?:&|$)/.test(payload.url),
  };
}

module.exports = { withSession, login, audit };
