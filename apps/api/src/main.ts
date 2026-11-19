import { createApi } from "./bootstrap.js";
import {
  loadLocalEnvironment,
  readApiConfig,
} from "./shared/config/environment.js";
import { RESPONSE_MESSAGES } from "./shared/constants/index.js";

async function main() {
  loadLocalEnvironment();
  const config = readApiConfig();
  const app = await createApi(config);
  await app.listen(config.port, "0.0.0.0");
  console.log(
    JSON.stringify({
      event: "api_started",
      message: RESPONSE_MESSAGES.STARTED,
      port: config.port,
    }),
  );
}
main().catch(() => {
  console.error(
    JSON.stringify({
      event: "api_start_failed",
      message: RESPONSE_MESSAGES.START_FAILED,
    }),
  );
  process.exitCode = 1;
});
