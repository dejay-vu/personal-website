const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 256;
const CURSOR_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const CURSOR_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type KeysetCursor = {
  id: string;
  timestamp: string;
};

type CursorKind = 'notes' | 'photos';

type CursorPayload = {
  i: string;
  k: CursorKind;
  t: string;
  v: typeof CURSOR_VERSION;
};

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !CURSOR_TIMESTAMP_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(value);

  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

export function encodeKeysetCursor(
  kind: CursorKind,
  cursor: KeysetCursor,
): string {
  if (!CURSOR_ID_PATTERN.test(cursor.id)) {
    throw new Error('Cursor id is invalid.');
  }

  if (!isCanonicalTimestamp(cursor.timestamp)) {
    throw new Error('Cursor timestamp is invalid.');
  }

  const payload: CursorPayload = {
    i: cursor.id,
    k: kind,
    t: cursor.timestamp,
    v: CURSOR_VERSION,
  };

  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function parseKeysetCursor(raw: string | null, kind: CursorKind) {
  if (!raw) {
    return { ok: true as const, cursor: null };
  }

  if (raw.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(raw)) {
    return { ok: false as const, cursor: null };
  }

  try {
    const payload = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as Partial<CursorPayload>;
    const id = payload.i;
    const timestamp = payload.t;

    if (
      payload.v !== CURSOR_VERSION ||
      payload.k !== kind ||
      typeof id !== 'string' ||
      !CURSOR_ID_PATTERN.test(id) ||
      !isCanonicalTimestamp(timestamp)
    ) {
      return { ok: false as const, cursor: null };
    }

    return {
      ok: true as const,
      cursor: {
        id,
        timestamp,
      } satisfies KeysetCursor,
    };
  } catch {
    return { ok: false as const, cursor: null };
  }
}
