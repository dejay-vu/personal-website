import type { PhotosPage } from '@/modules/photos/types';
import { expect, test } from '@playwright/test';

import { getPhotoExifSummary } from '../../src/components/photos/photoAlt';
import { getPhotoDisplayDimensions } from '../../src/components/photos/photoDimensions';
import { installMediaRoute } from './support/browser';

test.beforeEach(async ({ page }) => {
  await installMediaRoute(page);
});

test('Darkroom interceptor renders an image-only fitted modal', async ({
  page,
}) => {
  await page.goto('/darkroom');
  const card = page
    .locator('a[href^="/darkroom/"]')
    .filter({ has: page.locator('img') })
    .first();
  await card.click();

  const dialog = page.getByRole('dialog', { name: 'Photo preview' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-photo-modal-frame]')).toHaveCount(1);
  await expect(dialog.locator('p:visible, h1:visible')).toHaveCount(0);
  await page.waitForTimeout(500);

  const bounds = await dialog
    .locator('[data-photo-modal-frame]')
    .evaluate((node) => {
      const frame = node.getBoundingClientRect();
      const image = node.querySelector('img')?.getBoundingClientRect();
      const modal = node.closest('[role="dialog"]')?.getBoundingClientRect();
      return {
        frame: { height: frame.height, width: frame.width },
        image: image && { height: image.height, width: image.width },
        modal: modal && { height: modal.height, width: modal.width },
        viewport: { height: window.innerHeight, width: window.innerWidth },
      };
    });
  expect(bounds.frame.width).toBeLessThanOrEqual(
    bounds.viewport.width * 0.9 + 1,
  );
  expect(bounds.frame.height).toBeLessThanOrEqual(
    bounds.viewport.height * 0.9 + 1,
  );
  expect(bounds.image).toEqual(bounds.frame);
  expect(bounds.modal).toEqual(bounds.frame);

  await page.getByRole('button', { name: 'Close photo' }).click();
  await expect(page).toHaveURL(/\/darkroom$/);
});

test('landscape, portrait, and square modal frames preserve their ratios', async ({
  page,
}) => {
  const response = await page.request.get('/api/photos?limit=36');
  expect(response.ok()).toBe(true);
  const photos = ((await response.json()) as PhotosPage).photos;
  const ratioOf = (photo: (typeof photos)[number]) => {
    const dimensions = getPhotoDisplayDimensions(photo);
    return dimensions.width / dimensions.height;
  };
  const candidates = [
    photos.find((photo) => ratioOf(photo) > 1.2),
    photos.find((photo) => ratioOf(photo) < 0.8),
    photos.find((photo) => Math.abs(ratioOf(photo) - 1) < 0.1),
  ].filter((photo): photo is (typeof photos)[number] => Boolean(photo));
  const hasDeterministicFixture = photos.some((photo) =>
    photo.id.startsWith('e2e-photo-'),
  );
  expect(candidates.length).toBeGreaterThanOrEqual(
    hasDeterministicFixture ? 3 : 2,
  );

  for (const photo of candidates) {
    await page.goto('/darkroom');
    await page.locator(`a[href="/darkroom/${photo.slug}"]`).first().click();
    const dialog = page.getByRole('dialog', { name: 'Photo preview' });
    const frame = dialog.locator('[data-photo-modal-frame]');
    await expect
      .poll(() =>
        frame.evaluate((node) => {
          const bounds = node.getBoundingClientRect();
          return (
            bounds.width <= window.innerWidth * 0.9 + 1 &&
            bounds.height <= window.innerHeight * 0.9 + 1
          );
        }),
      )
      .toBe(true);
    const bounds = await frame.evaluate((node) => {
      const frame = node.getBoundingClientRect();
      return {
        height: frame.height,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        width: frame.width,
      };
    });
    expect(bounds.width).toBeLessThanOrEqual(bounds.viewportWidth * 0.9 + 1);
    expect(bounds.height).toBeLessThanOrEqual(bounds.viewportHeight * 0.9 + 1);
    expect(bounds.width / bounds.height).toBeCloseTo(ratioOf(photo), 2);
    await page.getByRole('button', { name: 'Close photo' }).click();
    await expect(page).toHaveURL(/\/darkroom$/);
  }
});

test('Photo modal dismissal preserves backdrop, Escape, and history behavior', async ({
  page,
}) => {
  const open = async () => {
    await page.goto('/darkroom');
    await page
      .locator('a[href^="/darkroom/"]')
      .filter({ has: page.locator('img') })
      .first()
      .click();
    await expect(
      page.getByRole('dialog', { name: 'Photo preview' }),
    ).toBeVisible();
  };

  await open();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/darkroom$/);

  await open();
  await page.mouse.click(4, 4);
  await expect(page).toHaveURL(/\/darkroom$/);

  await open();
  await page.goBack();
  await expect(page).toHaveURL(/\/darkroom$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Photo cards expose the shared compact EXIF on hover and focus', async ({
  page,
}, testInfo) => {
  const response = await page.request.get('/api/photos?limit=36');
  expect(response.ok()).toBe(true);
  const pageData = (await response.json()) as PhotosPage;
  const photo = pageData.photos.find((candidate) =>
    Boolean(
      candidate.make ||
      candidate.model ||
      candidate.fNumber ||
      candidate.exposureTime ||
      candidate.iso,
    ),
  );
  test.skip(!photo, 'The deterministic E2E seed always supplies EXIF.');

  const exif = getPhotoExifSummary(photo!, { compact: true });
  await page.goto('/darkroom');
  const card = page.locator(`a[href^="/darkroom/${photo!.slug}"]`).first();
  const metadata = card.locator('[data-photo-card-metadata]');
  await expect(metadata).toHaveCount(1);
  expect(
    await metadata.evaluate((node) => getComputedStyle(node).opacity),
  ).toBe('0');
  if (testInfo.project.name === 'desktop-chromium') {
    await card.hover();
    await expect
      .poll(() => metadata.evaluate((node) => getComputedStyle(node).opacity))
      .toBe('1');
    await expect(metadata).toContainText(exif);
  }
  await card.focus();
  await expect
    .poll(() => metadata.evaluate((node) => getComputedStyle(node).opacity))
    .toBe('1');
  await expect(metadata).toContainText(exif);
});

