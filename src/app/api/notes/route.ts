import { NextRequest, NextResponse } from 'next/server';

import { VENUES } from '@/config/venues';
import { getPublishedNotesPage } from '@/modules/notes';
import { parseNotesPageSearchParams } from '@/modules/notes/publicApi';

import { publicApiError } from '@/lib/publicApi';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const parsed = parseNotesPageSearchParams(searchParams);

  if (!parsed.ok) {
    return publicApiError(parsed.error, 400);
  }

  try {
    const page = await getPublishedNotesPage(parsed.input);

    return NextResponse.json(page);
  } catch (error) {
    console.error(`Failed to load ${VENUES.notes.label} page`, error);

    return publicApiError(`Failed to load ${VENUES.notes.label}.`, 500);
  }
}
