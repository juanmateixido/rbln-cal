/* No credentials: only read public pages and inject local assets in this browser. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const root = path.resolve(__dirname, "../..");
const out = path.resolve(process.argv[2] || path.join(root, "rbln/evidence/UI-01"));
const css = fs.readFileSync(path.join(root, "apps/web/styles/rbln-theme.css"), "utf8");
const fonts = path.join(root, "apps/web/fonts/rbln");
const fontShim = `
@font-face { font-family: 'RBLN Geist'; src: url('/__rbln_preview__/Geist-Variable.woff2'); font-weight: 100 900; font-display: swap; }
@font-face { font-family: 'RBLN Manrope'; src: url('/__rbln_preview__/Manrope-700.ttf'); font-weight: 700; font-display: swap; }
:root:root { --font-sans: 'RBLN Geist', system-ui; --font-cal: 'RBLN Manrope', system-ui; }`;

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const report = {
    at: new Date().toISOString(),
    cssSha256: crypto.createHash("sha256").update(css).digest("hex"),
    method: "Final CSS + local font shim; not a build or deployment",
    checks: [],
    blocked: [],
    errors: [],
    publicEvent: null,
  };
  try {
    for (const colorScheme of ["dark", "light"]) {
      const context = await browser.newContext({
        locale: "en-US",
        colorScheme,
        serviceWorkers: "block",
        deviceScaleFactor: 1,
      });
      await context.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
          report.blocked.push({ method: request.method(), path: url.pathname });
          return route.abort();
        }
        if (url.pathname.startsWith("/__rbln_preview__/")) {
          const name = url.pathname.split("/").pop();
          if (!["Geist-Variable.woff2", "Manrope-700.ttf"].includes(name)) return route.abort();
          return route.fulfill({
            contentType: name.endsWith("ttf") ? "font/ttf" : "font/woff2",
            body: fs.readFileSync(path.join(fonts, name)),
          });
        }
        return route.continue();
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => report.errors.push(error.message));
      const routes = [
        ["/giuli", "giuli"],
        ["/auth/login", "login"],
      ];
      for (const [route, name] of routes) {
        await page.setViewportSize({ width: 1440, height: 900 });
        const response = await page.goto(`https://agenda.rebelion.training${route}`, {
          waitUntil: "networkidle",
          timeout: 60000,
        });
        assert.equal(response.status(), 200);
        assert.equal(new URL(page.url()).pathname, route);
        await page.addStyleTag({ content: fontShim + css });
        await page.evaluate(async () => {
          await document.fonts.load('400 16px "RBLN Geist"');
          await document.fonts.load('700 24px "RBLN Manrope"');
          await document.fonts.ready;
        });
        if (name === "giuli") {
          const events = await page.locator("a[href]").evaluateAll((links) =>
            links
              .filter((a) => {
                const url = new URL(a.href);
                return (
                  url.origin === location.origin &&
                  url.pathname.startsWith("/giuli/") &&
                  a.getClientRects().length
                );
              })
              .map((a) => new URL(a.href).pathname)
          );
          if (events.length) {
            report.publicEvent = events[0];
            routes.push([events[0], "booking"]);
          }
        }
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
          await page.mouse.move(0, 0);
          const check = await page.evaluate(() => {
            const style = getComputedStyle(document.documentElement);
            return {
              width: innerWidth,
              scrollWidth: document.documentElement.scrollWidth,
              background: getComputedStyle(document.body).backgroundColor,
              bodyFont: getComputedStyle(document.body).fontFamily,
              geist: document.fonts.check('400 16px "RBLN Geist"'),
              manrope: document.fonts.check('700 24px "RBLN Manrope"'),
              headings: [...document.querySelectorAll("h1,h2,h3")].map((h) => ({
                font: getComputedStyle(h).fontFamily,
                weight: getComputedStyle(h).fontWeight,
              })),
              brand: style.getPropertyValue("--cal-brand").trim(),
              submit: [...document.querySelectorAll('[data-testid="login-form"] button[type="submit"]')].map(
                (b) => ({ background: getComputedStyle(b).backgroundColor, color: getComputedStyle(b).color })
              ),
            };
          });
          assert.equal(check.background, "rgb(10, 10, 18)");
          assert.ok(check.geist && check.manrope && check.bodyFont.includes("RBLN Geist"));
          assert.ok(check.headings.every((h) => h.font.includes("RBLN Manrope") && h.weight === "700"));
          assert.ok(check.scrollWidth <= width, "Horizontal overflow");
          for (const button of check.submit) {
            assert.equal(button.background, "rgb(255, 143, 208)");
            assert.equal(button.color, "rgb(5, 10, 23)");
          }
          if (colorScheme === "dark")
            await page.screenshot({
              path: path.join(out, `${name}-${width}.png`),
              fullPage: true,
              animations: "disabled",
            });
          if (process.env.AXE_PATH) {
            await page.addScriptTag({ path: process.env.AXE_PATH });
            const axe = await page.evaluate(async () => {
              const result = await window.axe.run(document, { runOnly: ["color-contrast"] });
              return {
                violations: result.violations.map((v) => ({
                  id: v.id,
                  nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
                })),
                incomplete: result.incomplete.map((v) => ({
                  id: v.id,
                  targets: v.nodes.map((n) => n.target),
                })),
              };
            });
            check.contrast = axe;
            assert.deepEqual(axe.violations, [], "Text contrast violations");
          }
          report.checks.push({ route, colorScheme, ...check });
        }
        // Prove that per-user inline branding cannot replace the instance palette.
        await page.evaluate(() => document.documentElement.style.setProperty("--cal-brand", "#000000"));
        const brand = await page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue("--cal-brand").trim()
        );
        assert.equal(brand, "#ff8fd0");
        report.checks.push({ route, colorScheme, inlineBrandOverride: brand });
        if (name === "login") {
          await page.locator("body").click({ position: { x: 0, y: 0 } });
          await page.keyboard.press("Tab");
          const focus = await page.evaluate(() => ({
            visible: document.activeElement.matches(":focus-visible"),
            color: getComputedStyle(document.activeElement).outlineColor,
            width: getComputedStyle(document.activeElement).outlineWidth,
          }));
          assert.equal(focus.visible, true);
          assert.equal(focus.color, "rgb(220, 255, 110)");
          assert.equal(focus.width, "2px");
          report.checks.push({ route, colorScheme, focus });
          if (colorScheme === "dark")
            await page.screenshot({
              path: path.join(out, "login-focus-390.png"),
              animations: "disabled",
              fullPage: true,
            });
        }
      }
      await context.close();
    }
    assert.deepEqual(report.errors, []);
  } finally {
    fs.writeFileSync(path.join(out, "verification.json"), JSON.stringify(report, null, 2) + "\n");
    await browser.close();
  }
  console.log(
    JSON.stringify({
      checks: report.checks.length,
      publicEvent: report.publicEvent,
      errors: report.errors,
      blocked: report.blocked,
      contrastViolations: report.checks.flatMap((c) => c.contrast?.violations || []),
    })
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
