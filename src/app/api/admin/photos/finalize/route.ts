import { after } from 'next/server';

import {
  finalizePhoto,
  prepareAdminPhotoFinalization,
} from '@/modules/photos/admin';
import { z } from 'zod';

import { requireAdminRequest } from '@/lib/admin';
import { adminErrorResponse, adminOk } from '@/lib/adminApi';

const finalizePhotoSchema = z.object({
  slug: z.string().trim().min(1).max(160),
  tags: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
  title: z.string().trim().min(1).max(160),
  uploadId: z.string().uuid(),
});

export async function POST(request: Request) {
  const admin = await requireAdminRequest(request);
  if (!admin.ok) return admin.response;

  try {
    const input = finalizePhotoSchema.parse(await request.json());

    await prepareAdminPhotoFinalization({
      githubId: admin.data.githubId,
      input,
    });

    after(async () => {
      try {
        await finalizePhoto({
          githubId: admin.data.githubId,
          input,
        });
      } catch (error) {
        console.error('Background photo finalize failed.', error);
      }
    });

    return adminOk(
      {
        status: 'queued',
        uploadId: input.uploadId,
      },
      202,
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}
