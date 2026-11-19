import { applyDecorators } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiServiceUnavailableResponse,
} from "@nestjs/swagger";
import { RESPONSE_MESSAGES } from "../constants/index.js";

export function ApiPublicResponse(description: string) {
  const envelope = {
    type: "object",
    required: ["success", "message", "requestId", "timestamp"],
    properties: {
      success: { type: "boolean" },
      message: { type: "string" },
      requestId: { type: "string", format: "uuid" },
      timestamp: { type: "string", format: "date-time" },
      data: { type: "object" },
      code: { type: "string" },
    },
  };
  return applyDecorators(
    ApiOkResponse({ description, schema: envelope }),
    ApiBadRequestResponse({
      description: RESPONSE_MESSAGES.INVALID_QUERY,
      schema: envelope,
    }),
    ApiServiceUnavailableResponse({
      description: RESPONSE_MESSAGES.DATABASE_UNAVAILABLE,
      schema: envelope,
    }),
  );
}
