import { NextResponse } from 'next/server';

import { auth } from '@/auth';

import { isAdminGithubId } from './adminAuth';

export type AdminSession = Awaited<ReturnType<typeof auth>> & {
  user: NonNullable<Awaited<ReturnType<typeof auth>>>['user'] & {
    githubId: string;
    isAdmin: true;
  };
};

function toAdminSession(session: Awaited<ReturnType<typeof auth>>) {
  const githubId = session?.user?.githubId;

  if (!session || !githubId || !isAdminGithubId(githubId)) return null;

  return {
    ...session,
    user: {
      ...session.user,
      githubId,
      isAdmin: true,
    },
  } as AdminSession;
}

export async function getAdminAccess() {
  const session = await auth();

  if (!session) return { status: 'anonymous' as const };

  const adminSession = toAdminSession(session);
  if (!adminSession) return { status: 'forbidden' as const };

  return {
    session: adminSession,
    status: 'authorized' as const,
  };
}

export async function getAdminSession() {
  const access = await getAdminAccess();

  return access.status === 'authorized' ? access.session : null;
}

export async function requireAdminSession() {
  const session = await getAdminSession();

  if (!session) {
    throw new Error('Unauthorized');
  }

  return session;
}

function getRequestHost(request: Request) {
  return request.headers.get('x-forwarded-host') ?? request.headers.get('host');
}

function isAllowedOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const host = getRequestHost(request);

  if (!origin || !host) {
    return process.env.NODE_ENV !== 'production';
  }

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function adminError(message: string, status: number) {
  return {
    message,
    status,
  };
}

export async function requireAdminRequest(
  request: Request,
  { mutation = true }: { mutation?: boolean } = {},
) {
  const session = await getAdminSession();

  if (!session) {
    const error = adminError('Unauthorized', 401);

    return {
      ok: false as const,
      error,
      response: NextResponse.json({ ok: false, error }, { status: 401 }),
    };
  }

  if (mutation && !isAllowedOrigin(request)) {
    const error = adminError('This request could not be verified.', 403);

    return {
      ok: false as const,
      error,
      response: NextResponse.json({ ok: false, error }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    data: {
      session,
      githubId: session.user.githubId,
    },
  };
}
