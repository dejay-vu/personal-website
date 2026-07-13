export class AdminDomainError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = 'AdminDomainError';
  }
}

export class AdminRetryableUploadError extends AdminDomainError {
  constructor(message: string, status = 409) {
    super(message, status);
    this.name = 'AdminRetryableUploadError';
  }
}

export function isAdminRetryableUploadError(
  error: unknown,
): error is AdminRetryableUploadError {
  return error instanceof AdminRetryableUploadError;
}

export function getAdminUploadFailure(error: unknown) {
  return {
    message: error instanceof Error ? error.message : String(error),
    retryable: isAdminRetryableUploadError(error),
  };
}

export function isPrismaUniqueConstraintError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

export function isPrismaUniqueConstraintOn(error: unknown, field: string) {
  if (!isPrismaUniqueConstraintError(error)) return false;

  const target = (error as { meta?: { target?: unknown } }).meta?.target;

  if (Array.isArray(target)) return target.includes(field);
  if (typeof target === 'string') return target.includes(field);

  return false;
}
