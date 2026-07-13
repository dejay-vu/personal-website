import { preflightAdminPhotoFinalizations } from '@/modules/photos/admin';
import { z } from 'zod';

import { requireAdminRequest } from '@/lib/admin';
import { adminErrorResponse, adminOk } from '@/lib/adminApi';
import { ADMIN_UPLOAD_LIMITS } from '@/lib/adminUpload';

const photoPreflightSchema = z.object({
  items: z
    .array(
      z.object({
        slug: z.string().trim().min(1).max(160),
        tags: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
        title: z.string().trim().min(1).max(160),
      }),
    )
    .min(1)
    .max(ADMIN_UPLOAD_LIMITS.maxPhotoBatchFiles),
});

export async function POST(request: Request) {
  const admin = await requireAdminRequest(request);
  if (!admin.ok) return admin.response;

  try {
    const input = photoPreflightSchema.parse(await request.json());
    const normalized = await preflightAdminPhotoFinalizations({
      inputs: input.items,
    });

    return adminOk({
      available: true,
      slugs: normalized.map(({ slug }) => slug),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
