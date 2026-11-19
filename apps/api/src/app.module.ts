import { Module, type DynamicModule } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { JobsModule } from "./modules/jobs/jobs.module.js";
import { HealthController } from "./modules/health/health.controller.js";
import { ResponseHandler } from "./shared/handlers/response.handler.js";
import { API_CONFIG, VALIDATION_LIMITS } from "./shared/constants/index.js";
import type { ApiConfig } from "./shared/config/environment.js";
import type { Connection } from "mongoose";

@Module({})
export class AppModule {
  static configure(config: ApiConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        MongooseModule.forRoot(config.uri, {
          autoIndex: false,
          autoCreate: false,
          bufferCommands: false,
          serverSelectionTimeoutMS: VALIDATION_LIMITS.QUERY_TIMEOUT_MS,
          connectTimeoutMS: VALIDATION_LIMITS.QUERY_TIMEOUT_MS,
          timeoutMS: VALIDATION_LIMITS.QUERY_TIMEOUT_MS,
          lazyConnection: true,
          connectionFactory: (connection: Connection) => {
            connection.on("error", () =>
              console.warn(
                JSON.stringify({ event: "database_connection_unavailable" }),
              ),
            );
            void connection.asPromise().catch(() => {});
            return connection;
          },
        }),
        JobsModule,
      ],
      providers: [{ provide: API_CONFIG, useValue: config }, ResponseHandler],
      controllers: [HealthController],
    };
  }
}
