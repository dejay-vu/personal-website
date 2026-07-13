'use client';

import type { ComponentType } from 'react';

import clsx from 'clsx';

type ContactFieldIconProps = {
  isActive: boolean;
  OutlineIcon: ComponentType;
  SolidIcon: ComponentType;
};

export function ContactFieldIcon({
  isActive,
  OutlineIcon,
  SolidIcon,
}: ContactFieldIconProps) {
  return (
    <span
      aria-hidden
      className="relative grid size-5 shrink-0 place-items-center text-foreground/60 transition-colors duration-300 group-data-[focus-within]:text-accent"
    >
      <span
        className={clsx(
          'absolute inset-0 grid place-items-center transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none [&>svg]:size-5',
          isActive ? 'scale-90 opacity-0' : 'scale-100 opacity-100',
        )}
      >
        <SolidIcon />
      </span>
      <span
        className={clsx(
          'absolute inset-0 grid place-items-center transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none [&>svg]:size-5',
          isActive ? 'scale-100 opacity-100' : 'scale-95 opacity-0',
        )}
      >
        <OutlineIcon />
      </span>
    </span>
  );
}
