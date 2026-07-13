import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ADMIN_FETCH_TIMEOUT_MS,
  S3_UPLOAD_TIMEOUT_MS,
  adminFetch,
} from '../../src/components/admin/adminClient';
import {
  NOTE_CREATE_DRAFT_STORAGE_KEY,
  clearFinalizedNoteCreateDraft,
  readNoteCreateDraftForm,
  writeNoteCreateDraft,
} from '../../src/components/admin/noteCreateDraftStorage';

function createLocalStorage() {
  const values = new Map<string, string>();

  return {
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    get length() {
      return values.size;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  } satisfies Storage;
}

function withLocalStorage(run: (storage: Storage) => void) {
  const originalWindow = globalThis.window;
  const storage = createLocalStorage();

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: storage },
  });

  try {
    run(storage);
  } finally {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: Window }).window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      });
    }
  }
}

test('a submitted note draft is cleared only by its finalized upload', () => {
  withLocalStorage((storage) => {
    const form = { content: '# Durable draft', slug: 'durable-draft' };

    writeNoteCreateDraft(form, 'upload-1');

    assert.deepEqual(readNoteCreateDraftForm(), form);
    assert.equal(clearFinalizedNoteCreateDraft('upload-2'), false);
    assert.notEqual(storage.getItem(NOTE_CREATE_DRAFT_STORAGE_KEY), null);
    assert.equal(clearFinalizedNoteCreateDraft('upload-1'), true);
    assert.equal(storage.getItem(NOTE_CREATE_DRAFT_STORAGE_KEY), null);
  });
});

test('editing a retained draft removes the old upload association', () => {
  withLocalStorage((storage) => {
    writeNoteCreateDraft({ content: 'submitted' }, 'upload-1');
    writeNoteCreateDraft({ content: 'new edits' });

    assert.equal(clearFinalizedNoteCreateDraft('upload-1'), false);
    assert.notEqual(storage.getItem(NOTE_CREATE_DRAFT_STORAGE_KEY), null);
  });
});

test('shared admin requests enforce a client deadline', async () => {
  assert.equal(ADMIN_FETCH_TIMEOUT_MS, 90_000);
  assert.equal(S3_UPLOAD_TIMEOUT_MS, 5 * 60_000);

  const originalFetch = globalThis.fetch;

  globalThis.fetch = (() =>
    new Promise<Response>(() => undefined)) as typeof fetch;

  try {
    await assert.rejects(
      adminFetch('/api/admin/test', { timeoutMs: 5 }),
      /Request timed out\. Please retry\./,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('admin create flows preflight before requesting upload storage', () => {
  const dashboard = readFileSync(
    'src/components/admin/AdminDashboard.tsx',
    'utf8',
  );
  const noteDrawer = readFileSync(
    'src/components/admin/NoteEditorDrawer.tsx',
    'utf8',
  );

  for (const [source, preflight] of [
    [dashboard, '/api/admin/photos/preflight'],
    [noteDrawer, '/api/admin/notes/preflight'],
  ] as const) {
    const preflightIndex = source.indexOf(preflight);
    const presignIndex = source.indexOf('/api/admin/uploads/presign');

    assert.notEqual(preflightIndex, -1);
    assert.ok(preflightIndex < presignIndex);
  }

  for (const source of [dashboard, noteDrawer]) {
    assert.match(source, /from ['"]@\/components\/admin\/adminClient['"]/);
    assert.doesNotMatch(source, /async function adminFetch/);
    assert.doesNotMatch(source, /async function uploadToS3/);
  }
});

test('the upload monitor exposes retryable staged photo errors', () => {
  const source = readFileSync(
    'src/components/admin/AdminUploadMonitor.tsx',
    'utf8',
  );

  assert.match(source, /status\.status === 'STAGED' && status\.error/);
  assert.match(source, /clearFinalizedNoteCreateDraft\(job\.uploadId\)/);
  assert.match(source, /\/api\/admin\/photos\/finalize/);
  assert.match(source, /Replacement slug for/);
  assert.match(source, /retryPhotoJob\(job\)/);

  const dashboard = readFileSync(
    'src/components/admin/AdminDashboard.tsx',
    'utf8',
  );
  assert.match(dashboard, /retry:\s*\{\s*slug:/);
});
