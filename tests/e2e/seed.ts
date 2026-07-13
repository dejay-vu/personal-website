import '../../scripts/assert-test-database';
import prisma from '../../src/lib/prisma';

const BLUR_DATA_URL =
  'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IC4AAADwAQCdASoBAAEAAQAcJaQAA3AA/vuUAAA=';

const pad = (value: number) => String(value).padStart(2, '0');

async function seedNotes() {
  await prisma.category.createMany({
    data: [
      { name: 'GPU', slug: 'gpu' },
      { name: 'Systems', slug: 'systems' },
      { name: 'Writing', slug: 'writing' },
    ],
  });

  for (let index = 0; index < 14; index += 1) {
    const ordinal = index + 1;
    const id = `e2e-note-${pad(ordinal)}`;
    const mediaId = `e2e-note-media-${pad(ordinal)}`;
    const title = `E2E Note ${pad(ordinal)}`;

    await prisma.note.create({
      data: {
        abstract: `Deterministic abstract for ${title}.`,
        categories: {
          connect: [
            { slug: index % 2 === 0 ? 'gpu' : 'systems' },
            ...(index % 3 === 0 ? [{ slug: 'writing' }] : []),
          ],
        },
        content: `# ${title}\n\nDeterministic browser-test article content.`,
        coverMedia: {
          create: {
            blurDataURL: BLUR_DATA_URL,
            height: 630,
            id: mediaId,
            mimeType: 'image/jpeg',
            originalKey: `e2e-media/notes/${id}/cover.jpg`,
            sizeBytes: 1,
            width: 1200,
          },
        },
        id,
        published: true,
        publishedAt: new Date(Date.UTC(2026, 6, 14 - index)),
        readingTime: ordinal,
        slug: `e2e-note-${pad(ordinal)}`,
        title,
        wordCount: 120 + index,
      },
    });
  }
}

const PHOTO_CASES = [
  {
    fNumber: 'f/1.8',
    exposureTime: '1/125',
    height: 900,
    iso: 'ISO 200',
    make: 'Fujifilm',
    model: 'X-T5',
    slug: 'landscape-full-exif',
    title: 'Neon Street',
    width: 1600,
  },
  {
    fNumber: 'f/2.8',
    height: 1600,
    iso: 'ISO 400',
    slug: 'portrait-partial-exif',
    title: 'untitled',
    width: 900,
  },
  {
    height: 1000,
    slug: 'square-title-only',
    title: 'Square Signal',
    width: 1000,
  },
  {
    height: 900,
    slug: 'untitled-no-exif',
    title: 'untitled',
    width: 1400,
  },
  {
    height: 900,
    make: 'Leica',
    model: 'Q3',
    slug: 'untitled-camera-only',
    title: 'untitled',
    width: 1400,
  },
] as const;

async function seedPhotos() {
  const london = await prisma.photoTag.create({
    data: {
      field: 'location',
      label: 'London',
      slug: 'london',
      value: 'London',
    },
  });
  const night = await prisma.photoTag.create({
    data: {
      field: 'genre',
      label: 'Night',
      slug: 'night',
      value: 'Night',
    },
  });

  for (let index = 0; index < 40; index += 1) {
    const ordinal = index + 1;
    const special = PHOTO_CASES[index];
    const id = `e2e-photo-${pad(ordinal)}`;
    const mediaId = `e2e-photo-media-${pad(ordinal)}`;
    const width = special?.width ?? (index % 3 === 0 ? 900 : 1600);
    const height = special?.height ?? (index % 3 === 0 ? 1400 : 900);

    await prisma.photo.create({
      data: {
        capturedAt: new Date(Date.UTC(2026, 5, 1 + (index % 28))),
        createdAt: new Date(Date.UTC(2026, 6, 20 - index)),
        exposureTime:
          special && 'exposureTime' in special ? special.exposureTime : null,
        fNumber: special && 'fNumber' in special ? special.fNumber : null,
        height,
        id,
        iso: special && 'iso' in special ? special.iso : null,
        make: special && 'make' in special ? special.make : null,
        mediaAsset: {
          create: {
            blurDataURL: BLUR_DATA_URL,
            height,
            id: mediaId,
            mimeType: 'image/jpeg',
            originalKey: `e2e-media/photos/${id}/original.jpg`,
            sizeBytes: 1,
            width,
          },
        },
        model: special && 'model' in special ? special.model : null,
        slug: special?.slug ?? `e2e-photo-${pad(ordinal)}`,
        title: special?.title ?? `E2E Photo ${pad(ordinal)}`,
        width,
      },
    });

    await prisma.photoTagAssignment.create({
      data: {
        photoId: id,
        tagId: index % 2 === 0 ? london.id : night.id,
      },
    });
  }
}

async function main() {
  await seedNotes();
  await seedPhotos();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
