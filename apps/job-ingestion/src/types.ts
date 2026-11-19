export interface IngestionSource {
  id: string;
  companyDomain: string;
  provider: string;
  boardToken: string;
}

export interface NormalizedJob {
  externalId: string;
  title: string;
  url: string;
  applyUrl: string;
  location: string;
  employmentType: string;
  descriptionText: string;
  descriptionHtml: string;
  publishedAt: Date | null;
}

export interface JobPage { jobs: NormalizedJob[]; cursor: string }
export interface IngestionStore {
  listSources(): Promise<IngestionSource[]>;
  companyExists(domain: string): Promise<boolean>;
  acquire(source: IngestionSource, owner: string): Promise<boolean>;
  renew(source: IngestionSource, owner: string): Promise<void>;
  saveJobs(source: IngestionSource, jobs: NormalizedJob[], seenAt: Date): Promise<{ inserted: number; updated: number }>;
  progress(source: IngestionSource, cursor: string): Promise<void>;
  complete(source: IngestionSource, at: Date): Promise<void>;
  fail(source: IngestionSource): Promise<void>;
  release(source: IngestionSource, owner: string): Promise<void>;
}

export interface IngestionDependencies {
  store: IngestionStore;
  pages(source: IngestionSource, signal: AbortSignal): AsyncIterable<JobPage>;
  log(event: Record<string, unknown>): void;
}

export interface IngestionSummary {
  status: 'success' | 'partial' | 'failed' | 'stopped';
  dryRun: boolean;
  sourcesFound: number;
  sourcesCompleted: number;
  sourcesFailed: number;
  sourcesLocked: number;
  jobsFetched: number;
  jobsInserted: number;
  jobsUpdated: number;
  jobsPlanned: number;
  duplicatesSkipped: number;
  errors: { source: string | null; code: string }[];
}
