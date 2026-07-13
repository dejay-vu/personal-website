import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import {
  buildNoteCoverOriginalKey,
  buildPhotoOriginalKey,
} from '../../src/modules/media/storageKeys';

export type BackupAsset = {
  id: string;
  originalKey: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  width: number | null;
  height: number | null;
  blurDataURL: string;
};

export type BackupNote = {
  row: Record<string, unknown>;
  categorySlugs: string[];
  markdownRelativePath: string;
  markdownSha256: string;
  coverMediaId: string;
};

export type BackupPhoto = {
  row: Record<string, unknown>;
  tagIds: string[];
  mediaAssetId: string;
};

export type BackupCategory = {
  [column: string]: unknown;
  slug: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type BackupPhotoTag = {
  [column: string]: unknown;
  id: string;
  field: string;
  value: string;
  label: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
};

export type DomainBackupManifest = {
  version: 1;
  generatedAt: string;
  notes: BackupNote[];
  photos: BackupPhoto[];
  assets: BackupAsset[];
  categories: BackupCategory[];
  photoTags: BackupPhotoTag[];
};

export const DOMAIN_RESET_LEGACY_PREFIXES = [
  'content/thoughts/',
  'media/thoughts/',
  'media/gallery/',
  'admin-staging/',
] as const;

export type DomainCleanupContract = {
  originalBucket: string;
  prefixes: [...typeof DOMAIN_RESET_LEGACY_PREFIXES];
  transformedBucket: string;
};

export const domainCleanupContractSchema: z.ZodType<DomainCleanupContract> = z
  .object({
    originalBucket: z.string().min(1),
    prefixes: z
      .array(z.enum(DOMAIN_RESET_LEGACY_PREFIXES))
      .length(DOMAIN_RESET_LEGACY_PREFIXES.length),
    transformedBucket: z.string().min(1),
  })
  .transform((contract, context) => {
    if (
      JSON.stringify(contract.prefixes) !==
      JSON.stringify(DOMAIN_RESET_LEGACY_PREFIXES)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Cleanup prefixes do not match this repository version.',
      });

      return z.NEVER;
    }

    return {
      ...contract,
      prefixes: [...DOMAIN_RESET_LEGACY_PREFIXES],
    };
  });

export function createDomainCleanupContract({
  originalBucket,
  transformedBucket,
}: {
  originalBucket: string;
  transformedBucket: string;
}): DomainCleanupContract {
  return domainCleanupContractSchema.parse({
    originalBucket,
    prefixes: [...DOMAIN_RESET_LEGACY_PREFIXES],
    transformedBucket,
  });
}

export function assertDomainCleanupContractMatches(
  artifactContract: unknown,
  currentContract: DomainCleanupContract,
) {
  const parsed = domainCleanupContractSchema.parse(artifactContract);

  if (JSON.stringify(parsed) !== JSON.stringify(currentContract)) {
    throw new Error(
      'Verification artifact cleanup target does not match the current buckets and prefixes.',
    );
  }
}

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const backupTimestampSchema = z
  .union([z.iso.datetime(), z.date()])
  .transform((value) => (value instanceof Date ? value.toISOString() : value));

const backupAssetSchema: z.ZodType<BackupAsset> = z.object({
  id: z.string(),
  originalKey: z.string(),
  relativePath: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  sha256: sha256Schema,
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  blurDataURL: z.string(),
});

const backupNoteSchema: z.ZodType<BackupNote> = z.object({
  row: z.record(z.string(), z.unknown()),
  categorySlugs: z.array(z.string()),
  markdownRelativePath: z.string(),
  markdownSha256: sha256Schema,
  coverMediaId: z.string(),
});

const backupPhotoSchema: z.ZodType<BackupPhoto> = z.object({
  row: z.record(z.string(), z.unknown()),
  tagIds: z.array(z.string()),
  mediaAssetId: z.string(),
});

const backupCategorySchema: z.ZodType<BackupCategory> = z
  .object({
    slug: z.string(),
    name: z.string(),
    createdAt: backupTimestampSchema,
    updatedAt: backupTimestampSchema,
  })
  .catchall(z.unknown());

const backupPhotoTagSchema: z.ZodType<BackupPhotoTag> = z
  .object({
    id: z.string(),
    field: z.string(),
    value: z.string(),
    label: z.string(),
    slug: z.string(),
    createdAt: backupTimestampSchema,
    updatedAt: backupTimestampSchema,
  })
  .catchall(z.unknown());

export const domainBackupManifestSchema: z.ZodType<DomainBackupManifest> =
  z.object({
    version: z.literal(1),
    generatedAt: z.iso.datetime(),
    notes: z.array(backupNoteSchema),
    photos: z.array(backupPhotoSchema),
    assets: z.array(backupAssetSchema),
    categories: z.array(backupCategorySchema),
    photoTags: z.array(backupPhotoTagSchema),
  });

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

const storageSegmentPattern = /^[A-Za-z0-9_-]+$/;

