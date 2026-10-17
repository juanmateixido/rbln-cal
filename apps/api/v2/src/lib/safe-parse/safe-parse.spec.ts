import { Logger } from "@nestjs/common";
import { z } from "zod";
import { safeParse } from "./safe-parse";

describe("safeParse log privacy", () => {
  afterEach(() => jest.restoreAllMocks());

  it("keeps input and issue markers out of the logger and preserves the fallback", () => {
    const logger = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const schema = z.object({ name: z.literal("allowed") }).describe("FICTITIOUS-SCHEMA");
    const fallback = { name: "allowed" as const };

    expect(safeParse(schema, { name: "FICTITIOUS-PATIENT" }, fallback)).toBe(fallback);
    expect(logger).toHaveBeenCalledWith("Zod parsing failed", { codes: ["invalid_literal"] });
    expect(JSON.stringify(logger.mock.calls)).not.toContain("FICTITIOUS");
  });

  it("preserves parsed data and is silent on success", () => {
    const logger = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    expect(safeParse(z.string().trim(), " abc ", "")).toBe("abc");
    expect(logger).not.toHaveBeenCalled();
  });

  it("preserves the fallback and silence with logError=false", () => {
    const logger = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    expect(safeParse(z.number(), "FICTITIOUS-PATIENT", 42, false)).toBe(42);
    expect(logger).not.toHaveBeenCalled();
  });
});
