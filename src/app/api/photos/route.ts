import { NextResponse } from 'next/server';

import { getPhotosPage } from '@/modules/photos';
import { parsePhotosPageSearchParams } from '@/modules/photos/publicApi';

import { publicApiError } from '@/lib/publicApi';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = parsePhotosPageSearchParams(searchParams);

  if (!parsed.ok) {
    return publicApiError(parsed.error, 400);
  }

  try {
    const page = await getPhotosPage(parsed.input);

    return NextResponse.json(page);
  } catch (error) {
    console.error('Failed to load photos page', error);

    return publicApiError('Failed to load photos.', 500);
  }
}
