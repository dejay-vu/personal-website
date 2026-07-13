import { config } from 'dotenv';
import { setDefaultResultOrder } from 'node:dns';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import { z } from 'zod';

import { backupFilePath, loadVerifiedDomainBackup, sha256 } from './manifest';

setDefaultResultOrder('ipv4first');
config({ path: '.env.local', quiet: true });
config({ quiet: true });

const args = process.argv.slice(2);
const backupIndex = args.indexOf('--backup');
const backupDirectory = backupIndex >= 0 ? args[backupIndex + 1] : undefined;
const shouldApply = args.includes('--apply');

if (!backupDirectory || !path.isAbsolute(backupDirectory)) {
  throw new Error('Pass an absolute verified backup directory with --backup.');
}
const absoluteBackupDirectory = backupDirectory;

const noteRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  seoTitle: z.string().nullable().optional(),
  abstract: z.string(),
  publishedAt: z.coerce.date(),
  wordCount: z.number().int(),
  readingTime: z.number().int(),
  published: z.boolean(),
  archivedAt: z.coerce.date().nullable().optional(),
  archivedByGithubId: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const photoRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  mediaAssetId: z.string(),
  archivedAt: z.coerce.date().nullable().optional(),
  archivedByGithubId: z.string().nullable().optional(),
  fileType: z.string().nullable().optional(),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  orientation: z.string().nullable().optional(),
  height: z.number().int().nullable().optional(),
  width: z.number().int().nullable().optional(),
  brightness: z.string().nullable().optional(),
  exposureBias: z.string().nullable().optional(),
  exposureTime: z.string().nullable().optional(),
  exposureMode: z.string().nullable().optional(),
  exposureProgram: z.string().nullable().optional(),
  fNumber: z.string().nullable().optional(),
  focalLength: z.string().nullable().optional(),
  focalLengthIn35mmFilm: z.string().nullable().optional(),
  iso: z.string().nullable().optional(),
  lensMake: z.string().nullable().optional(),
  lensModel: z.string().nullable().optional(),
  dateTime: z.coerce.date().nullable().optional(),
  dateTimeOriginal: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function isMissingObject(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    $metadata?: { httpStatusCode?: number };
    name?: string;
  };
  return (
    candidate.$metadata?.httpStatusCode === 404 ||
    candidate.name === 'NotFound' ||
    candidate.name === 'NoSuchKey'
  );
}

async function assertCanonicalEmptySchema(connectionString: string) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const schema = await client.query<{
      notes: string | null;
      posts: string | null;
    }>(`select to_regclass('public.notes')::text as notes,
               to_regclass('public.posts')::text as posts`);
    if (!schema.rows[0]?.notes || schema.rows[0]?.posts) {
      throw new Error(
        'Target must have canonical notes and no legacy posts table.',
      );
    }
  } finally {
    await client.end();
  }
}

