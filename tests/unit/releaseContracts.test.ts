import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path: string) {
  return readFileSync(path, 'utf8');
}

function json<T>(path: string) {
  return JSON.parse(read(path)) as T;
}

test('release-please starts from v0.1.0 with explicit pre-major policy', () => {
  const packageManifest = json<{
    devEngines: {
      packageManager: { name: string; onFail: string; version: string };
      runtime: { name: string; onFail: string; version: string };
    };
    packageManager: string;
    version: string;
  }>('package.json');
  const manifest = json<Record<string, string>>(
    '.release-please-manifest.json',
  );
  const config = json<{
    packages: Record<
      string,
      {
        'bump-minor-pre-major': boolean;
        'bump-patch-for-minor-pre-major': boolean;
        draft: boolean;
        'force-tag-creation': boolean;
        'include-component-in-tag': boolean;
        'include-v-in-tag': boolean;
        'package-name': string;
        'release-type': string;
      }
    >;
  }>('release-please-config.json');
  const root = config.packages['.'];

  assert.equal(packageManifest.version, '0.1.0');
  assert.equal(manifest['.'], packageManifest.version);
  assert.equal(root['release-type'], 'node');
  assert.equal(root['package-name'], 'dejayvu');
  assert.equal(root['include-v-in-tag'], true);
  assert.equal(root['include-component-in-tag'], false);
  assert.equal(root['bump-minor-pre-major'], true);
  assert.equal(root['bump-patch-for-minor-pre-major'], false);
  assert.equal(root.draft, true);
  assert.equal(root['force-tag-creation'], true);
  assert.equal(packageManifest.packageManager, 'npm@11.17.0');
  assert.deepEqual(packageManifest.devEngines, {
    packageManager: { name: 'npm', onFail: 'error', version: '11.17.0' },
    runtime: { name: 'node', onFail: 'error', version: '24.x' },
  });
});

test('release workflows are pinned, trusted-ref-only, and secret-scoped', () => {
  const releasePlease = read('.github/workflows/release-please.yml');
  const provenance = read('.github/workflows/release-provenance.yml');
  const finalize = read('.github/workflows/release-finalize.yml');

  assert.match(
    releasePlease,
    /googleapis\/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7/,
  );
  assert.match(releasePlease, /secrets\.RELEASE_PLEASE_TOKEN/);
  assert.match(releasePlease, /contents: write/);
  assert.match(releasePlease, /pull-requests: write/);
  assert.doesNotMatch(releasePlease, /pull_request_target|pull_request:/);

  for (const source of [provenance, finalize]) {
    assert.match(
      source,
      /actions\/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5/,
    );
    assert.match(
      source,
      /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/,
    );
    assert.match(source, /persist-credentials: false/);
    assert.match(source, /refs\/tags\//);
    assert.match(source, /corepack npm ci/);
    assert.doesNotMatch(source, /\$\{\{\s*runner\.temp/);
    assert.doesNotMatch(source, /pull_request_target|pull_request:/);
  }

  assert.match(finalize, /environment: Production/);
  assert.match(finalize, /test "\$RELEASE_COMMIT_SHA" = "\$GITHUB_SHA"/);
  assert.match(finalize, /actions\/workflows\/ci\.yml\/runs/);
  assert.match(finalize, /-f event=push/);
  assert.match(finalize, /secrets\.VERCEL_TOKEN/);
  assert.match(finalize, /secrets\.POSTGRES_URL_NON_POOLING/);
  assert.match(finalize, /db:mask-logs/);
  assert.match(finalize, /\^2\[0-9\]\[0-9\]\$/);
  assert.match(finalize, /RELEASE_VERIFICATION_PREFLIGHT/);
  assert.match(finalize, /Re-verify deployment and write runtime evidence/);
  assert.match(finalize, /--draft=false/);
  assert.match(provenance, /contents: read/);
  assert.match(provenance, /release-provenance\.json/);
  assert.match(provenance, /release-verification\.json/);
  assert.doesNotMatch(provenance, /gh release upload/);
});

test('database workflows checkout their immutable dispatch commit', () => {
  for (const path of [
    '.github/workflows/db-baseline.yml',
    '.github/workflows/db-deploy.yml',
  ]) {
    const source = read(path);
    assert.match(source, /ref: \$\{\{ github\.sha \}\}/);
    assert.doesNotMatch(source, /ref: refs\/heads\/main/);
  }

  const baseline = read('.github/workflows/db-baseline.yml');
  const provenanceStep = baseline.slice(
    baseline.indexOf('- name: Write migration provenance'),
    baseline.indexOf('- uses: actions/upload-artifact'),
  );
  assert.doesNotMatch(provenanceStep, /PRODUCTION_RESTORE_EVIDENCE/);
});

test('generated release evidence is ignored and blocked from public trees', () => {
  assert.match(read('.gitignore'), /\/\.release-evidence\//);
  assert.match(read('.prettierignore'), /\.release-evidence\//);
  assert.match(read('scripts/check-public-tree.mjs'), /'\.release-evidence'/);
  assert.match(
    read('scripts/write-release-provenance.ts'),
    /ls-files', '--others', '--exclude-standard/,
  );
});

test('nested tool entrypoints preserve the pinned npm version', () => {
  const packageManifest = json<{
    devDependencies: Record<string, string>;
    scripts: Record<string, string>;
  }>('package.json');

  for (const name of [
    'test:integration',
    'test:e2e:prepare',
    'test:e2e',
    'db:test:verify',
  ]) {
    assert.doesNotMatch(
      packageManifest.scripts[name],
      /(?:^|&&\s*)npm\s/,
      `${name} must not fall back to the system npm`,
    );
  }

  assert.match(
    read('playwright.config.ts'),
    /command:\s*\n?\s*'corepack npm run start/,
  );
  assert.match(
    read('scripts/resolve-production-baseline.ts'),
    /\['npm', 'exec', '--', 'prisma', \.\.\.args\]/,
  );
  assert.doesNotMatch(
    read('scripts/resolve-production-baseline.ts'),
    /['"]npx(?:\.cmd)?['"]/,
  );
  for (const path of ['.husky/pre-commit', '.husky/commit-msg']) {
    assert.match(read(path), /corepack npm exec/);
    assert.doesNotMatch(read(path), /\bnpx\b/);
  }
  assert.equal(packageManifest.devDependencies['github-actionlint'], '1.7.12');
  assert.equal(packageManifest.scripts['check:workflows'], 'github-actionlint');
  assert.equal(packageManifest.scripts['prisma:generate'], 'prisma generate');
  assert.equal(packageManifest.scripts['prisma generate'], undefined);
  const mediaSource = read('src/lib/media.ts');
  assert.match(mediaSource, /DEFAULT_PUBLIC_MEDIA_URLS\.transformed/);
  assert.match(mediaSource, /DEFAULT_PUBLIC_MEDIA_URLS\.originals/);

  const vercel = json<{ buildCommand: string; installCommand: string }>(
    'vercel.json',
  );
  assert.equal(vercel.installCommand, 'corepack npm ci');
  assert.equal(vercel.buildCommand, 'corepack npm run build');
});
