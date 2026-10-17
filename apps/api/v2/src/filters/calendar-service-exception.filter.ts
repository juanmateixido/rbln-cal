import { ERROR_STATUS } from "@calcom/platform-constants";
import {
  CalendarAppDelegationCredentialClientIdNotAuthorizedError,
  CalendarAppDelegationCredentialConfigurationError,
  CalendarAppDelegationCredentialError,
  CalendarAppDelegationCredentialInvalidGrantError,
  CalendarAppDelegationCredentialNotSetupError,
  CalendarAppError,
} from "@calcom/platform-libraries/app-store";
import { Response } from "@calcom/platform-types";
import { ArgumentsHost, Catch, ExceptionFilter, Logger } from "@nestjs/common";
import { Request } from "express";
import { extractUserContext } from "@/lib/extract-user-context";
import { filterReqHeaders } from "@/lib/filterReqHeaders";

type CalendarError =
  | CalendarAppError
  | CalendarAppDelegationCredentialInvalidGrantError
  | CalendarAppDelegationCredentialError
  | CalendarAppDelegationCredentialConfigurationError
  | CalendarAppDelegationCredentialNotSetupError
  | CalendarAppDelegationCredentialClientIdNotAuthorizedError;
@Catch(
  CalendarAppError,
  CalendarAppDelegationCredentialInvalidGrantError,
  CalendarAppDelegationCredentialError,
  CalendarAppDelegationCredentialConfigurationError,
  CalendarAppDelegationCredentialClientIdNotAuthorizedError,
  CalendarAppDelegationCredentialNotSetupError
)
export class CalendarServiceExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("CalendarServiceExceptionFilter");

  catch(exception: CalendarError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId =
      request.headers["X-Request-Id"] ?? request.headers["x-request-id"] ?? "unknown-request-id";
    response.setHeader("X-Request-Id", (request.headers["X-Request-Id"] ?? "unknown-request-id").toString());

    const { userEmail: _userEmail, ...userContext } = extractUserContext(request);
    this.logger.error("Calendar Service Exception Filter", {
      errorType: exception.name,
      statusCode: 400,
      headers: filterReqHeaders(request.headers),
      url: request.path,
      method: request.method,
      requestId,
      ...userContext,
    });

    response.status(400).json({
      status: ERROR_STATUS,
      timestamp: new Date().toISOString(),
      path: request.url,
      error: { code: exception.name, message: exception.message },
    });
  }
}
