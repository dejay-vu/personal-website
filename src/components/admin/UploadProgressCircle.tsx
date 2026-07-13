'use client';

import { ProgressCircle } from '@heroui/react';

export function UploadProgressCircle({
  label,
  state = 'active',
}: {
  label: string;
  state?: 'active' | 'success';
}) {
  return (
    <ProgressCircle
      aria-label={label}
      isIndeterminate={state === 'active'}
      size="sm"
      color={state === 'success' ? 'success' : 'accent'}
      value={state === 'success' ? 100 : undefined}
      className="shrink-0"
    >
      <ProgressCircle.Track>
        <ProgressCircle.TrackCircle />
        <ProgressCircle.FillCircle />
      </ProgressCircle.Track>
    </ProgressCircle>
  );
}
