import { after } from 'next/server';

import {
  createAdminNoteFromEditor,
  prepareAdminNoteCreation,
} from '@/modules/notes/admin';
import { markdownContentSchema } from '@/modules/notes/types';
import { z } from 'zod';

import { requireAdminRequest } from '@/lib/admin';
import { adminErrorResponse, adminOk } from '@/lib/adminApi';

const noteEditorSchema = z.object({
  abstract: z.string().trim().min(1).max(500),
  categories: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  content: markdownContentSchema,
  coverUploadId: z.string().uuid(),
  published: z.boolean(),
  publishedAt: z.string().trim().min(1),
  seoTitle: z.string().trim().max(60).optional().nullable(),
  slug: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(160),
});

export async function POST(request: Request) {
  const admin = await requireAdminRequest(request);
  if (!admin.ok) return admin.response;

  try {
    const input = noteEditorSchema.parse(await request.json());

    await prepareAdminNoteCreation({
      githubId: admin.data.githubId,
      input,
    });

    after(async () => {
      try {
        await createAdminNoteFromEditor({
          githubId: admin.data.githubId,
          input,
        });
      } catch (error) {
        console.error('Background note creation failed.', error);
      }
    });

    return adminOk(
      {
        status: 'queued',
        uploadId: input.coverUploadId,
      },
      202,
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}
