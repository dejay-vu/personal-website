import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from 'dotenv';
import { setDefaultResultOrder } from 'node:dns';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client, type QueryResultRow } from 'pg';

import {
  type BackupAsset,
  type BackupNote,
  type BackupPhoto,
  type DomainBackupManifest,
  domainBackupManifestSchema,
  sha256,
} from './manifest';

const outputArgIndex = process.argv.indexOf('--output');
const outputDirectory = process.argv[outputArgIndex + 1];

if (
  outputArgIndex < 0 ||
  !outputDirectory ||
  !path.isAbsolute(outputDirectory)
) {
  throw new Error('Pass an absolute backup directory with --output.');
}

setDefaultResultOrder('ipv4first');
config({ path: '.env.local', quiet: true });

type LegacyPostRow = QueryResultRow & {
  id: string;
  markdownKey: string;
  coverMediaId: string;
};

type LegacyPhotoRow = QueryResultRow & {
  id: string;
  mediaAssetId: string;
};

type LegacyMediaAssetRow = QueryResultRow & {
  id: string;
  originalKey: string;
  mimeType: string;
  sizeBytes: number | null;
  sha256: string | null;
  width: number | null;
  height: number | null;
  blurDataURL: string;
};

type LegacyCategoryRow = QueryResultRow & {
  slug: string;
};

type LegacyPhotoTagRow = QueryResultRow & {
  id: string;
};

type PostCategoryRow = QueryResultRow & {
  categorySlug: string;
  postId: string;
};

type PhotoTagAssignmentRow = QueryResultRow & {
  photoId: string;
  tagId: string;
};

type LegacySnapshot = {
  posts: LegacyPostRow[];
  photos: LegacyPhotoRow[];
  mediaAssets: LegacyMediaAssetRow[];
  categories: LegacyCategoryRow[];
  photoTags: LegacyPhotoTagRow[];
  postCategories: PostCategoryRow[];
  photoTagAssignments: PhotoTagAssignmentRow[];
};

function requiredEnv(name: string, fallbackName?: string): string {
  const value = (
    process.env[name] ?? (fallbackName ? process.env[fallbackName] : undefined)
  )?.trim();

  if (!value) {
    throw new Error(
      fallbackName ? `Missing ${name} or ${fallbackName}.` : `Missing ${name}.`,
    );
  }

  return value;
}

function databaseConnectionString(): string {
  const connectionString = requiredEnv(
    'POSTGRES_URL_NON_POOLING',
    'DATABASE_URL',
  );
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get('sslmode');

  if (sslMode && ['prefer', 'require', 'verify-ca'].includes(sslMode)) {
    url.searchParams.set('sslmode', 'verify-full');
  }

  return url.toString();
}

