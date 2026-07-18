import { handleAwsHealthRequest } from './handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handleAwsHealthRequest(request);
}
