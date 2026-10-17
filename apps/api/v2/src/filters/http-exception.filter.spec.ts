import { HttpException, Logger } from "@nestjs/common";
import { ExecutionContextHost } from "@nestjs/core/helpers/execution-context-host";
import { createRequest, createResponse } from "node-mocks-http";
import { HttpExceptionFilter } from "./http-exception.filter";

jest.mock("@/lib/extract-user-context", () => ({
  extractUserContext: () => ({ userId: "7", userEmail: "fictitious-patient@example.invalid" }),
}));

jest.mock("@calcom/platform-constants", () => ({ ERROR_STATUS: "error" }), { virtual: true });

describe("HttpExceptionFilter log privacy", () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ["header", "fictitious-header-key"],
    ["body", "fictitious-body-key"],
    ["query", "fictitious-query-key"],
  ])("keeps %s credentials out of the captured logger", (_point, forbidden) => {
    const request = createRequest({
      method: "POST",
      url: "/v2/privacy-probe?apiKey=fictitious-query-key",
      headers: { authorization: "Bearer fictitious-header-key", "x-request-id": "privacy-probe-id" },
      body: { apiKey: "fictitious-body-key", email: "fictitious-patient@example.invalid" },
    });
    const response = createResponse();
    const exception = new HttpException(`Cannot POST ${request.url}`, 404);
    const logger = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    new HttpExceptionFilter().catch(exception, new ExecutionContextHost([request, response]));

    expect(logger).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(logger.mock.calls);
    expect(logged).not.toContain(forbidden);
    expect(logged).not.toContain("fictitious-patient@example.invalid");
    expect(logged).toContain("privacy-probe-id");
    expect(logged).toContain("/v2/privacy-probe");
    expect(response.statusCode).toBe(404);
    expect(response.getHeader("X-Request-Id")).toBe("unknown-request-id");
    expect(response._getJSONData().error.message).toBe(exception.message);
    expect(response._getJSONData().path).toBe(request.url);
  });
});
