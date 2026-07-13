import { DEFAULT_PUBLIC_MEDIA_HOSTS } from './publicConfig';
import { STORAGE_LAYOUT_VERSION } from './storageKeys';

type ExternalMediaContract = {
  imageOptimization?: {
    environment?: {
      originalImageBucketName?: string;
      transformedImageBucketName?: string;
    };
    functionName?: string;
    ownerStack?: string;
  };
  managedByThisRepository?: boolean;
  originals?: {
    bucketName?: string;
    cloudFrontDistributionId?: string;
    owner?: string;
    publicHost?: string;
    versioningState?: string;
  };
  region?: string;
  schemaVersion?: number;
  storageLayoutVersion?: number;
  transformed?: {
    bucketName?: string;
    cacheExpirationDays?: number;
    cloudFrontDistributionId?: string;
    ownerStack?: string;
    publicHost?: string;
    versioningState?: string;
  };
};

const S3_VERSIONING_STATES = new Set(['Enabled', 'NeverEnabled', 'Suspended']);

export function getAwsContractIssues(value: unknown) {
  if (!value || typeof value !== 'object') {
    return ['external media contract must be an object'];
  }

  const contract = value as ExternalMediaContract;
  const issues: string[] = [];
  const originals = contract.originals;
  const transformed = contract.transformed;
  const imageOptimization = contract.imageOptimization;

  if (contract.schemaVersion !== 1) issues.push('schemaVersion must be 1');
  if (contract.storageLayoutVersion !== STORAGE_LAYOUT_VERSION) {
    issues.push('storageLayoutVersion does not match application code');
  }
  if (!contract.region) issues.push('AWS region is missing');
  if (contract.managedByThisRepository !== false) {
    issues.push('media resources must remain explicitly external');
  }
  if (originals?.owner !== 'external-unmanaged') {
    issues.push('original media ownership is incorrect');
  }
  if (transformed?.ownerStack !== 'ImgTransformationStack') {
    issues.push('transformed media owner stack is incorrect');
  }
  if (imageOptimization?.ownerStack !== 'ImgTransformationStack') {
    issues.push('image optimization owner stack is incorrect');
  }
  if (!originals?.bucketName || !transformed?.bucketName) {
    issues.push('media bucket identity is missing');
  } else if (originals.bucketName === transformed.bucketName) {
    issues.push('original and transformed buckets must be different');
  }
  if (
    !originals?.cloudFrontDistributionId ||
    !transformed?.cloudFrontDistributionId
  ) {
    issues.push('CloudFront distribution identity is missing');
  } else if (
    originals.cloudFrontDistributionId === transformed.cloudFrontDistributionId
  ) {
    issues.push('original and transformed distributions must be different');
  }
  if (!originals?.publicHost || !transformed?.publicHost) {
    issues.push('media public host is missing');
  } else if (
    originals.publicHost !== DEFAULT_PUBLIC_MEDIA_HOSTS.originals ||
    transformed.publicHost !== DEFAULT_PUBLIC_MEDIA_HOSTS.transformed
  ) {
    issues.push('media public hosts do not match application defaults');
  }
  if (
    !originals?.versioningState ||
    !S3_VERSIONING_STATES.has(originals.versioningState) ||
    !transformed?.versioningState ||
    !S3_VERSIONING_STATES.has(transformed.versioningState)
  ) {
    issues.push('recorded S3 versioning state is invalid');
  }
  if (
    !Number.isInteger(transformed?.cacheExpirationDays) ||
    (transformed?.cacheExpirationDays ?? 0) <= 0
  ) {
    issues.push('transformed cache expiration is invalid');
  }
  if (!imageOptimization?.functionName) {
    issues.push('image optimization function identity is missing');
  }
  if (
    imageOptimization?.environment?.originalImageBucketName !==
      originals?.bucketName ||
    imageOptimization?.environment?.transformedImageBucketName !==
      transformed?.bucketName
  ) {
    issues.push('image optimization bucket mapping is inconsistent');
  }

  return issues;
}

export function assertAwsContract(contract: unknown) {
  const issues = getAwsContractIssues(contract);
  if (issues.length > 0) {
    throw new Error(`AWS contract is invalid: ${issues.join('; ')}.`);
  }
}
