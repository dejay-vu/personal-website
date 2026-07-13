import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type ReleaseProvenanceInput,
  buildReleaseProvenance,
  canonicalPrettyJson,
  sha256CanonicalJson,
} from '../../scripts/release-provenance';

function input(): ReleaseProvenanceInput {
  return {
    aws: {
      contactTemplate: {
        Resources: { Bucket: { Type: 'AWS::S3::Bucket' } },
        AWSTemplateFormatVersion: '2010-09-09',
      },
      externalMediaContract: {
        schemaVersion: 1,
        storageLayoutVersion: 1,
      },
    },
    database: {
      migrationLockBytes: Buffer.from('provider = "postgresql"\n'),
      migrations: [
        {
          bytes: Buffer.from('select 2;\n'),
          name: '20260712000000_second',
        },
        {
          bytes: Buffer.from('select 1;\n'),
          name: '00000000000000_baseline',
        },
      ],
      prismaSchemaBytes: Buffer.from(
        'datasource db { provider = "postgresql" }\n',
      ),
      provider: 'postgresql',
    },
    release: {
      commitSha: 'a'.repeat(40),
      lockVersion: '0.1.0',
      manifestVersion: '0.1.0',
      packageVersion: '0.1.0',
      tag: 'v0.1.0',
      treeSha: 'b'.repeat(40),
      version: '0.1.0',
    },
    storage: {
      contractLayoutVersion: 1,
      keyBuilderBytes: Buffer.from('export const STORAGE_LAYOUT_VERSION = 1;'),
      layoutVersion: 1,
    },
    toolchain: {
      awsCdk: '2.1126.0',
      awsCdkLib: '2.258.1',
      node: '24.x',
      npm: '11.17.0',
      prisma: '7.8.0',
    },
  };
}

test('release provenance is deterministic and contains only structure evidence', () => {
  const first = buildReleaseProvenance(input());
  const second = buildReleaseProvenance(input());
  const bytes = canonicalPrettyJson(first);

  assert.equal(bytes, canonicalPrettyJson(second));
  assert.equal(first.release.tag, 'v0.1.0');
  assert.equal(first.database.migrationHead, '20260712000000_second');
  assert.deepEqual(
    first.database.migrations.map(({ name }) => name),
    ['00000000000000_baseline', '20260712000000_second'],
  );
  assert.equal(first.storage.layoutVersion, 1);
  assert.doesNotMatch(
    bytes,
    /generatedAt|restore|backup|deployment|oldMain|account|principal|objectKey|https?:/i,
  );
});

test('canonical JSON digest ignores object key order but detects semantics', () => {
  assert.equal(
    sha256CanonicalJson({ a: 1, nested: { b: 2, c: 3 } }),
    sha256CanonicalJson({ nested: { c: 3, b: 2 }, a: 1 }),
  );
  assert.notEqual(sha256CanonicalJson({ a: 1 }), sha256CanonicalJson({ a: 2 }));
  assert.notEqual(
    sha256CanonicalJson({ a: 1 }),
    sha256CanonicalJson(JSON.parse('{"a":1,"__proto__":{"x":2}}')),
  );
});

test('release provenance rejects version, layout, migration, and input drift', () => {
  const versionMismatch = input();
  versionMismatch.release.packageVersion = '0.1.1';
  assert.throws(() => buildReleaseProvenance(versionMismatch), /must match/);

  const lockVersionMismatch = input();
  lockVersionMismatch.release.lockVersion = '0.1.1';
  assert.throws(
    () => buildReleaseProvenance(lockVersionMismatch),
    /lockfile version/,
  );

  const layoutMismatch = input();
  layoutMismatch.storage.contractLayoutVersion = 2;
  assert.throws(
    () => buildReleaseProvenance(layoutMismatch),
    /Storage layout version/,
  );

  const duplicateMigration = input();
  duplicateMigration.database.migrations.push({
    ...duplicateMigration.database.migrations[0],
  });
  assert.throws(
    () => buildReleaseProvenance(duplicateMigration),
    /must be unique/,
  );

  const unknownField = input() as ReleaseProvenanceInput & { secret: string };
  unknownField.secret = 'must-not-be-accepted';
  assert.throws(() => buildReleaseProvenance(unknownField), /unknown fields/);
});
