import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const adminModuleContracts = {
  'src/modules/admin/audit.ts': [/export async function writeAdminAudit/],
  'src/modules/admin/dashboard.ts': [
    /export type AdminDashboardData/,
    /export async function getAdminDashboardData/,
  ],
  'src/modules/admin/errors.ts': [/export class AdminDomainError/],
  'src/modules/admin/uploads.ts': [
    /export async function createUploadPresigns/,
    /export async function getUploadStatuses/,
  ],
  'src/modules/notes/admin.ts': [
    /export type NoteEditorInput/,
    /export async function createAdminNoteFromEditor/,
    /export async function updateAdminNoteFromEditor/,
    /export async function updateAdminNoteStatus/,
    /export async function purgeAdminNote/,
  ],
  'src/modules/photos/admin.ts': [
    /export async function finalizePhoto/,
    /export async function updateAdminPhoto/,
    /export async function purgeAdminPhoto/,
  ],
} as const;

test('exposes the canonical admin domain modules', () => {
  for (const [file, exports] of Object.entries(adminModuleContracts)) {
    assert.equal(existsSync(file), true, `${file} must exist`);
    const source = readFileSync(file, 'utf8');

    for (const exportPattern of exports) {
      assert.match(
        source,
        exportPattern,
        `${file} must export ${exportPattern}`,
      );
    }
  }

  assert.equal(existsSync('src/services/admin/media.ts'), false);
});

test('admin route adapters import only their owning domain modules', () => {
  const routeFiles = [
    'src/app/api/admin/notes/[id]/editor/route.ts',
    'src/app/api/admin/notes/[id]/route.ts',
    'src/app/api/admin/notes/editor/route.ts',
    'src/app/api/admin/notes/preflight/route.ts',
    'src/app/api/admin/photos/[id]/route.ts',
    'src/app/api/admin/photos/finalize/route.ts',
    'src/app/api/admin/photos/preflight/route.ts',
    'src/app/api/admin/uploads/presign/route.ts',
    'src/app/api/admin/uploads/status/route.ts',
  ];

  for (const file of routeFiles) {
    assert.equal(existsSync(file), true, `${file} must exist`);
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /@\/services\/admin\/media/,
      `${file} must not import the deleted catch-all`,
    );
  }

  assert.equal(
    existsSync('src/app/api/admin/gallery/photos/[id]/route.ts'),
    false,
  );
  assert.equal(
    existsSync('src/app/api/admin/gallery/photos/finalize/route.ts'),
    false,
  );
});

test('client admin modules keep server imports type-only', () => {
  for (const file of [
    'src/components/admin/AdminDashboard.tsx',
    'src/components/admin/NoteEditorDrawer.tsx',
  ]) {
    const source = readFileSync(file, 'utf8');

    assert.match(
      source,
      /import type \{ AdminDashboardData \} from ['"]@\/modules\/admin\/dashboard['"]/,
    );
    const serverModuleImports = (source.match(/import[\s\S]*?;/g) ?? []).filter(
      (statement) =>
        /from ['"]@\/modules\/(?:admin|notes|photos)\/(?:admin|dashboard|uploads)['"]/.test(
          statement,
        ),
    );

    assert.equal(
      serverModuleImports.every((statement) =>
        statement.startsWith('import type'),
      ),
      true,
    );
  }
});

test('the admin page uses the shared access decision', () => {
  const page = readFileSync('src/app/admin/page.tsx', 'utf8');

  assert.match(page, /getAdminAccess\(\)/);
  assert.doesNotMatch(page, /isAdminGithubId/);
  assert.doesNotMatch(page, /await auth\(\)/);
});

test('photo creation and title edits use an explicit slug', () => {
  const photoAdminSource = readFileSync('src/modules/photos/admin.ts', 'utf8');
  const finalizeRouteSource = readFileSync(
    'src/app/api/admin/photos/finalize/route.ts',
    'utf8',
  );
  const updateRouteSource = readFileSync(
    'src/app/api/admin/photos/[id]/route.ts',
    'utf8',
  );

  assert.match(finalizeRouteSource, /slug:\s*z\.string\(\)/);
  assert.match(updateRouteSource, /slug:\s*z\.string\(\)/);
  assert.match(
    photoAdminSource,
    /ensureAdminSlug\(input\.slug, ['"]Slug['"]\)/,
  );
  assert.doesNotMatch(photoAdminSource, /ensureAdminSlug\((?:input\.)?title/);
  assert.doesNotMatch(photoAdminSource, /toSlug\((?:input\.)?title/);
});

test('the note update implementation is storage-free', () => {
  const source = readFileSync('src/modules/notes/admin.ts', 'utf8');
  const updateStart = source.indexOf(
    'export async function updateAdminNoteFromEditor',
  );
  const updateEnd = source.indexOf('\nexport async function ', updateStart + 1);
  const updateSource = source.slice(
    updateStart,
    updateEnd === -1 ? undefined : updateEnd,
  );

  assert.notEqual(updateStart, -1);
  assert.doesNotMatch(
    updateSource,
    /loadAdminUploadCapabilities|uploads\.|awsS3|buildNoteCoverOriginalKey|originalKey|prepare.*cover/i,
  );
});
