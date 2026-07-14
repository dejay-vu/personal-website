import { DEFAULT_PUBLIC_MEDIA_HOSTS } from './publicConfig';
import { STORAGE_LAYOUT_VERSION } from './storageKeys';

type ExternalMediaContract = {
  accountId?: string;
  driftPolicy?: {
    afterViewerRequestPatch?: Array<{
      logicalResourceId?: string;
      propertyPath?: string;
    }>;
    known?: Array<{
      actualValue?: string;
      expectedValue?: string;
      logicalResourceId?: string;
      propertyPath?: string;
    }>;
  };
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
  viewerRequest?: {
    baselineSourceSha256?: string;
    cloudFormationLogicalId?: string;
    distributionId?: string;
    eventType?: string;
    functionName?: string;
    ownerStack?: string;
    robots?: {
      cacheControl?: string;
      contentType?: string;
      getBody?: string;
      methods?: string[];
      path?: string;
      statusCode?: number;
    };
    runtime?: string;
    sourceFile?: string;
    targetSourceSha256?: string;
  };
};

const S3_VERSIONING_STATES = new Set(['Enabled', 'NeverEnabled', 'Suspended']);
const SHA_256 = /^[a-f0-9]{64}$/;

export function getAwsContractIssues(value: unknown) {
  if (!value || typeof value !== 'object') {
    return ['external media contract must be an object'];
  }

  const contract = value as ExternalMediaContract;
  const issues: string[] = [];
  const originals = contract.originals;
  const transformed = contract.transformed;
  const imageOptimization = contract.imageOptimization;
  const viewerRequest = contract.viewerRequest;

  if (contract.schemaVersion !== 2) issues.push('schemaVersion must be 2');
  if (contract.storageLayoutVersion !== STORAGE_LAYOUT_VERSION) {
    issues.push('storageLayoutVersion does not match application code');
  }
  if (!/^\d{12}$/.test(contract.accountId ?? '')) {
    issues.push('AWS account identity is invalid');
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
  if (viewerRequest?.ownerStack !== transformed?.ownerStack) {
    issues.push('viewer-request function owner stack is inconsistent');
  }
  if (viewerRequest?.distributionId !== transformed?.cloudFrontDistributionId) {
    issues.push('viewer-request distribution identity is inconsistent');
  }
  if (
    !viewerRequest?.functionName ||
    !viewerRequest.cloudFormationLogicalId ||
    !viewerRequest.sourceFile
  ) {
    issues.push('viewer-request function identity is missing');
  }
  if (viewerRequest?.runtime !== 'cloudfront-js-1.0') {
    issues.push('viewer-request runtime must remain cloudfront-js-1.0');
  }
  if (viewerRequest?.eventType !== 'viewer-request') {
    issues.push('viewer-request event association is invalid');
  }
  if (
    !SHA_256.test(viewerRequest?.baselineSourceSha256 ?? '') ||
    !SHA_256.test(viewerRequest?.targetSourceSha256 ?? '') ||
    viewerRequest?.baselineSourceSha256 === viewerRequest?.targetSourceSha256
  ) {
    issues.push('viewer-request source hashes are invalid');
  }
  const robots = viewerRequest?.robots;
  if (
    robots?.path !== '/robots.txt' ||
    JSON.stringify(robots?.methods) !== JSON.stringify(['GET', 'HEAD']) ||
    robots?.statusCode !== 200 ||
    robots?.contentType !== 'text/plain; charset=utf-8' ||
    robots?.cacheControl !== 'public, max-age=86400' ||
    robots?.getBody !== 'User-agent: *\nAllow: /\n'
  ) {
    issues.push('viewer-request robots contract is invalid');
  }
  const knownDrift = contract.driftPolicy?.known;
  if (
    knownDrift?.length !== 1 ||
    knownDrift[0]?.logicalResourceId !== 'imageoptimization4C49F079' ||
    knownDrift[0]?.propertyPath !== '/Environment/Variables/maxImageSize' ||
    knownDrift[0]?.expectedValue !== '4700000' ||
    knownDrift[0]?.actualValue !== '50000000'
  ) {
    issues.push('known image optimization drift allowlist is invalid');
  }
  const postPatchDrift = contract.driftPolicy?.afterViewerRequestPatch;
  if (
    postPatchDrift?.length !== 1 ||
    postPatchDrift[0]?.logicalResourceId !==
      viewerRequest?.cloudFormationLogicalId ||
    postPatchDrift[0]?.propertyPath !== '/FunctionCode'
  ) {
    issues.push('viewer-request code drift allowlist is invalid');
  }

  return issues;
}

export function assertAwsContract(contract: unknown) {
  const issues = getAwsContractIssues(contract);
  if (issues.length > 0) {
    throw new Error(`AWS contract is invalid: ${issues.join('; ')}.`);
  }
}
