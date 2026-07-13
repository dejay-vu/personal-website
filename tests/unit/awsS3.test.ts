import type {
  DeleteObjectsCommandInput,
  ListObjectVersionsCommandInput,
  ListObjectVersionsCommandOutput,
  ListObjectsV2CommandInput,
  ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  awsS3DeleteAllVersions,
  awsS3DeleteMany,
  awsS3DeleteVersionEntries,
  awsS3List,
  awsS3ListVersions,
} from '../../src/services/awsS3';

test('original-media cleanup paths never use marker-producing simple delete', () => {
  const uploadSource = readFileSync('src/modules/admin/uploads.ts', 'utf8');
  const deletionSource = readFileSync(
    'src/modules/media/deletionJobs.ts',
    'utf8',
  );

  assert.doesNotMatch(uploadSource, /\bawsS3Delete\s*\(/);
  assert.match(uploadSource, /awsS3DeleteAllVersions/);
  assert.match(deletionSource, /deleteAllOriginalVersions/);
});

test('lists every S3 page and includes zero-byte objects', async () => {
  const inputs: ListObjectsV2CommandInput[] = [];
  const pages: ListObjectsV2CommandOutput[] = [
    {
      $metadata: {},
      Contents: [
        { Key: 'prefix/non-empty.webp', Size: 128 },
        { Key: 'prefix/empty.webp', Size: 0 },
        { Size: 12 },
      ],
      IsTruncated: true,
      NextContinuationToken: 'page-2',
    },
    {
      $metadata: {},
      Contents: [{ Key: 'prefix/final.webp', Size: 64 }],
      IsTruncated: false,
    },
  ];

  const keys = await awsS3List('prefix/', {
    Bucket: 'transformed-media',
    listPage: async (input) => {
      inputs.push(input);
      const page = pages.shift();
      assert.ok(page);
      return page;
    },
  });

  assert.deepEqual(keys, [
    'prefix/non-empty.webp',
    'prefix/empty.webp',
    'prefix/final.webp',
  ]);
  assert.deepEqual(inputs, [
    {
      Bucket: 'transformed-media',
      ContinuationToken: undefined,
      Prefix: 'prefix/',
    },
    {
      Bucket: 'transformed-media',
      ContinuationToken: 'page-2',
      Prefix: 'prefix/',
    },
  ]);
});

test('rejects a truncated S3 page without a usable continuation token', async () => {
  await assert.rejects(
    awsS3List('prefix/', {
      Bucket: 'transformed-media',
      listPage: async () => ({
        $metadata: {},
        IsTruncated: true,
      }),
    }),
    /truncated without a new continuation token/,
  );
});

test('rejects a repeated S3 version-list marker', async () => {
  let calls = 0;

  await assert.rejects(
    awsS3ListVersions('prefix/', {
      Bucket: 'original-media',
      listPage: async () => {
        calls += 1;
        return {
          $metadata: {},
          IsTruncated: true,
          NextKeyMarker: 'prefix/key',
          NextVersionIdMarker: 'v1',
        };
      },
    }),
    /truncated without a new marker/,
  );
  assert.equal(calls, 2);
});

test('lists every S3 object version and exact-key delete marker', async () => {
  const inputs: ListObjectVersionsCommandInput[] = [];
  const pages: ListObjectVersionsCommandOutput[] = [
    {
      $metadata: {},
      DeleteMarkers: [
        {
          IsLatest: true,
          Key: 'media/photos/p1/original.jpg',
          VersionId: 'd1',
        },
      ],
      IsTruncated: true,
      NextKeyMarker: 'media/photos/p1/original.jpg',
      NextVersionIdMarker: 'v1',
      Versions: [
        {
          IsLatest: false,
          Key: 'media/photos/p1/original.jpg',
          VersionId: 'v1',
        },
        {
          IsLatest: true,
          Key: 'media/photos/p1/original.jpg/format=webp',
          VersionId: 'other',
        },
      ],
    },
    {
      $metadata: {},
      IsTruncated: false,
      Versions: [
        {
          IsLatest: false,
          Key: 'media/photos/p1/original.jpg',
          VersionId: 'v0',
        },
      ],
    },
  ];

  const versions = await awsS3ListVersions('media/photos/p1/original.jpg', {
    Bucket: 'original-media',
    exactKey: 'media/photos/p1/original.jpg',
    listPage: async (input) => {
      inputs.push(input);
      const page = pages.shift();
      assert.ok(page);
      return page;
    },
  });

  assert.deepEqual(versions, [
    {
      isDeleteMarker: false,
      isLatest: false,
      key: 'media/photos/p1/original.jpg',
      versionId: 'v1',
    },
    {
      isDeleteMarker: true,
      isLatest: true,
      key: 'media/photos/p1/original.jpg',
      versionId: 'd1',
    },
    {
      isDeleteMarker: false,
      isLatest: false,
      key: 'media/photos/p1/original.jpg',
      versionId: 'v0',
    },
  ]);
  assert.deepEqual(inputs, [
    {
      Bucket: 'original-media',
      KeyMarker: undefined,
      Prefix: 'media/photos/p1/original.jpg',
      VersionIdMarker: undefined,
    },
    {
      Bucket: 'original-media',
      KeyMarker: 'media/photos/p1/original.jpg',
      Prefix: 'media/photos/p1/original.jpg',
      VersionIdMarker: 'v1',
    },
  ]);
});

test('deletes every version and delete marker for an immutable original key', async () => {
  const deletes: DeleteObjectsCommandInput[] = [];
  let listCalls = 0;

  const count = await awsS3DeleteAllVersions({
    Bucket: 'original-media',
    Keys: ['media/notes/n1/covers/a1/original.jpg'],
    deleteBatch: async (input) => {
      deletes.push(input);
      return { $metadata: {} };
    },
    listPage: async () => {
      listCalls += 1;
      if (listCalls > 1) return { $metadata: {}, IsTruncated: false };

      return {
        $metadata: {},
        DeleteMarkers: [
          {
            IsLatest: true,
            Key: 'media/notes/n1/covers/a1/original.jpg',
            VersionId: 'marker-1',
          },
        ],
        IsTruncated: false,
        Versions: [
          {
            IsLatest: false,
            Key: 'media/notes/n1/covers/a1/original.jpg',
            VersionId: 'version-1',
          },
        ],
      };
    },
  });

  assert.equal(count, 2);
  assert.deepEqual(deletes, [
    {
      Bucket: 'original-media',
      Delete: {
        Objects: [
          {
            Key: 'media/notes/n1/covers/a1/original.jpg',
            VersionId: 'version-1',
          },
          {
            Key: 'media/notes/n1/covers/a1/original.jpg',
            VersionId: 'marker-1',
          },
        ],
        Quiet: false,
      },
    },
  ]);
});

test('re-lists exact keys until a racing S3 version is also deleted', async () => {
  const deletedVersionIds: string[][] = [];
  let listCalls = 0;

  const count = await awsS3DeleteAllVersions({
    Bucket: 'original-media',
    Keys: ['key.jpg'],
    deleteBatch: async (input) => {
      deletedVersionIds.push(
        (input.Delete?.Objects ?? []).map(({ VersionId }) => VersionId ?? ''),
      );
      return { $metadata: {} };
    },
    listPage: async () => {
      listCalls += 1;
      if (listCalls === 1) {
        return {
          $metadata: {},
          IsTruncated: false,
          Versions: [
            { IsLatest: true, Key: 'key.jpg', VersionId: 'version-1' },
          ],
        };
      }
      if (listCalls === 2) {
        return {
          $metadata: {},
          IsTruncated: false,
          Versions: [{ IsLatest: true, Key: 'key.jpg', VersionId: 'null' }],
        };
      }
      return { $metadata: {}, IsTruncated: false };
    },
  });

  assert.equal(count, 2);
  assert.deepEqual(deletedVersionIds, [['version-1'], ['null']]);
});

test('fails a durable all-version deletion that never converges', async () => {
  let deletes = 0;
  let lists = 0;

  await assert.rejects(
    awsS3DeleteAllVersions({
      Bucket: 'original-media',
      Keys: ['key.jpg'],
      deleteBatch: async () => {
        deletes += 1;
        return { $metadata: {} };
      },
      listPage: async () => {
        lists += 1;
        return {
          $metadata: {},
          IsTruncated: false,
          Versions: [
            { IsLatest: true, Key: 'key.jpg', VersionId: 'version-1' },
          ],
        };
      },
    }),
    /did not converge/,
  );

  assert.equal(deletes, 5);
  assert.equal(lists, 6);
});

test('batches S3 deletion and rejects per-object failures', async () => {
  const calls: DeleteObjectsCommandInput[] = [];
  const keys = Array.from({ length: 1001 }, (_, index) => `key-${index}`);

  await awsS3DeleteMany({
    Bucket: 'cache',
    Keys: keys,
    deleteBatch: async (input) => {
      calls.push(input);
      return { $metadata: {} };
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].Delete?.Objects?.length, 1000);
  assert.equal(calls[1].Delete?.Objects?.length, 1);

  await assert.rejects(
    awsS3DeleteMany({
      Bucket: 'cache',
      Keys: ['failed'],
      deleteBatch: async () => ({
        $metadata: {},
        Errors: [{ Key: 'failed', VersionId: 'v1' }],
      }),
    }),
    /failed@v1/,
  );
});

test('batches more than 1000 versioned S3 deletions with version IDs', async () => {
  const calls: DeleteObjectsCommandInput[] = [];

  await awsS3DeleteVersionEntries({
    Bucket: 'original-media',
    Entries: Array.from({ length: 1001 }, (_, index) => ({
      isDeleteMarker: index % 2 === 0,
      isLatest: false,
      key: `key-${index}`,
      versionId: `version-${index}`,
    })),
    deleteBatch: async (input) => {
      calls.push(input);
      return { $metadata: {} };
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].Delete?.Objects?.length, 1000);
  assert.equal(calls[1].Delete?.Objects?.length, 1);
  assert.deepEqual(calls[1].Delete?.Objects?.[0], {
    Key: 'key-1000',
    VersionId: 'version-1000',
  });
});
