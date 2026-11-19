import { InjectModel } from "@nestjs/mongoose";
import { Injectable, HttpStatus } from "@nestjs/common";
import { Types, type FilterQuery, type Model } from "mongoose";
import { Job } from "../../../../job-ingestion/src/models.js";
import { Company } from "../../../../../src/models.js";
import type { JobFilters } from "../../../../../packages/contracts/src/index.js";
import {
  EMPLOYMENT_PATTERNS,
  REMOTE_PATTERN,
  VALIDATION_LIMITS,
  ERROR_CODES,
  RESPONSE_MESSAGES,
} from "../../shared/constants/index.js";
import { ApiException } from "../../shared/exceptions/api.exception.js";
import type { JobsQueryDto } from "./dto/jobs-query.dto.js";
import type { StoredJob, StoredCompany } from "./interfaces/stored-job.js";

export const JOB_LIST_PROJECTION =
  "title companyDomain location employmentType provider url applyUrl firstSeenAt publishedAt";
export const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function buildJobFilter(
  query: JobsQueryDto,
  indexedSearch: boolean,
): FilterQuery<Job> {
  const conditions: FilterQuery<Job>[] = [];
  if (query.q) {
    if (indexedSearch) conditions.push({ $text: { $search: query.q } });
    else
      for (const word of query.q.split(/\s+/).filter(Boolean)) {
        const pattern = new RegExp(escapeRegex(word), "i");
        conditions.push({
          $or: [
            { title: pattern },
            { descriptionText: pattern },
            { descriptionHtml: pattern },
          ],
        });
      }
  }
  if (query.role)
    conditions.push({ title: new RegExp(escapeRegex(query.role), "i") });
  if (query.location)
    conditions.push({ location: new RegExp(escapeRegex(query.location), "i") });
  if (query.employmentType)
    conditions.push({
      employmentType: EMPLOYMENT_PATTERNS[query.employmentType],
    });
  if (query.workMode === "remote")
    conditions.push({
      $or: [{ location: REMOTE_PATTERN }, { employmentType: /^remote$/i }],
    });
  return conditions.length ? { $and: conditions } : {};
}

@Injectable()
export class JobsRepository {
  private indexCache?: { indexed: boolean; expires: number };
  constructor(
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    @InjectModel(Company.name) private readonly companies: Model<Company>,
  ) {}

