import assert from 'node:assert/strict';
import test from 'node:test';

import { createImageObjectJsonLd, createPageMetadata } from '../../src/lib/seo';
import {
  getPhotoContentLocation,
  getPhotoSeoPresentation,
} from '../../src/modules/photos/presentation';
import type { PhotoDetail } from '../../src/modules/photos/types';

function createPhoto(
  overrides: Partial<PhotoDetail> = {},
  tags: Array<{ field: string; label: string }> = [],
) {
  return {
    archivedAt: null,
    capturedAt: new Date('2026-06-14T12:34:56.000Z'),
    createdAt: new Date('2026-06-15T12:34:56.000Z'),
    dateTimeOriginal: null,
    exposureTime: null,
    fNumber: null,
    height: 1200,
    id: 'photo-1',
    iso: null,
    lensModel: null,
    make: 'Leica',
    mediaAsset: {
      blurDataURL: 'data:image/webp;base64,AA==',
      height: 1200,
      originalKey: 'media/photos/photo-1/original.jpg',
      width: 1800,
    },
    model: 'Q3',
    orientation: null,
    slug: 'night-shift',
    tags: tags.map(({ field, label }, index) => ({
      createdAt: new Date('2026-06-15T12:34:56.000Z'),
      photoId: 'photo-1',
      tag: {
        createdAt: new Date('2026-06-15T12:34:56.000Z'),
        field,
        id: `tag-${index}`,
        label,
        slug: label.toLowerCase().replaceAll(' ', '-'),
        updatedAt: new Date('2026-06-15T12:34:56.000Z'),
        value: label,
      },
      tagId: `tag-${index}`,
    })),
    title: 'Night Shift',
    updatedAt: new Date('2026-06-16T12:34:56.000Z'),
    width: 1800,
    ...overrides,
  } as PhotoDetail;
}

test('photo presentation orders and de-duplicates human location tags', () => {
  const photo = createPhoto({}, [
    { field: 'country', label: 'United Kingdom' },
    { field: 'area', label: 'England' },
    { field: 'location', label: 'London' },
    { field: 'place', label: ' london ' },
    { field: 'city', label: 'Oxford' },
    { field: 'genre', label: 'Night' },
  ]);

  assert.equal(
    getPhotoContentLocation(photo),
    'London, Oxford, England, United Kingdom',
  );
  assert.deepEqual(getPhotoSeoPresentation(photo), {
    description:
      'Night Shift in London, Oxford, England, United Kingdom, photographed by Junhao Zhang (Jay).',
    location: 'London, Oxford, England, United Kingdom',
    name: 'Night Shift in London, Oxford, England, United Kingdom',
  });
});

test('placeholder titles fall back to location, then camera description', () => {
  const locationOnly = createPhoto({ title: '  Untitled  ' }, [
    { field: 'location', label: 'London' },
  ]);
  const cameraOnly = createPhoto({ title: 'untitled' });

  assert.equal(getPhotoSeoPresentation(locationOnly).name, 'London');
  assert.equal(
    getPhotoSeoPresentation(cameraOnly).name,
    'Photograph taken with Leica Q3',
  );
  assert.doesNotMatch(
    getPhotoSeoPresentation(locationOnly).description,
    /untitled/i,
  );
});

test('ImageObject publishes high-resolution, copyright, place and EXIF data', () => {
  const photo = createPhoto({}, [{ field: 'location', label: 'London' }]);
  const contentUrl =
    'https://resizer.dejayvu.com/media/photo.jpg?format=webp&quality=75&width=2048';
  const thumbnailUrl =
    'https://resizer.dejayvu.com/media/photo.jpg?format=webp&quality=75&width=480';
  const url = 'https://dejayvu.com/darkroom/night-shift';
  const schema = createImageObjectJsonLd({
    contentUrl,
    photo,
    thumbnailUrl,
    url,
  });

  assert.equal(schema.name, 'Night Shift in London');
  assert.equal(schema.description, getPhotoSeoPresentation(photo).description);
  assert.equal(schema.contentUrl, contentUrl);
  assert.equal(schema.thumbnailUrl, thumbnailUrl);
  assert.equal(schema.url, url);
  assert.equal(schema.mainEntityOfPage, url);
  assert.equal(schema.dateCreated, '2026-06-14T12:34:56.000Z');
  assert.equal(schema.creditText, 'Junhao Zhang');
  assert.equal(schema.copyrightNotice, '© Junhao Zhang. All rights reserved.');
  assert.deepEqual(schema.contentLocation, {
    '@type': 'Place',
    name: 'London',
  });
  assert.equal('license' in schema, false);
  assert.equal('acquireLicensePage' in schema, false);
});

test('ImageObject omits invalid or absent EXIF capture dates', () => {
  const schema = createImageObjectJsonLd({
    contentUrl: 'https://example.com/full.webp',
    photo: createPhoto({
      capturedAt: null,
      dateTimeOriginal: new Date(Number.NaN),
    }),
    thumbnailUrl: 'https://example.com/thumb.webp',
    url: 'https://dejayvu.com/darkroom/night-shift',
  });

  assert.equal('dateCreated' in schema, false);
});

test('indexable metadata allows large previews while noindex remains closed', () => {
  const publicMetadata = createPageMetadata({
    path: '/darkroom/night-shift',
    title: 'Night Shift',
  });
  const privateMetadata = createPageMetadata({
    noIndex: true,
    path: '/admin',
    title: 'Admin',
  });

  assert.deepEqual(publicMetadata.robots, {
    follow: true,
    googleBot: {
      follow: true,
      index: true,
      'max-image-preview': 'large',
    },
    index: true,
  });
  assert.deepEqual(privateMetadata.robots, {
    follow: false,
    googleBot: {
      follow: false,
      index: false,
    },
    index: false,
  });
});