async function prepareOutputDirectory(directory: string): Promise<void> {
  try {
    const outputStat = await stat(directory);

    if (!outputStat.isDirectory()) {
      throw new Error(`Backup output is not a directory: ${directory}`);
    }

    if ((await readdir(directory)).length > 0) {
      throw new Error(`Backup output directory is not empty: ${directory}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }

    await mkdir(directory, { recursive: true });
  }
}

async function loadLegacySnapshot(client: Client): Promise<LegacySnapshot> {
  await client.query(
    'begin transaction isolation level repeatable read read only',
  );

  try {
    const posts = await client.query<LegacyPostRow>(
      'select * from posts order by id',
    );
    const photos = await client.query<LegacyPhotoRow>(
      'select * from photos order by id',
    );
    const mediaAssets = await client.query<LegacyMediaAssetRow>(
      'select * from media_assets order by id',
    );
    const categories = await client.query<LegacyCategoryRow>(
      'select * from categories order by slug',
    );
    const photoTags = await client.query<LegacyPhotoTagRow>(
      'select * from photo_tags order by id',
    );
    const postCategories = await client.query<PostCategoryRow>(`
      select "A" as "categorySlug", "B" as "postId"
      from "_CategoryToPost"
      order by "B", "A"
    `);
    const photoTagAssignments = await client.query<PhotoTagAssignmentRow>(`
      select "photoId", "tagId"
      from photo_tag_assignments
      order by "photoId", "tagId"
    `);

    await client.query('commit');

    return {
      posts: posts.rows,
      photos: photos.rows,
      mediaAssets: mediaAssets.rows,
      categories: categories.rows,
      photoTags: photoTags.rows,
      postCategories: postCategories.rows,
      photoTagAssignments: photoTagAssignments.rows,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

function indexRelations(snapshot: LegacySnapshot): {
  categorySlugsByPostId: Map<string, string[]>;
  tagIdsByPhotoId: Map<string, string[]>;
} {
  const postIds = new Set(snapshot.posts.map((post) => post.id));
  const photoIds = new Set(snapshot.photos.map((photo) => photo.id));
  const mediaAssetIds = new Set(
    snapshot.mediaAssets.map((mediaAsset) => mediaAsset.id),
  );
  const categorySlugs = new Set(
    snapshot.categories.map((category) => category.slug),
  );
  const photoTagIds = new Set(snapshot.photoTags.map((tag) => tag.id));
  const categorySlugsByPostId = new Map<string, string[]>();
  const tagIdsByPhotoId = new Map<string, string[]>();

  for (const post of snapshot.posts) {
    if (!mediaAssetIds.has(post.coverMediaId)) {
      throw new Error(
        `Post ${post.id} references a missing cover media asset.`,
      );
    }
    categorySlugsByPostId.set(post.id, []);
  }

  for (const photo of snapshot.photos) {
    if (!mediaAssetIds.has(photo.mediaAssetId)) {
      throw new Error(`Photo ${photo.id} references a missing media asset.`);
    }
    tagIdsByPhotoId.set(photo.id, []);
  }

  for (const assignment of snapshot.postCategories) {
    if (
      !postIds.has(assignment.postId) ||
      !categorySlugs.has(assignment.categorySlug)
    ) {
      throw new Error('A post category assignment references a missing row.');
    }

    categorySlugsByPostId.get(assignment.postId)!.push(assignment.categorySlug);
  }

  for (const assignment of snapshot.photoTagAssignments) {
    if (
      !photoIds.has(assignment.photoId) ||
      !photoTagIds.has(assignment.tagId)
    ) {
      throw new Error('A photo tag assignment references a missing row.');
    }

    tagIdsByPhotoId.get(assignment.photoId)!.push(assignment.tagId);
  }

  return { categorySlugsByPostId, tagIdsByPhotoId };
}

function safeId(id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`Unsafe legacy row id: ${id}`);
  }

  return id;
}

function assetExtension(asset: LegacyMediaAssetRow): string {
  const keyExtension = path.posix.extname(asset.originalKey).slice(1);

  if (/^[A-Za-z0-9]+$/.test(keyExtension)) {
    return keyExtension.toLowerCase();
  }

  const mimeExtensions: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/avif': 'avif',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/svg+xml': 'svg',
    'image/tiff': 'tiff',
    'image/webp': 'webp',
  };

  return mimeExtensions[asset.mimeType.toLowerCase()] ?? 'bin';
}

async function downloadObject(
  s3: S3Client,
  bucketName: string,
  expectedBucketOwner: string,
  key: string,
): Promise<Buffer> {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: bucketName,
      ExpectedBucketOwner: expectedBucketOwner,
      Key: key,
    }),
  );

  if (!response.Body) {
    throw new Error(`S3 object has no body: ${key}`);
  }

  return Buffer.from(await response.Body.transformToByteArray());
}

async function exportNotes(
  snapshot: LegacySnapshot,
  categorySlugsByPostId: Map<string, string[]>,
  s3: S3Client,
  bucketName: string,
  expectedBucketOwner: string,
): Promise<BackupNote[]> {
  const notes: BackupNote[] = [];

  for (const post of snapshot.posts) {
    const markdown = await downloadObject(
      s3,
      bucketName,
      expectedBucketOwner,
      post.markdownKey,
    );
    const markdownRelativePath = path.posix.join(
      'notes',
      safeId(post.id),
      'content.md',
    );
    const markdownPath = path.join(outputDirectory, markdownRelativePath);

    await mkdir(path.dirname(markdownPath), { recursive: true });
    await writeFile(markdownPath, markdown);

    notes.push({
      row: post,
      categorySlugs: categorySlugsByPostId.get(post.id) ?? [],
      markdownRelativePath,
      markdownSha256: sha256(markdown),
      coverMediaId: post.coverMediaId,
    });
  }

  return notes;
}

async function exportAssets(
  snapshot: LegacySnapshot,
  s3: S3Client,
  bucketName: string,
  expectedBucketOwner: string,
): Promise<BackupAsset[]> {
  const assets: BackupAsset[] = [];

  for (const mediaAsset of snapshot.mediaAssets) {
    const original = await downloadObject(
      s3,
      bucketName,
      expectedBucketOwner,
      mediaAsset.originalKey,
    );
    const actualSha256 = sha256(original);

    if (mediaAsset.sha256 && mediaAsset.sha256.toLowerCase() !== actualSha256) {
      throw new Error(`Stored hash mismatch for media asset ${mediaAsset.id}.`);
    }

    const relativePath = path.posix.join(
      'assets',
      safeId(mediaAsset.id),
      `original.${assetExtension(mediaAsset)}`,
    );
    const assetPath = path.join(outputDirectory, relativePath);

    await mkdir(path.dirname(assetPath), { recursive: true });
    await writeFile(assetPath, original);

    assets.push({
      id: mediaAsset.id,
      originalKey: mediaAsset.originalKey,
      relativePath,
      mimeType: mediaAsset.mimeType,
      sizeBytes: original.byteLength,
      sha256: actualSha256,
      width: mediaAsset.width,
      height: mediaAsset.height,
      blurDataURL: mediaAsset.blurDataURL,
    });
  }

  return assets;
}

function exportPhotos(
  snapshot: LegacySnapshot,
  tagIdsByPhotoId: Map<string, string[]>,
): BackupPhoto[] {
  return snapshot.photos.map((photo) => ({
    row: photo,
    tagIds: tagIdsByPhotoId.get(photo.id) ?? [],
    mediaAssetId: photo.mediaAssetId,
  }));
}

function backupFilePath(directory: string, relativePath: string): string {
  const resolvedDirectory = path.resolve(directory);
  const resolvedFile = path.resolve(directory, relativePath);
  const relativeFile = path.relative(resolvedDirectory, resolvedFile);

  if (relativeFile.startsWith('..') || path.isAbsolute(relativeFile)) {
    throw new Error(
      `Manifest path escapes the backup directory: ${relativePath}`,
    );
  }

  return resolvedFile;
}

async function verifyWrittenBackup(
  manifestPath: string,
  expectedCounts: {
    notes: number;
    photos: number;
    assets: number;
    categories: number;
    photoTags: number;
  },
): Promise<DomainBackupManifest> {
  const parsedManifest = domainBackupManifestSchema.parse(
    JSON.parse(await readFile(manifestPath, 'utf8')),
  );

  if (
    parsedManifest.notes.length !== expectedCounts.notes ||
    parsedManifest.photos.length !== expectedCounts.photos ||
    parsedManifest.assets.length !== expectedCounts.assets ||
    parsedManifest.categories.length !== expectedCounts.categories ||
    parsedManifest.photoTags.length !== expectedCounts.photoTags
  ) {
    throw new Error(
      'Parsed backup manifest counts do not match source counts.',
    );
  }

  for (const note of parsedManifest.notes) {
    const markdown = await readFile(
      backupFilePath(outputDirectory, note.markdownRelativePath),
    );

    if (sha256(markdown) !== note.markdownSha256) {
      throw new Error('Written Markdown hash does not match the manifest.');
    }
  }

  for (const asset of parsedManifest.assets) {
    const original = await readFile(
      backupFilePath(outputDirectory, asset.relativePath),
    );

    if (
      original.byteLength !== asset.sizeBytes ||
      sha256(original) !== asset.sha256
    ) {
      throw new Error(`Written media does not match asset ${asset.id}.`);
    }
  }

  return parsedManifest;
}

async function main(): Promise<void> {
  await prepareOutputDirectory(outputDirectory);

  const database = new Client({ connectionString: databaseConnectionString() });
  await database.connect();

  let snapshot: LegacySnapshot;
  try {
    snapshot = await loadLegacySnapshot(database);
  } finally {
    await database.end();
  }

  const sourceCounts = {
    notes: snapshot.posts.length,
    photos: snapshot.photos.length,
    assets: snapshot.mediaAssets.length,
    categories: snapshot.categories.length,
    tags: snapshot.photoTags.length,
    noteCategoryAssignments: snapshot.postCategories.length,
    photoTagAssignments: snapshot.photoTagAssignments.length,
  };

  console.log(JSON.stringify({ sourceCounts }));

  const { categorySlugsByPostId, tagIdsByPhotoId } = indexRelations(snapshot);
  const bucketName = requiredEnv(
    'S3_BUCKET_NAME',
    'NEXT_PUBLIC_S3_BUCKET_NAME',
  );
  const region = requiredEnv('AWS_REGION', 'NEXT_PUBLIC_S3_REGION');
  const expectedBucketOwner = requiredEnv('AWS_EXPECTED_ACCOUNT_ID');
  const sessionToken = process.env.AWS_SESSION_TOKEN?.trim();
  const s3 = new S3Client({
    region,
    credentials: {
      accessKeyId: requiredEnv('AWS_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('AWS_SECRET_ACCESS_KEY'),
      ...(sessionToken ? { sessionToken } : {}),
    },
  });

  try {
    const notes = await exportNotes(
      snapshot,
      categorySlugsByPostId,
      s3,
      bucketName,
      expectedBucketOwner,
    );
    const assets = await exportAssets(
      snapshot,
      s3,
      bucketName,
      expectedBucketOwner,
    );
    const photos = exportPhotos(snapshot, tagIdsByPhotoId);
    const manifest = domainBackupManifestSchema.parse({
      version: 1,
      generatedAt: new Date().toISOString(),
      notes,
      photos,
      assets,
      categories: snapshot.categories,
      photoTags: snapshot.photoTags,
    });
    const manifestPath = path.join(outputDirectory, 'manifest.json');

    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const verifiedManifest = await verifyWrittenBackup(manifestPath, {
      notes: snapshot.posts.length,
      photos: snapshot.photos.length,
      assets: snapshot.mediaAssets.length,
      categories: snapshot.categories.length,
      photoTags: snapshot.photoTags.length,
    });

    console.log(
      JSON.stringify({
        backupDirectory: outputDirectory,
        manifestPath,
        exportedCounts: {
          notes: verifiedManifest.notes.length,
          photos: verifiedManifest.photos.length,
          assets: verifiedManifest.assets.length,
          categories: verifiedManifest.categories.length,
          photoTags: verifiedManifest.photoTags.length,
        },
        backupVerified: true,
      }),
    );
  } finally {
    s3.destroy();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Backup export failed.',
  );
  process.exitCode = 1;
});
