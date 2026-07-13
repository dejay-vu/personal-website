const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const EXTENSION_PATTERN = /^[a-z0-9]+$/;

// Increment only when a persisted S3 key shape or namespace changes. Public
// venue labels, routes, and ordinary application releases do not affect it.
export const STORAGE_LAYOUT_VERSION = 1 as const;

const validateId = (value: string, name: string) => {
  if (!ID_PATTERN.test(value)) {
    throw new Error(`Invalid ${name}.`);
  }
};

const validateExtension = (extension: string) => {
  if (!EXTENSION_PATTERN.test(extension)) {
    throw new Error('Invalid extension.');
  }
};

export const buildPhotoOriginalKey = ({
  photoId,
  mediaAssetId,
  extension,
}: {
  photoId: string;
  mediaAssetId: string;
  extension: string;
}) => {
  validateId(photoId, 'photoId');
  validateId(mediaAssetId, 'mediaAssetId');
  validateExtension(extension);

  return `media/photos/${photoId}/${mediaAssetId}/original.${extension}`;
};

export const buildNoteCoverOriginalKey = ({
  noteId,
  mediaAssetId,
  extension,
}: {
  noteId: string;
  mediaAssetId: string;
  extension: string;
}) => {
  validateId(noteId, 'noteId');
  validateId(mediaAssetId, 'mediaAssetId');
  validateExtension(extension);

  return `media/notes/${noteId}/covers/${mediaAssetId}/original.${extension}`;
};

export const buildProjectAssetOriginalKey = ({
  projectId,
  mediaAssetId,
  extension,
}: {
  projectId: string;
  mediaAssetId: string;
  extension: string;
}) => {
  validateId(projectId, 'projectId');
  validateId(mediaAssetId, 'mediaAssetId');
  validateExtension(extension);

  return `media/projects/${projectId}/${mediaAssetId}/original.${extension}`;
};

export const buildStagingKey = (uploadId: string) => {
  validateId(uploadId, 'uploadId');

  return `staging/uploads/${uploadId}/source`;
};
