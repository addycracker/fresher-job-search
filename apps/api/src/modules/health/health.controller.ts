import { Controller, Get, HttpStatus, Inject, Req } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import { ApiTags } from "@nestjs/swagger";
import {
  API_ROUTES,
  API_VERSIONS,
  ERROR_CODES,
  RESPONSE_MESSAGES,
  VALIDATION_LIMITS,
} from "../../shared/constants/index.js";
import { ApiException } from "../../shared/exceptions/api.exception.js";
import { ResponseHandler } from "../../shared/handlers/response.handler.js";
import { ApiPublicResponse } from "../../shared/handlers/api-response.decorator.js";
import type { ApiRequest } from "../../shared/logger/request-context.js";
import type { HealthStatus } from "../../../../../packages/contracts/src/index.js";

@ApiTags(API_ROUTES.HEALTH)
@Controller(`${API_VERSIONS.V1}/${API_ROUTES.HEALTH}`)
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(ResponseHandler) private readonly responses: ResponseHandler,
  ) {}
  @Get()
  @ApiPublicResponse(RESPONSE_MESSAGES.HEALTHY)
  health(@Req() request: ApiRequest) {
    return this.responses.success<HealthStatus>(
      {
        status: "ok",
        database:
          this.connection.readyState === 1 ? "connected" : "disconnected",
      },
      RESPONSE_MESSAGES.HEALTHY,
      request,
    );
  }
  @Get(API_ROUTES.READY)
  @ApiPublicResponse(RESPONSE_MESSAGES.HEALTHY)
  async ready(@Req() request: ApiRequest) {
    try {
      if (this.connection.readyState !== 1 || !this.connection.db)
        throw new Error();
      await this.connection.db.command(
        { ping: 1 },
        { timeoutMS: VALIDATION_LIMITS.QUERY_TIMEOUT_MS },
      );
    } catch {
      throw new ApiException(
        ERROR_CODES.NOT_READY,
        RESPONSE_MESSAGES.NOT_READY,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.responses.success<HealthStatus>(
      { status: "ok", database: "connected" },
      RESPONSE_MESSAGES.HEALTHY,
      request,
    );
  }
}
