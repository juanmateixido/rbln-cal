import { filterReqHeaders } from "./filterReqHeaders";

describe("filterReqHeaders", () => {
  it.each([
    "authorization",
    "Authorization",
    "aUtHoRiZaTiOn",
    "cookie",
    "Cookie",
    "x-cal-secret-key",
    "X-Cal-Secret-Key",
    "x-api-key",
    "X-API-Key",
    "x-client-secret",
    "X-Client-Secret",
    "x-access-token",
    "X-Access-Token",
  ])("redacts %s without changing the request", (name) => {
    const headers = Object.freeze({ [name]: "fictitious-test-value" });

    const filtered = filterReqHeaders(headers);

    expect(filtered[name]).toBe("[REDACTED]");
    expect(JSON.stringify(filtered)).not.toContain("fictitious-test-value");
    expect(headers[name]).toBe("fictitious-test-value");
  });

  it.each(["content-type", "Content-Type"])("preserves harmless %s", (name) => {
    expect(filterReqHeaders({ [name]: "application/json" })["Content-Type"]).toBe("application/json");
  });

  it("keeps the existing allowlist and does not invent absent credentials", () => {
    const filtered = filterReqHeaders({ "x-unlisted-header": "unlisted-value" });

    expect(filtered["x-unlisted-header"]).toBeUndefined();
    expect(JSON.stringify(filtered)).not.toContain("[REDACTED]");
  });

  it("redacts arrays and duplicate casings without retaining any credential", () => {
    const headers = {
      authorization: "fictitious-lowercase",
      Authorization: "fictitious-uppercase",
      Cookie: ["fictitious-cookie-one", "fictitious-cookie-two"],
      "X-Access-Token": ["fictitious-token-one", "fictitious-token-two"],
    };
    const filtered = filterReqHeaders(headers);

    for (const name of Object.keys(headers)) expect(filtered[name]).toBe("[REDACTED]");
    expect(JSON.stringify(filtered)).not.toContain("fictitious-");
    expect(headers.Cookie).toEqual(["fictitious-cookie-one", "fictitious-cookie-two"]);
  });

  it.each(["x-cal-client-id", "X-Cal-Client-Id"])("omits unused OAuth header %s", (name) => {
    expect(JSON.stringify(filterReqHeaders({ [name]: "fictitious-client" }))).not.toContain(
      "fictitious-client"
    );
  });
});
