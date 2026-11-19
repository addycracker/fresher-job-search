import type { Types } from "mongoose";

export interface StoredJob {
  _id: Types.ObjectId;
  title: string;
  companyDomain: string;
  location?: string;
  employmentType?: string;
  provider: string;
  url: string;
  applyUrl: string;
  firstSeenAt: Date;
  publishedAt?: Date | null;
  descriptionText?: string;
  descriptionHtml?: string;
}
export interface StoredCompany {
  domain: string;
  name: string;
  website: string;
}