async function main() {
  const verified = await loadVerifiedDomainBackup(absoluteBackupDirectory);
  const counts = {
    assets: verified.manifest.assets.length,
    categories: verified.manifest.categories.length,
    notes: verified.manifest.notes.length,
    photoTags: verified.manifest.photoTags.length,
    photos: verified.manifest.photos.length,
  };
  const destructiveGate = process.env.ALLOW_DESTRUCTIVE_DOMAIN_RESET === '1';

  console.log(
    JSON.stringify({
      apply: shouldApply && destructiveGate,
      backupDirectory: absoluteBackupDirectory,
      counts,
      manifestSha256: verified.manifestSha256,
      plan: verified.plan,
    }),
  );

  if (!shouldApply || !destructiveGate) {
    console.log(
      'Dry run only. Apply requires --apply and ALLOW_DESTRUCTIVE_DOMAIN_RESET=1.',
    );
    return;
  }

  const directDatabaseUrl = requiredEnv('POSTGRES_URL_NON_POOLING');
  await assertCanonicalEmptySchema(directDatabaseUrl);
  process.env.DATABASE_URL = directDatabaseUrl;

  const [{ default: prisma }, s3] = await Promise.all([
    import('../../src/lib/prisma'),
    import('../../src/services/awsS3'),
  ]);
  const targetCounts = await Promise.all([
    prisma.note.count(),
    prisma.photo.count(),
    prisma.category.count(),
    prisma.photoTag.count(),
    prisma.photoTagAssignment.count(),
    prisma.mediaAsset.count(),
  ]);
  if (targetCounts.some((count) => count !== 0)) {
    throw new Error(
      `Target domain tables are not empty: ${targetCounts.join(',')}.`,
    );
  }

  const assetPlanBySource = new Map(
    verified.plan.assets.map((asset) => [asset.sourceId, asset]),
  );
  for (const asset of verified.manifest.assets) {
    const planned = assetPlanBySource.get(asset.id)!;
    const bytes = await readFile(
      backupFilePath(absoluteBackupDirectory, asset.relativePath),
    );
    let exists = false;

    try {
      const existing = await s3.awsS3Head({ Key: planned.finalKey });
      exists = true;
      if (existing.contentLength !== bytes.byteLength) {
        throw new Error(`Existing target size mismatch: ${planned.finalKey}`);
      }
      const existingBytes = await s3.awsS3GetBuffer({ Key: planned.finalKey });
      if (sha256(existingBytes.buffer) !== asset.sha256) {
        throw new Error(`Existing target hash mismatch: ${planned.finalKey}`);
      }
    } catch (error) {
      if (!isMissingObject(error)) throw error;
    }

    if (!exists) {
      await s3.awsS3Put(planned.finalKey, bytes, asset.mimeType, {
        Metadata: { sha256: asset.sha256 },
      });
    }
    const head = await s3.awsS3Head({ Key: planned.finalKey });
    if (head.contentLength !== asset.sizeBytes) {
      throw new Error(`Uploaded target size mismatch: ${planned.finalKey}`);
    }
  }

  const notePlanBySource = new Map(
    verified.plan.notes.map((note) => [note.sourceId, note.id]),
  );
  const photoPlanBySource = new Map(
    verified.plan.photos.map((photo) => [photo.sourceId, photo.id]),
  );

  await prisma.$transaction(
    async (transaction) => {
      await transaction.category.createMany({
        data: verified.manifest.categories.map((category) => ({
          createdAt: new Date(category.createdAt),
          name: category.name,
          slug: category.slug,
          updatedAt: new Date(category.updatedAt),
        })),
      });
      await transaction.photoTag.createMany({
        data: verified.manifest.photoTags.map((tag) => ({
          createdAt: new Date(tag.createdAt),
          field: tag.field,
          id: tag.id,
          label: tag.label,
          slug: tag.slug,
          updatedAt: new Date(tag.updatedAt),
          value: tag.value,
        })),
      });
      await transaction.mediaAsset.createMany({
        data: verified.manifest.assets.map((asset) => {
          const planned = assetPlanBySource.get(asset.id)!;
          return {
            blurDataURL: asset.blurDataURL,
            height: asset.height,
            id: planned.id,
            mimeType: asset.mimeType,
            originalKey: planned.finalKey,
            sha256: asset.sha256,
            sizeBytes: asset.sizeBytes,
            width: asset.width,
          };
        }),
      });

      for (const note of verified.manifest.notes) {
        const row = noteRowSchema.parse(note.row);
        const markdown = await readFile(
          backupFilePath(absoluteBackupDirectory, note.markdownRelativePath),
          'utf8',
        );
        await transaction.note.create({
          data: {
            abstract: row.abstract,
            archivedAt: row.archivedAt ?? null,
            archivedByGithubId: row.archivedByGithubId ?? null,
            categories: {
              connect: note.categorySlugs.map((slug) => ({ slug })),
            },
            content: markdown,
            coverMediaId: assetPlanBySource.get(note.coverMediaId)!.id,
            createdAt: row.createdAt,
            id: notePlanBySource.get(row.id)!,
            published: row.published,
            publishedAt: row.publishedAt,
            readingTime: row.readingTime,
            seoTitle: row.seoTitle ?? null,
            slug: row.slug,
            title: row.title,
            updatedAt: row.updatedAt,
            wordCount: row.wordCount,
          },
        });
      }

      for (const photo of verified.manifest.photos) {
        const row = photoRowSchema.parse(photo.row);
        await transaction.photo.create({
          data: {
            archivedAt: row.archivedAt ?? null,
            archivedByGithubId: row.archivedByGithubId ?? null,
            brightness: row.brightness ?? null,
            capturedAt: row.dateTime ?? null,
            createdAt: row.createdAt,
            dateTimeOriginal: row.dateTimeOriginal ?? null,
            exposureBias: row.exposureBias ?? null,
            exposureMode: row.exposureMode ?? null,
            exposureProgram: row.exposureProgram ?? null,
            exposureTime: row.exposureTime ?? null,
            fNumber: row.fNumber ?? null,
            fileType: row.fileType ?? null,
            focalLength: row.focalLength ?? null,
            focalLengthIn35mmFilm: row.focalLengthIn35mmFilm ?? null,
            height: row.height ?? null,
            id: photoPlanBySource.get(row.id)!,
            iso: row.iso ?? null,
            lensMake: row.lensMake ?? null,
            lensModel: row.lensModel ?? null,
            make: row.make ?? null,
            mediaAssetId: assetPlanBySource.get(photo.mediaAssetId)!.id,
            model: row.model ?? null,
            orientation: row.orientation ?? null,
            slug: row.slug,
            title: row.title,
            updatedAt: row.updatedAt,
            width: row.width ?? null,
          },
        });
        if (photo.tagIds.length > 0) {
          await transaction.photoTagAssignment.createMany({
            data: photo.tagIds.map((tagId) => ({
              photoId: photoPlanBySource.get(row.id)!,
              tagId,
            })),
          });
        }
      }
    },
    { maxWait: 10_000, timeout: 120_000 },
  );

  const result = {
    status: 'imported',
    importedAt: new Date().toISOString(),
    manifestSha256: verified.manifestSha256,
    counts,
    plan: verified.plan,
  };
  const resultPath = path.join(absoluteBackupDirectory, 'import-result.json');
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ domainImport: 'passed', resultPath, counts }));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Domain import failed.',
  );
  process.exitCode = 1;
});
