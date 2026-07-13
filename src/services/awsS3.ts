import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  type DeleteObjectsCommandInput,
  type DeleteObjectsCommandOutput,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  type ListObjectVersionsCommandInput,
  type ListObjectVersionsCommandOutput,
  ListObjectsV2Command,
  type ListObjectsV2CommandInput,
  type ListObjectsV2CommandOutput,
  type ObjectIdentifier,
  PutObjectCommandInput,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { PresignedPostOptions } from '@aws-sdk/s3-presigned-post';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function firstConfiguredEnvironmentValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  return '';
}

const AWS_S3_BUCKET_NAME = firstConfiguredEnvironmentValue(
  'S3_BUCKET_NAME',
  'NEXT_PUBLIC_S3_BUCKET_NAME',
);
const AWS_S3_REGION = firstConfiguredEnvironmentValue(
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'NEXT_PUBLIC_S3_REGION',
);
const AWS_EXPECTED_BUCKET_OWNER = firstConfiguredEnvironmentValue(
  'AWS_EXPECTED_ACCOUNT_ID',
);

export const awsS3DefaultBucketName = AWS_S3_BUCKET_NAME;

let s3Client: S3Client | null = null;

// Lazy + validated: configuration errors stay explicit while credentials are
// resolved by the SDK's refreshable Node provider chain.
function getS3Client() {
  if (s3Client) return s3Client;

  const missing = [
    !AWS_S3_REGION && 'AWS_REGION',
    !AWS_EXPECTED_BUCKET_OWNER && 'AWS_EXPECTED_ACCOUNT_ID',
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing AWS S3 configuration: ${missing.join(', ')}.`);
  }
  if (!/^\d{12}$/.test(AWS_EXPECTED_BUCKET_OWNER)) {
    throw new Error('AWS_EXPECTED_ACCOUNT_ID must be a 12-digit account ID.');
  }

  s3Client = new S3Client({
    region: AWS_S3_REGION,
  });

  return s3Client;
}

function copySource(bucket: string, key: string) {
  return `${bucket}/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
}

export type AwsS3ListPage = (
  input: ListObjectsV2CommandInput,
) => Promise<ListObjectsV2CommandOutput>;

const listS3Page: AwsS3ListPage = (input) =>
  getS3Client().send(new ListObjectsV2Command(input));

export type AwsS3ListVersionsPage = (
  input: ListObjectVersionsCommandInput,
) => Promise<ListObjectVersionsCommandOutput>;

export type AwsS3DeleteBatch = (
  input: DeleteObjectsCommandInput,
) => Promise<DeleteObjectsCommandOutput>;

export type AwsS3VersionEntry = {
  isDeleteMarker: boolean;
  isLatest: boolean;
  key: string;
  versionId: string;
};

const listS3VersionsPage: AwsS3ListVersionsPage = (input) =>
  getS3Client().send(new ListObjectVersionsCommand(input));

const deleteS3Batch: AwsS3DeleteBatch = (input) =>
  getS3Client().send(new DeleteObjectsCommand(input));

export const awsS3List = async (
  Prefix: string,
  {
    Bucket = AWS_S3_BUCKET_NAME,
    ExpectedBucketOwner = AWS_EXPECTED_BUCKET_OWNER,
    listPage = listS3Page,
  }: {
    Bucket?: string;
    ExpectedBucketOwner?: string;
    listPage?: AwsS3ListPage;
  } = {},
) => {
  const keys: string[] = [];
  const seenContinuationTokens = new Set<string>();
  let ContinuationToken: string | undefined;

  while (true) {
    const response = await listPage({
      Bucket,
      ContinuationToken,
      ...(ExpectedBucketOwner ? { ExpectedBucketOwner } : {}),
      Prefix,
    });

    for (const content of response.Contents ?? []) {
      // A zero-byte S3 object is still a real object and must be included in
      // prefix deletion. Only omit malformed list entries without a key.
      if (content.Key !== undefined) keys.push(content.Key);
    }

    if (!response.IsTruncated) break;

    const nextToken = response.NextContinuationToken;
    if (!nextToken || seenContinuationTokens.has(nextToken)) {
      throw new Error(
        `S3 listing for prefix "${Prefix}" was truncated without a new continuation token.`,
      );
    }

    seenContinuationTokens.add(nextToken);
    ContinuationToken = nextToken;
  }

  return keys;
};

export const awsS3ListVersions = async (
  Prefix: string,
  {
    Bucket = AWS_S3_BUCKET_NAME,
    exactKey,
    ExpectedBucketOwner = AWS_EXPECTED_BUCKET_OWNER,
    listPage = listS3VersionsPage,
  }: {
    Bucket?: string;
    exactKey?: string;
    ExpectedBucketOwner?: string;
    listPage?: AwsS3ListVersionsPage;
  } = {},
) => {
  const entries: AwsS3VersionEntry[] = [];
  const seenMarkers = new Set<string>();
  let KeyMarker: string | undefined;
  let VersionIdMarker: string | undefined;

  while (true) {
    const response = await listPage({
      Bucket,
      ...(ExpectedBucketOwner ? { ExpectedBucketOwner } : {}),
      KeyMarker,
      Prefix,
      VersionIdMarker,
    });

    const append = (
      item: {
        IsLatest?: boolean;
        Key?: string;
        VersionId?: string;
      },
      isDeleteMarker: boolean,
    ) => {
      if (
        item.Key === undefined ||
        item.VersionId === undefined ||
        (exactKey !== undefined && item.Key !== exactKey)
      ) {
        return;
      }
      entries.push({
        isDeleteMarker,
        isLatest: item.IsLatest === true,
        key: item.Key,
        versionId: item.VersionId,
      });
    };

    for (const version of response.Versions ?? []) append(version, false);
    for (const marker of response.DeleteMarkers ?? []) append(marker, true);

    if (!response.IsTruncated) break;

    const nextKeyMarker = response.NextKeyMarker;
    const nextVersionIdMarker = response.NextVersionIdMarker;
    const marker = `${nextKeyMarker ?? ''}\0${nextVersionIdMarker ?? ''}`;
    if (!nextKeyMarker || seenMarkers.has(marker)) {
      throw new Error(
        `S3 version listing for prefix "${Prefix}" was truncated without a new marker.`,
      );
    }

    seenMarkers.add(marker);
    KeyMarker = nextKeyMarker;
    VersionIdMarker = nextVersionIdMarker;
  }

  return entries;
};

export const awsS3Head = async ({
  Bucket = AWS_S3_BUCKET_NAME,
  ExpectedBucketOwner = AWS_EXPECTED_BUCKET_OWNER,
  Key,
}: {
  Bucket?: string;
  ExpectedBucketOwner?: string;
  Key: string;
}) => {
  const response = await getS3Client().send(
    new HeadObjectCommand({
      Bucket,
      ExpectedBucketOwner,
      Key,
    }),
  );

  return {
    contentLength: response.ContentLength ?? 0,
    contentType: response.ContentType ?? 'application/octet-stream',
    metadata: response.Metadata ?? {},
  };
};

export const awsS3GetBuffer = async ({
  Bucket = AWS_S3_BUCKET_NAME,
  ExpectedBucketOwner = AWS_EXPECTED_BUCKET_OWNER,
  Key,
}: {
  Bucket?: string;
  ExpectedBucketOwner?: string;
  Key: string;
}) => {
  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket,
      ExpectedBucketOwner,
      Key,
    }),
  );

  if (!response.Body) {
    throw new Error(`S3 object has no body: ${Key}`);
  }

  const bytes = await response.Body.transformToByteArray();

  return {
    buffer: Buffer.from(bytes),
    contentType: response.ContentType ?? 'application/octet-stream',
    metadata: response.Metadata ?? {},
  };
};

