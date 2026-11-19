import { Controller, Get, Inject, Param, Query, Req } from "@nestjs/common";
import {
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiQuery,
} from "@nestjs/swagger";
import {
  API_ROUTES,
  API_VERSIONS,
  ROUTE_PARAMS,
  RESPONSE_MESSAGES,
} from "../../shared/constants/index.js";
import { ResponseHandler } from "../../shared/handlers/response.handler.js";
import { ApiPublicResponse } from "../../shared/handlers/api-response.decorator.js";
import { ObjectIdPipe } from "../../shared/pipes/object-id.pipe.js";
import { QueryValidationPipe } from "../../shared/pipes/query-validation.pipe.js";
import type { ApiRequest } from "../../shared/logger/request-context.js";
import { JobsQueryDto } from "./dto/jobs-query.dto.js";
import { JobsService } from "./jobs.service.js";

@ApiTags(API_ROUTES.JOBS)
@Controller(`${API_VERSIONS.V1}/${API_ROUTES.JOBS}`)
export class JobsController {
  constructor(
    @Inject(JobsService) private readonly service: JobsService,
    @Inject(ResponseHandler) private readonly responses: ResponseHandler,
  ) {}
  @Get()
  @ApiOperation({ summary: RESPONSE_MESSAGES.JOBS_FETCHED })
  @ApiPublicResponse(RESPONSE_MESSAGES.JOBS_FETCHED)
  @ApiQuery({ type: JobsQueryDto })
  async list(
    @Query(new QueryValidationPipe(JobsQueryDto)) query: JobsQueryDto,
    @Req() request: ApiRequest,
  ) {
    return this.responses.success(
      await this.service.list(query),
      RESPONSE_MESSAGES.JOBS_FETCHED,
      request,
    );
  }
  @Get(API_ROUTES.FILTERS)
  @ApiOperation({ summary: RESPONSE_MESSAGES.FILTERS_FETCHED })
  @ApiPublicResponse(RESPONSE_MESSAGES.FILTERS_FETCHED)
  async filters(@Req() request: ApiRequest) {
    return this.responses.success(
      await this.service.filters(),
      RESPONSE_MESSAGES.FILTERS_FETCHED,
      request,
    );
  }
  @Get(`:${ROUTE_PARAMS.JOB_ID}`)
  @ApiOperation({ summary: RESPONSE_MESSAGES.JOB_FETCHED })
  @ApiPublicResponse(RESPONSE_MESSAGES.JOB_FETCHED)
  @ApiNotFoundResponse({ description: RESPONSE_MESSAGES.JOB_NOT_FOUND })
  async details(
    @Param(ROUTE_PARAMS.JOB_ID, new ObjectIdPipe()) id: string,
    @Req() request: ApiRequest,
  ) {
    return this.responses.success(
      await this.service.details(id),
      RESPONSE_MESSAGES.JOB_FETCHED,
      request,
    );
  }
}
