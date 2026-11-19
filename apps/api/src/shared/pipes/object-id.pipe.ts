import { HttpStatus, type PipeTransform } from "@nestjs/common";
import { ApiException } from "../exceptions/api.exception.js";
import { ERROR_CODES, RESPONSE_MESSAGES } from "../constants/index.js";

export class ObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string) {
    if (!/^[a-f\d]{24}$/i.test(value))
      throw new ApiException(
        ERROR_CODES.INVALID_ID,
        RESPONSE_MESSAGES.INVALID_ID,
        HttpStatus.BAD_REQUEST,
      );
    return value;
  }
}
