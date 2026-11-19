import { Injectable } from "@nestjs/common";
import type { ApiSuccess } from "../../../../../packages/contracts/src/index.js";
import type { ApiRequest } from "../logger/request-context.js";

@Injectable()
export class ResponseHandler {
  success<T>(data: T, message: string, request: ApiRequest): ApiSuccess<T> {
    return {
      success: true,
      message,
      data,
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
    };
  }
}
