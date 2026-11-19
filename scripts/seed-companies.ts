import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { connectDatabase, disconnectDatabase } from "../src/db.js";
import {
  CompanyModel as Company,
  JobSourceModel as JobSource,
} from "../src/cli-models.js";
import { mongoSeedStore } from "../src/mongo-seed-store.js";
import { seedCompanies, validateDataset } from "../src/seed.js";
import { message } from "../src/messages.js";
import { formatSeedError, type SeedStage } from "../src/seed-error.js";
import { verifyBoards } from "../src/verify-boards.js";

let stage: SeedStage = "setup";

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--dry-run"))
    throw new Error(message("usage"));
  for (const file of [".env.development", ".env"]) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
  const input: unknown = JSON.parse(
    await readFile(new URL("./data/companies.json", import.meta.url), "utf8"),
  );
  const records = validateDataset(input);
  const sourceCount = records.reduce(
    (count, record) => count + record.sources.length,
    0,
  );
  stage = "verification";
  await verifyBoards(records);
  if (args.includes("--dry-run")) {
    console.log(message("dryRun"));
    for (const { domain, name, sources } of records) {
      console.log(JSON.stringify({ company: { domain, name }, sources }));
    }
    console.log(
      message("dryRunSummary", {
        companies: records.length,
        sources: sourceCount,
      }),
    );
    return;
  }
  if (records.length === 0) {
    console.log(message("emptyDataset"));
    return;
  }
  try {
    stage = "connect";
    await connectDatabase();

    stage = "indexes";
    await Company.createIndexes();
    await JobSource.createIndexes();
    stage = "upserts";
    await seedCompanies(records, mongoSeedStore);
    console.log(
      message("seedComplete", {
        companies: records.length,
        sources: sourceCount,
      }),
    );
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error: unknown) => {
  console.error(formatSeedError(error, stage));
  process.exitCode = 1;
});
