import { Logger } from "@nestjs/common";
import type { ZodSchema } from "zod";

const logger = new Logger("safeParse");

export function safeParse<T>(schema: ZodSchema<T>, value: unknown, defaultValue: T, logError = true): T {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  } else {
    if (logError) {
      logger.error("Zod parsing failed", { codes: result.error.issues.map(({ code }) => code) });
    }

    return defaultValue;
  }
}
