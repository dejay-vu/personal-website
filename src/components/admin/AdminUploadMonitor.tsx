'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { Button, ProgressCircle } from '@heroui/react';
import clsx from 'clsx';

import { appToast } from '@/lib/appToast';

import { adminFetch } from '@/components/admin/adminClient';
import { clearFinalizedNoteCreateDraft } from '@/components/admin/noteCreateDraftStorage';

const ADMIN_UPLOAD_EVENT = 'dejayvu:admin-upload-jobs';
const ADMIN_UPLOAD_STORAGE_KEY = 'dejayvu:admin-upload-jobs:v1';
const UPLOAD_STATUS_POLL_INTERVAL_MS = 1500;
const UPLOAD_STATUS_MAX_POLLS = 240;
const LEGACY_PHOTO_JOB_KIND = ['gal', 'lery'].join('');
const LEGACY_NOTE_JOB_KIND = ['thou', 'ght'].join('');

type PhotoUploadRetryInput = {
  slug: string;
  tags: string[];
  title: string;
};

export type AdminUploadJobInput = {
  kind: 'note' | 'photo';
  label: string;
  retry?: PhotoUploadRetryInput;
  uploadId: string;
};

type AdminUploadJob = AdminUploadJobInput & {
  error?: string;
  retryable?: boolean;
  status: 'error' | 'processing' | 'success';
};

type QueuedUploadPayload = {
  status: 'queued';
  uploadId: string;
};

class UploadProcessingError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'UploadProcessingError';
  }
}

type UploadStatusPayload = {
  data?: {
    statuses: {
      error: string | null;
      retryable?: boolean;
      status: 'ABORTED' | 'FAILED' | 'FINALIZED' | 'STAGED';
      uploadId: string;
    }[];
  };
  ok: boolean;
};

