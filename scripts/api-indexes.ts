import { createConnection } from "mongoose";
import type { IndexSpecification, CreateIndexesOptions } from "mongodb";
import {
  loadLocalEnvironment,
  readApiConfig,
} from "../apps/api/src/shared/config/environment.js";
import { API_INDEXES } from "../apps/api/src/shared/constants/index.js";
import { JobModel } from "../apps/job-ingestion/src/models.js";
import { setServers } from "node:dns/promises";

async function main() {
  loadLocalEnvironment();
  const config = readApiConfig();
  if (config.dnsServers.length) setServers(config.dnsServers);
  const connection = await createConnection(config.uri, {
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 5000,
  }).asPromise();
  try {
    for (const index of API_INDEXES)
      await connection
        .collection(JobModel.collection.name)
        .createIndex(
          index.key as IndexSpecification,
          index.options as CreateIndexesOptions,
        );
    console.log(JSON.stringify({ event: "api_indexes_prepared" }));
  } finally {
    await connection.close();
  }
}
main().catch(() => {
  console.error(JSON.stringify({ event: "api_index_setup_failed" }));
  process.exitCode = 1;
});
