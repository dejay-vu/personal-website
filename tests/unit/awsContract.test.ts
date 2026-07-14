import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertAwsContract,
  getAwsContractIssues,
} from '../../src/modules/media/awsContract';
import { DEFAULT_PUBLIC_MEDIA_HOSTS } from '../../src/modules/media/publicConfig';

const contract = {
  accountId: '123456789012',
  driftPolicy: {
    afterViewerRequestPatch: [
      {
        logicalResourceId: 'urlRewriteD6DE1501',
        propertyPath: '/FunctionCode',
      },
    ],
    known: [
      {
        actualValue: '50000000',
        expectedValue: '4700000',
        logicalResourceId: 'imageoptimization4C49F079',
        propertyPath: '/Environment/Variables/maxImageSize',
      },
    ],
  },
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
  schemaVersion: 2,
  storageLayoutVersion: 1,
  transformed: {
    bucketName: 'transformed-media',
    cacheExpirationDays: 90,
    cloudFrontDistributionId: 'ETRANSFORMED',
    ownerStack: 'ImgTransformationStack',
    publicHost: DEFAULT_PUBLIC_MEDIA_HOSTS.transformed,
    versioningState: 'NeverEnabled',
  },
  viewerRequest: {
    baselineSourceSha256: 'a'.repeat(64),
    cloudFormationLogicalId: 'urlRewriteD6DE1501',
    distributionId: 'ETRANSFORMED',
    eventType: 'viewer-request',
    functionName: 'url-rewrite',
    ownerStack: 'ImgTransformationStack',
    robots: {
      cacheControl: 'public, max-age=86400',
      contentType: 'text/plain; charset=utf-8',
      getBody: 'User-agent: *\nAllow: /\n',
      methods: ['GET', 'HEAD'],
      path: '/robots.txt',
      statusCode: 200,
    },
    runtime: 'cloudfront-js-1.0',
    sourceFile: 'infra/cloudfront/url-rewrite-function.js',
    targetSourceSha256: 'b'.repeat(64),
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
