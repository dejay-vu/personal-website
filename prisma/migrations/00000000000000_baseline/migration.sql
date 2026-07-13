-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AdminUploadKind" AS ENUM ('PHOTO', 'NOTE_COVER');

-- CreateEnum
CREATE TYPE "AdminUploadStatus" AS ENUM ('STAGED', 'FINALIZED', 'ABORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "AdminAuditAction" AS ENUM ('UPLOAD', 'UPDATE', 'ARCHIVE', 'RESTORE', 'PURGE', 'PUBLISH', 'UNPUBLISH', 'SET_COVER');

-- CreateEnum
CREATE TYPE "StorageDeletionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "categories" (
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "originalKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "blurDataURL" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "sha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "coverMediaId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "seoTitle" TEXT,
    "abstract" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "readingTime" INTEGER NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "archivedByGithubId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'untitled',
    "archivedAt" TIMESTAMP(3),
    "archivedByGithubId" TEXT,
    "fileType" TEXT,
    "make" TEXT,
    "model" TEXT,
    "orientation" TEXT,
    "height" INTEGER,
    "width" INTEGER,
    "brightness" TEXT,
    "exposureBias" TEXT,
    "exposureTime" TEXT,
    "exposureMode" TEXT,
    "exposureProgram" TEXT,
    "fNumber" TEXT,
    "focalLength" TEXT,
    "focalLengthIn35mmFilm" TEXT,
    "iso" TEXT,
    "lensMake" TEXT,
    "lensModel" TEXT,
    "dateTime" TIMESTAMP(3),
    "dateTimeOriginal" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_tags" (
    "id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photo_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_tag_assignments" (
    "photoId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_tag_assignments_pkey" PRIMARY KEY ("photoId","tagId")
);

-- CreateTable
CREATE TABLE "admin_upload_intents" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "kind" "AdminUploadKind" NOT NULL,
    "status" "AdminUploadStatus" NOT NULL DEFAULT 'STAGED',
    "githubId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "stagingKey" TEXT NOT NULL,
    "finalKey" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "error" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_upload_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "action" "AdminAuditAction" NOT NULL,
    "githubId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_deletion_jobs" (
    "id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "StorageDeletionStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_deletion_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CategoryToNote" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CategoryToNote_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_originalKey_key" ON "media_assets"("originalKey");

-- CreateIndex
CREATE INDEX "media_assets_sha256_idx" ON "media_assets"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "notes_slug_key" ON "notes"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "notes_coverMediaId_key" ON "notes"("coverMediaId");

-- CreateIndex
CREATE INDEX "notes_published_archivedAt_publishedAt_id_idx" ON "notes"("published", "archivedAt", "publishedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "photos_slug_key" ON "photos"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "photos_mediaAssetId_key" ON "photos"("mediaAssetId");

-- CreateIndex
CREATE INDEX "photos_archivedAt_createdAt_id_idx" ON "photos"("archivedAt", "createdAt", "id");

-- CreateIndex
CREATE INDEX "photos_dateTime_idx" ON "photos"("dateTime");

-- CreateIndex
CREATE INDEX "photo_tags_slug_idx" ON "photo_tags"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "photo_tags_field_slug_key" ON "photo_tags"("field", "slug");

-- CreateIndex
CREATE INDEX "photo_tag_assignments_tagId_idx" ON "photo_tag_assignments"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "admin_upload_intents_uploadId_key" ON "admin_upload_intents"("uploadId");

-- CreateIndex
CREATE UNIQUE INDEX "admin_upload_intents_stagingKey_key" ON "admin_upload_intents"("stagingKey");

-- CreateIndex
CREATE INDEX "admin_upload_intents_githubId_createdAt_idx" ON "admin_upload_intents"("githubId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_upload_intents_status_createdAt_idx" ON "admin_upload_intents"("status", "createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_logs_createdAt_idx" ON "admin_audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_logs_targetType_targetId_idx" ON "admin_audit_logs"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "storage_deletion_jobs_status_nextAttemptAt_idx" ON "storage_deletion_jobs"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "_CategoryToNote_B_index" ON "_CategoryToNote"("B");

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_tag_assignments" ADD CONSTRAINT "photo_tag_assignments_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_tag_assignments" ADD CONSTRAINT "photo_tag_assignments_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "photo_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CategoryToNote" ADD CONSTRAINT "_CategoryToNote_A_fkey" FOREIGN KEY ("A") REFERENCES "categories"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CategoryToNote" ADD CONSTRAINT "_CategoryToNote_B_fkey" FOREIGN KEY ("B") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
