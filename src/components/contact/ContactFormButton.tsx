'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button, Spinner } from '@heroui/react';

import type { ContactFormState } from '@/lib/contact';

import { CheckIcon, ExclamationIcon, SendIcon } from '../ui/Icons';

type ContactFormButtonIconState = 'error' | 'idle' | 'pending' | 'success';

function ContactFormButtonIconLayer({
  children,
  isActive,
}: {
  children: ReactNode;
  isActive: boolean;
}) {
  return (
    <span
      aria-hidden
      className={`absolute inset-0 grid place-items-center transition-[opacity,scale,rotate] duration-[360ms] ease-out motion-reduce:transition-none ${
        isActive
          ? 'scale-100 rotate-0 opacity-100'
          : 'pointer-events-none scale-75 -rotate-12 opacity-0'
      }`}
    >
      <span
        data-slot="link-icon"
        className="grid size-5 place-items-center leading-none [&>svg]:!m-0 [&>svg]:!block [&>svg]:!size-5"
      >
        {children}
      </span>
    </span>
  );
}

export function ContactFormButton({
  feedbackKey,
  isDisabled,
  status,
}: {
  feedbackKey?: number;
  isDisabled: boolean;
  status: ContactFormState['status'];
}) {
  const { pending } = useFormStatus();
  const [expiredFeedbackKey, setExpiredFeedbackKey] = useState<number>();
  const visualStatus =
    feedbackKey &&
    feedbackKey !== expiredFeedbackKey &&
    status !== 'idle' &&
    !pending
      ? status
      : 'idle';
  const buttonVariant = visualStatus === 'error' ? 'danger' : 'primary';

  useEffect(() => {
    if (!feedbackKey || status === 'idle') return;

    const timeoutId = window.setTimeout(() => {
      setExpiredFeedbackKey(feedbackKey);
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [feedbackKey, status]);

  const iconState: ContactFormButtonIconState = pending
    ? 'pending'
    : visualStatus === 'success' || visualStatus === 'error'
      ? visualStatus
      : 'idle';
  const toneClassName =
    visualStatus === 'success'
      ? '[--button-bg:var(--success)] [--button-bg-hover:var(--success-hover)] [--button-bg-pressed:var(--success-hover)] [--button-fg:var(--success-foreground)]'
      : visualStatus === 'error'
        ? ''
        : '[--button-bg:var(--accent)] [--button-bg-hover:var(--accent-hover)] [--button-bg-pressed:var(--accent-hover)] [--button-fg:var(--accent-foreground)]';

  return (
    <Button
      type="submit"
      variant={buttonVariant}
      isIconOnly
      isDisabled={isDisabled}
      isPending={pending}
      aria-label="Send message"
      className={`size-10 min-w-10 rounded-full !transition-[transform,background-color,color,box-shadow] !duration-[360ms] !ease-out data-[pending=true]:opacity-100 ${toneClassName}`}
    >
      <span className="relative grid size-5 place-items-center">
        <ContactFormButtonIconLayer isActive={iconState === 'pending'}>
          {pending ? <Spinner size="sm" color="current" /> : null}
        </ContactFormButtonIconLayer>
        <ContactFormButtonIconLayer isActive={iconState === 'success'}>
          <CheckIcon />
        </ContactFormButtonIconLayer>
        <ContactFormButtonIconLayer isActive={iconState === 'error'}>
          <ExclamationIcon />
        </ContactFormButtonIconLayer>
        <ContactFormButtonIconLayer isActive={iconState === 'idle'}>
          <SendIcon />
        </ContactFormButtonIconLayer>
      </span>
    </Button>
  );
}