export const awsS3Copy = async ({
  Bucket = AWS_S3_BUCKET_NAME,
  CopySourceBucket = AWS_S3_BUCKET_NAME,
  CopySourceKey,
  ExpectedBucketOwner = AWS_EXPECTED_BUCKET_OWNER,
  ExpectedSourceBucketOwner = AWS_EXPECTED_BUCKET_OWNER,
  Key,
}: {
  Bucket?: string;
  CopySourceBucket?: string;
  CopySourceKey: string;
  ExpectedBucketOwner?: string;
  ExpectedSourceBucketOwner?: string;
  Key: string;
}) =>
  getS3Client().send(
    new CopyObjectCommand({
      Bucket,
      CopySource: copySource(CopySourceBucket, CopySourceKey),
      ExpectedBucketOwner,
      ExpectedSourceBucketOwner,
      Key,
      MetadataDirective: 'COPY',
    }),
  );

export const awsS3Put = async (
  Key: string,
  Body: Buffer | string,
  ContentType?: string,
  options: Omit<
    PutObjectCommandInput,
    'Body' | 'Bucket' | 'ContentType' | 'Key'
  > &
    Partial<Pick<PutObjectCommandInput, 'Bucket'>> = {},
) => {
  try {
    const upload = new Upload({
      client: getS3Client(),
      params: {
        ...options,
        Bucket: options.Bucket ?? AWS_S3_BUCKET_NAME,
        ExpectedBucketOwner:
          options.ExpectedBucketOwner ?? AWS_EXPECTED_BUCKET_OWNER,
        Key,
        Body,
        ContentType,
      },
      queueSize: 10,
    });

    await upload.done();
  } catch (e) {
    console.error(e);
    throw e;
  }
};

export const awsS3CreatePresignedPost = async ({
  Bucket = AWS_S3_BUCKET_NAME,
  Conditions,
  Expires,
  Fields,
  Key,
}: {
  Bucket?: string;
  Conditions?: PresignedPostOptions['Conditions'];
  Expires?: number;
  Fields?: Record<string, string>;
  Key: string;
}) =>
  createPresignedPost(getS3Client(), {
    Bucket,
    Conditions,
    Expires,
    Fields,
    Key,
  });

