export type StorageEnvironment = Record<string, string | undefined>;

export type StorageDeletionConfiguration = {
  expectedBucketOwner: string;
  originalBucketName: string;
  originalDistributionId: string;
  transformedBucketName: string;
  transformedDistributionId: string;
};

function firstConfiguredValue(
  environment: StorageEnvironment,
  names: string[],
) {
  for (const name of names) {
    const value = environment[name]?.trim();
    if (value) return value;
  }

  return '';
}

/**
 * Validate every setting required to drain a storage-deletion job before a
 * purge commits its database transaction. This is deliberately a local
 * configuration check: it does not mutate storage or make a network request.
 */
export function assertStorageDeletionConfigured(
  environment: StorageEnvironment = process.env,
): StorageDeletionConfiguration {
  const region = firstConfiguredValue(environment, [
    'AWS_REGION',
    'AWS_DEFAULT_REGION',
    'NEXT_PUBLIC_S3_REGION',
  ]);
  const expectedBucketOwner = firstConfiguredValue(environment, [
    'AWS_EXPECTED_ACCOUNT_ID',
  ]);
  const originalBucketName = firstConfiguredValue(environment, [
    'S3_BUCKET_NAME',
    'NEXT_PUBLIC_S3_BUCKET_NAME',
  ]);
  const transformedBucketName = firstConfiguredValue(environment, [
    'TRANSFORMED_IMAGE_BUCKET_NAME',
    'AWS_TRANSFORMED_IMAGE_BUCKET_NAME',
    'NEXT_PUBLIC_TRANSFORMED_IMAGE_BUCKET_NAME',
  ]);
  const originalDistributionId = firstConfiguredValue(environment, [
    'CLOUDFRONT_ORIGINALS_DISTRIBUTION_ID',
  ]);
  const transformedDistributionId = firstConfiguredValue(environment, [
    'CLOUDFRONT_TRANSFORMED_DISTRIBUTION_ID',
  ]);
  const accessKeyId = environment.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = environment.AWS_SECRET_ACCESS_KEY?.trim();
  const missing = [
    !region && 'AWS_REGION/AWS_DEFAULT_REGION/NEXT_PUBLIC_S3_REGION',
    !accessKeyId && 'AWS_ACCESS_KEY_ID',
    !secretAccessKey && 'AWS_SECRET_ACCESS_KEY',
    !expectedBucketOwner && 'AWS_EXPECTED_ACCOUNT_ID',
    !originalBucketName && 'S3_BUCKET_NAME/NEXT_PUBLIC_S3_BUCKET_NAME',
    !transformedBucketName &&
      'TRANSFORMED_IMAGE_BUCKET_NAME/AWS_TRANSFORMED_IMAGE_BUCKET_NAME/NEXT_PUBLIC_TRANSFORMED_IMAGE_BUCKET_NAME',
    !originalDistributionId && 'CLOUDFRONT_ORIGINALS_DISTRIBUTION_ID',
    !transformedDistributionId && 'CLOUDFRONT_TRANSFORMED_DISTRIBUTION_ID',
  ].filter((name): name is string => Boolean(name));

  if (missing.length > 0) {
    throw new Error(
      `Storage deletion is not configured. Missing: ${missing.join(', ')}.`,
    );
  }

  if (!/^\d{12}$/.test(expectedBucketOwner)) {
    throw new Error(
      'Storage deletion is not configured safely. AWS_EXPECTED_ACCOUNT_ID must be a 12-digit account ID.',
    );
  }

  if (originalBucketName === transformedBucketName) {
    throw new Error(
      'Storage deletion is not configured safely. Original and transformed bucket names must be different.',
    );
  }

  if (originalDistributionId === transformedDistributionId) {
    throw new Error(
      'Storage deletion is not configured safely. Original and transformed CloudFront distribution IDs must be different.',
    );
  }

  return {
    expectedBucketOwner,
    originalBucketName,
    originalDistributionId,
    transformedBucketName,
    transformedDistributionId,
  };
}
