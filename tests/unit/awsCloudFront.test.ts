import type { CreateInvalidationCommandInput } from '@aws-sdk/client-cloudfront';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { awsCloudFrontInvalidatePrefixes } from '../../src/services/awsCloudFront';

test('the production sender is serialized for the wildcard quota', () => {
  const source = readFileSync('src/services/awsCloudFront.ts', 'utf8');

  assert.match(source, /WILDCARD_INVALIDATION_INTERVAL_MS = 1_050/);
  assert.match(source, /invalidationQueue\.then/);
});

test('creates a CloudFront wildcard invalidation with a consistent quantity', async () => {
  const inputs: CreateInvalidationCommandInput[] = [];

  await awsCloudFrontInvalidatePrefixes({
    callerReference: 'test-invalidation-1',
    create: async (input) => {
      inputs.push(input);
      return { $metadata: {} };
    },
    distributionId: 'EORIGINALS123',
    prefixes: [
      'media/photos/photo_1/asset_1/original.jpg',
      '/media/photos/photo_1/asset_1/original.jpg',
    ],
  });

  assert.deepEqual(inputs, [
    {
      DistributionId: 'EORIGINALS123',
      InvalidationBatch: {
        CallerReference: 'test-invalidation-1',
        Paths: {
          Items: ['/media/photos/photo_1/asset_1/original.jpg*'],
          Quantity: 1,
        },
      },
    },
  ]);
});

test('uses a unique caller reference for each invalidation', async () => {
  const references: string[] = [];
  const create = async (input: CreateInvalidationCommandInput) => {
    const reference = input.InvalidationBatch?.CallerReference;
    assert.ok(reference);
    references.push(reference);
    return { $metadata: {} };
  };

  await awsCloudFrontInvalidatePrefixes({
    create,
    distributionId: 'EDISTRIBUTION123',
    prefixes: ['media/photos/photo_1/asset_1/original.jpg'],
  });
  await awsCloudFrontInvalidatePrefixes({
    create,
    distributionId: 'EDISTRIBUTION123',
    prefixes: ['media/photos/photo_1/asset_1/original.jpg'],
  });

  assert.equal(references.length, 2);
  assert.notEqual(references[0], references[1]);
});

test('does not send an empty invalidation batch', async () => {
  let calls = 0;

  const result = await awsCloudFrontInvalidatePrefixes({
    create: async () => {
      calls += 1;
      return { $metadata: {} };
    },
    distributionId: 'EDISTRIBUTION123',
    prefixes: [],
  });

  assert.equal(result, null);
  assert.equal(calls, 0);
});
