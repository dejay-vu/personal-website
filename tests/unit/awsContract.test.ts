import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertAwsContract,
  getAwsContractIssues,
} from '../../src/modules/media/awsContract';
import { DEFAULT_PUBLIC_MEDIA_HOSTS } from '../../src/modules/media/publicConfig';

const contract = {
  imageOptimization: {
    environment: {
      originalImageBucketName: 'original-media',
      transformedImageBucketName: 'transformed-media',
    },
    functionName: 'image-optimization',
    ownerStack: 'ImgTransformationStack',
  },
  managedByThisRepository: false,
  originals: {
    bucketName: 'original-media',
    cloudFrontDistributionId: 'EORIGINALS',
    owner: 'external-unmanaged',
    publicHost: DEFAULT_PUBLIC_MEDIA_HOSTS.originals,
    versioningState: 'Enabled',
  },
  region: 'eu-west-2',
  schemaVersion: 1,
  storageLayoutVersion: 1,
  transformed: {
    bucketName: 'transformed-media',
    cacheExpirationDays: 90,
    cloudFrontDistributionId: 'ETRANSFORMED',
    ownerStack: 'ImgTransformationStack',
    publicHost: DEFAULT_PUBLIC_MEDIA_HOSTS.transformed,
    versioningState: 'NeverEnabled',
  },
};

test('AWS contract accepts the versioned storage layout and resource mapping', () => {
  assert.deepEqual(getAwsContractIssues(contract), []);
  assert.doesNotThrow(() => assertAwsContract(contract));
});

test('AWS contract rejects layout drift and aliased resources', () => {
  const issues = getAwsContractIssues({
    ...contract,
    originals: {
      ...contract.originals,
      bucketName: 'transformed-media',
      cloudFrontDistributionId: 'ETRANSFORMED',
    },
    storageLayoutVersion: 2,
  });

  assert.ok(issues.some((issue) => issue.includes('storageLayoutVersion')));
  assert.ok(
    issues.some((issue) => issue.includes('buckets must be different')),
  );
  assert.ok(
    issues.some((issue) => issue.includes('distributions must be different')),
  );
  assert.ok(issues.some((issue) => issue.includes('mapping is inconsistent')));
  assert.throws(() => assertAwsContract({}), /AWS contract is invalid/);
});
