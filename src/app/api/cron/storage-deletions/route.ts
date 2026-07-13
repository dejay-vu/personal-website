import { handleStorageDeletionCronRequest } from '@/modules/media/deletionCron';
import { drainStorageDeletionJobs } from '@/modules/media/deletionJobs';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return handleStorageDeletionCronRequest(request, {
    cronSecret: process.env.CRON_SECRET,
    drain: () => drainStorageDeletionJobs({ limit: 20 }),
  });
}
