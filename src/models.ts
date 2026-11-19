import "reflect-metadata";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";
import { providerNames } from "./providers.js";

@Schema({ timestamps: true })
export class Company {
  @Prop({ type: String, required: true, immutable: true })
  domain!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, required: true })
  website!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export type CompanyDocument = HydratedDocument<Company>;
export const CompanySchema = SchemaFactory.createForClass(Company);
CompanySchema.index({ domain: 1 }, { unique: true });

@Schema({ timestamps: true })
export class JobSource {
  @Prop({ type: String, required: true, immutable: true })
  companyDomain!: string;

  @Prop({
    type: String,
    enum: providerNames,
    required: true,
    immutable: true,
  })
  provider!: string;

  @Prop({ type: String, required: true, immutable: true })
  boardToken!: string;

  @Prop({ type: String, required: true })
  url!: string;

  // Reserved for future synchronization. Seeding never writes these fields.
  @Prop({ type: Date })
  lastSyncedAt?: Date;

  @Prop({ type: String })
  syncCursor?: string;

  @Prop({ type: String })
  syncStatus?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export type JobSourceDocument = HydratedDocument<JobSource>;
export const JobSourceSchema = SchemaFactory.createForClass(JobSource);
JobSourceSchema.index({ provider: 1, boardToken: 1 }, { unique: true });
JobSourceSchema.index({ companyDomain: 1 });
