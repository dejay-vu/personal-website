import { AdminUploadKind } from '@/generated/prisma/client';
import { createUploadPresigns } from '@/modules/admin/uploads';
import { z } from 'zod';

import { requireAdminRequest } from '@/lib/admin';
import { adminErrorResponse, adminOk } from '@/lib/adminApi';
import { ADMIN_UPLOAD_LIMITS } from '@/lib/adminUpload';

const presignSchema = z.object({
  files: z
    .array(
      z.object({
        kind: z.enum([AdminUploadKind.PHOTO, AdminUploadKind.NOTE_COVER]),
        name: z.string().min(1).max(180),
        size: z.number().int().positive(),
        type: z.string().max(100).optional().nullable(),
      }),
    )
    .min(1)
    .max(ADMIN_UPLOAD_LIMITS.maxPhotoBatchFiles),
});

export async function POST(request: Request) {
  const admin = await requireAdminRequest(request);
  if (!admin.ok) return admin.response;

  try {
    const payload = presignSchema.parse(await request.json());
    const uploads = await createUploadPresigns({
      files: payload.files,
      githubId: admin.data.githubId,
    });

    return adminOk({ uploads });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
