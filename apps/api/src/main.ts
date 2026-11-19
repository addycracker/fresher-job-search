import { createApi } from "./bootstrap.js";
import {
  loadLocalEnvironment,
  readApiConfig,
} from "./shared/config/environment.js";
import { RESPONSE_MESSAGES } from "./shared/constants/index.js";
import { startupDiagnostic } from "./shared/logger/startup-diagnostic.js";

let stage = "environment";

async function main() {
  loadLocalEnvironment();
  const config = readApiConfig();
  stage = "initialization";
  const app = await createApi(config);
  stage = "listen";
  try {
    await app.listen(config.port, "0.0.0.0");
  } catch (error) {
    await app.close();
    throw error;
  }
  console.log(
    JSON.stringify({
      event: "api_started",
      message: RESPONSE_MESSAGES.STARTED,
      port: config.port,
    }),
  );
}
main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: "api_start_failed",
      message: RESPONSE_MESSAGES.START_FAILED,
      diagnostic: startupDiagnostic(error, stage),
    }),
  );
  process.exitCode = 1;
});
