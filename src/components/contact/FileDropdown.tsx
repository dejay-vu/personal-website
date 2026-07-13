'use client';

import { useFormStatus } from 'react-dom';

import { Button, Tooltip } from '@heroui/react';

import { AttachmentIcon } from '../ui/Icons';

export function FileDropdown({ onPress }: { onPress: () => void }) {
  const { pending } = useFormStatus();

  return (
    <Tooltip delay={300}>
      <Button
        type="button"
        variant="tertiary"
        isIconOnly
        isPending={pending}
        aria-label="Add files"
        className="size-10 min-w-10 rounded-full transition-[background-color,color] duration-300 hover:bg-accent/10 hover:text-accent data-[pending=true]:opacity-100"
        onPress={onPress}
      >
        <AttachmentIcon />
      </Button>
      <Tooltip.Content>
        <p className="text-xs">Attach files</p>
      </Tooltip.Content>
    </Tooltip>
  );
}
