import { preflightAdminNoteCreation } from '@/modules/notes/admin';
import { markdownContentSchema } from '@/modules/notes/types';
import { z } from 'zod';

import { requireAdminRequest } from '@/lib/admin';
import { adminErrorResponse, adminOk } from '@/lib/adminApi';

const notePreflightSchema = z.object({
  abstract: z.string().trim().min(1).max(500),
  categories: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  content: markdownContentSchema,
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
    const input = notePreflightSchema.parse(await request.json());
    const result = await preflightAdminNoteCreation({ input });

    return adminOk({
      available: true,
      slug: result.slug,
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
