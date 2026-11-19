import { HttpStatus, type PipeTransform } from "@nestjs/common";
import { plainToInstance, type ClassConstructor } from "class-transformer";
import { validateSync } from "class-validator";
import { ApiException } from "../exceptions/api.exception.js";
import { ERROR_CODES, RESPONSE_MESSAGES } from "../constants/index.js";

export class QueryValidationPipe<T extends object> implements PipeTransform<
  unknown,
  T
> {
  constructor(private readonly dto: ClassConstructor<T>) {}
  transform(value: unknown): T {
    const instance = plainToInstance(this.dto, value, {
      exposeDefaultValues: true,
    });
    const errors = validateSync(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    });
    if (errors.length)
      throw new ApiException(
        ERROR_CODES.INVALID_QUERY,
        RESPONSE_MESSAGES.INVALID_QUERY,
        HttpStatus.BAD_REQUEST,
      );
    return instance;
  }
}
