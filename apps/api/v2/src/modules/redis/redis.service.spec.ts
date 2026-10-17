import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "./redis.service";
import type { AppConfig } from "@/config/type";

jest.mock(
  "ioredis",
  () => ({
    Redis: jest.fn().mockImplementation(() => ({ on: jest.fn(), quit: jest.fn() })),
  }),
  { virtual: true }
);

describe("Redis shutdown log privacy", () => {
  afterEach(() => jest.restoreAllMocks());

  it("keeps AUTH password and error markers out of shutdown logs", async () => {
    const service = new RedisService(
      new ConfigService<AppConfig>({ db: { redisUrl: "redis://127.0.0.1:6379" } })
    );
    const error = Object.assign(new Error("WRONGPASS FICTITIOUS-AUTH-MESSAGE"), {
      name: "ReplyError",
      code: "WRONGPASS",
      command: { name: "auth", args: ["default", "FICTITIOUS-REDIS-PASSWORD"] },
    });
    const quit = jest.spyOn(service.redis, "quit").mockRejectedValue(error);
    const logger = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    expect(quit).toHaveBeenCalledTimes(1);
    expect(logger).toHaveBeenCalledWith("Redis shutdown failed", {
      errorType: "ReplyError",
      code: "WRONGPASS",
    });
    expect(JSON.stringify(logger.mock.calls)).not.toContain("FICTITIOUS");
    expect(JSON.stringify(logger.mock.calls)).not.toContain("command");
  });
});
