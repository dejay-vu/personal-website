'use client';

import type { ReactNode } from 'react';

import { Toast } from '@heroui/react';

type AppToastOptions = {
  description?: ReactNode;
  indicator?: ReactNode;
  isLoading?: boolean;
  onClose?: () => void;
  timeout?: number;
};

type AppToastVariant = 'accent' | 'danger' | 'default' | 'success' | 'warning';

export const appToastQueue = new Toast.Queue({
  maxVisibleToasts: 3,
});

const duplicateWindowMs = 900;
const recentToastKeys = new Map<string, { id: string; timestamp: number }>();

function getToastKey(title: ReactNode, variant: AppToastVariant) {
  return `${variant}:${typeof title === 'string' ? title : 'custom'}`;
}

function addToast(
  title: ReactNode,
  variant: AppToastVariant,
  options: AppToastOptions = {},
) {
  const toastKey = getToastKey(title, variant);
  const recentToast = recentToastKeys.get(toastKey);
  const now = Date.now();

  if (recentToast && now - recentToast.timestamp < duplicateWindowMs) {
    return recentToast.id;
  }

  const id = appToastQueue.add(
    {
      description: options.description,
      indicator: options.indicator,
      isLoading: options.isLoading,
      title,
      variant,
    },
    {
      onClose: () => {
        window.requestAnimationFrame(() => {
          const currentToast = recentToastKeys.get(toastKey);

          if (currentToast?.id === id) {
            recentToastKeys.delete(toastKey);
          }

          options.onClose?.();
        });
      },
      timeout: options.timeout,
    },
  );

  recentToastKeys.set(toastKey, {
    id,
    timestamp: now,
  });

  return id;
}

export const appToast = {
  danger: (title: ReactNode, options?: AppToastOptions) =>
    addToast(title, 'danger', options),
  info: (title: ReactNode, options?: AppToastOptions) =>
    addToast(title, 'accent', options),
  success: (title: ReactNode, options?: AppToastOptions) =>
    addToast(title, 'success', options),
  warning: (title: ReactNode, options?: AppToastOptions) =>
    addToast(title, 'warning', options),
};
