'use client';

import { createPortal } from 'react-dom';

import styles from './RouteProgress.module.css';

export function RouteProgress({ label }: { label: string }) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <span
      aria-label={label}
      data-route-progress
      role="progressbar"
      className={styles.track}
    >
      <span className={styles.bar} />
    </span>,
    document.body,
  );
}
