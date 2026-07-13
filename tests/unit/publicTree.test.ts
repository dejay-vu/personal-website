import assert from 'node:assert/strict';
import test from 'node:test';

import {
  comparePublicDocs,
  findAgentNoteMarkers,
  findBlockedPaths,
  parsePublicDocsAllowlist,
} from '../../scripts/check-public-tree.mjs';

test('blocks local tooling paths and guidance basenames at any depth', () => {
  assert.deepEqual(
    findBlockedPaths([
      '.claude/settings.json',
      '.vscode/mcp.json',
      'docs/plans-local/release.md',
      'nested/AGENTS.md',
      'nested/.claude/settings.json',
      '.env.local',
      'nested/.env.production',
      '.vercel/project.json',
      'cdk.out/stack.template.json',
      'domain-backups/export.json',
      '.release-evidence/release-provenance.json',
      'release-provenance.json',
      'nested/release-verification.json',
      'test-results/trace.zip',
      'secrets/identity.pem',
      'src/app/page.tsx',
    ]),
    [
      '.claude/settings.json',
      '.vscode/mcp.json',
      'docs/plans-local/release.md',
      'nested/AGENTS.md',
      'nested/.claude/settings.json',
      '.env.local',
      'nested/.env.production',
      '.vercel/project.json',
      'cdk.out/stack.template.json',
      'domain-backups/export.json',
      '.release-evidence/release-provenance.json',
      'release-provenance.json',
      'nested/release-verification.json',
      'test-results/trace.zip',
      'secrets/identity.pem',
    ],
  );
  assert.deepEqual(findBlockedPaths(['.env.example', 'src/app/page.tsx']), []);
});

test('requires exact, duplicate-free public documentation paths', () => {
  const allowed = parsePublicDocsAllowlist(
    'docs/adr/0001-stable-domain-names-and-storage-identity.md\n',
  );
  assert.deepEqual(
    comparePublicDocs(
      [
        'README.md',
        'docs/adr/0001-stable-domain-names-and-storage-identity.md',
      ],
      allowed,
    ),
    [],
  );
  assert.throws(
    () =>
      parsePublicDocsAllowlist(
        'docs/runbooks/release.md\ndocs/runbooks/release.md\n',
      ),
    /duplicate paths/,
  );
  assert.throws(
    () => parsePublicDocsAllowlist('docs/runbooks/*.md\n'),
    /Invalid public docs allowlist path/,
  );
});

test('reports unapproved and missing public docs', () => {
  assert.deepEqual(
    comparePublicDocs(
      ['docs/runbooks/release.md'],
      ['docs/adr/architecture.md'],
    ),
    [
      'unexpected: docs/runbooks/release.md',
      'missing: docs/adr/architecture.md',
    ],
  );
});

test('detects legacy development-note markers in Markdown blobs', () => {
  assert.deepEqual(
    findAgentNoteMarkers([
      ['README.md', '# Project'],
      ['notes.md', 'Run the REQUIRED SUB-SKILL before editing.'],
    ]),
    ['notes.md'],
  );
});
