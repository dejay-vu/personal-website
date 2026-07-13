import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ContactAttachmentsStack } from '../../infra/lib/contact-attachments-stack';
import { DEFAULT_PUBLIC_MEDIA_HOSTS } from '../../src/modules/media/publicConfig';
import { STORAGE_LAYOUT_VERSION } from '../../src/modules/media/storageKeys';

type TemplateResource = {
  DeletionPolicy?: string;
  Properties?: Record<string, unknown>;
  Type: string;
  UpdateReplacePolicy?: string;
};

type ExternalMediaContract = {
  imageOptimization: {
    environment: Record<string, string>;
    functionName: string;
    ownerStack: string;
  };
  managedByThisRepository: boolean;
  originals: {
    bucketName: string;
    cloudFrontDistributionId: string;
    owner: string;
    publicHost: string;
    versioningState: string;
  };
  region: string;
  schemaVersion: number;
  storageLayoutVersion: number;
  transformed: {
    bucketName: string;
    cacheExpirationDays: number;
    cloudFrontDistributionId: string;
    ownerStack: string;
    publicHost: string;
    versioningState: string;
  };
};

function resourcesOfType(template: Template, type: string) {
  return Object.values(
    template.findResources(type) as Record<string, TemplateResource>,
  );
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

test('AWS infrastructure keeps contact attachments private and retained', () => {
  const app = new App();
  const stack = new ContactAttachmentsStack(app, 'ContactContract', {
    lifecycleExpirationDays: 30,
  });
  const template = Template.fromStack(stack);
  const buckets = resourcesOfType(template, 'AWS::S3::Bucket');

  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].DeletionPolicy, 'Retain');
  assert.equal(buckets[0].UpdateReplacePolicy, 'Retain');
  assert.deepEqual(buckets[0].Properties?.BucketEncryption, {
    ServerSideEncryptionConfiguration: [
      { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
    ],
  });
  assert.deepEqual(buckets[0].Properties?.OwnershipControls, {
    Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }],
  });
  assert.deepEqual(buckets[0].Properties?.PublicAccessBlockConfiguration, {
    BlockPublicAcls: true,
    BlockPublicPolicy: true,
    IgnorePublicAcls: true,
    RestrictPublicBuckets: true,
  });
  assert.deepEqual(buckets[0].Properties?.LifecycleConfiguration, {
    Rules: [
      {
        ExpirationInDays: 30,
        Prefix: 'private/contact/',
        Status: 'Enabled',
      },
    ],
  });
  assert.equal(buckets[0].Properties?.VersioningConfiguration, undefined);

  const policies = resourcesOfType(template, 'AWS::S3::BucketPolicy');
  assert.equal(policies.length, 1);
  const policyText = JSON.stringify(policies[0].Properties?.PolicyDocument);
  assert.match(policyText, /aws:SecureTransport/);
  assert.match(policyText, /"Effect":"Deny"/);
  assert.match(policyText, /"Action":"s3:\*"/);
});

test('AWS infrastructure keeps media as a versioned external structure contract', () => {
  const contract = readJson<ExternalMediaContract>(
    'infra/external-media-contract.json',
  );
  const cdk = readJson<{ context: Record<string, unknown> }>('cdk.json');
  const appSource = readFileSync('infra/bin/media-stack.ts', 'utf8');

  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.storageLayoutVersion, STORAGE_LAYOUT_VERSION);
  assert.equal(contract.managedByThisRepository, false);
  assert.equal(contract.originals.owner, 'external-unmanaged');
  assert.equal(contract.transformed.ownerStack, 'ImgTransformationStack');
  assert.equal(contract.imageOptimization.ownerStack, 'ImgTransformationStack');
  assert.equal(contract.originals.versioningState, 'Enabled');
  assert.equal(contract.transformed.versioningState, 'NeverEnabled');
  assert.equal(contract.transformed.cacheExpirationDays, 90);
  assert.equal(
    contract.originals.publicHost,
    DEFAULT_PUBLIC_MEDIA_HOSTS.originals,
  );
  assert.equal(
    contract.transformed.publicHost,
    DEFAULT_PUBLIC_MEDIA_HOSTS.transformed,
  );
  assert.notEqual(
    contract.originals.bucketName,
    contract.transformed.bucketName,
  );
  assert.notEqual(
    contract.originals.cloudFrontDistributionId,
    contract.transformed.cloudFrontDistributionId,
  );
  assert.equal(
    contract.imageOptimization.environment.originalImageBucketName,
    contract.originals.bucketName,
  );
  assert.equal(
    contract.imageOptimization.environment.transformedImageBucketName,
    contract.transformed.bucketName,
  );
  const infrastructureGuide = readFileSync('infra/README.md', 'utf8');
  assert.match(infrastructureGuide, /owner-only runtime health endpoint/);
  assert.match(infrastructureGuide, /`s3:ListBucket`/);
  assert.match(infrastructureGuide, /exact `media\/health-check\/` prefix/);
  assert.match(infrastructureGuide, /`s3:max-keys` no greater\s+than `1`/);
  assert.match(infrastructureGuide, /must not grant object reads/);
  assert.deepEqual(Object.keys(cdk.context).sort(), [
    'contactAttachmentExpirationDays',
    'region',
  ]);
  assert.doesNotMatch(appSource, /MediaImageTransformationConfigStack/);
});

test('AWS infrastructure documentation uses stable and safe language', () => {
  const source = readFileSync('infra/README.md', 'utf8');
  const dashboard = readFileSync(
    'src/components/admin/AdminDashboard.tsx',
    'utf8',
  );

  assert.doesNotMatch(source, /gallery|thoughts/i);
  assert.match(source, /media\/photos\//);
  assert.match(source, /media\/notes\//);
  assert.match(source, /never an account root key/);
  assert.match(source, /S3 Object Versioning controls recovery/);
  assert.match(source, /storage layout version `1`/);
  assert.match(dashboard, /every original S3 version/);
  assert.match(dashboard, /storage deletion queued/);
});
