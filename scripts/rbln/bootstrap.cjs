const { spawnSync } = require("node:child_process");
const { homedir } = require("node:os");
const process = require("node:process");
const { withSession, login } = require("./browser-session.cjs");

async function main() {
  if (process.env.SMTP_MODE !== "capture") throw new Error("Bootstrap requires SMTP capture");
  const reader = `${homedir()}/.config/infisical/leer.py`;
  const keyExists =
    spawnSync("python3", [reader, "RBLN", "/cal", "CAL_API_KEY_CRM", "--", "true"], {
      stdio: "ignore",
    }).status === 0;
  await withSession("P-05 bootstrap: single account, profile and CRM API key through UI", async (session) => {
    const { page, context, base } = session;
    await page.goto(`${base}/auth/setup`);
    const username = page.locator('input[name="username"]');
    if (await username.count()) {
      await username.fill("giuli");
      await page.locator('input[name="full_name"]').fill("Giuliana");
      await page.locator('input[name="email_address"]').fill(process.env.CAL_ADMIN_EMAIL);
      await page.locator('input[name="password"]').fill(process.env.CAL_ADMIN_INITIAL_PASSWORD);
      const created = page.waitForResponse(
        (r) => r.url().endsWith("/api/auth/setup") && r.request().method() === "POST"
      );
      await page.locator('#wizard-step-1 button[type="submit"]').click();
      if (!(await created).ok()) throw new Error("Setup failed");
    }
    if (!(await login(session)).authenticated) throw new Error("Bootstrap login failed");
    const profile = await context.request.post(`${base}/api/trpc/me/updateProfile`, {
      data: {
        json: {
          username: "giuli",
          name: "Giuliana",
          locale: "es",
          timeZone: "America/Asuncion",
          timeFormat: 24,
          hideBranding: true,
          completedOnboarding: true,
          allowDynamicBooking: false,
          allowSEOIndexing: false,
          receiveMonthlyDigestEmail: false,
        },
      },
    });
    if (!profile.ok() || (await profile.json()).error) throw new Error("Profile update rejected");
    if (keyExists) return;
    await page.goto(`${base}/settings/developer/api-keys`);
    await page
      .getByRole("button", { name: /^(Add|Añadir|Agregar)$/ })
      .first()
      .click();
    await page.locator('input[name="note"]').fill("RBLN CRM cal-booking");
    await page.getByRole("switch").check();
    await page.locator('[role="dialog"] button[type="submit"]').click();
    const code = page.locator('[role="dialog"] code');
    await code.waitFor();
    const key = (await code.textContent()).trim();
    if (!/^cal_[a-zA-Z0-9_-]+$/.test(key)) throw new Error("Unexpected API key format");
    const saved = spawnSync(
      "python3",
      [`${homedir()}/.config/infisical/cargar.py`, "RBLN", "/cal", "CAL_API_KEY_CRM"],
      {
        input: key,
        encoding: "utf8",
        stdio: ["pipe", "ignore", "ignore"],
      }
    );
    if (saved.status !== 0) throw new Error("API key storage failed; do not create another key");
    console.log("API key stored: RBLN /cal CAL_API_KEY_CRM");
  });
}

main().catch(() => {
  console.error("Bootstrap failed; details withheld. Inspect sanitized evidence.");
  process.exitCode = 1;
});