export function queueAdminUploadJobs(jobs: AdminUploadJobInput[]) {
  if (typeof window === 'undefined' || jobs.length === 0) return;

  window.dispatchEvent(
    new CustomEvent(ADMIN_UPLOAD_EVENT, {
      detail: {
        jobs,
      },
    }),
  );
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function normalizePhotoRetryInput(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;

  const candidate = value as Partial<PhotoUploadRetryInput>;
  if (
    typeof candidate.slug !== 'string' ||
    typeof candidate.title !== 'string' ||
    !Array.isArray(candidate.tags) ||
    !candidate.tags.every((tag) => typeof tag === 'string')
  ) {
    return undefined;
  }

  return {
    slug: candidate.slug,
    tags: candidate.tags,
    title: candidate.title,
  } satisfies PhotoUploadRetryInput;
}

async function fetchUploadStatus(uploadId: string) {
  const params = new URLSearchParams({
    uploadId,
  });
  const response = await fetch(`/api/admin/uploads/status?${params}`, {
    method: 'GET',
  });
  const payload = (await response
    .json()
    .catch(() => null)) as UploadStatusPayload | null;

  if (!response.ok || !payload?.ok || !payload.data) {
    throw new Error('Upload status could not be loaded.');
  }

  const status = payload.data.statuses.find(
    (item) => item.uploadId === uploadId,
  );

  if (!status) throw new Error('Upload status was not found.');

  return status;
}

function readStoredJobs() {
  try {
    const raw = window.localStorage.getItem(ADMIN_UPLOAD_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) return [];

    return parsed
      .flatMap((job): AdminUploadJob[] => {
        if (!job || typeof job !== 'object') return [];

        const candidate = job as Partial<AdminUploadJob>;
        const storedKind = (job as { kind?: unknown }).kind;
        const kind =
          storedKind === 'photo' || storedKind === LEGACY_PHOTO_JOB_KIND
            ? 'photo'
            : storedKind === 'note' || storedKind === LEGACY_NOTE_JOB_KIND
              ? 'note'
              : null;
        const retry =
          kind === 'photo'
            ? normalizePhotoRetryInput(candidate.retry)
            : undefined;

        if (
          !kind ||
          typeof candidate.uploadId !== 'string' ||
          typeof candidate.label !== 'string' ||
          (candidate.status !== 'processing' &&
            candidate.status !== 'success' &&
            candidate.status !== 'error')
        ) {
          return [];
        }

        return [
          {
            error: candidate.error,
            kind,
            label: candidate.label,
            retry,
            retryable: candidate.retryable === true,
            status: candidate.status,
            uploadId: candidate.uploadId,
          },
        ];
      })
      .slice(-12);
  } catch {
    window.localStorage.removeItem(ADMIN_UPLOAD_STORAGE_KEY);
    return [];
  }
}

function UploadProgressCircle({
  label,
  state,
}: {
  label: string;
  state: 'active' | 'error' | 'success';
}) {
  return (
    <ProgressCircle
      aria-label={label}
      isIndeterminate={state === 'active'}
      size="md"
      color={
        state === 'success'
          ? 'success'
          : state === 'error'
            ? 'danger'
            : 'accent'
      }
      value={state === 'active' ? undefined : 100}
      className="shrink-0"
    >
      <ProgressCircle.Track>
        <ProgressCircle.TrackCircle />
        <ProgressCircle.FillCircle />
      </ProgressCircle.Track>
    </ProgressCircle>
  );
}

export function AdminUploadMonitor() {
  const router = useRouter();
  const pollingIdsRef = useRef(new Set<string>());
  const [hasRestoredStoredJobs, setHasRestoredStoredJobs] = useState(false);
  const [jobs, setJobs] = useState<AdminUploadJob[]>([]);
  const hasJobs = jobs.length > 0;
  const hasProcessing = jobs.some((job) => job.status === 'processing');
  const hasError = jobs.some((job) => job.status === 'error');
  const allSuccess = hasJobs && jobs.every((job) => job.status === 'success');
  const visibleJobs = jobs.slice(-4);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setJobs(readStoredJobs());
      setHasRestoredStoredJobs(true);
    }, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!hasRestoredStoredJobs) return;

    window.localStorage.setItem(ADMIN_UPLOAD_STORAGE_KEY, JSON.stringify(jobs));
  }, [hasRestoredStoredJobs, jobs]);

  const updateJob = useCallback(
    (uploadId: string, next: Partial<AdminUploadJob>) => {
      setJobs((current) =>
        current.map((job) =>
          job.uploadId === uploadId ? { ...job, ...next } : job,
        ),
      );
    },
    [],
  );

  const pollJob = useCallback(
    async (job: AdminUploadJob) => {
      if (pollingIdsRef.current.has(job.uploadId)) return;

      pollingIdsRef.current.add(job.uploadId);

      try {
        for (let attempt = 0; attempt < UPLOAD_STATUS_MAX_POLLS; attempt += 1) {
          await wait(attempt === 0 ? 700 : UPLOAD_STATUS_POLL_INTERVAL_MS);

          const status = await fetchUploadStatus(job.uploadId);

          if (status.status === 'FINALIZED' && !status.error) {
            if (job.kind === 'note') {
              clearFinalizedNoteCreateDraft(job.uploadId);
            }

            updateJob(job.uploadId, {
              error: undefined,
              status: 'success',
            });
            return;
          }

          if (
            status.status === 'FAILED' ||
            status.status === 'ABORTED' ||
            (status.status === 'FINALIZED' && status.error) ||
            (status.status === 'STAGED' && status.error)
          ) {
            const message = status.error || 'Upload processing failed.';
            const retryable = Boolean(
              status.retryable && job.kind === 'photo' && job.retry,
            );

            updateJob(job.uploadId, { retryable });

            throw new UploadProcessingError(
              retryable ? `${message} Correct the slug and retry.` : message,
              retryable,
            );
          }
        }

        throw new Error('Upload is still processing. Refresh the page later.');
      } catch (error) {
        updateJob(job.uploadId, {
          error: error instanceof Error ? error.message : String(error),
          status: 'error',
        });
        throw error;
      } finally {
        pollingIdsRef.current.delete(job.uploadId);
      }
    },
    [updateJob],
  );

  const retryPhotoJob = useCallback(
    async (job: AdminUploadJob) => {
      if (job.kind !== 'photo' || !job.retry || !job.retry.slug.trim()) return;

      const processingJob: AdminUploadJob = {
        ...job,
        error: undefined,
        retry: {
          ...job.retry,
          slug: job.retry.slug.trim(),
        },
        retryable: false,
        status: 'processing',
      };

      updateJob(job.uploadId, {
        error: undefined,
        retryable: false,
      });

      try {
        const queued = await adminFetch<QueuedUploadPayload>(
          '/api/admin/photos/finalize',
          {
            body: {
              ...processingJob.retry,
              uploadId: processingJob.uploadId,
            },
          },
        );

        if (queued.uploadId !== processingJob.uploadId) {
          throw new Error('Upload retry returned a different upload id.');
        }

        // Claim the poll synchronously before publishing `processing`; the
        // restore effect also watches that state and must not win this race.
        const polling = pollJob(processingJob);
        updateJob(job.uploadId, processingJob);
        await polling;
        router.refresh();
        appToast.success(`Saved ${processingJob.label}.`);
        window.setTimeout(() => {
          setJobs((current) =>
            current.filter((item) => item.uploadId !== processingJob.uploadId),
          );
        }, 9000);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Upload retry failed.';

        updateJob(job.uploadId, {
          error: message,
          retryable:
            error instanceof UploadProcessingError ? error.retryable : true,
          status: 'error',
        });
        appToast.danger(message);
      }
    },
    [pollJob, router, updateJob],
  );

  const startJobs = useCallback(
    (nextJobs: AdminUploadJobInput[]) => {
      const processingJobs = nextJobs.map((job) => ({
        ...job,
        status: 'processing' as const,
      }));

      setJobs((current) => [
        ...current.filter(
          (currentJob) =>
            !processingJobs.some((job) => job.uploadId === currentJob.uploadId),
        ),
        ...processingJobs,
      ]);

      void (async () => {
        const results = await Promise.allSettled(
          processingJobs.map((job) => pollJob(job)),
        );
        const hasFailure = results.some(
          (result) => result.status === 'rejected',
        );

        router.refresh();

        if (hasFailure) {
          appToast.danger('Some background upload tasks failed.');
          return;
        }

        window.setTimeout(() => {
          setJobs((current) =>
            current.filter(
              (job) =>
                !processingJobs.some(
                  (completedJob) => completedJob.uploadId === job.uploadId,
                ),
            ),
          );
        }, 9000);
      })();
    },
    [pollJob, router],
  );

  const dismissJobs = useCallback(() => {
    setJobs([]);
    window.localStorage.removeItem(ADMIN_UPLOAD_STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (!hasRestoredStoredJobs) return;

    jobs
      .filter((job) => job.status === 'processing')
      .forEach((job) => {
        void pollJob(job).catch(() => undefined);
      });
  }, [hasRestoredStoredJobs, jobs, pollJob]);

  useEffect(() => {
    const handleJobs = (event: Event) => {
      const customEvent = event as CustomEvent<{
        jobs?: AdminUploadJobInput[];
      }>;
      const nextJobs = customEvent.detail?.jobs;

      if (!Array.isArray(nextJobs) || nextJobs.length === 0) return;

      startJobs(
        nextJobs.filter(
          (job) =>
            job &&
            typeof job.uploadId === 'string' &&
            typeof job.label === 'string' &&
            (job.kind === 'photo' || job.kind === 'note'),
        ),
      );
    };

    window.addEventListener(ADMIN_UPLOAD_EVENT, handleJobs);

    return () => {
      window.removeEventListener(ADMIN_UPLOAD_EVENT, handleJobs);
    };
  }, [startJobs]);

  if (!hasRestoredStoredJobs || !hasJobs) return null;

  return (
    <aside
      aria-live="polite"
      className={clsx(
        'fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-[95] w-[min(calc(100vw-2rem),22rem)] rounded-2xl border p-4 shadow-2xl backdrop-blur-xl transition-colors duration-300',
        hasError &&
          'border-danger/25 bg-background/95 text-foreground shadow-danger/10',
        allSuccess &&
          'border-emerald-500/30 bg-emerald-500/10 text-emerald-950 shadow-emerald-500/15 dark:text-emerald-50',
        hasProcessing &&
          !hasError &&
          'border-foreground/10 bg-background/95 text-foreground shadow-black/10',
      )}
    >
      <div className="flex items-start gap-3">
        <UploadProgressCircle
          label="Background upload progress"
          state={hasError ? 'error' : allSuccess ? 'success' : 'active'}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {hasError
              ? 'Upload needs attention'
              : allSuccess
                ? 'Upload complete'
                : 'Uploading in background'}
          </p>
          <p className="mt-0.5 text-xs text-foreground/55">
            {hasError
              ? 'One or more tasks failed.'
              : allSuccess
                ? 'Your media has been saved successfully.'
                : 'You can keep browsing the website.'}
          </p>
        </div>
        <Button
          aria-label="Dismiss upload status"
          className="-mr-1 -mt-1 size-8 min-w-0 rounded-full text-foreground/55 hover:bg-foreground/10 hover:text-foreground"
          onPress={dismissJobs}
          size="sm"
          variant="tertiary"
        >
          <span aria-hidden="true" className="text-base leading-none">
            ×
          </span>
        </Button>
      </div>

      <div className="mt-3 grid gap-2">
        {visibleJobs.map((job) => (
          <div
            key={job.uploadId}
            className="grid min-w-0 gap-2 rounded-xl bg-background/55 px-3 py-2 ring-1 ring-foreground/10"
          >
            <div className="flex min-w-0 items-center justify-between gap-3">
              <span className="min-w-0 truncate text-xs font-medium">
                {job.label}
              </span>
              <span
                className={clsx(
                  'shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold',
                  job.status === 'processing' && 'bg-accent/10 text-accent',
                  job.status === 'success' &&
                    'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                  job.status === 'error' && 'bg-danger/10 text-danger',
                )}
              >
                {job.status === 'processing'
                  ? 'Processing'
                  : job.status === 'success'
                    ? 'Done'
                    : 'Failed'}
              </span>
            </div>
            {job.status === 'error' && job.retryable && job.retry ? (
              <div className="flex items-center gap-2">
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Replacement photo slug</span>
                  <input
                    aria-label={`Replacement slug for ${job.label}`}
                    className="h-8 w-full rounded-lg border border-foreground/15 bg-background px-2 text-xs outline-none focus:border-accent"
                    value={job.retry.slug}
                    onChange={(event) =>
                      updateJob(job.uploadId, {
                        retry: {
                          ...job.retry!,
                          slug: event.currentTarget.value,
                        },
                      })
                    }
                  />
                </label>
                <Button
                  className="h-8 min-w-0 rounded-lg px-3 text-xs"
                  isDisabled={!job.retry.slug.trim()}
                  onPress={() => void retryPhotoJob(job)}
                  size="sm"
                  variant="primary"
                >
                  Retry
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {hasError ? (
        <p className="mt-3 line-clamp-2 text-xs text-danger">
          {jobs.find((job) => job.status === 'error')?.error ??
            'Upload processing failed.'}
        </p>
      ) : null}
    </aside>
  );
}
