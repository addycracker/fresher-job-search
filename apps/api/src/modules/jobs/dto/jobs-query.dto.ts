import { Transform } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  EMPLOYMENT_TYPES,
  WORK_MODES,
  type EmploymentType,
  type SortOption,
} from "../../../../../../packages/contracts/src/index.js";
import {
  PAGINATION_DEFAULTS as PAGE,
  SORT_OPTIONS,
  VALIDATION_LIMITS as LIMIT,
} from "../../../shared/constants/index.js";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
const integer = ({ value }: { value: unknown }) =>
  typeof value === "string" && /^\d+$/.test(value)
    ? Number(value)
    : typeof value === "number"
      ? value
      : Number.NaN;

export class JobsQueryDto {
  @ApiPropertyOptional({ type: String, maxLength: LIMIT.SEARCH })
  @IsOptional()
  @IsString()
  @MaxLength(LIMIT.SEARCH)
  @Transform(trim)
  q?: string;
  @ApiPropertyOptional({
    type: String,
    description: "Matches stored job titles, not AI categories",
  })
  @IsOptional()
  @IsString()
  @MaxLength(LIMIT.FILTER)
  @Transform(trim)
  role?: string;
  @ApiPropertyOptional({
    type: String,
    description: "Unavailable until classification data is stored",
  })
  @IsOptional()
  @IsString()
  @MaxLength(LIMIT.FILTER)
  @Transform(trim)
  category?: string;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(LIMIT.FILTER)
  @Transform(trim)
  location?: string;
  @ApiPropertyOptional({ enum: EMPLOYMENT_TYPES })
  @IsOptional()
  @IsIn(EMPLOYMENT_TYPES)
  employmentType?: EmploymentType;
  @ApiPropertyOptional({
    enum: WORK_MODES,
    description:
      "Only explicitly remote/virtual stored locations are supported",
  })
  @IsOptional()
  @IsIn(WORK_MODES)
  workMode?: "remote";
  @ApiPropertyOptional({
    type: Number,
    default: PAGE.PAGE,
    minimum: 1,
    maximum: PAGE.MAX_PAGE,
  })
  @IsInt()
  @Min(1)
  @Max(PAGE.MAX_PAGE)
  @Transform(integer)
  page: number = PAGE.PAGE;
  @ApiPropertyOptional({
    type: Number,
    default: PAGE.PAGE_SIZE,
    minimum: 1,
    maximum: PAGE.MAX_PAGE_SIZE,
  })
  @IsInt()
  @Min(1)
  @Max(PAGE.MAX_PAGE_SIZE)
  @Transform(integer)
  pageSize: number = PAGE.PAGE_SIZE;
  @ApiPropertyOptional({ enum: SORT_OPTIONS, default: SORT_OPTIONS[0] })
  @IsIn(SORT_OPTIONS)
  sort: SortOption = SORT_OPTIONS[0];
}
