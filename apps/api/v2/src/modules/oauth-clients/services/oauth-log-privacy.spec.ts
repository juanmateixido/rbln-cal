import { HttpService } from "@nestjs/axios";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { OAuthFlowService } from "./oauth-flow.service";
import { ConferencingController } from "@/modules/conferencing/controllers/conferencing.controller";
import { ConferencingService } from "@/modules/conferencing/services/conferencing.service";
import { OAuthClientRepository } from "@/modules/oauth-clients/oauth-client.repository";
import { RedisService } from "@/modules/redis/redis.service";
import { StripeController } from "@/modules/stripe/controllers/stripe.controller";
import { StripeService } from "@/modules/stripe/stripe.service";
import { TokensRepository } from "@/modules/tokens/tokens.repository";

jest.mock("@/modules/conferencing/services/conferencing.service", () => ({ ConferencingService: class {} }));
jest.mock("@/modules/stripe/stripe.service", () => ({ StripeService: class {} }));
jest.mock("@/modules/tokens/tokens.repository", () => ({ TokensRepository: class {} }));
jest.mock("@/modules/users/users.repository", () => ({}));
jest.mock("@/modules/oauth-clients/oauth-client.repository", () => ({ OAuthClientRepository: class {} }));
jest.mock("@/modules/redis/redis.service", () => ({ RedisService: class {} }));
jest.mock("@/modules/auth/guards/api-auth/api-auth.guard", () => ({ ApiAuthGuard: class {} }));
jest.mock("@/modules/conferencing/outputs/get-conferencing-apps-oauth-url", () => ({}));
jest.mock("@/modules/conferencing/outputs/get-conferencing-apps.output", () => ({}));
jest.mock("@/modules/conferencing/outputs/get-default-conferencing-app.output", () => ({}));
jest.mock("@/modules/conferencing/outputs/set-default-conferencing-app.output", () => ({}));
jest.mock("@/modules/stripe/outputs/stripe.output", () => ({}));
jest.mock("@/modules/oauth-clients/controllers/oauth-flow/responses/KeysResponse.dto", () => ({}));
jest.mock("@calcom/platform-constants", () => ({ API_VERSIONS: ["2024-08-13"] }), { virtual: true });
jest.mock("express", () => ({}), { virtual: true });

describe("OAuth log privacy", () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    "conferencing",
    "stripe",
  ])("keeps %s callback markers out of logs and preserves the redirect", async (kind) => {
    const logger = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const module = await Test.createTestingModule({
      controllers: [ConferencingController, StripeController],
      providers: [
        { provide: ConferencingService, useValue: {} },
        { provide: StripeService, useValue: {} },
        { provide: TokensRepository, useValue: { getAccessTokenOwnerId: jest.fn().mockResolvedValue(7) } },
        { provide: ConfigService, useValue: {} },
        { provide: HttpService, useValue: {} },
      ],
    }).compile();
    const state = JSON.stringify({
      accessToken: "FICTITIOUS-ACCESS",
      onErrorReturnTo: "https://example.invalid/fallback",
    });
    try {
      const result =
        kind === "conferencing"
          ? await module
              .get(ConferencingController)
              .save(state, "zoom", "FICTITIOUS-CODE", "FICTITIOUS-ERROR", "FICTITIOUS-DESCRIPTION")
          : await module
              .get(StripeController)
              .save(state, "FICTITIOUS-CODE", "FICTITIOUS-ERROR", "FICTITIOUS-DESCRIPTION");
      expect(result).toEqual({ url: "https://example.invalid/fallback" });
      expect(logger.mock.calls.length + consoleError.mock.calls.length).toBe(1);
      const logged = JSON.stringify([logger.mock.calls, consoleError.mock.calls]);
      expect(logged).not.toContain("FICTITIOUS");
      expect(logged).toContain("OAuth callback failed");
    } finally {
      await module.close();
    }
  });

  it("keeps Redis command and error markers out of logs and preserves DB fallback", async () => {
    const logger = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const error = Object.assign(new Error("FICTITIOUS-ERROR"), {
      code: "ECONNRESET",
      command: { name: "hmset", args: ["act_FICTITIOUS-ACCESS"] },
    });
    const hmset = jest.fn().mockRejectedValue(error);
    const module = await Test.createTestingModule({
      providers: [
        OAuthFlowService,
        {
          provide: TokensRepository,
          useValue: {
            getAccessTokenOwnerId: jest.fn().mockResolvedValue(7),
            getAccessTokenExpiryDate: jest.fn().mockResolvedValue(new Date("2030-01-01T00:00:00Z")),
          },
        },
        { provide: OAuthClientRepository, useValue: {} },
        { provide: RedisService, useValue: { redis: { hmset } } },
      ],
    }).compile();
    try {
      await expect(
        module.get(OAuthFlowService).propagateAccessToken("FICTITIOUS-ACCESS")
      ).resolves.toBeUndefined();
      expect(hmset).toHaveBeenCalledWith("act_FICTITIOUS-ACCESS", expect.objectContaining({ ownerId: 7 }));
      expect(logger).toHaveBeenCalledWith("Access Token Propagation Failed, falling back to DB...", {
        errorType: "Error",
        code: "ECONNRESET",
      });
      expect(JSON.stringify(logger.mock.calls)).not.toContain("FICTITIOUS");
    } finally {
      await module.close();
    }
  });
});
