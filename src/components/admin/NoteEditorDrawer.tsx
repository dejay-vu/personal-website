'use client';

import {
  ChangeEvent,
  FormEvent,
  RefObject,
  UIEvent,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import type { AdminDashboardData } from '@/modules/admin/dashboard';
import {
  AlertDialog,
  Button,
  Calendar,
  Card,
  DateField,
  Drawer,
  Fieldset,
  Form,
  IconCalendar,
  InputGroup,
  Popover,
  ProgressBar,
  Switch,
  Tabs,
  TextField,
  useOverlayState,
} from '@heroui/react';
import { type DateValue, parseDate } from '@internationalized/date';
import clsx from 'clsx';

import { ADMIN_UPLOAD_LIMITS } from '@/lib/adminUpload';
import { appToast } from '@/lib/appToast';
import { formatFileSize } from '@/lib/format';
import { toSlug } from '@/lib/slug';

import { queueAdminUploadJobs } from '@/components/admin/AdminUploadMonitor';
import { UploadProgressCircle } from '@/components/admin/UploadProgressCircle';
import {
  type PresignedUpload,
  adminFetch,
  uploadToS3,
} from '@/components/admin/adminClient';
import {
  clearNoteCreateDraft,
  readNoteCreateDraftForm,
  writeNoteCreateDraft,
} from '@/components/admin/noteCreateDraftStorage';
import {
  AttachmentIcon,
  FileAddIcon,
  NotesIcon,
  XMarkIcon,
} from '@/components/ui';

// Loaded on demand: the markdown preview pulls react-markdown + the syntax
// highlighter, which should not weigh down the admin dashboard's first load.
const NoteContent = dynamic(
  () =>
    import('@/components/notes/note/NoteContent').then(
      (module) => module.NoteContent,
    ),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-foreground/80">Loading preview…</p>
    ),
  },
);

type AdminNote = AdminDashboardData['notes'][number];

type QueuedUploadPayload = {
  status: 'queued';
  uploadId: string;
};

type NoteEditorPayload = {
  abstract: string;
  categories: string[];
  content: string;
  coverUrl: string;
  id: string;
  published: boolean;
  publishedAt: string;
  seoTitle: string;
  slug: string;
  title: string;
};

type NoteEditorForm = {
  abstract: string;
  categories: string;
  content: string;
  published: boolean;
  publishedAt: string;
  seoTitle: string;
  slug: string;
  title: string;
};

const uploadKind = {
  noteCover: 'NOTE_COVER',
} as const;

const DRAFT_SAVE_DELAY_MS = 500;
const PREVIEW_UPDATE_DELAY_MS = 220;
const hiddenOverlayTriggerClassName =
  'fixed -left-[100vw] top-0 size-px overflow-hidden whitespace-nowrap border-0 p-0 opacity-0 pointer-events-none';
const noteDrawerInputGroupClassName =
  'admin-drawer-input rounded-large border border-foreground/10 bg-background';
const noteDrawerFileButtonClassName =
  'h-10 w-full min-w-0 justify-center rounded-full border border-foreground/10 px-3';

const defaultForm = (): NoteEditorForm => ({
  abstract: '',
  categories: '',
  content: '',
  published: true,
  publishedAt: new Date().toISOString().slice(0, 10),
  seoTitle: '',
  slug: '',
  title: '',
});

function normalizeDraftForm(value: unknown): NoteEditorForm | null {
  if (!value || typeof value !== 'object') return null;

  const draft = value as Partial<Record<keyof NoteEditorForm, unknown>>;
  const next = defaultForm();

  for (const key of [
    'abstract',
    'categories',
    'content',
    'publishedAt',
    'seoTitle',
    'slug',
    'title',
  ] satisfies (keyof NoteEditorForm)[]) {
    const draftValue = draft[key];

    if (typeof draftValue === 'string') {
      next[key] = draftValue;
    }
  }

  if (typeof draft.published === 'boolean') {
    next.published = draft.published;
  }

  return next;
}

function readCreateDraft() {
  return normalizeDraftForm(readNoteCreateDraftForm());
}

function writeCreateDraft(form: NoteEditorForm, pendingUploadId?: string) {
  writeNoteCreateDraft(form, pendingUploadId);
}