function deterministicId(kind: string, legacyId: string) {
  if (storageSegmentPattern.test(legacyId)) return legacyId;
  return `${kind}_${sha256(Buffer.from(`${kind}:${legacyId}`)).slice(0, 24)}`;
}

function assetExtension(asset: BackupAsset) {
  const extension = path.posix
    .extname(asset.relativePath)
    .slice(1)
    .toLowerCase();
  if (/^[a-z0-9]+$/.test(extension)) return extension;

  const mimeExtensions: Record<string, string> = {
    'image/avif': 'avif',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/svg+xml': 'svg',
    'image/webp': 'webp',
  };
  const fallback = mimeExtensions[asset.mimeType.toLowerCase()];
  if (!fallback)
    throw new Error(`Cannot determine extension for asset ${asset.id}.`);
  return fallback;
}

export type DomainImportPlan = {
  assets: {
    finalKey: string;
    id: string;
    ownerId: string;
    ownerKind: 'note' | 'photo';
    sourceId: string;
    sourceKey: string;
  }[];
  notes: { id: string; sourceId: string }[];
  photos: { id: string; sourceId: string }[];
};

export function planDomainImport(
  manifest: DomainBackupManifest,
): DomainImportPlan {
  const noteIds = new Map(
    manifest.notes.map((note) => {
      const sourceId = z.string().min(1).parse(note.row.id);
      return [sourceId, deterministicId('note', sourceId)] as const;
    }),
  );
  const photoIds = new Map(
    manifest.photos.map((photo) => {
      const sourceId = z.string().min(1).parse(photo.row.id);
      return [sourceId, deterministicId('photo', sourceId)] as const;
    }),
  );
  const assetIds = new Map(
    manifest.assets.map((asset) => [
      asset.id,
      deterministicId('asset', asset.id),
    ]),
  );
  const owners = new Map<string, { id: string; kind: 'note' | 'photo' }>();

  for (const note of manifest.notes) {
    const sourceId = z.string().parse(note.row.id);
    if (owners.has(note.coverMediaId)) {
      throw new Error(`Asset ${note.coverMediaId} has multiple owners.`);
    }
    owners.set(note.coverMediaId, { id: noteIds.get(sourceId)!, kind: 'note' });
  }
  for (const photo of manifest.photos) {
    const sourceId = z.string().parse(photo.row.id);
    if (owners.has(photo.mediaAssetId)) {
      throw new Error(`Asset ${photo.mediaAssetId} has multiple owners.`);
    }
    owners.set(photo.mediaAssetId, {
      id: photoIds.get(sourceId)!,
      kind: 'photo',
    });
  }

  const assets = manifest.assets.map((asset) => {
    const owner = owners.get(asset.id);
    if (!owner) throw new Error(`Asset ${asset.id} has no domain owner.`);
    const id = assetIds.get(asset.id)!;
    const extension = assetExtension(asset);
    const finalKey =
      owner.kind === 'note'
        ? buildNoteCoverOriginalKey({
            extension,
            mediaAssetId: id,
            noteId: owner.id,
          })
        : buildPhotoOriginalKey({
            extension,
            mediaAssetId: id,
            photoId: owner.id,
          });

    return {
      finalKey,
      id,
      ownerId: owner.id,
      ownerKind: owner.kind,
      sourceId: asset.id,
      sourceKey: asset.originalKey,
    };
  });

  return {
    assets,
    notes: [...noteIds].map(([sourceId, id]) => ({ id, sourceId })),
    photos: [...photoIds].map(([sourceId, id]) => ({ id, sourceId })),
  };
}

export function backupFilePath(directory: string, relativePath: string) {
  const root = path.resolve(directory);
  const resolved = path.resolve(directory, relativePath);
  const relative = path.relative(root, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Backup path escapes its directory: ${relativePath}`);
  }
  return resolved;
}

export async function loadVerifiedDomainBackup(directory: string) {
  if (!path.isAbsolute(directory)) {
    throw new Error('Backup directory must be an absolute path.');
  }
  const manifestPath = path.join(directory, 'manifest.json');
  const manifestBytes = await readFile(manifestPath);
  const manifest = domainBackupManifestSchema.parse(
    JSON.parse(manifestBytes.toString('utf8')),
  );

  for (const note of manifest.notes) {
    const markdown = await readFile(
      backupFilePath(directory, note.markdownRelativePath),
    );
    if (sha256(markdown) !== note.markdownSha256) {
      throw new Error(
        `Markdown hash mismatch for note ${String(note.row.id)}.`,
      );
    }
  }
  for (const asset of manifest.assets) {
    const bytes = await readFile(backupFilePath(directory, asset.relativePath));
    if (
      bytes.byteLength !== asset.sizeBytes ||
      sha256(bytes) !== asset.sha256
    ) {
      throw new Error(`Payload mismatch for asset ${asset.id}.`);
    }
  }

  return {
    manifest,
    manifestPath,
    manifestSha256: sha256(manifestBytes),
    plan: planDomainImport(manifest),
  };
}
