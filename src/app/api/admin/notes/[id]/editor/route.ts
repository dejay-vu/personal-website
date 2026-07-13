import {
  getAdminNoteEditor,
  replaceAdminNoteCoverFromUpload,
  updateAdminNoteFromEditor,
} from '@/modules/notes/admin';
import { markdownContentSchema } from '@/modules/notes/types';
import { z } from 'zod';

import { requireAdminRequest } from '@/lib/admin';
import { adminErrorResponse, adminOk } from '@/lib/adminApi';

const noteEditorSchema = z.object({
  abstract: z.string().trim().min(1).max(500),
  categories: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  content: markdownContentSchema,
  coverUploadId: z.string().uuid().optional(),
  published: z.boolean(),
  publishedAt: z.string().trim().min(1),
  seoTitle: z.string().trim().max(60).optional().nullable(),
  slug: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(160),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminRequest(request, { mutation: false });
  if (!admin.ok) return admin.response;

  try {
    const { id } = await params;
    const note = await getAdminNoteEditor({ id });

    return adminOk(note);
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminRequest(request);
  if (!admin.ok) return admin.response;

  try {
    const { id } = await params;
    const input = noteEditorSchema.parse(await request.json());
    const note = await updateAdminNoteFromEditor({
      githubId: admin.data.githubId,
      id,
      input,
    });
    const savedNote = input.coverUploadId
      ? await replaceAdminNoteCoverFromUpload({
          githubId: admin.data.githubId,
          noteId: id,
          uploadId: input.coverUploadId,
        })
      : note;

    return adminOk({
      id: savedNote.id,
      slug: savedNote.slug,
      title: savedNote.title,
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
