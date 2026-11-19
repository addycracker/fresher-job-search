import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { ApiException } from "../exceptions/api.exception.js";
import { ERROR_CODES, RESPONSE_MESSAGES } from "../constants/index.js";
import type { ApiRequest } from "../logger/request-context.js";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<ApiRequest>();
    const response = context.getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ERROR_CODES.INTERNAL;
    let message: string = RESPONSE_MESSAGES.INTERNAL_ERROR;
    if (exception instanceof ApiException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      if (status === HttpStatus.NOT_FOUND) {
        code = ERROR_CODES.NOT_FOUND;
        message = RESPONSE_MESSAGES.NOT_FOUND;
      } else if (status === HttpStatus.BAD_REQUEST) {
        code = ERROR_CODES.INVALID_REQUEST;
        message = RESPONSE_MESSAGES.INVALID_REQUEST;
      } else if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
        code = ERROR_CODES.BODY_TOO_LARGE;
        message = RESPONSE_MESSAGES.BODY_TOO_LARGE;
      }
    } else if (
      exception !== null &&
      typeof exception === "object" &&
      "type" in exception &&
      exception.type === "entity.too.large"
    ) {
      status = HttpStatus.PAYLOAD_TOO_LARGE;
      code = ERROR_CODES.BODY_TOO_LARGE;
      message = RESPONSE_MESSAGES.BODY_TOO_LARGE;
    } else if (
      exception !== null &&
      typeof exception === "object" &&
      "type" in exception &&
      exception.type === "entity.parse.failed"
    ) {
      status = HttpStatus.BAD_REQUEST;
      code = ERROR_CODES.INVALID_REQUEST;
      message = RESPONSE_MESSAGES.INVALID_REQUEST;
    }
    response.status(status).json({
      success: false,
      code,
      message,
      requestId: request.requestId ?? randomUUID(),
      timestamp: new Date().toISOString(),
    });
  }
}
