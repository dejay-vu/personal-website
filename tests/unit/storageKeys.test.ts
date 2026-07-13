import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STORAGE_LAYOUT_VERSION,
  buildNoteCoverOriginalKey,
  buildPhotoOriginalKey,
  buildProjectAssetOriginalKey,
  buildStagingKey,
} from '../../src/modules/media/storageKeys';

test('publishes the persisted storage-layout contract version', () => {
  assert.equal(STORAGE_LAYOUT_VERSION, 1);
});

test('builds immutable ID-based keys', () => {
  assert.equal(
    buildPhotoOriginalKey({
      photoId: 'photo_1',
      mediaAssetId: 'asset_1',
      extension: 'jpg',
    }),
    'media/photos/photo_1/asset_1/original.jpg',
  );
  assert.equal(
    buildNoteCoverOriginalKey({
      noteId: 'note_1',
      mediaAssetId: 'asset_2',
      extension: 'webp',
    }),
    'media/notes/note_1/covers/asset_2/original.webp',
  );
  assert.equal(
    buildProjectAssetOriginalKey({
      projectId: 'project_1',
      mediaAssetId: 'asset_3',
      extension: 'png',
    }),
    'media/projects/project_1/asset_3/original.png',
  );
  assert.equal(buildStagingKey('upload_1'), 'staging/uploads/upload_1/source');
});

test('rejects path-breaking identity and extension input', () => {
  assert.throws(() =>
    buildPhotoOriginalKey({
      photoId: '../slug',
      mediaAssetId: 'asset_1',
      extension: 'jpg',
    }),
  );
  assert.throws(() =>
    buildPhotoOriginalKey({
      photoId: 'photo_1',
      mediaAssetId: 'asset/1',
      extension: 'jpg',
    }),
  );
  assert.throws(() =>
    buildPhotoOriginalKey({
      photoId: 'photo_1',
      mediaAssetId: 'asset_1',
      extension: '../jpg',
    }),
  );
  assert.throws(() =>
    buildNoteCoverOriginalKey({
      noteId: 'note/1',
      mediaAssetId: 'asset_2',
      extension: 'webp',
    }),
  );
  assert.throws(() =>
    buildProjectAssetOriginalKey({
      projectId: 'project_1',
      mediaAssetId: 'asset/3',
      extension: 'png',
    }),
  );
  assert.throws(() => buildStagingKey('upload/name'));
});
