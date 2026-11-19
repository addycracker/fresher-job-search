import mongoose from "mongoose";
import { Company, CompanySchema, JobSource, JobSourceSchema } from "./models.js";

// The standalone seed uses the same schemas without bootstrapping a Nest app.
export const CompanyModel = mongoose.model(Company.name, CompanySchema);
export const JobSourceModel = mongoose.model(JobSource.name, JobSourceSchema);
