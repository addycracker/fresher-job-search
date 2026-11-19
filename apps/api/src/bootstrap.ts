import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import {
  createEncryptedTransport,
  securityFailure,
} from "./shared/security/encrypted-transport.js";
import { TRANSPORT } from "../../../packages/contracts/src/transport.js";
import { API_PATHS } from "../../../packages/contracts/src/index.js";
import { json, urlencoded } from "express";
import { setServers } from "node:dns/promises";
import { isIP } from "node:net";
import { AppModule } from "./app.module.js";
import type { ApiConfig } from "./shared/config/environment.js";
import {
  API_ROUTES,
  API_VERSIONS,
  VALIDATION_LIMITS,
} from "./shared/constants/index.js";
import { GlobalExceptionFilter } from "./shared/filters/global-exception.filter.js";
import { requestContext } from "./shared/logger/request-context.js";
import { JsonLogger } from "./shared/logger/json.logger.js";

export async function createApi(config: ApiConfig) {
  if (config.dnsServers.length) {
    if (config.dnsServers.some((server) => !isIP(server))) throw new Error();
    setServers(config.dnsServers);
  }
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.configure(config),
    { logger: new JsonLogger(), bodyParser: false, abortOnError: false },
  );
  configureHttp(app, config);
  return app;
}

export function configureHttp(app: NestExpressApplication, config: ApiConfig) {
  app.getHttpAdapter().getInstance().set("query parser", "simple");
  app
    .getHttpAdapter()
    .getInstance()
    .set("trust proxy", config.security.trustProxy);
  app.use(requestContext);
  app.use(helmet());
  app.use(json({ limit: VALIDATION_LIMITS.BODY }));
  app.use(urlencoded({ extended: false, limit: VALIDATION_LIMITS.BODY }));
  app.enableCors({
    origin: config.corsOrigins,
    methods: ["GET", "HEAD", "OPTIONS"],
    credentials: false,
    allowedHeaders: [
      "Accept",
      "Content-Type",
      ...Object.values(TRANSPORT.HEADERS),
    ],
    exposedHeaders: [
      "X-Request-Id",
      "Retry-After",
      "RateLimit",
      "RateLimit-Policy",
    ],
  });
  const limiter = rateLimit({
    windowMs: config.security.windowMs,
    limit: config.security.rateLimit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res) => securityFailure(req, res, 429, "RATE_LIMITED"),
  });
  const transport = createEncryptedTransport(config.security);
  app.use(
    (
      req: import("express").Request,
      res: import("express").Response,
      next: import("express").NextFunction,
    ) => {
      const path = req.path.toLowerCase();
      const protectedRoute =
        path === TRANSPORT.PUBLIC_KEY_PATH ||
        path === API_PATHS.jobs ||
        path.startsWith(API_PATHS.jobs + "/");
      if (!protectedRoute) return next();
      limiter(req, res, (error?: unknown) =>
        error ? next(error) : transport(req, res, next),
      );
    },
  );
  app.setGlobalPrefix(API_ROUTES.PREFIX);
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableShutdownHooks();
  if (config.swagger) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("FresherJobs AI API")
        .setVersion(API_VERSIONS.V1)
        .build(),
    );
    SwaggerModule.setup(
      `${API_ROUTES.PREFIX}/${API_ROUTES.DOCS}`,
      app,
      document,
    );
  }
}
