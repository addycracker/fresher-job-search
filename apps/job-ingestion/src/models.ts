import 'reflect-metadata';
import mongoose, { Schema as MongoSchema, Types } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { JobSource } from '../../../src/models.js';
import { providerNames } from '../../../src/providers.js';

@Schema({ timestamps: true })
export class Job {
  @Prop({ type: MongoSchema.Types.ObjectId, ref: JobSource.name, required: true, immutable: true })
  source!: Types.ObjectId;
  @Prop({ type: String, required: true, immutable: true }) companyDomain!: string;
  @Prop({ type: String, enum: providerNames, required: true, immutable: true }) provider!: string;
  @Prop({ type: String, required: true, immutable: true }) boardToken!: string;
  @Prop({ type: String, required: true, immutable: true }) externalId!: string;
  @Prop({ type: String, required: true }) title!: string;
  @Prop({ type: String, required: true }) url!: string;
  @Prop({ type: String, required: true }) applyUrl!: string;
  @Prop({ type: String }) location!: string;
  @Prop({ type: String }) employmentType!: string;
  @Prop({ type: String }) descriptionText!: string;
  @Prop({ type: String }) descriptionHtml!: string;
  @Prop({ type: Date }) publishedAt?: Date | null;
  @Prop({ type: Date, required: true, immutable: true }) firstSeenAt!: Date;
  @Prop({ type: Date, required: true }) lastSeenAt!: Date;
}

export const JobSchema = SchemaFactory.createForClass(Job);
JobSchema.index({ provider: 1, boardToken: 1, externalId: 1 }, { unique: true });
JobSchema.index({ companyDomain: 1 });
JobSchema.index({ source: 1 });
export const JobModel = mongoose.model(Job.name, JobSchema);

// Separate leases avoid changing Company/JobSource schemas or seeding behavior.
const leaseSchema = new MongoSchema({
  source: { type: MongoSchema.Types.ObjectId, required: true },
  owner: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});
leaseSchema.index({ source: 1 }, { unique: true });
export const IngestionLeaseModel = mongoose.model('IngestionLease', leaseSchema);
