import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getAdminDashboardData } from '@/modules/admin/dashboard';

import { getAdminAccess } from '@/lib/admin';
import { createPageMetadata } from '@/lib/seo';

import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { AdminLogin } from '@/components/admin/AdminLogin';

export const metadata: Metadata = createPageMetadata({
  title: 'Admin',
  description: 'Private media workspace for DeJay Vu.',
  path: '/admin',
  noIndex: true,
});

export default async function AdminPage() {
  const access = await getAdminAccess();

  if (access.status === 'anonymous') {
    return <AdminLogin />;
  }

  if (access.status === 'forbidden') {
    notFound();
  }

  const data = await getAdminDashboardData();

  return <AdminDashboard data={data} />;
}
