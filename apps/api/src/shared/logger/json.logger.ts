import type { LoggerService } from "@nestjs/common";

export class JsonLogger implements LoggerService {
  log(message: unknown, context?: string) {
    console.log(
      JSON.stringify({
        level: "info",
        message: typeof message === "string" ? message : "application_event",
        context,
      }),
    );
  }
  warn(message: unknown, context?: string) {
    console.warn(
      JSON.stringify({
        level: "warn",
        message: typeof message === "string" ? message : "application_warning",
        context,
      }),
    );
  }
  error(_message: unknown, _trace?: string, context?: string) {
    console.error(
      JSON.stringify({ level: "error", event: "application_error", context }),
    );
  }
}
