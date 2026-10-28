import { ZodError } from 'zod';
export class AppError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}
export const fail = (status, code, message, details) => {
  throw new AppError(status, code, message, details);
};
export const requireValue = (condition, status, code, message) => {
  if (!condition) fail(status, code, message);
};
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = error.status || 500,
    code = error.code || 'INTERNAL_ERROR',
    message = error.status ? error.message : 'Request could not be completed',
    details = error.details || [];
  if (error instanceof ZodError) {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed';
    details = error.issues.map((x) => ({ field: x.path.join('.'), issue: x.message }));
  }
  if (error.type === 'entity.parse.failed') {
    status = 400;
    code = 'MALFORMED_JSON';
    message = 'Request body is not valid JSON';
  }
  if (error.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request exceeds size limit';
  }
  if (error.name === 'CastError' || error.name === 'ValidationError') {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed';
  }
  if (error.code === 11000) {
    status = 409;
    code = error.keyPattern?.email
      ? 'EMAIL_EXISTS'
      : error.keyPattern?.courseCode
        ? 'COURSE_CODE_EXISTS'
        : 'DUPLICATE_RECORD';
    message = 'A record with this identity already exists';
  }
  if (/Mongo(ServerSelection|Network|NotConnected)/.test(error.name)) {
    status = 503;
    code = 'DATABASE_UNAVAILABLE';
    message = 'Database is unavailable';
  }
  if (status >= 500)
    console.error(
      JSON.stringify({ requestId: req.requestId, status, code, errorType: error.name }),
    );
  res
    .status(status)
    .json({ error: { code, message, details }, meta: { requestId: req.requestId } });
}
