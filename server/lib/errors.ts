/** Domain error carrying an HTTP status and a stable machine-readable code for the client. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message ?? code);
  }
}

export const notFound = (code = "not_found") => new AppError(404, code);
export const conflict = (code: string, message?: string) => new AppError(409, code, message);
export const badRequest = (code: string, message?: string, fields?: Record<string, string>) =>
  new AppError(400, code, message, fields);
export const forbidden = (code = "forbidden") => new AppError(403, code);
export const unauthorized = (code = "unauthorized") => new AppError(401, code);
export const unavailable = (code: string, message?: string) => new AppError(503, code, message);
