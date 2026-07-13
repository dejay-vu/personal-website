import assert from 'node:assert/strict';
import test from 'node:test';

import { assertStorageDeletionConfigured } from '../../src/modules/media/storageConfig';

const configuredEnvironment = {
  AWS_ACCESS_KEY_ID: 'access-key',
  AWS_EXPECTED_ACCOUNT_ID: '123456789012',
  AWS_REGION: 'eu-west-2',
  AWS_SECRET_ACCESS_KEY: 'secret-key',
  CLOUDFRONT_ORIGINALS_DISTRIBUTION_ID: 'EORIGINALS123',
  CLOUDFRONT_TRANSFORMED_DISTRIBUTION_ID: 'ETRANSFORMED123',
  S3_BUCKET_NAME: 'original-media',
  TRANSFORMED_IMAGE_BUCKET_NAME: 'transformed-media',
};

test('storage deletion preflight returns the configured bucket identities', () => {
  assert.deepEqual(assertStorageDeletionConfigured(configuredEnvironment), {
    expectedBucketOwner: '123456789012',
    originalBucketName: 'original-media',
    originalDistributionId: 'EORIGINALS123',
    transformedBucketName: 'transformed-media',
    transformedDistributionId: 'ETRANSFORMED123',
  });
});

test('storage deletion preflight trims values and skips blank fallbacks', () => {
  assert.deepEqual(
    assertStorageDeletionConfigured({
      ...configuredEnvironment,
      AWS_DEFAULT_REGION: ' eu-west-2 ',
      AWS_REGION: ' ',
      CLOUDFRONT_ORIGINALS_DISTRIBUTION_ID: ' EORIGINALS123 ',
      NEXT_PUBLIC_S3_BUCKET_NAME: ' original-fallback ',
      S3_BUCKET_NAME: ' ',
      TRANSFORMED_IMAGE_BUCKET_NAME: ' transformed-media ',
    }),
    {
      expectedBucketOwner: '123456789012',
      originalBucketName: 'original-fallback',
      originalDistributionId: 'EORIGINALS123',
      transformedBucketName: 'transformed-media',
      transformedDistributionId: 'ETRANSFORMED123',
    },
  );
});

test('storage deletion preflight rejects incomplete configuration', () => {
  assert.throws(
    () =>
      assertStorageDeletionConfigured({
        ...configuredEnvironment,
        AWS_ACCESS_KEY_ID: ' ',
        CLOUDFRONT_TRANSFORMED_DISTRIBUTION_ID: undefined,
        TRANSFORMED_IMAGE_BUCKET_NAME: undefined,
      }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /AWS_ACCESS_KEY_ID/);
      assert.match(error.message, /CLOUDFRONT_TRANSFORMED_DISTRIBUTION_ID/);
      assert.match(error.message, /TRANSFORMED_IMAGE_BUCKET_NAME/);
      return true;
    },
  );
});

test('storage deletion preflight rejects aliased buckets and distributions', () => {
  assert.throws(
    () =>
      assertStorageDeletionConfigured({
        ...configuredEnvironment,
        TRANSFORMED_IMAGE_BUCKET_NAME: 'original-media',
      }),
    /bucket names must be different/,
  );

  assert.throws(
    () =>
      assertStorageDeletionConfigured({
        ...configuredEnvironment,
        CLOUDFRONT_TRANSFORMED_DISTRIBUTION_ID: 'EORIGINALS123',
      }),
    /distribution IDs must be different/,
  );
});

test('storage deletion preflight rejects an invalid expected bucket owner', () => {
  assert.throws(
    () =>
      assertStorageDeletionConfigured({
        ...configuredEnvironment,
        AWS_EXPECTED_ACCOUNT_ID: '1234',
      }),
    /12-digit account ID/,
  );
});
