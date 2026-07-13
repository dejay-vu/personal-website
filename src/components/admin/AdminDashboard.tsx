'use client';

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { signOut } from 'next-auth/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

import type { AdminDashboardData } from '@/modules/admin/dashboard';
import {
  AlertDialog,
  Button,
  Card,
  Drawer,
  Fieldset,
  Form,
  InputGroup,
  SearchField,
  Table,
  Tabs,
  TextField,
  useOverlayState,
} from '@heroui/react';
import clsx from 'clsx';

import { ADMIN_UPLOAD_LIMITS } from '@/lib/adminUpload';
import { appToast } from '@/lib/appToast';
import { formatFileSize } from '@/lib/format';
import { toSlug } from '@/lib/slug';

import { queueAdminUploadJobs } from '@/components/admin/AdminUploadMonitor';
import { NoteEditorDrawer } from '@/components/admin/NoteEditorDrawer';
import { UploadProgressCircle } from '@/components/admin/UploadProgressCircle';
import {
  type PresignedUpload,
  adminFetch,
  uploadToS3,
} from '@/components/admin/adminClient';
import { FileAddIcon, PhotosIcon, XMarkIcon } from '@/components/ui';

type AdminPhoto = AdminDashboardData['photos'][number];
type AdminNote = AdminDashboardData['notes'][number];
type AdminDeletionJobs = AdminDashboardData['deletionJobs'];

type QueuedUploadPayload = {
  status: 'queued';
  uploadId: string;
};

type StorageDeletionDrainPayload = {
  claimed: number;
  retried: number;
};

type ConfirmState = {
  body: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  title: string;
} | null;

type AdminMutationInput = {
  body?: unknown;
  method: 'DELETE' | 'PATCH';
  success: string;
  url: string;
};

const uploadKind = {
  photo: 'PHOTO',
} as const;

const createActionButtonClassName =
  'inline-flex h-10 w-full min-w-0 shrink-0 items-center justify-center gap-2.5 whitespace-nowrap rounded-full !bg-foreground px-4 text-xs font-medium !text-background shadow-none transition-opacity hover:!bg-foreground hover:opacity-85 sm:w-auto sm:min-w-36 sm:px-5 sm:text-sm';
const hiddenOverlayTriggerClassName =
  'fixed -left-[100vw] top-0 size-px overflow-hidden whitespace-nowrap border-0 p-0 opacity-0 pointer-events-none';
const adminDrawerInputGroupClassName =
  'admin-drawer-input rounded-large border border-foreground/10 bg-background';
function formatDate(value: string | null) {
  if (!value) return 'Active';

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getFileTitle(file: File) {
  return file.name
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
}

function StatusPill({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'danger' | 'default' | 'success' | 'warning';
}) {
  return (
    <span
      className={clsx(
        'inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-medium',
        tone === 'success' &&
          'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        tone === 'warning' &&
          'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        tone === 'danger' &&
          'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300',
        tone === 'default' &&
          'border-foreground/10 bg-foreground/5 text-foreground/70',
      )}
    >
      {children}
    </span>
  );
}

function AdminSearch({
  onChange,
  placeholder,
  value,
}: {
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <SearchField
      aria-label={placeholder}
      value={value}
      onChange={onChange}
      className="w-full md:max-w-sm"
    >
      <SearchField.Group className="rounded-full border border-foreground/10 bg-background px-3 shadow-sm transition-colors focus-within:border-accent">
        <SearchField.SearchIcon className="size-4 text-foreground/45" />
        <SearchField.Input placeholder={placeholder} className="h-10" />
        <SearchField.ClearButton className="text-foreground/45" />
      </SearchField.Group>
    </SearchField>
  );
}

function AdminTableShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Table.Root
      variant="secondary"
      className={clsx('overflow-hidden rounded-large', className)}
    >
      <Table.ScrollContainer>{children}</Table.ScrollContainer>
    </Table.Root>
  );
}

function AdminThumbnail({
  alt = '',
  src,
  variant,
}: {
  alt?: string;
  src: string;
  variant: 'card' | 'table';
}) {
  return (
    <span
      className={clsx(
        'relative block shrink-0 overflow-hidden rounded-md bg-foreground/5',
        variant === 'card' && 'h-[4.5rem] w-24 sm:h-20 sm:w-28',
        variant === 'table' && 'h-14 w-20',
      )}
    >
      <Image
        unoptimized
        src={src}
        alt={alt}
        fill
        sizes={variant === 'card' ? '(max-width: 640px) 6rem, 7rem' : '5rem'}
        className="object-cover"
      />
    </span>
  );
}

function RowActions({
  children,
  className,
  display = 'flex',
  isPending,
}: {
  children: React.ReactNode;
  className?: string;
  display?: 'flex' | 'grid';
  isPending: boolean;
}) {
  return (
    <div
      className={clsx(
        display === 'grid'
          ? 'grid items-center gap-2'
          : 'flex flex-wrap items-center justify-end gap-2',
        className,
        isPending && 'pointer-events-none opacity-50',
      )}
    >
      {children}
    </div>
  );
}

function EmptyAdminState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-large border border-dashed border-foreground/15 p-6 text-center text-sm text-foreground/55">
      {children}
    </div>
  );
}

