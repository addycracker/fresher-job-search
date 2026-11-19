import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  Job,
  JobSchema,
  JobModel,
} from "../../../../job-ingestion/src/models.js";
import { Company, CompanySchema } from "../../../../../src/models.js";
import { CompanyModel } from "../../../../../src/cli-models.js";
import { ResponseHandler } from "../../shared/handlers/response.handler.js";
import { JobsController } from "./jobs.controller.js";
import { JobsService } from "./jobs.service.js";
import { JobsRepository } from "./jobs.repository.js";

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Job.name,
        schema: JobSchema,
        collection: JobModel.collection.name,
      },
      {
        name: Company.name,
        schema: CompanySchema,
        collection: CompanyModel.collection.name,
      },
    ]),
  ],
  controllers: [JobsController],
  providers: [JobsService, JobsRepository, ResponseHandler],
})
export class JobsModule {}
