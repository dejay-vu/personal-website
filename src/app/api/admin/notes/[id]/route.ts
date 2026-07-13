import { purgeAdminNote, updateAdminNoteStatus } from '@/modules/notes/admin';
import { z } from 'zod';

import { requireAdminRequest } from '@/lib/admin';
import { adminErrorResponse, adminOk } from '@/lib/adminApi';

const updateNoteSchema = z.object({
  action: z.enum(['archive', 'restore', 'publish', 'unpublish']),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminRequest(request);
  if (!admin.ok) return admin.response;

  try {
    const { id } = await params;
    const { action } = updateNoteSchema.parse(await request.json());

    await updateAdminNoteStatus({
      action,
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

    await purgeAdminNote({
      githubId: admin.data.githubId,
      id,
    });

    return adminOk({ id });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
