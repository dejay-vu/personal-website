'use client';

import { ThemeProvider } from 'next-themes';

import { AppToastProvider } from '@/components/AppToastProvider';
import { AdminUploadMonitor } from '@/components/admin/AdminUploadMonitor';

// AdminUploadMonitor stays global (it renders nothing without queued jobs in
// localStorage) so background upload tracking survives navigating away from
// /admin, as its own UI promises. The heavy providers (next-auth session,
// parallax) were removed from the public tree instead.
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    // The public site is committed dark-neon (admin re-neutralizes via
    // .app-neutral). forcedTheme locks dark and makes ThemeSwitch inert, so the
    // theme toggle is removed from the chrome.
    <ThemeProvider
      forcedTheme="dark"
      attribute={['class', 'data-theme']}
      value={{ dark: 'dark', light: 'light' }}
    >
      {children}
      <AdminUploadMonitor />
      <AppToastProvider />
    </ThemeProvider>
  );
}