test('Photo cards omit absent metadata lines across all supported combinations', async ({
  page,
}) => {
  const response = await page.request.get('/api/photos?limit=1');
  expect(response.ok()).toBe(true);
  const base = ((await response.json()) as PhotosPage).photos[0];
  if (!base) throw new Error('A published Photo fixture is required.');

  const emptyExif = {
    exposureTime: null,
    fNumber: null,
    iso: null,
    lensModel: null,
    make: null,
    model: null,
  };
  const photos = [
    {
      ...base,
      ...emptyExif,
      exposureTime: '1/125',
      fNumber: 'f/1.8',
      id: 'e2e-card-full',
      iso: 'ISO 200',
      make: 'Fujifilm',
      mediaAsset: {
        ...base.mediaAsset,
        originalKey: 'e2e-media/photos/card-full/original.jpg',
      },
      model: 'X-T5',
      slug: 'e2e-card-full',
      title: 'Neon Street',
    },
    {
      ...base,
      ...emptyExif,
      fNumber: 'f/2.8',
      id: 'e2e-card-partial',
      iso: 'ISO 400',
      mediaAsset: {
        ...base.mediaAsset,
        originalKey: 'e2e-media/photos/card-partial/original.jpg',
      },
      slug: 'e2e-card-partial',
      title: 'untitled',
    },
    {
      ...base,
      ...emptyExif,
      id: 'e2e-card-title',
      mediaAsset: {
        ...base.mediaAsset,
        originalKey: 'e2e-media/photos/card-title/original.jpg',
      },
      slug: 'e2e-card-title',
      title: 'Square Signal',
    },
    {
      ...base,
      ...emptyExif,
      id: 'e2e-card-camera',
      make: 'Leica',
      mediaAsset: {
        ...base.mediaAsset,
        originalKey: 'e2e-media/photos/card-camera/original.jpg',
      },
      model: 'Q3',
      slug: 'e2e-card-camera',
      title: 'untitled',
    },
    {
      ...base,
      ...emptyExif,
      id: 'e2e-card-empty',
      mediaAsset: {
        ...base.mediaAsset,
        originalKey: 'e2e-media/photos/card-empty/original.jpg',
      },
      slug: 'e2e-card-empty',
      title: 'untitled',
    },
  ];

  await page.route('**/api/photos?**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ nextCursor: null, photos }),
      contentType: 'application/json',
    });
  });
  await page.goto('/darkroom?q=e2e-card-contract');

  const metadataFor = (slug: string) =>
    page
      .locator(`a[href^="/darkroom/${slug}"]`)
      .locator('[data-photo-card-metadata]');
  await expect(metadataFor('e2e-card-full').locator('p')).toHaveCount(2);
  await expect(metadataFor('e2e-card-full')).toContainText('Neon Street');
  await expect(metadataFor('e2e-card-full')).toContainText(
    'Fujifilm X-T5 · f/1.8 · 1/125 · ISO 200',
  );
  await expect(metadataFor('e2e-card-partial').locator('p')).toHaveCount(1);
  await expect(metadataFor('e2e-card-partial')).toHaveText('f/2.8 · ISO 400');
  await expect(metadataFor('e2e-card-title').locator('p')).toHaveCount(1);
  await expect(metadataFor('e2e-card-title')).toHaveText('Square Signal');
  await expect(metadataFor('e2e-card-camera').locator('p')).toHaveCount(1);
  await expect(metadataFor('e2e-card-camera')).toHaveText('Leica Q3');
  await expect(metadataFor('e2e-card-empty')).toHaveCount(0);

  await page.goto('/');
  await expect(page.locator('#street [data-photo-card-metadata]')).toHaveCount(
    0,
  );
});

test('canonical Photo detail keeps its full metadata view', async ({
  page,
}) => {
  await page.goto('/darkroom');
  const href = await page
    .locator('a[href^="/darkroom/"]')
    .filter({ has: page.locator('img') })
    .first()
    .getAttribute('href');
  expect(href).toBeTruthy();

  await page.goto(href!);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('article')).toBeVisible();
  await expect(page.locator('article h1')).toHaveCount(1);
});
