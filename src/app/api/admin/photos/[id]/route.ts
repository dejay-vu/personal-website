import { purgeAdminPhoto, updateAdminPhoto } from '@/modules/photos/admin';
import { z } from 'zod';

import { requireAdminRequest } from '@/lib/admin';
import { adminErrorResponse, adminOk } from '@/lib/adminApi';

const updatePhotoSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.enum(['archive', 'restore']),
  }),
  z.object({
    action: z.literal('update'),
    slug: z.string().trim().min(1).max(160),
    tags: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
    title: z.string().trim().min(1).max(160),
  }),
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminRequest(request);
  if (!admin.ok) return admin.response;

  try {
    const { id } = await params;
    const input = updatePhotoSchema.parse(await request.json());

    await updateAdminPhoto({
      input,
      githubId: admin.data.githubId,
      id,
    });

    return adminOk({ id });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminRequest(request);
  if (!admin.ok) return admin.response;

  try {
    const { id } = await params;

    await purgeAdminPhoto({
      githubId: admin.data.githubId,
      id,
    });

    return adminOk({ id });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
