import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DOMAIN_RESET_LEGACY_PREFIXES,
  assertDomainCleanupContractMatches,
  createDomainCleanupContract,
  domainBackupManifestSchema,
  planDomainImport,
  sha256,
} from '../../scripts/domain-reset/manifest';

test('binds destructive cleanup approval to exact buckets and prefixes', () => {
  const contract = createDomainCleanupContract({
    originalBucket: 'originals',
    transformedBucket: 'transformed',
  });

  assert.deepEqual(contract.prefixes, DOMAIN_RESET_LEGACY_PREFIXES);
  assert.doesNotThrow(() =>
    assertDomainCleanupContractMatches(contract, contract),
  );
  assert.throws(() =>
    assertDomainCleanupContractMatches(
      { ...contract, transformedBucket: 'different-bucket' },
      contract,
    ),
  );
  assert.throws(() =>
    assertDomainCleanupContractMatches(
      { ...contract, prefixes: [...contract.prefixes].reverse() },
      contract,
    ),
  );
});

test('accepts a versioned backup with notes, photos, and assets', () => {
  const manifest = domainBackupManifestSchema.parse({
    version: 1,
    generatedAt: '2026-07-10T00:00:00.000Z',
    notes: [],
    photos: [],
    assets: [],
    categories: [],
    photoTags: [],
  });

  assert.equal(manifest.version, 1);
});

test('rejects a manifest without a hash for an exported asset', () => {
  assert.throws(() =>
    domainBackupManifestSchema.parse({
      version: 1,
      generatedAt: '2026-07-10T00:00:00.000Z',
      notes: [],
      photos: [],
      categories: [],
      photoTags: [],
      assets: [{ id: 'm1', originalKey: 'x', relativePath: 'x' }],
    }),
  );
});

test('preserves every field from a category row', () => {
  const category = {
    slug: 'engineering',
    name: 'Engineering',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-02T00:00:00.000Z',
  };
  const manifest = domainBackupManifestSchema.parse({
    version: 1,
    generatedAt: '2026-07-10T00:00:00.000Z',
    notes: [],
    photos: [],
    assets: [],
    categories: [category],
    photoTags: [],
  });

  assert.deepEqual(manifest.categories, [category]);
});

test('preserves every field from a photo-tag row', () => {
  const photoTag = {
    id: 'tag-1',
    field: 'camera',
    value: 'X100V',
    label: 'Fujifilm X100V',
    slug: 'x100v',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-02T00:00:00.000Z',
  };
  const manifest = domainBackupManifestSchema.parse({
    version: 1,
    generatedAt: '2026-07-10T00:00:00.000Z',
    notes: [],
    photos: [],
    assets: [],
    categories: [],
    photoTags: [photoTag],
  });

  assert.deepEqual(manifest.photoTags, [photoTag]);
});

test('rejects an incomplete category row', () => {
  assert.throws(() =>
    domainBackupManifestSchema.parse({
      version: 1,
      generatedAt: '2026-07-10T00:00:00.000Z',
      notes: [],
      photos: [],
      assets: [],
      categories: [
        {
          slug: 'engineering',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-02T00:00:00.000Z',
        },
      ],
      photoTags: [],
    }),
  );
});

test('rejects an incomplete photo-tag row', () => {
  assert.throws(() =>
    domainBackupManifestSchema.parse({
      version: 1,
      generatedAt: '2026-07-10T00:00:00.000Z',
      notes: [],
      photos: [],
      assets: [],
      categories: [],
      photoTags: [
        {
          id: 'tag-1',
          field: 'camera',
          value: 'X100V',
          slug: 'x100v',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-02T00:00:00.000Z',
        },
      ],
    }),
  );
});

test('hashes bytes deterministically', () => {
  assert.equal(
    sha256(Buffer.from('note')),
    'edb465624291e4053c6c5ea4b7eb320dec773e10a57d26b95dcf0564f8e310f8',
  );
});

test('plans deterministic ID-based note and photo media keys', () => {
  const manifest = domainBackupManifestSchema.parse({
    version: 1,
    generatedAt: '2026-07-10T00:00:00.000Z',
    categories: [],
    photoTags: [],
    notes: [
      {
        row: { id: '../legacy note' },
        categorySlugs: [],
        markdownRelativePath: 'notes/n1/content.md',
        markdownSha256: 'a'.repeat(64),
        coverMediaId: 'asset/cover',
      },
    ],
    photos: [
      {
        row: { id: 'photo_valid' },
        tagIds: [],
        mediaAssetId: 'asset_photo',
      },
    ],
    assets: [
      {
        id: 'asset/cover',
        originalKey: 'media/thoughts/n/cover.jpg',
        relativePath: 'assets/a/original.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1,
        sha256: 'b'.repeat(64),
        width: 1,
        height: 1,
        blurDataURL: 'data:',
      },
      {
        id: 'asset_photo',
        originalKey: 'media/gallery/photo.jpg',
        relativePath: 'assets/b/original.webp',
        mimeType: 'image/webp',
        sizeBytes: 1,
        sha256: 'c'.repeat(64),
        width: 1,
        height: 1,
        blurDataURL: 'data:',
      },
    ],
  });

  const first = planDomainImport(manifest);
  const second = planDomainImport(manifest);

  assert.deepEqual(first, second);
  assert.equal(first.photos[0].id, 'photo_valid');
  assert.match(first.notes[0].id, /^note_[a-f0-9]{24}$/);
  assert.match(
    first.assets[0].finalKey,
    /^media\/notes\/note_[a-f0-9]{24}\/covers\/asset_[a-f0-9]{24}\/original\.jpg$/,
  );
  assert.equal(
    first.assets[1].finalKey,
    'media/photos/photo_valid/asset_photo/original.webp',
  );
});