function clearCreateDraft() {
  clearNoteCreateDraft();
}

function previewPlaceholderForm(form: NoteEditorForm): NoteEditorForm {
  return {
    ...form,
    content: '',
  };
}

function parseLocalMarkdown(markdown: string) {
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n?/.exec(markdown);
  const entries = new Map<string, string>();

  if (!match) {
    return {
      content: markdown,
      metadata: entries,
    };
  }

  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');

    if (!key || rest.length === 0) continue;

    entries.set(
      key.trim(),
      rest
        .join(':')
        .trim()
        .replace(/^["']|["']$/g, ''),
    );
  }

  return {
    content: markdown.slice(match[0].length),
    metadata: entries,
  };
}

function categoriesFromInput(value: string) {
  return [
    ...new Set(value.split(',').map((category) => category.trim())),
  ].filter(Boolean);
}

function normalizeImportedCategories(value: string | undefined) {
  if (!value) return undefined;

  const trimmed = value.trim();
  const withoutBrackets =
    trimmed.startsWith('[') && trimmed.endsWith(']')
      ? trimmed.slice(1, -1)
      : trimmed;

  return categoriesFromInput(withoutBrackets.replace(/["']/g, '')).join(', ');
}

function editorPayload(form: NoteEditorForm) {
  return {
    abstract: form.abstract.trim(),
    categories: categoriesFromInput(form.categories),
    content: form.content.trim(),
    published: form.published,
    publishedAt: form.publishedAt,
    seoTitle: form.seoTitle.trim() || null,
    slug: form.slug.trim() || toSlug(form.title),
    title: form.title.trim(),
  };
}

function editorFormFromPayload(payload: NoteEditorPayload): NoteEditorForm {
  return {
    abstract: payload.abstract,
    categories: payload.categories.join(', '),
    content: payload.content,
    published: payload.published,
    publishedAt: payload.publishedAt,
    seoTitle: payload.seoTitle,
    slug: payload.slug,
    title: payload.title,
  };
}

function dateValueFromString(value: string) {
  if (!value) return null;

  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

function NotePublishedDatePicker({
  onChange,
  value,
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const selectedDate = dateValueFromString(value);

  return (
    <div className="w-full">
      <div className="relative">
        <DateField
          aria-label="Published date"
          fullWidth
          isRequired
          value={selectedDate}
          onChange={(nextDate: DateValue | null) =>
            onChange(nextDate?.toString() ?? '')
          }
        >
          <DateField.Group
            fullWidth
            className="admin-drawer-date-input h-10 rounded-large border border-foreground/10 bg-background pr-10 shadow-none"
          >
            <DateField.Input>
              {(segment) => <DateField.Segment segment={segment} />}
            </DateField.Input>
          </DateField.Group>
        </DateField>
        <Popover isOpen={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <Button
            type="button"
            aria-label="Open calendar"
            variant="tertiary"
            className="absolute right-1.5 top-1/2 z-10 !size-7 !w-7 !min-w-7 -translate-y-1/2 rounded-full p-0 text-foreground/45 shadow-none transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <IconCalendar />
          </Button>
          <Popover.Content
            placement="bottom end"
            offset={8}
            className="z-[100] !max-w-none border border-foreground/10 bg-background/95 p-3 shadow-2xl backdrop-blur"
          >
            <Popover.Dialog className="outline-none">
              <Calendar
                value={selectedDate}
                onChange={(nextDate: DateValue) => {
                  onChange(nextDate.toString());
                  setIsCalendarOpen(false);
                }}
              >
                <Calendar.Header>
                  <Calendar.NavButton slot="previous" />
                  <Calendar.Heading />
                  <Calendar.NavButton slot="next" />
                </Calendar.Header>
                <Calendar.Grid>
                  <Calendar.GridHeader>
                    {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                  </Calendar.GridHeader>
                  <Calendar.GridBody>
                    {(date) => <Calendar.Cell date={date} />}
                  </Calendar.GridBody>
                </Calendar.Grid>
              </Calendar>
            </Popover.Dialog>
          </Popover.Content>
        </Popover>
      </div>
    </div>
  );
}

const EditorPreview = memo(function EditorPreview({
  form,
  onScroll,
  scrollRef,
}: {
  form: NoteEditorForm;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const date = form.publishedAt ? new Date(form.publishedAt) : null;
  const dateLabel =
    date && !Number.isNaN(date.valueOf()) ? date.toDateString() : 'No date';

  return (
    <Card className="h-full min-h-0 border border-foreground/10 bg-background">
      <Card.Content className="h-full p-0">
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto p-5"
          onScroll={onScroll}
        >
          <article
            className={clsx(
              'prose dark:prose-invert max-w-none',
              'prose-headings:text-foreground prose-headings:font-bold',
              'prose-p:text-foreground prose-li:text-foreground',
              'prose-strong:text-foreground prose-strong:font-semibold',
              'prose-pre:p-0 prose-pre:rounded-2xl',
            )}
          >
            <h1>{form.title || 'Untitled note'}</h1>
            <p className="text-sm text-foreground/55">{dateLabel}</p>
            {form.content.trim() ? (
              <NoteContent content={form.content} />
            ) : (
              <p>Start writing markdown to preview it here.</p>
            )}
          </article>
        </div>
      </Card.Content>
    </Card>
  );
});

export function NoteEditorDrawer({
  className,
  mode,
  note,
}: {
  className?: string;
  mode: 'create' | 'edit';
  note?: AdminNote;
}) {
  const router = useRouter();
  const drawer = useOverlayState({});
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const markdownInputRef = useRef<HTMLInputElement | null>(null);
  const markdownTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const isSyncingScrollRef = useRef(false);
  const suppressDraftSaveRef = useRef(false);
  const coverObjectUrlRef = useRef<string | null>(null);
  const [form, setForm] = useState<NoteEditorForm>(() => defaultForm());
  const [previewForm, setPreviewForm] = useState<NoteEditorForm>(() =>
    defaultForm(),
  );
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverUrl, setCoverUrl] = useState('');
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [mobileView, setMobileView] = useState('edit');
  const [stage, setStage] = useState<
    'error' | 'idle' | 'loading' | 'processing' | 'saving' | 'uploading'
  >('idle');
  const [error, setError] = useState('');
  const isCreate = mode === 'create';
  const isCloseBlocked =
    stage === 'loading' || stage === 'saving' || stage === 'uploading';
  const isBusy = isCloseBlocked || stage === 'processing';
  const today = defaultForm().publishedAt;
  const hasMeaningfulCreateDraft = Boolean(
    form.title.trim() ||
    form.seoTitle.trim() ||
    form.slug.trim() ||
    form.abstract.trim() ||
    form.categories.trim() ||
    form.content.trim() ||
    form.published !== true ||
    form.publishedAt !== today ||
    coverFile,
  );
  const hasUnsavedChanges =
    !isBusy && (isCreate ? hasMeaningfulCreateDraft : isDirty);

  const syncScrollPosition = useCallback(
    (source: HTMLElement, target: HTMLElement | null) => {
      if (!target || isSyncingScrollRef.current) return;

      const sourceScrollable = source.scrollHeight - source.clientHeight;
      const targetScrollable = target.scrollHeight - target.clientHeight;

      if (sourceScrollable <= 0 || targetScrollable <= 0) return;

      isSyncingScrollRef.current = true;
      target.scrollTop =
        (source.scrollTop / sourceScrollable) * targetScrollable;

      window.requestAnimationFrame(() => {
        isSyncingScrollRef.current = false;
      });
    },
    [],
  );

  const syncPreviewScroll = useCallback(
    (event: UIEvent<HTMLTextAreaElement>) => {
      syncScrollPosition(event.currentTarget, previewScrollRef.current);
    },
    [syncScrollPosition],
  );

  const syncEditorScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      syncScrollPosition(event.currentTarget, markdownTextAreaRef.current);
    },
    [syncScrollPosition],
  );

  const updateForm = (next: Partial<NoteEditorForm>) => {
    setIsDirty(true);
    setForm((current) => ({
      ...current,
      ...next,
    }));
  };

  const clearCoverObjectUrl = () => {
    if (!coverObjectUrlRef.current) return;

    URL.revokeObjectURL(coverObjectUrlRef.current);
    coverObjectUrlRef.current = null;
  };

  const openEditor = async () => {
    suppressDraftSaveRef.current = false;
    drawer.open();
    setMobileView('edit');
    setIsCloseConfirmOpen(false);
    setError('');

    if (isCreate) {
      const initialForm = readCreateDraft() ?? defaultForm();

      clearCoverObjectUrl();
      setForm(initialForm);
      setPreviewForm(previewPlaceholderForm(initialForm));
      setCoverFile(null);
      setCoverUrl('');
      setIsDirty(false);
      setStage('idle');
      return;
    }

    if (!note) return;

    setStage('loading');

    try {
      const payload = await adminFetch<NoteEditorPayload>(
        `/api/admin/notes/${note.id}/editor`,
        { method: 'GET' },
      );

      const initialForm = editorFormFromPayload(payload);

      clearCoverObjectUrl();
      setForm(initialForm);
      setPreviewForm(previewPlaceholderForm(initialForm));
      setCoverFile(null);
      setCoverUrl(payload.coverUrl);
      setIsDirty(false);
      setStage('idle');
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : 'Failed to load note.';

      setError(message);
      setStage('error');
      appToast.danger(message);
    }
  };

  const closeEditor = ({
    clearDraft = false,
    preserveStoredDraft = false,
  }: {
    clearDraft?: boolean;
    preserveStoredDraft?: boolean;
  } = {}) => {
    if (clearDraft && isCreate) {
      suppressDraftSaveRef.current = true;
      clearCreateDraft();
    }

    if (
      !clearDraft &&
      !preserveStoredDraft &&
      isCreate &&
      hasMeaningfulCreateDraft
    ) {
      writeCreateDraft(form);
    }

    setIsCloseConfirmOpen(false);
    drawer.close();
  };

  const requestClose = () => {
    if (isCloseBlocked) return;

    if (stage === 'processing') {
      closeEditor();
      return;
    }

    if (hasUnsavedChanges) {
      setIsCloseConfirmOpen(true);
      return;
    }

    closeEditor({ clearDraft: isCreate });
  };

  useEffect(() => {
    if (!isCreate || !drawer.isOpen || suppressDraftSaveRef.current) return;

    const timeoutId = window.setTimeout(() => {
      if (hasMeaningfulCreateDraft) {
        writeCreateDraft(form);
        return;
      }

      clearCreateDraft();
    }, DRAFT_SAVE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [drawer.isOpen, form, hasMeaningfulCreateDraft, isCreate]);

  useEffect(() => {
    if (!drawer.isOpen || stage === 'loading') return;

    const timeoutId = window.setTimeout(() => {
      setPreviewForm(form);
    }, PREVIEW_UPDATE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [drawer.isOpen, form, stage]);

  useEffect(() => {
    if (!drawer.isOpen || !hasUnsavedChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [drawer.isOpen, hasUnsavedChanges]);

  useEffect(() => {
    return () => {
      clearCoverObjectUrl();
    };
  }, []);

  const handleMarkdownImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;

    if (!file) return;

    if (file.size > ADMIN_UPLOAD_LIMITS.maxMarkdownBytes) {
      appToast.warning('Markdown file is too large.');
      input.value = '';
      return;
    }

    const { content, metadata } = parseLocalMarkdown(await file.text());

    updateForm({
      abstract: metadata.get('abstract') ?? form.abstract,
      categories:
        normalizeImportedCategories(metadata.get('categories')) ??
        form.categories,
      content,
      publishedAt:
        metadata.get('publishedAt') ?? metadata.get('date') ?? form.publishedAt,
      seoTitle: metadata.get('seoTitle') ?? form.seoTitle,
      title: metadata.get('title') ?? form.title,
    });
    input.value = '';
  };

  const handleCover = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;

    if (!file) return;

    if (file.size > ADMIN_UPLOAD_LIMITS.maxImageBytes) {
      appToast.warning('Cover image is too large.');
      input.value = '';
      return;
    }

    clearCoverObjectUrl();
    const nextCoverUrl = URL.createObjectURL(file);

    coverObjectUrlRef.current = nextCoverUrl;
    setIsDirty(true);
    setCoverFile(file);
    setCoverUrl(nextCoverUrl);
    input.value = '';
  };

  const removeCover = () => {
    clearCoverObjectUrl();
    setIsDirty(true);
    setCoverFile(null);
    setCoverUrl('');

    if (coverInputRef.current) {
      coverInputRef.current.value = '';
    }
  };

  const validate = () => {
    const payload = editorPayload(form);

    if (
      !payload.title ||
      !payload.slug ||
      !payload.abstract ||
      !payload.publishedAt ||
      payload.categories.length === 0 ||
      !payload.content
    ) {
      return 'Title, abstract, date, categories, and markdown are required.';
    }

    if (form.seoTitle.trim().length > 60) {
      return 'SEO title must be 60 characters or fewer.';
    }

    if (isCreate && !coverFile) {
      return 'Cover image is required for a new note.';
    }

    return null;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validationError = validate();

    if (validationError) {
      appToast.warning(validationError);
      return;
    }

    setStage(isCreate ? 'uploading' : 'saving');
    setError('');

    try {
      const payload = editorPayload(form);

      if (isCreate) {
        await adminFetch('/api/admin/notes/preflight', {
          body: payload,
        });

        const { uploads } = await adminFetch<{ uploads: PresignedUpload[] }>(
          '/api/admin/uploads/presign',
          {
            body: {
              files: [
                {
                  kind: uploadKind.noteCover,
                  name: coverFile!.name,
                  size: coverFile!.size,
                  type: coverFile!.type,
                },
              ],
            },
          },
        );
        const coverUpload = uploads[0];

        await uploadToS3(coverUpload, coverFile!);
        setStage('processing');
        const queued = await adminFetch<QueuedUploadPayload>(
          '/api/admin/notes/editor',
          {
            body: {
              ...payload,
              coverUploadId: coverUpload.uploadId,
            },
          },
        );
        suppressDraftSaveRef.current = true;
        writeCreateDraft(form, queued.uploadId);
        queueAdminUploadJobs([
          {
            kind: 'note',
            label: payload.title,
            uploadId: queued.uploadId,
          },
        ]);
      } else if (note) {
        let coverUploadId: string | undefined;

        if (coverFile) {
          setStage('uploading');
          const { uploads } = await adminFetch<{ uploads: PresignedUpload[] }>(
            '/api/admin/uploads/presign',
            {
              body: {
                files: [
                  {
                    kind: uploadKind.noteCover,
                    name: coverFile.name,
                    size: coverFile.size,
                    type: coverFile.type,
                  },
                ],
              },
            },
          );
          const coverUpload = uploads[0];
          await uploadToS3(coverUpload, coverFile);
          coverUploadId = coverUpload.uploadId;
          setStage('saving');
        }

        await adminFetch(`/api/admin/notes/${note.id}/editor`, {
          body: { ...payload, ...(coverUploadId && { coverUploadId }) },
          method: 'PATCH',
        });
        appToast.success('Note updated.');
      }

      setIsDirty(false);
      setStage('idle');
      closeEditor({ preserveStoredDraft: isCreate });
      if (!isCreate) {
        router.refresh();
      }
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : 'Save failed.';

      setError(message);
      setStage('error');
      appToast.danger(message);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant={isCreate ? 'primary' : 'tertiary'}
        className={clsx('rounded-full', className)}
        onPress={openEditor}
      >
        {isCreate && <NotesIcon />}
        {isCreate ? 'Add note' : 'Edit'}
      </Button>
      <Drawer state={drawer}>
        <Drawer.Trigger
          className={hiddenOverlayTriggerClassName}
          aria-hidden
          excludeFromTabOrder
        >
          Open editor
        </Drawer.Trigger>
        <Drawer.Backdrop
          variant="blur"
          isDismissable={false}
          className="fixed inset-0 z-[60] bg-background/20 backdrop-blur-md"
        >
          <Drawer.Content
            placement="right"
            className="fixed inset-y-0 !left-auto !right-0 z-[70] flex h-dvh w-[min(72rem,96vw)]"
          >
            <Drawer.Dialog
              aria-label={isCreate ? 'Add note editor' : 'Edit note editor'}
              className="relative flex h-full w-full flex-col border-l border-foreground/10 bg-background p-0 shadow-2xl outline-none"
            >
              <Button
                type="button"
                aria-label="Close editor"
                variant="tertiary"
                isDisabled={isCloseBlocked}
                className="absolute right-4 top-4 z-10 grid size-9 min-w-9 place-items-center rounded-full bg-background/80 p-0 text-foreground/60 shadow-sm backdrop-blur transition-colors hover:bg-foreground/5 hover:text-foreground"
                onPress={requestClose}
              >
                <XMarkIcon />
              </Button>
              <Drawer.Body className="flex min-h-0 flex-1 overflow-hidden px-5 pb-0 pt-0 md:overflow-y-auto">
                {stage === 'loading' ? (
                  <div className="grid h-full min-h-80 place-items-center">
                    <ProgressBar isIndeterminate aria-label="Load note" />
                  </div>
                ) : (
                  <Form
                    onSubmit={submit}
                    className="flex h-full min-h-0 w-full flex-col gap-3 md:h-auto"
                  >
                    <div
                      className={clsx(
                        'min-h-0 flex-1 space-y-3 overflow-y-auto pb-20 pt-16 md:flex-none md:overflow-visible md:pb-20',
                      )}
                    >
                      <Tabs
                        selectedKey={mobileView}
                        onSelectionChange={(key) => setMobileView(String(key))}
                        variant="secondary"
                        className="md:hidden"
                      >
                        <Tabs.List>
                          <Tabs.Tab id="edit">Edit</Tabs.Tab>
                          <Tabs.Tab id="preview">Preview</Tabs.Tab>
                        </Tabs.List>
                      </Tabs>

                      <div
                        className={clsx(
                          'grid gap-3',
                          mobileView !== 'edit' && 'hidden md:grid',
                        )}
                      >
                        <Fieldset
                          aria-label="Note metadata"
                          className="grid gap-3"
                        >
                          <input
                            ref={markdownInputRef}
                            type="file"
                            accept=".md,.mdx,text/markdown,text/plain"
                            className="hidden"
                            onChange={handleMarkdownImport}
                          />
                          <input
                            ref={coverInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleCover}
                          />
                          <TextField
                            aria-label="Title"
                            isRequired
                            value={form.title}
                            onChange={(title) => updateForm({ title })}
                          >
                            <InputGroup
                              className={noteDrawerInputGroupClassName}
                            >
                              <InputGroup.Input placeholder="Title" />
                            </InputGroup>
                          </TextField>
                          <TextField
                            aria-label="Slug"
                            isRequired
                            value={form.slug}
                            onChange={(slug) => updateForm({ slug })}
                          >
                            <InputGroup
                              className={noteDrawerInputGroupClassName}
                            >
                              <InputGroup.Input placeholder="note-slug" />
                            </InputGroup>
                          </TextField>
                          <TextField
                            aria-label="SEO title"
                            value={form.seoTitle}
                            onChange={(seoTitle) => updateForm({ seoTitle })}
                          >
                            <InputGroup
                              className={noteDrawerInputGroupClassName}
                            >
                              <InputGroup.Input
                                placeholder="SEO title"
                                maxLength={60}
                              />
                            </InputGroup>
                          </TextField>
                          <TextField
                            aria-label="Abstract"
                            isRequired
                            value={form.abstract}
                            onChange={(abstract) => updateForm({ abstract })}
                          >
                            <InputGroup
                              className={noteDrawerInputGroupClassName}
                            >
                              <InputGroup.Input placeholder="Abstract" />
                            </InputGroup>
                          </TextField>
                          <NotePublishedDatePicker
                            value={form.publishedAt}
                            onChange={(publishedAt) =>
                              updateForm({ publishedAt })
                            }
                          />
                          <TextField
                            aria-label="Categories"
                            isRequired
                            value={form.categories}
                            onChange={(categories) =>
                              updateForm({ categories })
                            }
                          >
                            <InputGroup
                              className={noteDrawerInputGroupClassName}
                            >
                              <InputGroup.Input placeholder="CUDA, PyTorch" />
                            </InputGroup>
                          </TextField>
                          <div className={clsx('grid gap-3', 'grid-cols-2')}>
                            <Button
                              type="button"
                              variant="tertiary"
                              className={noteDrawerFileButtonClassName}
                              onPress={() => markdownInputRef.current?.click()}
                            >
                              <AttachmentIcon />
                              <span className="truncate">Import markdown</span>
                            </Button>
                            <Button
                              type="button"
                              variant="tertiary"
                              className={noteDrawerFileButtonClassName}
                              onPress={() => coverInputRef.current?.click()}
                            >
                              <FileAddIcon />
                              <span className="truncate">
                                {coverFile ? 'Change cover' : 'Cover image'}
                              </span>
                            </Button>
                          </div>
                          {coverUrl && (
                            <div className="flex min-w-0 items-center gap-3 rounded-large border border-foreground/10 p-3">
                              <div
                                aria-hidden="true"
                                className="h-16 w-24 shrink-0 rounded-md bg-cover bg-center"
                                style={{
                                  backgroundImage: `url(${coverUrl})`,
                                }}
                              />
                              <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                                <div className="min-w-0 text-sm">
                                  <p className="truncate font-medium">
                                    {coverFile?.name ?? 'Current cover'}
                                  </p>
                                  {coverFile && (
                                    <p className="text-xs text-foreground/50">
                                      {formatFileSize(coverFile.size)}
                                    </p>
                                  )}
                                </div>
                                {isCreate && coverFile && (
                                  <Button
                                    type="button"
                                    variant="tertiary"
                                    isIconOnly
                                    aria-label={`Remove ${coverFile.name}`}
                                    className="size-9 shrink-0 rounded-full border border-foreground/10 p-0 text-foreground/55 hover:text-danger"
                                    onPress={removeCover}
                                  >
                                    <XMarkIcon />
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                          <div className="flex min-w-0 items-center justify-between gap-3 rounded-large border border-foreground/10 px-3 py-2.5">
                            <div className="min-w-0 text-sm">
                              <p className="font-medium">
                                {form.published
                                  ? 'Visible on site'
                                  : 'Draft only'}
                              </p>
                              <p className="text-xs text-foreground/50">
                                {form.published
                                  ? 'Public pages can show this note.'
                                  : 'Hidden from public pages until published.'}
                              </p>
                            </div>
                            <Switch
                              aria-label="Publish note"
                              isSelected={form.published}
                              onChange={(published) =>
                                updateForm({ published })
                              }
                            />
                          </div>
                        </Fieldset>
                      </div>

                      <div className="grid h-[calc(100dvh-6.25rem)] min-h-[34rem] min-w-0 gap-3 md:min-h-[42rem] md:grid-cols-2">
                        <div
                          className={clsx(
                            'h-full min-h-0 min-w-0',
                            mobileView !== 'edit' && 'hidden md:block',
                          )}
                        >
                          <InputGroup className="admin-drawer-input note-editor-markdown-input h-full min-h-0 w-full min-w-0 rounded-large border border-foreground/10 bg-background">
                            <InputGroup.TextArea
                              ref={markdownTextAreaRef}
                              aria-label="Markdown content"
                              required
                              rows={24}
                              value={form.content}
                              placeholder="Write markdown..."
                              onChange={(event) =>
                                updateForm({ content: event.target.value })
                              }
                              onScroll={syncPreviewScroll}
                              className="h-full min-h-0 w-full min-w-0 resize-none font-mono text-sm"
                            />
                          </InputGroup>
                        </div>

                        <div
                          className={clsx(
                            'h-full min-h-0 min-w-0',
                            mobileView !== 'preview' && 'hidden md:block',
                          )}
                        >
                          <EditorPreview
                            form={previewForm}
                            onScroll={syncEditorScroll}
                            scrollRef={previewScrollRef}
                          />
                        </div>
                      </div>
                    </div>

                    <Drawer.Footer className="pointer-events-none absolute inset-x-0 bottom-0 z-30 border-0 bg-transparent p-5 shadow-none">
                      <div className="pointer-events-auto grid w-full gap-2">
                        {(stage === 'saving' ||
                          stage === 'uploading' ||
                          stage === 'processing') && (
                          <div className="flex items-center gap-3 rounded-full bg-background/90 px-3 py-2 text-sm shadow-[0_12px_36px_rgba(0,0,0,0.12)] ring-1 ring-foreground/10">
                            <UploadProgressCircle
                              label={
                                stage === 'uploading'
                                  ? 'Upload cover'
                                  : stage === 'processing'
                                    ? 'Create note'
                                    : 'Save note'
                              }
                            />
                            <span className="min-w-0 truncate text-foreground/65">
                              {stage === 'uploading'
                                ? 'Uploading cover to S3'
                                : stage === 'processing'
                                  ? 'Creating note in background'
                                  : 'Saving changes'}
                            </span>
                          </div>
                        )}
                        {error && (
                          <p className="rounded-large bg-background/90 px-3 text-sm text-danger">
                            {error}
                          </p>
                        )}
                        <Button
                          type="submit"
                          variant="primary"
                          isDisabled={isBusy}
                          className="note-editor-floating-action h-10 w-full rounded-full !border-0 shadow-none"
                        >
                          {stage === 'uploading'
                            ? 'Uploading...'
                            : stage === 'processing'
                              ? 'Processing...'
                              : stage === 'saving'
                                ? 'Saving...'
                                : isCreate
                                  ? 'Create note'
                                  : 'Save changes'}
                        </Button>
                      </div>
                    </Drawer.Footer>
                  </Form>
                )}
              </Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
      {isCloseConfirmOpen && (
        <AlertDialog
          isOpen={isCloseConfirmOpen}
          onOpenChange={(open) => {
            if (!open) setIsCloseConfirmOpen(false);
          }}
        >
          <AlertDialog.Trigger
            className={hiddenOverlayTriggerClassName}
            aria-hidden
            tabIndex={-1}
          >
            Confirm close
          </AlertDialog.Trigger>
          <AlertDialog.Backdrop
            variant="blur"
            className="fixed inset-0 z-[80] bg-background/25 backdrop-blur-md"
          >
            <AlertDialog.Container placement="center" className="z-[90]">
              <AlertDialog.Dialog className="mx-auto w-[min(100%,28rem)] rounded-large border border-foreground/10 bg-background p-0 shadow-2xl outline-none">
                <AlertDialog.Header className="flex items-start gap-3 p-5">
                  <AlertDialog.Icon status="warning" />
                  <div>
                    <AlertDialog.Heading className="text-lg font-semibold">
                      {isCreate ? 'Close this draft?' : 'Discard changes?'}
                    </AlertDialog.Heading>
                    <p className="mt-2 text-sm text-foreground/65">
                      {isCreate
                        ? 'The text fields are saved locally and will be restored next time. Cover files must be selected again.'
                        : 'Unsaved edits to this note will be lost.'}
                    </p>
                  </div>
                </AlertDialog.Header>
                <AlertDialog.Footer
                  className={clsx(
                    'grid gap-2 border-t border-foreground/10 p-4',
                    isCreate ? 'grid-cols-3' : 'grid-cols-2',
                  )}
                >
                  <Button
                    variant="tertiary"
                    className="w-full min-w-0 rounded-full border border-foreground/10 px-3 text-xs sm:text-sm"
                    onPress={() => setIsCloseConfirmOpen(false)}
                  >
                    <span className="sm:hidden">Keep</span>
                    <span className="hidden sm:inline">Keep editing</span>
                  </Button>
                  {isCreate && (
                    <Button
                      variant="primary"
                      className="w-full min-w-0 rounded-full bg-danger px-3 text-xs text-white hover:bg-danger hover:opacity-85 sm:text-sm"
                      onPress={() => closeEditor({ clearDraft: true })}
                    >
                      <span className="sm:hidden">Discard</span>
                      <span className="hidden sm:inline">Discard draft</span>
                    </Button>
                  )}
                  <Button
                    variant={isCreate ? 'tertiary' : 'primary'}
                    className={clsx(
                      'w-full min-w-0 rounded-full px-3 text-xs sm:text-sm',
                      isCreate
                        ? 'border border-foreground/10'
                        : 'bg-danger text-white hover:bg-danger hover:opacity-85',
                    )}
                    onPress={() =>
                      isCreate
                        ? closeEditor()
                        : closeEditor({ clearDraft: true })
                    }
                  >
                    {isCreate ? (
                      'Close'
                    ) : (
                      <>
                        <span className="sm:hidden">Discard</span>
                        <span className="hidden sm:inline">
                          Discard changes
                        </span>
                      </>
                    )}
                  </Button>
                </AlertDialog.Footer>
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        </AlertDialog>
      )}
    </>
  );
}
