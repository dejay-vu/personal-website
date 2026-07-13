import {
  CloudFrontClient,
  CreateInvalidationCommand,
  type CreateInvalidationCommandInput,
  type CreateInvalidationCommandOutput,
} from '@aws-sdk/client-cloudfront';
import { randomUUID } from 'node:crypto';

function firstConfiguredEnvironmentValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  return '';
}

const AWS_REGION = firstConfiguredEnvironmentValue(
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'NEXT_PUBLIC_S3_REGION',
);

let cloudFrontClient: CloudFrontClient | null = null;
const WILDCARD_INVALIDATION_INTERVAL_MS = 1_050;
let nextInvalidationStartAt = 0;
let invalidationQueue: Promise<void> = Promise.resolve();

function getCloudFrontClient() {
  if (cloudFrontClient) return cloudFrontClient;

  const missing = [!AWS_REGION && 'AWS_REGION'].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Missing AWS CloudFront configuration: ${missing.join(', ')}.`,
    );
  }

  cloudFrontClient = new CloudFrontClient({
    region: AWS_REGION,
  });

  return cloudFrontClient;
}

export type AwsCloudFrontCreateInvalidation = (
  input: CreateInvalidationCommandInput,
) => Promise<CreateInvalidationCommandOutput>;

const createInvalidation: AwsCloudFrontCreateInvalidation = (input) => {
  const pending = invalidationQueue.then(async () => {
    const waitMs = Math.max(0, nextInvalidationStartAt - Date.now());

    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    // CloudFront's default wildcard-invalidation quota is one per second.
    // Serialize starts within this server instance; cross-instance throttles
    // still fall through to the deletion job's durable retry/backoff path.
    nextInvalidationStartAt = Date.now() + WILDCARD_INVALIDATION_INTERVAL_MS;
    return getCloudFrontClient().send(new CreateInvalidationCommand(input));
  });

  invalidationQueue = pending.then(
    () => undefined,
    () => undefined,
  );

  return pending;
};

function invalidationPath(prefix: string) {
  const normalized = prefix.trim().replace(/^\/+/, '');

  if (
    !normalized ||
    normalized.includes('*') ||
    normalized.includes('?') ||
    normalized.includes('#')
  ) {
    throw new Error(`Invalid CloudFront invalidation prefix: ${prefix}`);
  }

  return `/${normalized}*`;
}

export async function awsCloudFrontInvalidatePrefixes({
  callerReference = `storage-purge-${randomUUID()}`,
  create = createInvalidation,
  distributionId,
  prefixes,
}: {
  callerReference?: string;
  create?: AwsCloudFrontCreateInvalidation;
  distributionId: string;
  prefixes: string[];
}) {
  const paths = [...new Set(prefixes.map(invalidationPath))];
  const normalizedDistributionId = distributionId.trim();
  const normalizedCallerReference = callerReference.trim();

  if (!normalizedDistributionId) {
    throw new Error('CloudFront distribution ID is required.');
  }
  if (!normalizedCallerReference) {
    throw new Error('CloudFront caller reference is required.');
  }

  if (paths.length === 0) return null;

  return create({
    DistributionId: normalizedDistributionId,
    InvalidationBatch: {
      CallerReference: normalizedCallerReference,
      Paths: {
        Items: paths,
        Quantity: paths.length,
      },
    },
  });
}
