'use client';

export const NOTE_CREATE_DRAFT_STORAGE_KEY =
  'dejayvu:admin:note-editor:create-draft:v1';

type StoredNoteCreateDraft = {
  form?: unknown;
  pendingUploadId?: string;
  savedAt?: string;
};

function readStoredDraft(): StoredNoteCreateDraft | null {
  try {
    const raw = window.localStorage.getItem(NOTE_CREATE_DRAFT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== 'object') return null;

    return parsed as StoredNoteCreateDraft;
  } catch {
    window.localStorage.removeItem(NOTE_CREATE_DRAFT_STORAGE_KEY);
    return null;
  }
}

export function readNoteCreateDraftForm() {
  return readStoredDraft()?.form;
}

export function writeNoteCreateDraft(form: unknown, pendingUploadId?: string) {
  window.localStorage.setItem(
    NOTE_CREATE_DRAFT_STORAGE_KEY,
    JSON.stringify({
      form,
      ...(pendingUploadId ? { pendingUploadId } : {}),
      savedAt: new Date().toISOString(),
    }),
  );
}

export function clearNoteCreateDraft() {
  window.localStorage.removeItem(NOTE_CREATE_DRAFT_STORAGE_KEY);
}

export function clearFinalizedNoteCreateDraft(uploadId: string) {
  const draft = readStoredDraft();

  if (draft?.pendingUploadId !== uploadId) return false;

  clearNoteCreateDraft();
  return true;
}
