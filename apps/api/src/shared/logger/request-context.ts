import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export interface ApiRequest extends Request {
  requestId: string;
}
export function requestContext(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const req = request as ApiRequest;
  req.requestId = randomUUID();
  response.setHeader("X-Request-Id", req.requestId);
  const start = performance.now();
  response.once("finish", () =>
    console.log(
      JSON.stringify({
        event: "http_request",
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        status: response.statusCode,
        durationMs: Math.round(performance.now() - start),
      }),
    ),
  );
  next();
}
