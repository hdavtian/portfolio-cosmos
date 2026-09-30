import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z } from "zod";

// Uniform error envelope, matching the other shared-login apps:
//   { error: { code, message, details[], requestId } }
export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  public static notFound(message = "Not found"): ApiError {
    return new ApiError(404, "NOT_FOUND", message);
  }

  public static badRequest(
    message: string,
    details?: Array<{ path: string; message: string }>,
  ): ApiError {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }

  /** The record changed since it was read (optimistic concurrency). */
  public static conflict(message: string): ApiError {
    return new ApiError(409, "CONFLICT", message);
  }
}

export const zodDetails = (error: z.ZodError): Array<{ path: string; message: string }> =>
  error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));

/** Parses input, throwing a 400 with per-field details the admin can display. */
export const parseOrThrow = <T extends z.ZodType>(
  schema: T,
  value: unknown,
  message = "Invalid request",
): z.infer<T> => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw ApiError.badRequest(message, zodDetails(result.error));
  }
  return result.data;
};

/** Forwards rejected promises to Express's error handler. */
export const asyncHandler =
  (handler: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    handler(req, res).catch(next);
  };

export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const requestId = req.requestId ?? "unknown";

  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
        requestId,
      },
    });
    return;
  }

  /*
   * A body over the route's limit is the client's fault, not ours.
   *
   * `express.json` throws a PayloadTooLargeError carrying `type:
   * "entity.too.large"`, and without this it fell through to the 500 below --
   * so the contact form's 32kb cap worked but reported itself as a server
   * fault, which is both wrong and unhelpful to whoever hit it. Matched on
   * `type` rather than the class, which body-parser does not export.
   */
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { type?: string }).type === "entity.too.large"
  ) {
    res.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "That request was too large.",
        requestId,
      },
    });
    return;
  }

  console.error(`[${requestId}]`, error);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Unexpected error",
      requestId,
    },
  });
};
