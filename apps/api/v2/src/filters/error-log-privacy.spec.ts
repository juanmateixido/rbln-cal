import { TRPCError } from "@calcom/platform-libraries";
import { CalendarAppError } from "@calcom/platform-libraries/app-store";
import { Prisma } from "@calcom/prisma/client";
import { HttpException, Logger } from "@nestjs/common";
import { ExecutionContextHost } from "@nestjs/core/helpers/execution-context-host";
import { createRequest, createResponse } from "node-mocks-http";
import { ZodError } from "zod";
import { CalendarServiceExceptionFilter } from "./calendar-service-exception.filter";
import { HttpExceptionFilter } from "./http-exception.filter";
import { PrismaExceptionFilter } from "./prisma-exception.filter";
import { TRPCExceptionFilter } from "./trpc-exception.filter";
import { ZodExceptionFilter } from "./zod-exception.filter";
import { OAuth2HttpException } from "@/modules/auth/oauth2/filters/oauth2-http.exception";
import { OAuth2HttpExceptionFilter } from "@/modules/auth/oauth2/filters/oauth2-http-exception.filter";

jest.mock("@/lib/extract-user-context", () => ({
  extractUserContext: () => ({ userId: "7", userEmail: "FICTITIOUS-PATIENT" }),
}));
jest.mock("@calcom/prisma/client", () => ({ Prisma: jest.requireActual("@prisma/client/runtime/library") }), {
  virtual: true,
});
jest.mock("@calcom/platform-libraries", () => ({ TRPCError: jest.requireActual("@trpc/server").TRPCError }), {
  virtual: true,
});
jest.mock(
  "@calcom/platform-libraries/app-store",
  () => jest.requireActual("../../../../../packages/lib/CalendarAppError"),
  { virtual: true }
);
jest.mock(
  "@calcom/platform-constants",
  () => ({
    ERROR_STATUS: "error",
    BAD_REQUEST: "BAD_REQUEST",
    CONFLICT: "CONFLICT",
    NOT_FOUND: "NOT_FOUND",
    INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  }),
  { virtual: true }
);

const message = "FICTITIOUS-ERROR?apiKey=FICTITIOUS-QUERY";
const oauthError = { error: "invalid_request", error_description: message };
const cases = [
  {
    name: "Http",
    status: 404,
    header: "unknown-request-id",
    body: { code: "HttpException", message, details: message },
    run: (host: ExecutionContextHost) =>
      new HttpExceptionFilter().catch(new HttpException(message, 404), host),
  },
  {
    name: "Prisma",
    status: 409,
    header: "unknown-request-id",
    body: { code: "CONFLICT", message: "Invalid Input: Trying to create a record that already exists." },
    run: (host: ExecutionContextHost) =>
      new PrismaExceptionFilter().catch(
        new Prisma.PrismaClientKnownRequestError(message, { code: "P2002", clientVersion: "test" }),
        host
      ),
  },
  {
    name: "TRPC",
    status: 400,
    header: "unknown-request-id",
    body: { code: "TRPCError", message },
    run: (host: ExecutionContextHost) =>
      new TRPCExceptionFilter().catch(new TRPCError({ code: "BAD_REQUEST", message }), host),
  },
  {
    name: "Zod",
    status: 400,
    header: "unknown-request-id",
    body: { code: "BAD_REQUEST", message: `name - ${message}, ` },
    run: (host: ExecutionContextHost) =>
      new ZodExceptionFilter().catch(new ZodError([{ code: "custom", path: ["name"], message }]), host),
  },
  {
    name: "CalendarService",
    status: 400,
    header: "unknown-request-id",
    body: { code: "CalendarAppError", message },
    run: (host: ExecutionContextHost) =>
      new CalendarServiceExceptionFilter().catch(new CalendarAppError(message), host),
  },
  {
    name: "OAuth2",
    status: 400,
    header: "privacy-request-id",
    body: oauthError,
    run: (host: ExecutionContextHost) =>
      new OAuth2HttpExceptionFilter().catch(new OAuth2HttpException(oauthError, 400), host),
  },
];

describe.each(cases)("$name filter", ({ name, run, status, header, body }) => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    "lowercase",
    "uppercase",
    "absent",
  ])("preserves anchor HTTP response with %s request id", (casing) => {
    const headers: Record<string, string> = {};
    if (casing !== "absent") headers[casing === "lowercase" ? "x-request-id" : "X-Request-Id"] = "test-id";
    const request = createRequest({ url: "/v2/privacy?apiKey=FICTITIOUS-QUERY" });
    request.headers = headers;
    const response = createResponse();
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    run(new ExecutionContextHost([request, response]));
    const acceptedCasing = name === "OAuth2" ? "lowercase" : "uppercase";
    expect(response.getHeader("X-Request-Id")).toBe(
      casing === acceptedCasing ? "test-id" : "unknown-request-id"
    );
    expect(response.statusCode).toBe(status);
    expect(name === "OAuth2" ? response._getJSONData() : response._getJSONData().error).toEqual(body);
    if (name !== "OAuth2") expect(response._getJSONData().path).toBe(request.url);
  });

  it("keeps all markers out of captured logs", () => {
    const request = createRequest({
      method: "POST",
      url: "/v2/privacy?apiKey=FICTITIOUS-QUERY",
      headers: { authorization: "Bearer FICTITIOUS-HEADER", "x-request-id": "privacy-request-id" },
      body: { apiKey: "FICTITIOUS-BODY", email: "FICTITIOUS-PATIENT" },
    });
    const response = createResponse();
    const logger = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    run(new ExecutionContextHost([request, response]));

    expect(logger).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.mock.calls)).not.toContain("FICTITIOUS");
    expect(JSON.stringify(logger.mock.calls)).toContain("privacy-request-id");
    expect(response.statusCode).toBe(status);
    expect(response.getHeader("X-Request-Id")).toBe(header);
    expect(name === "OAuth2" ? response._getJSONData() : response._getJSONData().error).toEqual(body);
    if (name !== "OAuth2") expect(response._getJSONData().path).toBe(request.url);
  });
});
