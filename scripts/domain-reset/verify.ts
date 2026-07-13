import { config } from 'dotenv';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import {
  DOMAIN_RESET_LEGACY_PREFIXES,
  createDomainCleanupContract,
  loadVerifiedDomainBackup,
  sha256,
} from './manifest';

config({ path: '.env.local', quiet: true });
config({ quiet: true });

const args = process.argv.slice(2);
const backupIndex = args.indexOf('--backup');
const backupDirectory = backupIndex >= 0 ? args[backupIndex + 1] : undefined;

if (!backupDirectory || !path.isAbsolute(backupDirectory)) {
  throw new Error('Pass an absolute verified backup directory with --backup.');
}
const absoluteBackupDirectory = backupDirectory;

const importResultSchema = z.object({
  status: z.literal('imported'),
  manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  counts: z.object({
    assets: z.number().int(),
    categories: z.number().int(),
    notes: z.number().int(),
    photoTags: z.number().int(),
    photos: z.number().int(),
  }),
});

function requiredEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }

  throw new Error(`Missing ${names.join(' or ')}.`);
}

async function main() {
  const verified = await loadVerifiedDomainBackup(absoluteBackupDirectory);
  const importResultPath = path.join(
    absoluteBackupDirectory,
    'import-result.json',
  );
  const importResult = importResultSchema.parse(
    JSON.parse(await readFile(importResultPath, 'utf8')),
  );
  if (importResult.manifestSha256 !== verified.manifestSha256) {
    throw new Error('Import result belongs to a different backup manifest.');
  }

  const directUrl = process.env.POSTGRES_URL_NON_POOLING;
  if (!directUrl) throw new Error('Missing POSTGRES_URL_NON_POOLING.');
  process.env.DATABASE_URL = directUrl;
  const [{ default: prisma }, s3, media] = await Promise.all([
    import('../../src/lib/prisma'),
    import('../../src/services/awsS3'),
    import('../../src/lib/media'),
  ]);
  const importedCounts = {
    assets: await prisma.mediaAsset.count(),
    categories: await prisma.category.count(),
    notes: await prisma.note.count(),
    photoTags: await prisma.photoTag.count(),
    photos: await prisma.photo.count(),
  };
  const sourceCounts = {
    assets: verified.manifest.assets.length,
    categories: verified.manifest.categories.length,
    notes: verified.manifest.notes.length,
    photoTags: verified.manifest.photoTags.length,
    photos: verified.manifest.photos.length,
  };
  if (JSON.stringify(importedCounts) !== JSON.stringify(sourceCounts)) {
    throw new Error(
      `Imported counts mismatch: ${JSON.stringify({ sourceCounts, importedCounts })}`,
    );
  }

  const notePlanBySource = new Map(
    verified.plan.notes.map((note) => [note.sourceId, note.id]),
  );
  for (const source of verified.manifest.notes) {
    const sourceId = z.string().parse(source.row.id);
    const note = await prisma.note.findUnique({
      where: { id: notePlanBySource.get(sourceId)! },
      include: { categories: true, coverMedia: true },
    });
    if (!note) throw new Error(`Missing imported note ${sourceId}.`);
    if (sha256(Buffer.from(note.content)) !== source.markdownSha256) {
      throw new Error(`Markdown mismatch for imported note ${sourceId}.`);
    }
    const categories = note.categories.map(({ slug }) => slug).sort();
    if (
      JSON.stringify(categories) !==
      JSON.stringify([...source.categorySlugs].sort())
    ) {
      throw new Error(`Category relations mismatch for note ${sourceId}.`);
    }
    if (!note.coverMedia)
      throw new Error(`Missing cover relation for note ${sourceId}.`);
  }

  const photoPlanBySource = new Map(
    verified.plan.photos.map((photo) => [photo.sourceId, photo.id]),
  );
  for (const source of verified.manifest.photos) {
    const sourceId = z.string().parse(source.row.id);
    const photo = await prisma.photo.findUnique({
      where: { id: photoPlanBySource.get(sourceId)! },
      include: { mediaAsset: true, tags: true },
    });
    if (!photo?.mediaAsset)
      throw new Error(`Missing imported photo ${sourceId}.`);
    const tagIds = photo.tags.map(({ tagId }) => tagId).sort();
    if (JSON.stringify(tagIds) !== JSON.stringify([...source.tagIds].sort())) {
      throw new Error(`Tag relations mismatch for photo ${sourceId}.`);
    }
  }

  const assetPlanBySource = new Map(
    verified.plan.assets.map((asset) => [asset.sourceId, asset]),
  );
  for (const source of verified.manifest.assets) {
    const planned = assetPlanBySource.get(source.id)!;
    const asset = await prisma.mediaAsset.findUnique({
      where: { id: planned.id },
    });
    if (!asset || asset.originalKey !== planned.finalKey) {
      throw new Error(`Media relation mismatch for asset ${source.id}.`);
    }
    const head = await s3.awsS3Head({ Key: asset.originalKey });
    if (head.contentLength !== source.sizeBytes) {
      throw new Error(`S3 size mismatch for ${asset.originalKey}.`);
    }
    const bytes = await s3.awsS3GetBuffer({ Key: asset.originalKey });
    if (sha256(bytes.buffer) !== source.sha256) {
      throw new Error(`S3 hash mismatch for ${asset.originalKey}.`);
    }
  }

  const legacyReferences = await prisma.mediaAsset.count({
    where: {
      OR: DOMAIN_RESET_LEGACY_PREFIXES.map((prefix) => ({
        originalKey: { startsWith: prefix },
      })),
    },
  });
  if (legacyReferences !== 0) {
    throw new Error(
      `Found ${legacyReferences} legacy database media references.`,
    );
  }

  const representatives = [
    verified.plan.assets.find(({ ownerKind }) => ownerKind === 'photo'),
    verified.plan.assets.find(({ ownerKind }) => ownerKind === 'note'),
  ].filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
  for (const asset of representatives) {
    const url = media.getMediaImageURL({ key: asset.finalKey, width: 320 });
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
    await response.body?.cancel();
    if (!response.ok) {
      throw new Error(
        `Representative transformed URL failed (${response.status}): ${url}`,
      );
    }
  }

  const artifact = {
    status: 'passed',
    verifiedAt: new Date().toISOString(),
    manifestSha256: verified.manifestSha256,
    cleanupContract: createDomainCleanupContract({
      originalBucket: requiredEnv(
        'S3_BUCKET_NAME',
        'NEXT_PUBLIC_S3_BUCKET_NAME',
      ),
      transformedBucket: requiredEnv(
        'TRANSFORMED_IMAGE_BUCKET_NAME',
        'AWS_TRANSFORMED_IMAGE_BUCKET_NAME',
        'NEXT_PUBLIC_TRANSFORMED_IMAGE_BUCKET_NAME',
      ),
    }),
    sourceCounts,
    importedCounts,
    representativeTransforms: representatives.length,
  };
  const verificationPath = path.join(
    absoluteBackupDirectory,
    'import-verification.json',
  );
  await writeFile(verificationPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    JSON.stringify({
      domainVerification: 'passed',
      verificationPath,
      sourceCounts,
      importedCounts,
    }),
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Domain verification failed.',
  );
  process.exitCode = 1;
});
