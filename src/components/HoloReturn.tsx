'use client';

import { type MouseEvent, useState } from 'react';

import { useRouter } from 'next/navigation';

import { prepareHomeGateReturn } from '@/lib/homeGateReturn';

import { RouteLink } from '@/components/ui/RouteLink';
import { RouteProgress } from '@/components/ui/RouteProgress';

// The deep-page return affordance — a fixed top-right mono link back up the
// tree, mirroring the home HUD's position and material. Replaces the old
// bottom street pill + top-left wordmark strip on non-admin deep pages.
export function HoloReturn({
  href,
  label,
  restoreHomeScroll = false,
}: {
  href: string;
  label: string;
  restoreHomeScroll?: boolean;
}) {
  const router = useRouter();
  const [manualPending, setManualPending] = useState(false);

  const returnToGate = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      !restoreHomeScroll ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }

    const gateReturn = prepareHomeGateReturn(window.location.pathname);
    if (!gateReturn) return;

    event.preventDefault();
    setManualPending(true);
    if (window.history.length === gateReturn.historyLength + 1) {
      router.back();
      return;
    }

    router.push(href, { scroll: false });
  };

  return (
    <nav className="holo-return" aria-label="Return">
      <RouteLink
        href={href}
        onClick={returnToGate}
        progressLabel={`Loading ${label.toLowerCase()}`}
      >
        ← {label}
        {manualPending ? <RouteProgress label="Returning to home" /> : null}
      </RouteLink>
    </nav>
  );
}
