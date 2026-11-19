import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type {
  JobFilters,
  JobsPage,
  JobDetails,
} from "../../../../../packages/contracts/src/index.js";
import { JobsRepository } from "./jobs.repository.js";
import { mapJob, mapJobDetails } from "./mappers/job.mapper.js";
import {
  PAGINATION_DEFAULTS,
  VALIDATION_LIMITS,
  ERROR_CODES,
  RESPONSE_MESSAGES,
} from "../../shared/constants/index.js";
import { ApiException } from "../../shared/exceptions/api.exception.js";
import type { JobsQueryDto } from "./dto/jobs-query.dto.js";

@Injectable()
export class JobsService {
  private cachedFilters?: { data: JobFilters; expires: number };
  constructor(
    @Inject(JobsRepository) private readonly repository: JobsRepository,
  ) {}
  async list(query: JobsQueryDto): Promise<JobsPage> {
    if (query.category)
      throw new ApiException(
        ERROR_CODES.UNSUPPORTED_FILTER,
        RESPONSE_MESSAGES.UNSUPPORTED_FILTER,
        HttpStatus.BAD_REQUEST,
      );
    if ((query.page - 1) * query.pageSize > PAGINATION_DEFAULTS.MAX_OFFSET) {
      throw new ApiException(
        ERROR_CODES.PAGE_LIMIT,
        RESPONSE_MESSAGES.PAGE_LIMIT,
        HttpStatus.BAD_REQUEST,
      );
    }
    const { items, total } = await this.repository.list(query);
    const companies = await this.repository.companyMap(
      items.map((job) => job.companyDomain),
    );
    return {
      items: items.map((job) => mapJob(job, companies.get(job.companyDomain))),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
        hasNextPage: query.page * query.pageSize < total,
        hasPreviousPage: query.page > 1 && total > 0,
      },
    };
  }
  async details(id: string): Promise<JobDetails> {
    const job = await this.repository.findById(id);
    if (!job)
      throw new ApiException(
        ERROR_CODES.JOB_NOT_FOUND,
        RESPONSE_MESSAGES.JOB_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    const companies = await this.repository.companyMap([job.companyDomain]);
    return mapJobDetails(job, companies.get(job.companyDomain));
  }
  async filters(): Promise<JobFilters> {
    if (this.cachedFilters && this.cachedFilters.expires > Date.now())
      return this.cachedFilters.data;
    const data = await this.repository.filters();
    this.cachedFilters = {
      data,
      expires: Date.now() + VALIDATION_LIMITS.METADATA_TTL_MS,
    };
    return data;
  }
}
