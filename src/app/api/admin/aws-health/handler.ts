import { NextResponse } from 'next/server';

import {
  type AwsRuntimeHealthResult,
  checkAwsRuntimeHealth,
} from '@/modules/media/awsRuntimeHealth';

import { requireAdminRequest } from '@/lib/admin';

type AdminAuthorization =
  | { ok: true }
  | {
      ok: false;
      response: Response;
    };

type AwsHealthRouteDependencies = {
  authorize?: (request: Request) => Promise<AdminAuthorization>;
  checkHealth?: () => Promise<AwsRuntimeHealthResult>;
  logError?: (message: string, error: unknown) => void;
};

function noStore(response: Response) {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function handleAwsHealthRequest(
  request: Request,
  {
    authorize = (input) => requireAdminRequest(input, { mutation: false }),
    checkHealth = () => checkAwsRuntimeHealth(),
    logError = (message, error) => console.error(message, error),
  }: AwsHealthRouteDependencies = {},
) {
  const admin = await authorize(request);
  if (!admin.ok) return noStore(admin.response);

  try {
    const health = await checkHealth();

    return noStore(
      NextResponse.json({
        data: health,
        ok: true,
      }),
    );
  } catch (error) {
    logError('AWS runtime health check failed.', error);

    return noStore(
      NextResponse.json(
        {
          error: {
            message: 'AWS runtime health check failed.',
            status: 500,
          },
          ok: false,
        },
        { status: 500 },
      ),
    );
  }
}
