import { NextResponse } from 'next/server';

import { parseKeysetCursor } from './keysetCursor';

export function parseCursor(raw: string | null, kind: 'notes' | 'photos') {
  return parseKeysetCursor(raw, kind);
}

export function parsePageLimit(
  raw: string | null,
  {
    defaultValue,
    max,
  }: {
    defaultValue: number;
    max: number;
  },
) {
  if (raw === null) {
    return { ok: true as const, limit: defaultValue };
  }

  if (!/^\d+$/.test(raw)) {
    return { ok: false as const, limit: defaultValue };
  }

  const limit = Number(raw);

  return Number.isSafeInteger(limit) && limit >= 1 && limit <= max
    ? { ok: true as const, limit }
    : { ok: false as const, limit: defaultValue };
}

export function publicApiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
