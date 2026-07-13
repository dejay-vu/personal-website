import {
  DeleteObjectsCommand,
  ListObjectVersionsCommand,
  ListObjectsV2Command,
  type ObjectIdentifier,
  S3Client,
} from '@aws-sdk/client-s3';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { config } from 'dotenv';
import { readFile } from 'node:fs/promises';
import path, { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { assertExpectedNonRootAwsIdentity } from '../../src/modules/media/awsIdentityGuard';
import {
  DOMAIN_RESET_LEGACY_PREFIXES,
  assertDomainCleanupContractMatches,
  createDomainCleanupContract,
  domainCleanupContractSchema,
  loadVerifiedDomainBackup,
} from './manifest';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);

config({ path: resolve(repositoryRoot, '.env.local'), quiet: true });
config({ path: resolve(repositoryRoot, '.env'), quiet: true });

const args = process.argv.slice(2);
const valueAfter = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const backupDirectory = valueAfter('--backup');
const verificationPath = valueAfter('--verification');
const shouldApply = args.includes('--apply');
if (!backupDirectory || !path.isAbsolute(backupDirectory)) {
  throw new Error('Pass an absolute backup directory with --backup.');
}
if (!verificationPath || !path.isAbsolute(verificationPath)) {
  throw new Error(
    'Pass an absolute verification artifact with --verification.',
  );
}
const absoluteBackupDirectory = backupDirectory;
const absoluteVerificationPath = verificationPath;

const verificationSchema = z.object({
  status: z.literal('passed'),
  manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  cleanupContract: domainCleanupContractSchema,
});

function requiredEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing ${names.join(' or ')}.`);
}

type ListedObject = { key: string; size: number };

async function listPrefix(
  s3: S3Client,
  bucket: string,
  expectedBucketOwner: string,
  prefix: string,
): Promise<ListedObject[]> {
  const objects: ListedObject[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        ExpectedBucketOwner: expectedBucketOwner,
      }),
    );
    for (const object of response.Contents ?? []) {
      if (object.Key) objects.push({ key: object.Key, size: object.Size ?? 0 });
    }
    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return objects;
}

type ListedVersion = {
  isDeleteMarker: boolean;
  key: string;
  size: number;
  versionId: string;
};

async function listPrefixVersions(
  s3: S3Client,
  bucket: string,
  expectedBucketOwner: string,
  prefix: string,
) {
  const versions: ListedVersion[] = [];
  const seenMarkers = new Set<string>();
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;

  while (true) {
    const response = await s3.send(
      new ListObjectVersionsCommand({
        Bucket: bucket,
        ExpectedBucketOwner: expectedBucketOwner,
        KeyMarker: keyMarker,
        Prefix: prefix,
        VersionIdMarker: versionIdMarker,
      }),
    );
    for (const version of response.Versions ?? []) {
      if (version.Key && version.VersionId) {
        versions.push({
          isDeleteMarker: false,
          key: version.Key,
          size: version.Size ?? 0,
          versionId: version.VersionId,
        });
      }
    }
    for (const marker of response.DeleteMarkers ?? []) {
      if (marker.Key && marker.VersionId) {
        versions.push({
          isDeleteMarker: true,
          key: marker.Key,
          size: 0,
          versionId: marker.VersionId,
        });
      }
    }

    if (!response.IsTruncated) return versions;

    const nextKeyMarker = response.NextKeyMarker;
    const nextVersionIdMarker = response.NextVersionIdMarker;
    const marker = `${nextKeyMarker ?? ''}\0${nextVersionIdMarker ?? ''}`;
    if (!nextKeyMarker || seenMarkers.has(marker)) {
      throw new Error(
        `Version listing for ${bucket}/${prefix} did not return a new marker.`,
      );
    }

    seenMarkers.add(marker);
    keyMarker = nextKeyMarker;
    versionIdMarker = nextVersionIdMarker;
  }
}

async function deleteObjects(
  s3: S3Client,
  bucket: string,
  expectedBucketOwner: string,
  objects: ObjectIdentifier[],
) {
  for (let index = 0; index < objects.length; index += 1_000) {
    const chunk = objects.slice(index, index + 1_000);
    if (chunk.length === 0) continue;
    const response = await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk, Quiet: false },
        ExpectedBucketOwner: expectedBucketOwner,
      }),
    );
    if ((response.Errors?.length ?? 0) > 0) {
      throw new Error(
        `Failed to delete ${response.Errors!.length} objects from ${bucket}.`,
      );
    }
  }
}

async function main() {
  const verified = await loadVerifiedDomainBackup(absoluteBackupDirectory);
  const verification = verificationSchema.parse(
    JSON.parse(await readFile(absoluteVerificationPath, 'utf8')),
  );
  if (verification.manifestSha256 !== verified.manifestSha256) {
    throw new Error('Verification artifact belongs to a different manifest.');
  }

  const region = requiredEnv(
    'AWS_REGION',
    'AWS_DEFAULT_REGION',
    'NEXT_PUBLIC_S3_REGION',
  );
  const originalBucket = requiredEnv(
    'S3_BUCKET_NAME',
    'NEXT_PUBLIC_S3_BUCKET_NAME',
  );
  const transformedBucket = requiredEnv(
    'TRANSFORMED_IMAGE_BUCKET_NAME',
    'AWS_TRANSFORMED_IMAGE_BUCKET_NAME',
    'NEXT_PUBLIC_TRANSFORMED_IMAGE_BUCKET_NAME',
  );
  const expectedAccount = requiredEnv('AWS_EXPECTED_ACCOUNT_ID');
  const expectedPrincipalPrefix = requiredEnv(
    'AWS_MAINTENANCE_PRINCIPAL_ARN_PREFIX',
  );
  const cleanupContract = createDomainCleanupContract({
    originalBucket,
    transformedBucket,
  });
  assertDomainCleanupContractMatches(
    verification.cleanupContract,
    cleanupContract,
  );
  const sessionToken = process.env.AWS_SESSION_TOKEN?.trim();
  const credentials = {
    accessKeyId: requiredEnv('AWS_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnv('AWS_SECRET_ACCESS_KEY'),
    ...(sessionToken ? { sessionToken } : {}),
  };
  const identity = await new STSClient({ credentials, region }).send(
    new GetCallerIdentityCommand({}),
  );
  assertExpectedNonRootAwsIdentity({
    actualAccount: identity.Account,
    actualArn: identity.Arn,
    expectedAccount,
    expectedPrincipalArnPrefix: expectedPrincipalPrefix,
  });

  const s3 = new S3Client({
    region,
    credentials,
  });

  try {
    const inventory = [] as {
      bucket: string;
      bytes: number;
      count: number;
      objects: ObjectIdentifier[];
      prefix: string;
    }[];
    for (const prefix of DOMAIN_RESET_LEGACY_PREFIXES) {
      const versions = await listPrefixVersions(
        s3,
        originalBucket,
        expectedAccount,
        prefix,
      );
      inventory.push({
        bucket: originalBucket,
        bytes: versions.reduce((sum, version) => sum + version.size, 0),
        count: versions.length,
        objects: versions.map(({ key: Key, versionId: VersionId }) => ({
          Key,
          VersionId,
        })),
        prefix,
      });

      const transformed = await listPrefix(
        s3,
        transformedBucket,
        expectedAccount,
        prefix,
      );
      inventory.push({
        bucket: transformedBucket,
        bytes: transformed.reduce((sum, object) => sum + object.size, 0),
        count: transformed.length,
        objects: transformed.map(({ key: Key }) => ({ Key })),
        prefix,
      });
    }

    console.log(
      JSON.stringify({
        apply:
          shouldApply && process.env.ALLOW_DESTRUCTIVE_DOMAIN_RESET === '1',
        legacyInventory: inventory.map(
          ({ objects: _objects, ...entry }) => entry,
        ),
      }),
    );

    if (!shouldApply || process.env.ALLOW_DESTRUCTIVE_DOMAIN_RESET !== '1') {
      console.log(
        'Dry run only. Cleanup requires --apply and ALLOW_DESTRUCTIVE_DOMAIN_RESET=1.',
      );
      return;
    }

    for (const entry of inventory) {
      if (
        !DOMAIN_RESET_LEGACY_PREFIXES.includes(
          entry.prefix as (typeof DOMAIN_RESET_LEGACY_PREFIXES)[number],
        )
      ) {
        throw new Error(`Refusing unexpected cleanup prefix: ${entry.prefix}`);
      }
      await deleteObjects(s3, entry.bucket, expectedAccount, entry.objects);
    }

    for (const entry of inventory) {
      const remaining =
        entry.bucket === originalBucket
          ? await listPrefixVersions(
              s3,
              entry.bucket,
              expectedAccount,
              entry.prefix,
            )
          : await listPrefix(s3, entry.bucket, expectedAccount, entry.prefix);
      if (remaining.length > 0) {
        throw new Error(
          `Domain cleanup verification found ${remaining.length} remaining entries in ${entry.bucket}/${entry.prefix}.`,
        );
      }
    }

    console.log(
      JSON.stringify({
        domainCleanup: 'passed',
        deletedObjects: inventory.reduce((sum, entry) => sum + entry.count, 0),
      }),
    );
  } finally {
    s3.destroy();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Domain cleanup failed.',
  );
  process.exitCode = 1;
});