export const awsS3CreateSignedGetUrl = async ({
  Bucket = AWS_S3_BUCKET_NAME,
  ExpiresIn,
  Key,
  ResponseContentDisposition,
}: {
  Bucket?: string;
  ExpiresIn: number;
  Key: string;
  ResponseContentDisposition?: string;
}) =>
  getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket,
      ExpectedBucketOwner: AWS_EXPECTED_BUCKET_OWNER,
      Key,
      ResponseContentDisposition,
    }),
    { expiresIn: ExpiresIn },
  );

export const awsS3Delete = async ({
  Bucket = AWS_S3_BUCKET_NAME,
  ExpectedBucketOwner = AWS_EXPECTED_BUCKET_OWNER,
  Key,
}: {
  Bucket?: string;
  ExpectedBucketOwner?: string;
  Key: string;
}) =>
  getS3Client().send(
    new DeleteObjectCommand({
      Bucket,
      ExpectedBucketOwner,
      Key,
    }),
  );

async function deleteS3Objects({
  Bucket,
  ExpectedBucketOwner,
  Objects,
  deleteBatch,
}: {
  Bucket: string;
  ExpectedBucketOwner?: string;
  Objects: ObjectIdentifier[];
  deleteBatch: AwsS3DeleteBatch;
}) {
  for (let index = 0; index < Objects.length; index += 1000) {
    const chunk = Objects.slice(index, index + 1000);

    if (chunk.length === 0) continue;

    const response = await deleteBatch({
      Bucket,
      Delete: {
        Objects: chunk,
        Quiet: false,
      },
      ...(ExpectedBucketOwner ? { ExpectedBucketOwner } : {}),
    });

    if (response.Errors && response.Errors.length > 0) {
      const failedKeys = response.Errors.map((error) =>
        [error.Key, error.VersionId].filter(Boolean).join('@'),
      ).filter(Boolean);

      throw new Error(
        `Failed to delete ${response.Errors.length} S3 object(s): ${failedKeys.join(', ')}`,
      );
    }
  }
}

export const awsS3DeleteMany = async ({
  Bucket = AWS_S3_BUCKET_NAME,
  ExpectedBucketOwner = AWS_EXPECTED_BUCKET_OWNER,
  Keys,
  deleteBatch = deleteS3Batch,
}: {
  Bucket?: string;
  ExpectedBucketOwner?: string;
  Keys: string[];
  deleteBatch?: AwsS3DeleteBatch;
}) =>
  deleteS3Objects({
    Bucket,
    ExpectedBucketOwner,
    Objects: Keys.map((Key) => ({ Key })),
    deleteBatch,
  });

export const awsS3DeleteVersionEntries = async ({
  Bucket = AWS_S3_BUCKET_NAME,
  Entries,
  ExpectedBucketOwner = AWS_EXPECTED_BUCKET_OWNER,
  deleteBatch = deleteS3Batch,
}: {
  Bucket?: string;
  Entries: AwsS3VersionEntry[];
  ExpectedBucketOwner?: string;
  deleteBatch?: AwsS3DeleteBatch;
}) =>
  deleteS3Objects({
    Bucket,
    ExpectedBucketOwner,
    Objects: Entries.map(({ key: Key, versionId: VersionId }) => ({
      Key,
      VersionId,
    })),
    deleteBatch,
  });

export const awsS3DeleteAllVersions = async ({
  Bucket = AWS_S3_BUCKET_NAME,
  ExpectedBucketOwner = AWS_EXPECTED_BUCKET_OWNER,
  Keys,
  deleteBatch = deleteS3Batch,
  listPage = listS3VersionsPage,
}: {
  Bucket?: string;
  ExpectedBucketOwner?: string;
  Keys: string[];
  deleteBatch?: AwsS3DeleteBatch;
  listPage?: AwsS3ListVersionsPage;
}) => {
  const uniqueKeys = [...new Set(Keys)];
  let deletedCount = 0;

  // Exact-key media paths are immutable, but verify convergence so a racing
  // write/delete marker cannot make a durable deletion job report success.
  for (let pass = 0; pass <= 5; pass += 1) {
    const versions: AwsS3VersionEntry[] = [];
    for (const key of uniqueKeys) {
      versions.push(
        ...(await awsS3ListVersions(key, {
          Bucket,
          exactKey: key,
          ExpectedBucketOwner,
          listPage,
        })),
      );
    }

    if (versions.length === 0) return deletedCount;
    if (pass === 5) {
      throw new Error(
        'S3 all-version deletion did not converge after 5 delete passes.',
      );
    }

    await awsS3DeleteVersionEntries({
      Bucket,
      Entries: versions,
      ExpectedBucketOwner,
      deleteBatch,
    });
    deletedCount += versions.length;
  }

  return deletedCount;
};
