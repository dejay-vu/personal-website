import {
  ListObjectsV2Command,
  type ListObjectsV2CommandInput,
  S3Client,
} from '@aws-sdk/client-s3';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';

import { assertExpectedNonRootAwsIdentity } from './awsIdentityGuard';

const HEALTH_PREFIX = 'media/health-check/';
const DEFAULT_TIMEOUT_MS = 5_000;

export type AwsRuntimeHealthResult = {
  identity: 'ok';
  originals: 'ok';
  transformed: 'ok';
};

export type AwsRuntimeHealthProbe = {
  getCallerIdentity(signal: AbortSignal): Promise<{
    Account?: string;
    Arn?: string;
  }>;
  listObjects(
    input: ListObjectsV2CommandInput,
    signal: AbortSignal,
  ): Promise<unknown>;
};

type AwsRuntimeHealthOptions = {
  env?: NodeJS.ProcessEnv;
  probe?: AwsRuntimeHealthProbe;
  timeoutMs?: number;
};

function firstConfiguredEnvironmentValue(
  env: NodeJS.ProcessEnv,
  ...names: string[]
) {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }

  return '';
}

function getAwsRuntimeHealthConfig(env: NodeJS.ProcessEnv) {
  const region = firstConfiguredEnvironmentValue(
    env,
    'AWS_REGION',
    'AWS_DEFAULT_REGION',
    'NEXT_PUBLIC_S3_REGION',
  );
  const expectedAccount = firstConfiguredEnvironmentValue(
    env,
    'AWS_EXPECTED_ACCOUNT_ID',
  );
  const expectedPrincipalArnPrefix = firstConfiguredEnvironmentValue(
    env,
    'AWS_RUNTIME_PRINCIPAL_ARN_PREFIX',
  );
  const originalBucketName = firstConfiguredEnvironmentValue(
    env,
    'S3_BUCKET_NAME',
    'NEXT_PUBLIC_S3_BUCKET_NAME',
  );
  const transformedBucketName = firstConfiguredEnvironmentValue(
    env,
    'TRANSFORMED_IMAGE_BUCKET_NAME',
    'AWS_TRANSFORMED_IMAGE_BUCKET_NAME',
    'NEXT_PUBLIC_TRANSFORMED_IMAGE_BUCKET_NAME',
  );
  const missing = [
    !region && 'AWS_REGION',
    !expectedAccount && 'AWS_EXPECTED_ACCOUNT_ID',
    !expectedPrincipalArnPrefix && 'AWS_RUNTIME_PRINCIPAL_ARN_PREFIX',
    !originalBucketName && 'S3_BUCKET_NAME',
    !transformedBucketName && 'TRANSFORMED_IMAGE_BUCKET_NAME',
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Missing AWS runtime health configuration: ${missing.join(', ')}.`,
    );
  }
  if (originalBucketName === transformedBucketName) {
    throw new Error(
      'AWS runtime health buckets must identify distinct resources.',
    );
  }

  try {
    assertExpectedNonRootAwsIdentity({
      actualAccount: expectedAccount,
      actualArn: expectedPrincipalArnPrefix,
      expectedAccount,
      expectedPrincipalArnPrefix,
    });
  } catch {
    throw new Error(
      'AWS runtime health identity configuration must identify a non-root principal in the expected account.',
    );
  }

  return {
    expectedAccount,
    expectedPrincipalArnPrefix,
    originalBucketName,
    region,
    transformedBucketName,
  };
}

function createAwsRuntimeHealthProbe(region: string): AwsRuntimeHealthProbe {
  const s3 = new S3Client({ region });
  const sts = new STSClient({ region });

  return {
    getCallerIdentity: (signal) =>
      sts.send(new GetCallerIdentityCommand({}), { abortSignal: signal }),
    listObjects: (input, signal) =>
      s3.send(new ListObjectsV2Command(input), { abortSignal: signal }),
  };
}

async function withTimeout<T>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('AWS runtime health timeout must be positive.');
  }

  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error('AWS runtime health check timed out.'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), expired]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function checkAwsRuntimeHealth({
  env = process.env,
  probe,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: AwsRuntimeHealthOptions = {}): Promise<AwsRuntimeHealthResult> {
  const config = getAwsRuntimeHealthConfig(env);
  const activeProbe = probe ?? createAwsRuntimeHealthProbe(config.region);

  return withTimeout(timeoutMs, async (signal) => {
    const identity = await activeProbe.getCallerIdentity(signal);

    try {
      assertExpectedNonRootAwsIdentity({
        actualAccount: identity.Account,
        actualArn: identity.Arn,
        expectedAccount: config.expectedAccount,
        expectedPrincipalArnPrefix: config.expectedPrincipalArnPrefix,
      });
    } catch {
      throw new Error(
        'AWS runtime identity does not match the configured non-root principal.',
      );
    }

    const listInput = (Bucket: string): ListObjectsV2CommandInput => ({
      Bucket,
      ExpectedBucketOwner: config.expectedAccount,
      MaxKeys: 1,
      Prefix: HEALTH_PREFIX,
    });

    await activeProbe.listObjects(listInput(config.originalBucketName), signal);
    await activeProbe.listObjects(
      listInput(config.transformedBucketName),
      signal,
    );

    return {
      identity: 'ok',
      originals: 'ok',
      transformed: 'ok',
    };
  });
}
