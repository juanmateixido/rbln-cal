const { withSession, login, audit } = require("./browser-session.cjs");
const process = require("node:process");

async function main() {
  const action = process.argv[2];
  if (
    process.env.CAL_GO_APPROVED !== "yes" ||
    process.env.SMTP_MODE !== "mailgun" ||
    process.env.NEXT_PUBLIC_WEBAPP_URL !== "https://agenda.rebelion.training"
  ) {
    throw new Error("GO, canonical domain and real SMTP are required");
  }
  if (action === "request-reset") {
    await withSession(
      "GO: verify bootstrap credential and request six-hour reset with Giuli present",
      async (session) => {
        if (!(await login(session)).authenticated)
          throw new Error("Bootstrap credential not valid before reset");
        await session.page.goto(`${session.base}/auth/forgot-password`);
        await session.page.locator('input[name="email"]').fill(process.env.CAL_ADMIN_EMAIL);
        const sent = session.page.waitForResponse(
          (r) => r.url().endsWith("/api/auth/forgot-password") && r.request().method() === "POST"
        );
        await session.page.locator('button[type="submit"]').click();
        if ((await sent).status() !== 201) throw new Error("Reset request failed");
        audit({
          event: "reset_requested",
          purpose: "GO with Giuli reading her inbox; one-use link expires in six hours",
        });
      }
    );
  } else if (action === "verify-reset") {
    await withSession("GO: prove initial password no longer opens a session", async (session) => {
      const result = await login(session);
      if (result.authenticated || !result.rejected)
        throw new Error("Initial credential was not explicitly rejected");
      audit({
        event: "initial_password_rejected",
        verified: true,
        purpose: "T14e rotation proof; vault may retire initial credential",
      });
      console.log("Initial password explicitly rejected; no authenticated session. T14e evidence recorded.");
    });
  } else if (action === "verify-calendar") {
    const response = await fetch(`${process.env.CAL_API_URL}/calendars`, {
      headers: { Authorization: `Bearer ${process.env.CAL_API_KEY}`, "cal-api-version": "2024-06-11" },
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error("Calendar lookup failed");
    const { data } = await response.json();
    const calendars = data.connectedCalendars
      .filter((c) => c.integration.type === "google_calendar")
      .flatMap((c) => c.calendars || []);
    if (
      !calendars.some(
        (c) =>
          c.name === "Pacientes" &&
          !c.readOnly &&
          c.isSelected &&
          c.externalId === data.destinationCalendar?.externalId
      )
    )
      throw new Error("Pacientes is not the selected writable destination");
    audit({
      event: "calendar_verified",
      verified: true,
      purpose: "Google Calendar Pacientes selected for conflicts and destination",
    });
    console.log("Google Calendar Pacientes verified; identifiers withheld.");
  } else throw new Error("Unknown GO action");
}

main().catch(() => {
  console.error("GO verification failed; wizard must not finish. Details withheld.");
  process.exitCode = 1;
});
