import { getUploadStatuses } from '@/modules/admin/uploads';
import { z } from 'zod';

import { requireAdminRequest } from '@/lib/admin';
import { adminErrorResponse, adminOk } from '@/lib/adminApi';

const statusSchema = z.object({
  uploadIds: z.array(z.string().uuid()).min(1).max(24),
});

export async function GET(request: Request) {
  const admin = await requireAdminRequest(request, {
    mutation: false,
  });
  if (!admin.ok) return admin.response;

  try {
    const url = new URL(request.url);
    const uploadIds = [
      ...url.searchParams.getAll('uploadId'),
      ...url.searchParams
        .getAll('uploadIds')
        .flatMap((value) => value.split(',')),
    ]
      .map((value) => value.trim())
      .filter(Boolean);
    const input = statusSchema.parse({
      uploadIds,
    });
    const statuses = await getUploadStatuses({
      githubId: admin.data.githubId,
      uploadIds: input.uploadIds,
    });

    return adminOk({
      statuses,
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
