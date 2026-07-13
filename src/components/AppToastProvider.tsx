'use client';

import { Spinner, Toast } from '@heroui/react';

import { appToastQueue } from '@/lib/appToast';

export function AppToastProvider() {
  return (
    <Toast.Provider
      queue={appToastQueue}
      placement="bottom end"
      maxVisibleToasts={3}
      width="min(calc(100vw - 2rem), 24rem)"
    >
      {({ toast }) => {
        const content = toast.content;
        const variant = content?.variant ?? 'default';

        return (
          <Toast toast={toast} variant={variant} className="app-toast">
            {content?.indicator === null ? null : (
              <Toast.Indicator variant={variant}>
                {content?.isLoading ? (
                  <Spinner color="current" size="sm" />
                ) : (
                  content?.indicator
                )}
              </Toast.Indicator>
            )}
            <Toast.Content className="min-w-0">
              {content?.title && (
                <Toast.Title className="truncate">{content.title}</Toast.Title>
              )}
              {content?.description && (
                <Toast.Description className="line-clamp-2">
                  {content.description}
                </Toast.Description>
              )}
            </Toast.Content>
            {content?.actionProps?.children && (
              <Toast.ActionButton {...content.actionProps} />
            )}
            <Toast.CloseButton className="app-toast-close-button" />
          </Toast>
        );
      }}
    </Toast.Provider>
  );
}