function splitTagInput(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatExifTag(field: string, value: unknown) {
  const normalizedValue = String(value ?? '').trim();

  return normalizedValue ? `${field}:${normalizedValue}` : null;
}

async function extractClientExifTags(file: File) {
  try {
    const ExifReader = await import('exifreader');
    const tags = ExifReader.load(await file.arrayBuffer()) as Record<
      string,
      {
        description?: unknown;
        value?: unknown;
      }
    >;
    const getDescription = (key: string) =>
      tags[key]?.description ?? tags[key]?.value ?? '';
    const date = String(
      getDescription('DateTimeOriginal') || getDescription('DateTime') || '',
    );
    const year = date.match(/\d{4}/)?.[0] ?? '';

    return [
      formatExifTag('fileType', getDescription('FileType')),
      formatExifTag('make', getDescription('Make')),
      formatExifTag('model', getDescription('Model')),
      formatExifTag('lensMake', getDescription('LensMake')),
      formatExifTag('lens', getDescription('LensModel')),
      formatExifTag('iso', getDescription('ISOSpeedRatings')),
      formatExifTag('aperture', getDescription('FNumber')),
      formatExifTag('shutter', getDescription('ExposureTime')),
      formatExifTag('focalLength', getDescription('FocalLength')),
      formatExifTag('focalLength35mm', getDescription('FocalLengthIn35mmFilm')),
      formatExifTag('exposureMode', getDescription('ExposureMode')),
      formatExifTag('exposureProgram', getDescription('ExposureProgram')),
      formatExifTag('orientation', getDescription('Orientation')),
      formatExifTag('year', year),
    ].filter((tag): tag is string => Boolean(tag));
  } catch {
    return [];
  }
}

function PhotoUploadDrawer() {
  const drawer = useOverlayState({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<
    {
      error?: string;
      file: File;
      slug: string;
      stage: 'error' | 'idle' | 'processing' | 'uploading';
      tags: string;
      title: string;
      uploadId?: string;
    }[]
  >([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasPhotos = items.length > 0;
  const hasActiveJobs = items.some(
    (item) => item.stage === 'uploading' || item.stage === 'processing',
  );
  const isLocked = isSubmitting || hasActiveJobs;
  const canSubmit =
    hasPhotos &&
    items.every(
      (item) => item.title.trim().length > 0 && item.slug.trim().length > 0,
    ) &&
    !isLocked;

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    if (isLocked) return;

    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);

    if (files.length === 0) return;

    const remainingSlots =
      ADMIN_UPLOAD_LIMITS.maxPhotoBatchFiles - items.length;

    if (remainingSlots <= 0) {
      appToast.warning(
        `Upload up to ${ADMIN_UPLOAD_LIMITS.maxPhotoBatchFiles} photos at a time.`,
      );
      input.value = '';
      return;
    }

    if (files.length > remainingSlots) {
      appToast.warning(
        `Upload up to ${ADMIN_UPLOAD_LIMITS.maxPhotoBatchFiles} photos at a time.`,
      );
    }

    const nextItems = await Promise.all(
      files.slice(0, remainingSlots).map(async (file) => {
        const title = getFileTitle(file);

        return {
          file,
          slug: toSlug(title),
          stage: 'idle' as const,
          tags: (await extractClientExifTags(file)).join(', '),
          title,
        };
      }),
    );

    setItems((current) => [...current, ...nextItems]);
    input.value = '';
  };

  const updateItem = (index: number, next: Partial<(typeof items)[number]>) => {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...next } : item,
      ),
    );
  };

  const removeItem = (index: number) => {
    if (isLocked) return;

    setItems((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    const queuedUploads: { index: number; uploadId: string }[] = [];

    try {
      await adminFetch('/api/admin/photos/preflight', {
        body: {
          items: items.map((item) => ({
            slug: item.slug,
            tags: splitTagInput(item.tags),
            title: item.title,
          })),
        },
      });

      const { uploads } = await adminFetch<{ uploads: PresignedUpload[] }>(
        '/api/admin/uploads/presign',
        {
          body: {
            files: items.map((item) => ({
              kind: uploadKind.photo,
              name: item.file.name,
              size: item.file.size,
              type: item.file.type,
            })),
          },
        },
      );

      for (const [index, item] of items.entries()) {
        const upload = uploads[index];

        try {
          updateItem(index, { error: undefined, stage: 'uploading' });
          await uploadToS3(upload, item.file);
          updateItem(index, {
            stage: 'processing',
            uploadId: upload.uploadId,
          });
          const queued = await adminFetch<QueuedUploadPayload>(
            '/api/admin/photos/finalize',
            {
              body: {
                slug: item.slug,
                tags: splitTagInput(item.tags),
                title: item.title,
                uploadId: upload.uploadId,
              },
            },
          );
          queuedUploads.push({
            index,
            uploadId: queued.uploadId,
          });
        } catch (error) {
          updateItem(index, {
            error: error instanceof Error ? error.message : String(error),
            stage: 'error',
          });
          throw error;
        }
      }

      queueAdminUploadJobs(
        queuedUploads.map(({ index, uploadId }) => ({
          kind: 'photo',
          label: items[index]?.title || items[index]?.file.name || 'Photo',
          retry: {
            slug: items[index]!.slug,
            tags: splitTagInput(items[index]!.tags),
            title: items[index]!.title,
          },
          uploadId,
        })),
      );
      setItems([]);
      drawer.close();
    } catch (error) {
      appToast.danger(
        error instanceof Error ? error.message : 'Upload failed.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isSubmitting) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isSubmitting]);

  return (
    <Drawer state={drawer}>
      <Drawer.Trigger className={createActionButtonClassName}>
        <PhotosIcon />
        <span className="sm:inline">Add photos</span>
      </Drawer.Trigger>
      <Drawer.Backdrop
        variant="blur"
        isDismissable={!isSubmitting}
        className="fixed inset-0 z-[60] bg-background/20 backdrop-blur-md"
      >
        <Drawer.Content
          placement="right"
          className="fixed inset-y-0 !left-auto !right-0 z-[70] flex h-dvh w-[min(30rem,96vw)]"
        >
          <Drawer.Dialog className="relative flex h-full w-full flex-col border-l border-foreground/10 bg-background p-0 shadow-2xl outline-none">
            <Drawer.CloseTrigger
              isDisabled={isSubmitting}
              className="absolute right-4 top-4 z-10 grid size-9 place-items-center rounded-full bg-background/80 text-foreground/60 shadow-sm backdrop-blur transition-colors hover:bg-foreground/5 hover:text-foreground"
            />
            <Drawer.Body className="flex min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-16">
              <Form
                onSubmit={submit}
                className="grid w-full content-start gap-3"
              >
                <Fieldset aria-label="Photos" className="grid gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={isLocked}
                    className="hidden"
                    onChange={handleFiles}
                  />
                  <Button
                    type="button"
                    variant="tertiary"
                    isDisabled={isLocked}
                    className="w-full justify-center rounded-full border border-foreground/15 px-4"
                    onPress={() => fileInputRef.current?.click()}
                  >
                    <FileAddIcon />
                    Add photos
                  </Button>
                  {!hasPhotos && (
                    <p className="text-sm text-foreground/55">
                      Add at least one photo before uploading.
                    </p>
                  )}
                  {items.length > 0 && (
                    <div className="grid gap-3">
                      {items.map((item, index) => (
                        <div
                          key={`${item.file.name}-${item.file.lastModified}-${index}`}
                          className="grid gap-3 rounded-large border border-foreground/10 p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">
                                {item.file.name}
                              </p>
                              <p className="text-xs text-foreground/55">
                                {formatFileSize(item.file.size)}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <Button
                                type="button"
                                variant="tertiary"
                                isIconOnly
                                isDisabled={isLocked}
                                aria-label={`Remove ${item.file.name}`}
                                className="size-9 rounded-full border border-foreground/10 p-0 text-foreground/55 hover:text-danger"
                                onPress={() => removeItem(index)}
                              >
                                <XMarkIcon />
                              </Button>
                            </div>
                          </div>
                          <TextField
                            aria-label={`Title for ${item.file.name}`}
                            isDisabled={isLocked}
                            value={item.title}
                            onChange={(title) => updateItem(index, { title })}
                          >
                            <InputGroup
                              className={adminDrawerInputGroupClassName}
                            >
                              <InputGroup.Input placeholder="Photo title" />
                            </InputGroup>
                          </TextField>
                          <TextField
                            aria-label={`Slug for ${item.file.name}`}
                            isDisabled={isLocked}
                            value={item.slug}
                            onChange={(slug) => updateItem(index, { slug })}
                          >
                            <InputGroup
                              className={adminDrawerInputGroupClassName}
                            >
                              <InputGroup.Input placeholder="photo-slug" />
                            </InputGroup>
                          </TextField>
                          <TextField
                            aria-label={`Tags for ${item.file.name}`}
                            isDisabled={isLocked}
                            value={item.tags}
                            onChange={(tags) => updateItem(index, { tags })}
                          >
                            <InputGroup
                              className={adminDrawerInputGroupClassName}
                            >
                              <InputGroup.Input placeholder="Tags, comma separated. Use country:Japan or iso:100 for semantic search." />
                            </InputGroup>
                          </TextField>
                          {item.stage === 'uploading' && (
                            <div className="flex items-center gap-3 rounded-large bg-foreground/[0.03] px-3 py-2">
                              <UploadProgressCircle label="Upload to S3" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium">
                                  Uploading to S3
                                </p>
                                <p className="text-xs text-foreground/50">
                                  Keep this page open until the direct upload
                                  finishes.
                                </p>
                              </div>
                            </div>
                          )}
                          {item.stage === 'processing' && (
                            <div className="flex items-center gap-3 rounded-large bg-foreground/[0.03] px-3 py-2">
                              <UploadProgressCircle label="Process photo" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium">
                                  Processing in background
                                </p>
                                <p className="text-xs text-foreground/50">
                                  The server is saving this photo.
                                </p>
                              </div>
                            </div>
                          )}
                          {item.error && (
                            <p className="text-sm text-danger">{item.error}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Fieldset>
                <Drawer.Footer className="sticky bottom-0 z-10 border-0 bg-background/95 p-0 pt-3 shadow-none backdrop-blur">
                  <Button
                    type="submit"
                    variant="primary"
                    isDisabled={!canSubmit}
                    className="w-full rounded-full !border-0 shadow-none"
                  >
                    {isSubmitting
                      ? 'Queuing...'
                      : hasActiveJobs
                        ? 'Processing...'
                        : 'Upload photos'}
                  </Button>
                </Drawer.Footer>
              </Form>
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}

function PhotoEditDrawer({
  className,
  photo,
}: {
  className?: string;
  photo: AdminPhoto;
}) {
  const router = useRouter();
  const drawer = useOverlayState({});
  const [tags, setTags] = useState(
    photo.tags.map((tag) => `${tag.field}:${tag.value}`).join(', '),
  );
  const [slug, setSlug] = useState(photo.slug);
  const [title, setTitle] = useState(photo.title);
  const [isSaving, setIsSaving] = useState(false);
  const canSave =
    slug.trim().length > 0 && title.trim().length > 0 && !isSaving;

  const openEditor = () => {
    setTags(photo.tags.map((tag) => `${tag.field}:${tag.value}`).join(', '));
    setSlug(photo.slug);
    setTitle(photo.title);
    drawer.open();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSave) return;

    setIsSaving(true);

    try {
      await adminFetch(`/api/admin/photos/${photo.id}`, {
        body: {
          action: 'update',
          slug,
          tags: splitTagInput(tags),
          title,
        },
        method: 'PATCH',
      });
      appToast.success('Photo updated.');
      drawer.close();
      router.refresh();
    } catch (error) {
      appToast.danger(
        error instanceof Error ? error.message : 'Photo update failed.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="tertiary"
        className={className}
        onPress={openEditor}
      >
        Edit
      </Button>
      <Drawer state={drawer}>
        <Drawer.Trigger
          className={hiddenOverlayTriggerClassName}
          aria-hidden
          excludeFromTabOrder
        >
          Edit photo
        </Drawer.Trigger>
        <Drawer.Backdrop
          variant="blur"
          isDismissable={!isSaving}
          className="fixed inset-0 z-[60] bg-background/20 backdrop-blur-md"
        >
          <Drawer.Content
            placement="right"
            className="fixed inset-y-0 !left-auto !right-0 z-[70] flex h-dvh w-[min(30rem,96vw)]"
          >
            <Drawer.Dialog className="relative flex h-full w-full flex-col border-l border-foreground/10 bg-background p-0 shadow-2xl outline-none">
              <Drawer.CloseTrigger
                isDisabled={isSaving}
                className="absolute right-4 top-4 z-10 grid size-9 place-items-center rounded-full bg-background/80 text-foreground/60 shadow-sm backdrop-blur transition-colors hover:bg-foreground/5 hover:text-foreground"
              />
              <Drawer.Body className="flex min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-16">
                <Form
                  onSubmit={submit}
                  className="grid w-full content-start gap-3"
                >
                  <TextField
                    aria-label="Photo title"
                    isRequired
                    isDisabled={isSaving}
                    value={title}
                    onChange={setTitle}
                  >
                    <InputGroup className={adminDrawerInputGroupClassName}>
                      <InputGroup.Input placeholder="Photo title" />
                    </InputGroup>
                  </TextField>
                  <TextField
                    aria-label="Photo slug"
                    isRequired
                    isDisabled={isSaving}
                    value={slug}
                    onChange={setSlug}
                  >
                    <InputGroup className={adminDrawerInputGroupClassName}>
                      <InputGroup.Input placeholder="photo-slug" />
                    </InputGroup>
                  </TextField>
                  <TextField
                    aria-label="Photo tags"
                    isDisabled={isSaving}
                    value={tags}
                    onChange={setTags}
                  >
                    <InputGroup className={adminDrawerInputGroupClassName}>
                      <InputGroup.Input placeholder="Tags, comma separated. Use country:Japan or iso:100 for semantic search." />
                    </InputGroup>
                  </TextField>
                  <p className="text-xs leading-5 text-foreground/45">
                    Title and slug are edited independently. The immutable media
                    key stays unchanged.
                  </p>
                  <Drawer.Footer className="sticky bottom-0 border-0 bg-background/95 p-0 pt-3 shadow-none backdrop-blur">
                    <Button
                      type="submit"
                      variant="primary"
                      isDisabled={!canSave}
                      className="w-full rounded-full !border-0 shadow-none"
                    >
                      {isSaving ? 'Saving...' : 'Save changes'}
                    </Button>
                  </Drawer.Footer>
                </Form>
              </Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
    </>
  );
}

function StorageDeletionJobsCard({
  jobs,
  onRun,
  pendingAction,
}: {
  jobs: AdminDeletionJobs;
  onRun: (action: 'drain' | 'retry') => Promise<void>;
  pendingAction: 'drain' | 'retry' | null;
}) {
  const { counts, recentFailures } = jobs;
  const activeCount = counts.pending + counts.processing + counts.failed;

  return (
    <Card className="w-full min-w-0 overflow-hidden border border-foreground/10 bg-background">
      <Card.Content className="p-4 md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">
                Storage deletion queue
              </h2>
              <StatusPill tone={counts.failed > 0 ? 'danger' : 'default'}>
                {activeCount} active
              </StatusPill>
            </div>
            <p className="mt-1 text-sm text-foreground/55">
              Originals and transformed variants are removed asynchronously. The
              daily worker also reclaims expired processing leases.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusPill>{counts.pending} pending</StatusPill>
              <StatusPill tone={counts.processing > 0 ? 'warning' : 'default'}>
                {counts.processing} processing
              </StatusPill>
              <StatusPill tone={counts.failed > 0 ? 'danger' : 'default'}>
                {counts.failed} failed
              </StatusPill>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Button
              variant="tertiary"
              className="rounded-full border border-foreground/10"
              isDisabled={pendingAction !== null}
              onPress={() => void onRun('drain')}
            >
              {pendingAction === 'drain' ? 'Draining…' : 'Drain now'}
            </Button>
            {counts.failed > 0 ? (
              <Button
                variant="primary"
                className="rounded-full"
                isDisabled={pendingAction !== null}
                onPress={() => void onRun('retry')}
              >
                {pendingAction === 'retry' ? 'Retrying…' : 'Retry failed'}
              </Button>
            ) : null}
          </div>
        </div>

        {recentFailures.length > 0 ? (
          <div className="mt-4 border-t border-foreground/10 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/45">
              Recent errors
            </p>
            <div className="mt-2 grid gap-2">
              {recentFailures.map((job) => (
                <div
                  key={job.id}
                  className="rounded-xl bg-danger/5 px-3 py-2 ring-1 ring-danger/15"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-xs font-medium text-foreground">
                      {job.reason}
                    </p>
                    <span className="shrink-0 text-[0.7rem] text-foreground/45">
                      Attempt {job.attempts} · retry{' '}
                      {formatDateTime(job.nextAttemptAt)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-danger">
                    {job.lastError}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Card.Content>
    </Card>
  );
}

export function AdminDashboard({ data }: { data: AdminDashboardData }) {
  const router = useRouter();
  const isMutatingRef = useRef(false);
  const [tab, setTab] = useState('photos');
  const [query, setQuery] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const deletionPendingAction = pendingId?.startsWith('storage-deletions:')
    ? (pendingId.slice('storage-deletions:'.length) as 'drain' | 'retry')
    : null;

  const photos = useMemo(() => {
    if (!normalizedQuery) return data.photos;

    return data.photos.filter((photo) =>
      [
        photo.title,
        photo.slug,
        ...photo.tags.flatMap((tag) => [
          tag.field,
          tag.label,
          tag.slug,
          tag.value,
        ]),
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [data.photos, normalizedQuery]);

  const notes = useMemo(() => {
    if (!normalizedQuery) return data.notes;

    return data.notes.filter((note) =>
      [note.title, note.seoTitle, note.slug, note.abstract]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [data.notes, normalizedQuery]);

  const mutate = async ({ body, method, success, url }: AdminMutationInput) => {
    if (isMutatingRef.current) return;

    isMutatingRef.current = true;
    setPendingId(url);

    try {
      await adminFetch(url, { body, method });
      appToast.success(success);
      router.refresh();
    } catch (error) {
      appToast.danger(
        error instanceof Error ? error.message : 'Admin request failed.',
      );
    } finally {
      isMutatingRef.current = false;
      setPendingId(null);
      setConfirm(null);
    }
  };

  const runStorageDeletionJobs = async (action: 'drain' | 'retry') => {
    if (isMutatingRef.current) return;

    isMutatingRef.current = true;
    setPendingId(`storage-deletions:${action}`);

    try {
      const result = await adminFetch<StorageDeletionDrainPayload>(
        '/api/admin/storage-deletions/drain',
        {
          body: { action },
        },
      );

      appToast.success(
        action === 'retry'
          ? `Queued ${result.retried} failed job(s); claimed ${result.claimed}.`
          : `Claimed ${result.claimed} storage deletion job(s).`,
      );
      router.refresh();
    } catch (error) {
      appToast.danger(
        error instanceof Error
          ? error.message
          : 'Storage deletion drain failed.',
      );
    } finally {
      isMutatingRef.current = false;
      setPendingId(null);
    }
  };

  const confirmAction = (nextConfirm: NonNullable<ConfirmState>) => {
    setConfirm(nextConfirm);
  };

  return (
    <section className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6 overflow-x-hidden">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-accent">Admin</p>
          <h1 className="text-3xl font-semibold text-foreground">
            Media workspace
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/65">
            Upload, archive, restore, and purge public media without exposing
            write operations outside the owner session.
          </p>
        </div>
        <div className="w-full sm:w-auto">
          <Button
            variant="tertiary"
            className="h-10 w-full min-w-0 justify-center whitespace-nowrap rounded-full border border-foreground/10 px-3 text-xs sm:w-auto sm:px-4 sm:text-sm"
            onPress={() => signOut({ callbackUrl: '/' })}
          >
            Sign out
          </Button>
        </div>
      </header>

      <StorageDeletionJobsCard
        jobs={data.deletionJobs}
        onRun={runStorageDeletionJobs}
        pendingAction={deletionPendingAction}
      />

      <Card className="w-full min-w-0 max-w-full overflow-hidden border border-foreground/10 bg-background">
        <Card.Content className="p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <Tabs
              selectedKey={tab}
              onSelectionChange={(key) => setTab(String(key))}
              variant="secondary"
            >
              <Tabs.List>
                <Tabs.Tab id="photos">Photos</Tabs.Tab>
                <Tabs.Tab id="notes">Notes</Tabs.Tab>
                <Tabs.Tab id="audit">Audit</Tabs.Tab>
              </Tabs.List>
            </Tabs>
            {tab !== 'audit' && (
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <AdminSearch
                  value={query}
                  onChange={setQuery}
                  placeholder={`Search ${tab}`}
                />
                {tab === 'photos' && <PhotoUploadDrawer />}
                {tab === 'notes' && (
                  <NoteEditorDrawer
                    mode="create"
                    className={createActionButtonClassName}
                  />
                )}
              </div>
            )}
          </div>
        </Card.Content>
      </Card>

      {tab === 'photos' && (
        <PhotosTable
          photos={photos}
          pendingId={pendingId}
          onConfirm={confirmAction}
          onMutate={mutate}
        />
      )}

      {tab === 'notes' && (
        <NotesTable
          notes={notes}
          pendingId={pendingId}
          onConfirm={confirmAction}
          onMutate={mutate}
        />
      )}

      {tab === 'audit' && (
        <AuditTable auditLogs={data.auditLogs} pendingId={pendingId} />
      )}

      <AlertDialog
        isOpen={Boolean(confirm)}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialog.Trigger
          className={hiddenOverlayTriggerClassName}
          aria-hidden
          tabIndex={-1}
        >
          Confirm action
        </AlertDialog.Trigger>
        <AlertDialog.Backdrop
          variant="blur"
          className="fixed inset-0 z-[80] bg-background/25 backdrop-blur-md"
        >
          <AlertDialog.Container
            placement="center"
            className="fixed inset-0 z-[90] flex !h-dvh !w-full !max-w-none items-center justify-center p-4 sm:!w-full sm:!p-4"
          >
            <AlertDialog.Dialog className="mx-auto w-full max-w-md rounded-large border border-foreground/10 bg-background p-0 shadow-2xl outline-none">
              <AlertDialog.Header className="flex items-start gap-3 p-5">
                <AlertDialog.Icon status="danger" />
                <div>
                  <AlertDialog.Heading className="text-lg font-semibold">
                    {confirm?.title}
                  </AlertDialog.Heading>
                  <p className="mt-2 text-sm text-foreground/65">
                    {confirm?.body}
                  </p>
                </div>
              </AlertDialog.Header>
              <AlertDialog.Footer className="flex justify-end gap-2 border-t border-foreground/10 p-4">
                <Button
                  variant="tertiary"
                  className="rounded-full"
                  onPress={() => setConfirm(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  className="rounded-full bg-danger text-white"
                  onPress={() => confirm?.onConfirm()}
                >
                  {confirm?.confirmLabel}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </section>
  );
}

function PhotoActions({
  isPending,
  layout = 'table',
  onConfirm,
  onMutate,
  photo,
}: {
  isPending: boolean;
  layout?: 'card' | 'table';
  onConfirm: (confirm: NonNullable<ConfirmState>) => void;
  onMutate: (input: AdminMutationInput) => Promise<void>;
  photo: AdminPhoto;
}) {
  const url = `/api/admin/photos/${photo.id}`;
  const isCard = layout === 'card';
  const actionColumns = photo.archivedAt ? 'grid-cols-2' : 'grid-cols-2';
  const actionClassName = clsx(
    'rounded-full',
    isCard
      ? 'w-full !min-w-0 justify-center overflow-hidden whitespace-nowrap px-2 text-xs sm:px-3 sm:text-sm'
      : 'w-full !min-w-0 justify-center overflow-hidden whitespace-nowrap px-3 text-sm',
  );

  return (
    <RowActions
      isPending={isPending}
      display="grid"
      className={
        isCard
          ? clsx(
              'grid w-full min-w-0 justify-stretch gap-2 pt-3',
              actionColumns,
            )
          : 'w-full min-w-[12.5rem] grid-cols-2 justify-stretch gap-2'
      }
    >
      <PhotoEditDrawer photo={photo} className={actionClassName} />
      {!photo.archivedAt && (
        <Button
          variant="tertiary"
          className={actionClassName}
          onPress={() =>
            onConfirm({
              body: 'The photo will disappear from the public photo feed but can still be restored.',
              confirmLabel: 'Archive',
              onConfirm: () =>
                onMutate({
                  body: { action: 'archive' },
                  method: 'PATCH',
                  success: 'Photo archived.',
                  url,
                }),
              title: `Archive ${photo.title}?`,
            })
          }
        >
          Archive
        </Button>
      )}
      {photo.archivedAt && (
        <>
          <Button
            variant="tertiary"
            className={actionClassName}
            onPress={() =>
              onMutate({
                body: { action: 'restore' },
                method: 'PATCH',
                success: 'Photo restored.',
                url,
              })
            }
          >
            Restore
          </Button>
          <Button
            variant="tertiary"
            className={clsx(actionClassName, 'text-danger')}
            onPress={() =>
              onConfirm({
                body: 'This permanently deletes the DB record and queues deletion of every original S3 version, delete marker, and transformed variant. The storage purge cannot be undone after cleanup completes.',
                confirmLabel: 'Purge',
                onConfirm: () =>
                  onMutate({
                    method: 'DELETE',
                    success: 'Photo purged; storage deletion queued.',
                    url,
                  }),
                title: `Purge ${photo.title} permanently?`,
              })
            }
          >
            Purge
          </Button>
        </>
      )}
    </RowActions>
  );
}

function NoteActions({
  isPending,
  layout = 'table',
  onConfirm,
  onMutate,
  note,
}: {
  isPending: boolean;
  layout?: 'card' | 'table';
  onConfirm: (confirm: NonNullable<ConfirmState>) => void;
  onMutate: (input: AdminMutationInput) => Promise<void>;
  note: AdminNote;
}) {
  const url = `/api/admin/notes/${note.id}`;
  const isCard = layout === 'card';
  const actionClassName = clsx(
    'rounded-full',
    isCard
      ? 'w-full !min-w-0 justify-center overflow-hidden whitespace-nowrap px-2 text-xs sm:px-3 sm:text-sm'
      : 'w-full !min-w-0 justify-center overflow-hidden whitespace-nowrap px-3 text-sm',
  );

  return (
    <RowActions
      isPending={isPending}
      display="grid"
      className={
        isCard
          ? 'grid w-full min-w-0 grid-cols-3 justify-stretch gap-2 pt-3'
          : 'w-full min-w-[19rem] grid-cols-3 justify-stretch gap-2'
      }
    >
      <NoteEditorDrawer mode="edit" note={note} className={actionClassName} />
      {!note.archivedAt && (
        <>
          <Button
            variant="tertiary"
            className={actionClassName}
            onPress={() =>
              onMutate({
                body: {
                  action: note.published ? 'unpublish' : 'publish',
                },
                method: 'PATCH',
                success: note.published
                  ? 'Note unpublished.'
                  : 'Note published.',
                url,
              })
            }
          >
            {note.published ? 'Unpublish' : 'Publish'}
          </Button>
          <Button
            variant="tertiary"
            className={actionClassName}
            onPress={() =>
              onConfirm({
                body: 'The note will disappear from public Notes but can still be restored.',
                confirmLabel: 'Archive',
                onConfirm: () =>
                  onMutate({
                    body: { action: 'archive' },
                    method: 'PATCH',
                    success: 'Note archived.',
                    url,
                  }),
                title: `Archive ${note.title}?`,
              })
            }
          >
            Archive
          </Button>
        </>
      )}
      {note.archivedAt && (
        <>
          <Button
            variant="tertiary"
            className={actionClassName}
            onPress={() =>
              onMutate({
                body: { action: 'restore' },
                method: 'PATCH',
                success: 'Note restored.',
                url,
              })
            }
          >
            Restore
          </Button>
          <Button
            variant="tertiary"
            className={clsx(actionClassName, 'text-danger')}
            onPress={() =>
              onConfirm({
                body: 'This permanently deletes the DB record and queues deletion of every cover S3 version, delete marker, and transformed variant. The storage purge cannot be undone after cleanup completes.',
                confirmLabel: 'Purge',
                onConfirm: () =>
                  onMutate({
                    method: 'DELETE',
                    success: 'Note purged; storage deletion queued.',
                    url,
                  }),
                title: `Purge ${note.title} permanently?`,
              })
            }
          >
            Purge
          </Button>
        </>
      )}
    </RowActions>
  );
}

function PhotosTable({
  onConfirm,
  onMutate,
  pendingId,
  photos,
}: {
  onConfirm: (confirm: NonNullable<ConfirmState>) => void;
  onMutate: (input: AdminMutationInput) => Promise<void>;
  pendingId: string | null;
  photos: AdminPhoto[];
}) {
  return (
    <>
      <div className="grid min-w-0 max-w-full gap-3 xl:hidden">
        {photos.length === 0 ? (
          <EmptyAdminState>No photos match this search.</EmptyAdminState>
        ) : (
          photos.map((photo) => {
            const url = `/api/admin/photos/${photo.id}`;
            const isPending = pendingId === url;

            return (
              <Card
                key={photo.id}
                className="w-full min-w-0 max-w-full overflow-hidden border border-foreground/10 bg-background"
              >
                <Card.Content className="min-w-0 max-w-full p-3">
                  <div className="flex min-w-0 gap-3">
                    <AdminThumbnail src={photo.thumbnailUrl} variant="card" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {photo.title}
                      </p>
                      <p className="truncate text-xs text-foreground/50">
                        {photo.slug}
                      </p>
                      <p className="mt-2 line-clamp-2 text-xs text-foreground/55">
                        {photo.tags
                          .slice(0, 5)
                          .map((tag) => `${tag.field}:${tag.value}`)
                          .join(', ') || 'No tags'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
                    {photo.archivedAt ? (
                      <StatusPill tone="warning">Archived</StatusPill>
                    ) : (
                      <StatusPill tone="success">Active</StatusPill>
                    )}
                    <span className="basis-full text-xs text-foreground/45 sm:ml-auto sm:basis-auto">
                      {formatDate(photo.updatedAt)}
                    </span>
                  </div>
                  <PhotoActions
                    photo={photo}
                    layout="card"
                    isPending={isPending}
                    onConfirm={onConfirm}
                    onMutate={onMutate}
                  />
                </Card.Content>
              </Card>
            );
          })
        )}
      </div>

      <AdminTableShell className="hidden xl:block">
        <Table.Content aria-label="Photo media">
          <Table.Header>
            <Table.Column isRowHeader>Photo</Table.Column>
            <Table.Column>Tags</Table.Column>
            <Table.Column>Status</Table.Column>
            <Table.Column>Updated</Table.Column>
            <Table.Column>Actions</Table.Column>
          </Table.Header>
          <Table.Body>
            {photos.map((photo) => {
              const url = `/api/admin/photos/${photo.id}`;
              const isPending = pendingId === url;

              return (
                <Table.Row key={photo.id} id={photo.id}>
                  <Table.Cell>
                    <div className="flex min-w-64 items-center gap-3">
                      <AdminThumbnail
                        src={photo.thumbnailUrl}
                        variant="table"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {photo.title}
                        </p>
                        <p className="truncate text-xs text-foreground/50">
                          {photo.slug}
                        </p>
                      </div>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="min-w-52 max-w-72 text-xs text-foreground/60">
                      <p className="line-clamp-2">
                        {photo.tags
                          .slice(0, 6)
                          .map((tag) => `${tag.field}:${tag.value}`)
                          .join(', ') || 'No tags'}
                      </p>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex flex-wrap gap-2">
                      {photo.archivedAt ? (
                        <StatusPill tone="warning">Archived</StatusPill>
                      ) : (
                        <StatusPill tone="success">Active</StatusPill>
                      )}
                    </div>
                  </Table.Cell>
                  <Table.Cell>{formatDate(photo.updatedAt)}</Table.Cell>
                  <Table.Cell>
                    <PhotoActions
                      photo={photo}
                      isPending={isPending}
                      onConfirm={onConfirm}
                      onMutate={onMutate}
                    />
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Content>
      </AdminTableShell>
    </>
  );
}

function NotesTable({
  onConfirm,
  onMutate,
  pendingId,
  notes,
}: {
  onConfirm: (confirm: NonNullable<ConfirmState>) => void;
  onMutate: (input: AdminMutationInput) => Promise<void>;
  pendingId: string | null;
  notes: AdminNote[];
}) {
  return (
    <>
      <div className="grid min-w-0 max-w-full gap-3 xl:hidden">
        {notes.length === 0 ? (
          <EmptyAdminState>No notes match this search.</EmptyAdminState>
        ) : (
          notes.map((note) => {
            const url = `/api/admin/notes/${note.id}`;
            const isPending = pendingId === url;

            return (
              <Card
                key={note.id}
                className="w-full min-w-0 max-w-full overflow-hidden border border-foreground/10 bg-background"
              >
                <Card.Content className="min-w-0 max-w-full p-3">
                  <div className="flex min-w-0 gap-3">
                    <AdminThumbnail src={note.coverUrl} variant="card" />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-semibold text-foreground">
                        {note.title}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-foreground/55">
                        {note.abstract}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
                    {note.archivedAt ? (
                      <StatusPill tone="warning">Archived</StatusPill>
                    ) : (
                      <StatusPill tone="success">Active</StatusPill>
                    )}
                    {note.published ? (
                      <StatusPill>Published</StatusPill>
                    ) : (
                      <StatusPill tone="warning">Draft</StatusPill>
                    )}
                  </div>
                  <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 rounded-md bg-foreground/[0.035] p-3 text-xs text-foreground/55">
                    <div className="min-w-0">
                      <p className="text-foreground/40">Published</p>
                      <p className="mt-1 truncate text-foreground/70">
                        {formatDate(note.publishedAt)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-foreground/40">Updated</p>
                      <p className="mt-1 truncate text-foreground/70">
                        {formatDate(note.updatedAt)}
                      </p>
                    </div>
                  </div>
                  <NoteActions
                    note={note}
                    layout="card"
                    isPending={isPending}
                    onConfirm={onConfirm}
                    onMutate={onMutate}
                  />
                </Card.Content>
              </Card>
            );
          })
        )}
      </div>

      <AdminTableShell className="hidden xl:block">
        <Table.Content aria-label="Notes media">
          <Table.Header>
            <Table.Column isRowHeader>Note</Table.Column>
            <Table.Column>Status</Table.Column>
            <Table.Column>Published</Table.Column>
            <Table.Column>Updated</Table.Column>
            <Table.Column>Actions</Table.Column>
          </Table.Header>
          <Table.Body>
            {notes.map((note) => {
              const url = `/api/admin/notes/${note.id}`;
              const isPending = pendingId === url;

              return (
                <Table.Row key={note.id} id={note.id}>
                  <Table.Cell>
                    <div className="flex w-[min(34vw,28rem)] min-w-0 max-w-[28rem] items-center gap-3">
                      <AdminThumbnail src={note.coverUrl} variant="table" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">
                          {note.title}
                        </p>
                        <p className="line-clamp-1 text-xs text-foreground/50">
                          {note.abstract}
                        </p>
                      </div>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex min-w-max flex-nowrap gap-2">
                      {note.archivedAt ? (
                        <StatusPill tone="warning">Archived</StatusPill>
                      ) : (
                        <StatusPill tone="success">Active</StatusPill>
                      )}
                      {note.published ? (
                        <StatusPill>Published</StatusPill>
                      ) : (
                        <StatusPill tone="warning">Draft</StatusPill>
                      )}
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="block min-w-max whitespace-nowrap">
                      {formatDate(note.publishedAt)}
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="block min-w-max whitespace-nowrap">
                      {formatDate(note.updatedAt)}
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <NoteActions
                      note={note}
                      isPending={isPending}
                      onConfirm={onConfirm}
                      onMutate={onMutate}
                    />
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Content>
      </AdminTableShell>
    </>
  );
}

function AuditTable({
  auditLogs,
}: {
  auditLogs: AdminDashboardData['auditLogs'];
  pendingId: string | null;
}) {
  return (
    <>
      <div className="grid min-w-0 max-w-full gap-3 xl:hidden">
        {auditLogs.length === 0 ? (
          <EmptyAdminState>No admin actions have been logged.</EmptyAdminState>
        ) : (
          auditLogs.map((log) => (
            <Card
              key={log.id}
              className="w-full min-w-0 max-w-full overflow-hidden border border-foreground/10 bg-background"
            >
              <Card.Content className="grid min-w-0 gap-3 p-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <StatusPill tone={log.success ? 'success' : 'danger'}>
                    {log.action}
                  </StatusPill>
                  <span className="shrink-0 text-xs text-foreground/45">
                    {formatDate(log.createdAt)}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-foreground/40">Target</p>
                  <p className="mt-1 text-sm text-foreground/70">
                    {log.targetType}
                    {log.targetId ? `:${log.targetId.slice(0, 8)}` : ''}
                  </p>
                </div>
                <p className="break-words text-sm text-foreground/65">
                  {log.summary}
                </p>
              </Card.Content>
            </Card>
          ))
        )}
      </div>

      <AdminTableShell className="hidden xl:block">
        <Table.Content aria-label="Admin audit log">
          <Table.Header>
            <Table.Column isRowHeader>Action</Table.Column>
            <Table.Column>Target</Table.Column>
            <Table.Column>Summary</Table.Column>
            <Table.Column>Time</Table.Column>
          </Table.Header>
          <Table.Body>
            {auditLogs.map((log) => (
              <Table.Row key={log.id} id={log.id}>
                <Table.Cell>
                  <StatusPill tone={log.success ? 'success' : 'danger'}>
                    {log.action}
                  </StatusPill>
                </Table.Cell>
                <Table.Cell>
                  {log.targetType}
                  {log.targetId ? `:${log.targetId.slice(0, 8)}` : ''}
                </Table.Cell>
                <Table.Cell>{log.summary}</Table.Cell>
                <Table.Cell>{formatDate(log.createdAt)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </AdminTableShell>
    </>
  );
}
