import { existsSync } from "node:fs";
import { connectDatabase, disconnectDatabase } from "../../../src/db.js";
import { message } from "../../../src/messages.js";
import { readIngestionConfig } from "./config.js";
import { JobModel, IngestionLeaseModel } from "./models.js";
import { createPageFetcher } from "./providers.js";
import { createIngestionStore } from "./store.js";
import { runIngestion } from "./worker.js";

async function main() {
  const args = process.argv.slice(2);
  if (
    args.length > 1 ||
    args.some((arg) => !["--dry-run", "--write"].includes(arg))
  ) {
    throw new Error(message("ingestionUsage"));
  }
  for (const file of [".env.development", ".env"])
    if (existsSync(file)) process.loadEnvFile(file);
  const config = readIngestionConfig();
  const dryRun = !args.includes("--write");
  if (!dryRun && !config.allowWrites)
    throw new Error(message("ingestionWritesDisabled"));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.runTimeoutMs);
  const stop = () => controller.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    await connectDatabase({ timeoutMs: config.databaseTimeoutMs });
    controller.signal.throwIfAborted();
    if (!dryRun) {
      await JobModel.createIndexes();
      controller.signal.throwIfAborted();
      await IngestionLeaseModel.createIndexes();
    }
    const summary = await runIngestion(
      { dryRun, signal: controller.signal },
      {
        store: createIngestionStore(config.maxSources),
        pages: createPageFetcher(),
        log(event) {
          console.log(JSON.stringify(event));
        },
      },
    );
    if (summary.status !== "success") process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
    await disconnectDatabase();
  }
}

main().catch((error: unknown) => {
  const known = [
    "ingestionUsage",
    "ingestionWritesDisabled",
    "mongodbUriRequired",
    "invalidDnsServers",
  ] as const;
  const hint = known.find(
    (key) => error instanceof Error && error.message === message(key),
  );
  console.error(
    JSON.stringify({
      event: "ingestion_setup_failed",
      hint: message(hint ?? "ingestionSetupFailed"),
    }),
  );
  process.exitCode = 1;
});
