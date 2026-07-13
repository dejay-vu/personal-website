import {
  drainStorageDeletionJobs,
  retryFailedStorageDeletionJobs,
} from '@/modules/media/deletionJobs';
import { z } from 'zod';

import { requireAdminRequest } from '@/lib/admin';
import { adminErrorResponse, adminOk } from '@/lib/adminApi';

const drainActionSchema = z.object({
  action: z.enum(['drain', 'retry']),
});

export async function POST(request: Request) {
  const admin = await requireAdminRequest(request);
  if (!admin.ok) return admin.response;

  try {
    const { action } = drainActionSchema.parse(await request.json());
    const now = new Date();
    const retried =
      action === 'retry' ? await retryFailedStorageDeletionJobs({ now }) : 0;
    const claimed = await drainStorageDeletionJobs({ limit: 20, now });

    return adminOk({
      claimed,
      retried,
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
