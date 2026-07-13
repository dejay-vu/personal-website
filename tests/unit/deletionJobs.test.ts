import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createStorageDeletionAdapters,
  executeStorageDeletionPayload,
  storageDeletionPayloadSchema,
} from '../../src/modules/media/deletionJobs';

const configuredEnvironment = {
  AWS_EXPECTED_ACCOUNT_ID: '123456789012',
  AWS_REGION: 'eu-west-2',
  CLOUDFRONT_ORIGINALS_DISTRIBUTION_ID: 'EORIGINALS123',
  CLOUDFRONT_TRANSFORMED_DISTRIBUTION_ID: 'ETRANSFORMED123',
  S3_BUCKET_NAME: 'original-media',
  TRANSFORMED_IMAGE_BUCKET_NAME: 'transformed-media',
};

test('default storage adapters keep original history and cache deletion isolated', async () => {
  const originalDeletes: unknown[] = [];
  const cacheLists: unknown[] = [];
  const cacheDeletes: unknown[] = [];
  const invalidations: unknown[] = [];
  const adapters = createStorageDeletionAdapters({
    environment: configuredEnvironment,
    services: {
      deleteAllOriginalVersions: async (input) => {
        originalDeletes.push(input);
        return 2;
      },
      deleteCurrentObjects: async (input) => {
        cacheDeletes.push(input);
      },
      invalidatePrefixes: async (input) => {
        invalidations.push(input);
        return null;
      },
      listCurrentObjects: async (prefix, options) => {
        cacheLists.push({ options, prefix });
        return [`${prefix}/format=webp,width=640`];
      },
    },
  });
  const key = 'media/photos/p1/a1/original.jpg';

  await executeStorageDeletionPayload(
    { originalKeys: [key], transformedPrefixes: [key] },
    adapters,
  );

  assert.deepEqual(originalDeletes, [
    {
      Bucket: 'original-media',
      ExpectedBucketOwner: '123456789012',
      Keys: [key],
    },
  ]);
  assert.deepEqual(cacheLists, [
    {
      options: {
        Bucket: 'transformed-media',
        ExpectedBucketOwner: '123456789012',
      },
      prefix: key,
    },
  ]);
  assert.deepEqual(cacheDeletes, [
    {
      Bucket: 'transformed-media',
      ExpectedBucketOwner: '123456789012',
      Keys: [`${key}/format=webp,width=640`],
    },
  ]);
  assert.deepEqual(invalidations, [
    { distributionId: 'EORIGINALS123', prefixes: [key] },
    { distributionId: 'ETRANSFORMED123', prefixes: [key] },
  ]);
});

test('deletes storage then invalidates both corresponding CDN prefixes', async () => {
  const originals: string[][] = [];
  const transformed: string[][] = [];
  const originalInvalidations: string[][] = [];
  const transformedInvalidations: string[][] = [];

  const payload = {
    originalKeys: ['media/notes/n1/covers/a1/original.jpg'],
    transformedPrefixes: ['media/notes/n1/covers/a1/original.jpg'],
  };

  const adapters = {
    deleteOriginalKeys: async (keys: string[]) => void originals.push(keys),
    deleteTransformedPrefixes: async (prefixes: string[]) =>
      void transformed.push(prefixes),
    invalidateOriginalPrefixes: async (prefixes: string[]) =>
      void originalInvalidations.push(prefixes),
    invalidateTransformedPrefixes: async (prefixes: string[]) =>
      void transformedInvalidations.push(prefixes),
  };

  await executeStorageDeletionPayload(payload, adapters);
  await executeStorageDeletionPayload(payload, adapters);

  assert.deepEqual(originals, [payload.originalKeys, payload.originalKeys]);
  assert.deepEqual(transformed, [
    payload.transformedPrefixes,
    payload.transformedPrefixes,
  ]);
  assert.deepEqual(originalInvalidations, [
    payload.originalKeys,
    payload.originalKeys,
  ]);
  assert.deepEqual(transformedInvalidations, [
    payload.transformedPrefixes,
    payload.transformedPrefixes,
  ]);
});

test('does not invalidate a CDN prefix until both storage deletions succeed', async () => {
  let invalidations = 0;

  await assert.rejects(() =>
    executeStorageDeletionPayload(
      {
        originalKeys: ['media/photos/p1/a1/original.jpg'],
        transformedPrefixes: ['media/photos/p1/a1/original.jpg'],
      },
      {
        deleteOriginalKeys: async () => undefined,
        deleteTransformedPrefixes: async () => {
          throw new Error('transformed deletion failed');
        },
        invalidateOriginalPrefixes: async () => void (invalidations += 1),
        invalidateTransformedPrefixes: async () => void (invalidations += 1),
      },
    ),
  );

  assert.equal(invalidations, 0);
});

test('accepts only immutable canonical media targets', () => {
  assert.deepEqual(
    storageDeletionPayloadSchema.parse({
      originalKeys: [
        'media/photos/p1/a1/original.jpg',
        'media/photos/p1/a1/original.jpg',
      ],
      transformedPrefixes: ['media/projects/project_1/asset_1/original.png'],
    }),
    {
      originalKeys: ['media/photos/p1/a1/original.jpg'],
      transformedPrefixes: ['media/projects/project_1/asset_1/original.png'],
    },
  );

  for (const key of [
    'media/gallery/slug/original.jpg',
    'media/notes/n1/covers/a1/../../secret',
    'content/thoughts/n1/index.md',
    'media/notes/n1/covers/a1/original.JPG',
  ]) {
    assert.throws(() =>
      storageDeletionPayloadSchema.parse({
        originalKeys: [key],
        transformedPrefixes: [],
      }),
    );
  }
});

test('bounds storage targets per durable deletion job', () => {
  assert.throws(() =>
    storageDeletionPayloadSchema.parse({
      originalKeys: Array.from(
        { length: 101 },
        (_, index) => `media/photos/p${index}/a${index}/original.jpg`,
      ),
      transformedPrefixes: [],
    }),
  );
});

test('allows an empty idempotent deletion payload', async () => {
  let calls = 0;

  await executeStorageDeletionPayload(
    { originalKeys: [], transformedPrefixes: [] },
    {
      deleteOriginalKeys: async () => void (calls += 1),
      deleteTransformedPrefixes: async () => void (calls += 1),
      invalidateOriginalPrefixes: async () => void (calls += 1),
      invalidateTransformedPrefixes: async () => void (calls += 1),
    },
  );

  assert.equal(calls, 4);
});
