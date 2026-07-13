'use client';

import { NOTES_CACHE_TAG } from '@/modules/notes/types';
import { Button } from '@heroui/react';

import { revalidateDatabase } from '@/lib/actions';

export default function RevalidateButton({
  children,
  tag,
}: {
  children: React.ReactNode;
  tag: typeof NOTES_CACHE_TAG | 'photos';
}) {
  return <Button onPress={() => revalidateDatabase(tag)}>{children}</Button>;
}
