'use server';

import { revalidateTag } from 'next/cache';

import { requireAdminSession } from './admin';

export const revalidateDatabase = async (tag: string) => {
  await requireAdminSession();
  revalidateTag(tag, 'max');
};
