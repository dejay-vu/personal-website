'use client';

export const ADMIN_FETCH_TIMEOUT_MS = 90_000;
export const S3_UPLOAD_TIMEOUT_MS = 5 * 60_000;

export type PresignedUpload = {
  fields: Record<string, string>;
  kind: string;
  originalName: string;
  uploadId: string;
  url: string;
};

type ApiResponse<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      error?: {
        message?: string;
      };
      ok: false;
    };

type AdminFetchOptions = {
  body?: unknown;
  method?: 'DELETE' | 'GET' | 'PATCH' | 'POST';
  timeoutMs?: number;
};

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
) {
  const request = fetch(input, init);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Request timed out. Please retry.'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }

    // A mutation may already have reached the server when the client-side
    // deadline expires. Observe a late rejection without aborting the request.
    request.catch(() => undefined);
  }
}

export async function adminFetch<T>(
  url: string,
  {
    body,
    method = 'POST',
    timeoutMs = ADMIN_FETCH_TIMEOUT_MS,
  }: AdminFetchOptions = {},
) {
  const response = await fetchWithTimeout(
    url,
    {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers:
        body === undefined ? undefined : { 'Content-Type': 'application/json' },
      method,
    },
    timeoutMs,
  );
  const payload = (await response
    .json()
    .catch(() => null)) as ApiResponse<T> | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(
      payload && !payload.ok
        ? payload.error?.message || 'Admin request failed.'
        : 'Admin request failed.',
    );
  }

  return payload.data;
}

export async function uploadToS3(
  upload: PresignedUpload,
  file: File,
  timeoutMs = S3_UPLOAD_TIMEOUT_MS,
) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(upload.fields)) {
    formData.append(key, value);
  }

  formData.append('file', file, file.name);

  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    let isSettled = false;
    let didTimeOut = false;
    const settle = (callback: () => void) => {
      if (isSettled) return;

      isSettled = true;
      clearTimeout(timeoutId);
      callback();
    };
    const timeoutId = setTimeout(() => {
      didTimeOut = true;
      request.abort();
      settle(() => reject(new Error(`S3 upload timed out for ${file.name}.`)));
    }, timeoutMs);

    request.open('POST', upload.url);

    request.onload = () => {
      settle(() => {
        if (request.status >= 200 && request.status < 300) {
          resolve();
          return;
        }

        reject(
          new Error(
            request.responseText
              ? `S3 upload failed for ${file.name}: ${request.status} ${request.responseText}`
              : `S3 upload failed for ${file.name}: ${request.status}`,
          ),
        );
      });
    };

    request.onerror = () => {
      settle(() =>
        reject(
          new Error(
            `S3 upload could not reach the storage endpoint for ${file.name}.`,
          ),
        ),
      );
    };

    request.onabort = () => {
      if (didTimeOut) return;

      settle(() =>
        reject(new Error(`S3 upload was cancelled for ${file.name}.`)),
      );
    };

    request.send(formData);
  });
}
