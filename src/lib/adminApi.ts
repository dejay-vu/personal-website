import { NextResponse } from 'next/server';

import { AdminDomainError } from '@/modules/admin/errors';
import { ZodError } from 'zod';

export function adminOk<T>(data: T, status = 200) {
  return NextResponse.json(
    {
      data,
      ok: true,
    },
    { status },
  );
}

export function adminErrorResponse(error: unknown) {
  if (error instanceof AdminDomainError) {
    return NextResponse.json(
      {
        error: {
          message: error.message,
          status: error.status,
        },
        ok: false,
      },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          message: error.issues[0]?.message ?? 'Invalid request.',
          status: 400,
        },
        ok: false,
      },
      { status: 400 },
    );
  }

  console.error(error);

  return NextResponse.json(
    {
      error: {
        message: 'Admin request failed.',
        status: 500,
      },
      ok: false,
    },
    { status: 500 },
  );
}
