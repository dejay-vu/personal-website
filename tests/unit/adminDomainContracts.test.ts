import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function getFunctionSource(source: string, name: string) {
  const start = source.indexOf(`function ${name}`);

  assert.notEqual(start, -1, `${name} must exist`);

  const parametersStart = source.indexOf('(', start);
  let parameterDepth = 0;
  let parametersEnd = -1;

  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === '(') parameterDepth += 1;
    if (source[index] === ')') parameterDepth -= 1;

    if (parameterDepth === 0) {
      parametersEnd = index;
      break;
    }
  }

  const bodyStart = source.indexOf('{', parametersEnd);
  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;

    if (depth === 0) return source.slice(start, index + 1);
  }

  assert.fail(`${name} must have a complete function body`);
}

test('the uploads module owns the transactional intent finalization', () => {
  const uploadsSource = readFileSync('src/modules/admin/uploads.ts', 'utf8');
  const notesSource = readFileSync('src/modules/notes/admin.ts', 'utf8');
  const commitSource = getFunctionSource(
    notesSource,
    'commitAdminNoteCreation',
  );

  assert.match(
    uploadsSource,
    /export async function finalizeUploadIntent\s*\(/,
  );
  assert.match(uploadsSource, /status: AdminUploadStatus\.STAGED/);
  assert.match(uploadsSource, /status: AdminUploadStatus\.FINALIZED/);
  assert.match(uploadsSource, /finalized\.count !== 1/);
  assert.doesNotMatch(notesSource, /adminUploadIntent/);
  assert.match(
    commitSource,
    /await uploads\.finalizeUploadIntent\(transaction,/,
  );
});

test('note storage dependencies cross one named capability seam', () => {
  const source = readFileSync('src/modules/notes/admin.ts', 'utf8');
  const loaderSource = getFunctionSource(source, 'loadAdminUploadCapabilities');
  const createSource = getFunctionSource(source, 'createAdminNoteFromEditor');
  const replaceSource = getFunctionSource(
    source,
    'replaceAdminNoteCoverFromUpload',
  );
  const updateSource = getFunctionSource(source, 'updateAdminNoteFromEditor');
  const purgeSource = getFunctionSource(source, 'purgeAdminNote');

  assert.match(
    loaderSource,
    /return import\(['"]@\/modules\/admin\/uploads['"]\)/,
  );
  assert.equal(
    source.match(/import\(['"]@\/modules\/admin\/uploads['"]\)/g)?.length,
    1,
  );
  assert.match(createSource, /loadAdminUploadCapabilities\(\)/);
  assert.match(replaceSource, /loadAdminUploadCapabilities\(\)/);
  assert.doesNotMatch(purgeSource, /loadAdminUploadCapabilities\(\)/);
  assert.doesNotMatch(
    updateSource,
    /loadAdminUploadCapabilities|uploads\.|awsS3|originalKey|buildNoteCoverOriginalKey/,
  );
  assert.doesNotMatch(source, /from ['"]@\/modules\/admin\/uploads['"]/);
});

test('note and photo admin share slug validation', () => {
  assert.equal(existsSync('src/modules/admin/slug.ts'), true);

  for (const file of [
    'src/modules/notes/admin.ts',
    'src/modules/photos/admin.ts',
  ]) {
    const source = readFileSync(file, 'utf8');

    assert.match(
      source,
      /import \{ ensureAdminSlug \} from ['"]@\/modules\/admin\/slug['"]/,
    );
    assert.doesNotMatch(source, /function ensureSlug\s*\(/);
    assert.match(source, /ensureAdminSlug\(input\.slug, ['"]Slug['"]\)/);
  }
});

test('the shared image limit has no ignored upload-kind parameter', () => {
  const source = readFileSync('src/modules/admin/uploads.ts', 'utf8');

  assert.doesNotMatch(source, /function getMaxBytes\s*\(/);
  assert.doesNotMatch(source, /_kind/);
});
