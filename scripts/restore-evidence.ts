const MAX_RESTORE_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const SAFE_EVIDENCE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{5,127}$/;

export type RestoreEvidence = {
  createdAt: string;
  id: string;
};

export function assertRecentRestoreEvidence({
  createdAt,
  id,
  now = Date.now(),
}: RestoreEvidence & { now?: number }): RestoreEvidence {
  if (!SAFE_EVIDENCE_ID.test(id)) {
    throw new Error(
      'PRODUCTION_RESTORE_EVIDENCE_ID must be a non-sensitive backup or restore identifier.',
    );
  }

  const timestamp = Date.parse(createdAt);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString() !== createdAt
  ) {
    throw new Error(
      'PRODUCTION_RESTORE_EVIDENCE_CREATED_AT must be a canonical ISO-8601 UTC timestamp.',
    );
  }
  if (timestamp > now + MAX_CLOCK_SKEW_MS) {
    throw new Error('Production restore evidence cannot be from the future.');
  }
  if (now - timestamp > MAX_RESTORE_EVIDENCE_AGE_MS) {
    throw new Error(
      'Production restore evidence must be less than 24 hours old.',
    );
  }

  return { createdAt, id };
}
