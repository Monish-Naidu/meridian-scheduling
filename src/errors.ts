import type { ErrorRequestHandler, RequestHandler } from "express";
import type { Logger } from "./logger";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, "NOT_FOUND", `Route ${req.method} ${req.path} not found`));
};

export function errorHandler(log: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const requestId = res.locals.requestId as string | undefined;
    if (err instanceof HttpError) {
      if (err.status >= 500) {
        log.error("request failed", { requestId, code: err.code, err });
      }
      res.status(err.status).json({
        error: { code: err.code, message: err.message, details: err.details, requestId },
      });
      return;
    }
    if (err instanceof SyntaxError && "body" in err) {
      res.status(400).json({ error: { code: "INVALID_JSON", message: "Malformed JSON body", requestId } });
      return;
    }
    log.error("unhandled error", { requestId, method: req.method, path: req.path, err });
    res.status(500).json({ error: { code: "INTERNAL", message: "Internal server error", requestId } });
  };
}