  private async database<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      throw new ApiException(
        ERROR_CODES.DATABASE,
        RESPONSE_MESSAGES.DATABASE_UNAVAILABLE,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
  async indexedSearch(): Promise<boolean> {
    if (this.indexCache && this.indexCache.expires > Date.now())
      return this.indexCache.indexed;
    return this.database(async () => {
      const indexes = await this.jobs.collection
        .indexes()
        .catch((error: unknown) => {
          // An empty database may not have a jobs collection yet.
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === 26
          )
            return [];
          throw error;
        });
      const indexed = indexes.some(
        (index) => index.textIndexVersion !== undefined,
      );
      this.indexCache = {
        indexed,
        expires: Date.now() + VALIDATION_LIMITS.METADATA_TTL_MS,
      };
      return indexed;
    });
  }
  async list(query: JobsQueryDto) {
    const indexed = query.q ? await this.indexedSearch() : false;
    const filter = buildJobFilter(query, indexed);
    const direction = query.sort === "oldest" ? 1 : -1;
    return this.database(async () => {
      const [items, total] = await Promise.all([
        this.jobs
          .find(filter)
          .select(JOB_LIST_PROJECTION)
          .sort({ firstSeenAt: direction, _id: direction })
          .skip((query.page - 1) * query.pageSize)
          .limit(query.pageSize)
          .maxTimeMS(VALIDATION_LIMITS.QUERY_TIMEOUT_MS)
          .lean<StoredJob[]>()
          .exec(),
        this.jobs
          .countDocuments(filter)
          .maxTimeMS(VALIDATION_LIMITS.QUERY_TIMEOUT_MS)
          .exec(),
      ]);
      return { items, total };
    });
  }
  async findById(id: string) {
    return this.database(() =>
      this.jobs
        .findById(new Types.ObjectId(id))
        .select(`${JOB_LIST_PROJECTION} descriptionText descriptionHtml`)
        .maxTimeMS(VALIDATION_LIMITS.QUERY_TIMEOUT_MS)
        .lean<StoredJob | null>()
        .exec(),
    );
  }
  async companyMap(domains: string[]) {
    if (!domains.length) return new Map<string, StoredCompany>();
    return this.database(async () => {
      const records = await this.companies
        .find({ domain: { $in: [...new Set(domains)] } })
        .select("name domain website -_id")
        .limit(domains.length)
        .maxTimeMS(VALIDATION_LIMITS.QUERY_TIMEOUT_MS)
        .lean<StoredCompany[]>()
        .exec();
      return new Map(records.map((company) => [company.domain, company]));
    });
  }
  async filters(): Promise<JobFilters> {
    return this.database(async () => {
      const options = { maxTimeMS: VALIDATION_LIMITS.QUERY_TIMEOUT_MS };
      const [
        locations,
        roles,
        employment,
        totalJobs,
        companies,
        internships,
        remote,
        indexedSearch,
      ] = await Promise.all([
        this.jobs
          .aggregate<{ _id: string }>([
            { $match: { location: { $type: "string", $ne: "" } } },
            { $group: { _id: "$location" } },
            { $sort: { _id: 1 } },
            { $limit: VALIDATION_LIMITS.FILTER_OPTIONS },
          ])
          .option(options)
          .exec(),
        this.jobs
          .aggregate<{ _id: string }>([
            { $group: { _id: "$title" } },
            { $sort: { _id: 1 } },
            { $limit: VALIDATION_LIMITS.FILTER_OPTIONS },
          ])
          .option(options)
          .exec(),
        this.jobs
          .aggregate<{ _id: string }>([
            { $group: { _id: "$employmentType" } },
            { $limit: VALIDATION_LIMITS.FILTER_OPTIONS },
          ])
          .option(options)
          .exec(),
        this.jobs
          .countDocuments()
          .maxTimeMS(VALIDATION_LIMITS.QUERY_TIMEOUT_MS)
          .exec(),
        this.jobs
          .aggregate<{ count: number }>([
            { $group: { _id: "$companyDomain" } },
            { $count: "count" },
          ])
          .option(options)
          .exec(),
        this.jobs
          .countDocuments({ employmentType: EMPLOYMENT_PATTERNS.internship })
          .maxTimeMS(VALIDATION_LIMITS.QUERY_TIMEOUT_MS)
          .exec(),
        this.jobs
          .exists({
            $or: [
              { location: REMOTE_PATTERN },
              { employmentType: /^remote$/i },
            ],
          })
          .maxTimeMS(VALIDATION_LIMITS.QUERY_TIMEOUT_MS)
          .exec(),
        this.indexedSearch(),
      ]);
      return {
        locations: locations
          .map((item) => item._id)
          .filter((value) => value.length <= VALIDATION_LIMITS.FILTER),
        roles: roles
          .map((item) => item._id)
          .filter((value) => value.length <= VALIDATION_LIMITS.FILTER),
        employmentTypes: (
          Object.keys(
            EMPLOYMENT_PATTERNS,
          ) as (keyof typeof EMPLOYMENT_PATTERNS)[]
        ).filter((key) =>
          employment.some((item) =>
            EMPLOYMENT_PATTERNS[key].test(item._id ?? ""),
          ),
        ),
        workModes: remote ? ["remote"] : [],
        capabilities: {
          category: false,
          workMode: Boolean(remote),
          indexedSearch,
        },
        stats: {
          totalJobs,
          totalCompanies: companies[0]?.count ?? 0,
          internships,
        },
      };
    });
  }
}
