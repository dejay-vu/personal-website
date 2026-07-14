import type { PhotosPage } from '@/modules/photos/types';
import { expect, test } from '@playwright/test';

import { getPhotoExifSummary } from '../../src/components/photos/photoAlt';
import { getPhotoDisplayDimensions } from '../../src/components/photos/photoDimensions';
import { installMediaRoute } from './support/browser';

test.beforeEach(async ({ page }) => {
  await installMediaRoute(page);
});

test('wide Darkroom rows align without stretching a sparse final row', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-chromium',
    'Wide-screen photo-grid geometry is covered by the desktop browser.',
  );
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto('/darkroom');

  const layout = await page.locator('.neon-justified').evaluate((grid) => {
    const gridBounds = grid.getBoundingClientRect();
    const rowHeightProbe = document.createElement('span');
    rowHeightProbe.style.cssText =
      'position:absolute;visibility:hidden;width:var(--jg-base);height:0';
    grid.append(rowHeightProbe);
    const targetRowHeight = rowHeightProbe.getBoundingClientRect().width;
    rowHeightProbe.remove();
    const rows: Array<{
      height: number;
      left: number;
      right: number;
      top: number;
    }> = [];

    for (const tile of grid.querySelectorAll<HTMLElement>(':scope > article')) {
      const bounds = tile.getBoundingClientRect();
      let row = rows.find(
        (candidate) => Math.abs(candidate.top - bounds.top) < 1,
      );
      if (!row) {
        row = {
          height: bounds.height,
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
        };
        rows.push(row);
      } else {
        row.height = Math.max(row.height, bounds.height);
        row.left = Math.min(row.left, bounds.left);
        row.right = Math.max(row.right, bounds.right);
      }
    }

    return {
      grid: { left: gridBounds.left, right: gridBounds.right },
      targetRowHeight,
      rows,
    };
  });

  expect(layout.rows.length).toBeGreaterThan(1);
  for (const row of layout.rows.slice(0, -1)) {
    expect(row.left).toBeCloseTo(layout.grid.left, 0);
    expect(row.right).toBeCloseTo(layout.grid.right, 0);
  }
  const finalRow = layout.rows.at(-1);
  expect(finalRow).toBeDefined();
  expect(finalRow!.left).toBeCloseTo(layout.grid.left, 0);
  expect(finalRow!.right).toBeLessThanOrEqual(layout.grid.right + 1);
  expect(finalRow!.height).toBeLessThanOrEqual(layout.targetRowHeight * 1.05);
  await expect(page.locator('[data-breaker], [data-featured]')).toHaveCount(0);
});

test('a photo click opens one animated HeroUI modal before its RSC completes', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const response = await page.request.get('/api/photos?limit=1');
  expect(response.ok()).toBe(true);
  const photo = ((await response.json()) as PhotosPage).photos[0];
  if (!photo) throw new Error('A published Photo fixture is required.');
  const targetPath = `/darkroom/${photo.slug}`;
  let releaseRequest: () => void = () => undefined;
  const requestGate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  let resolveRequestStarted: () => void = () => undefined;
  const requestStarted = new Promise<void>((resolve) => {
    resolveRequestStarted = resolve;
  });
  const handler = async (route: import('@playwright/test').Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = request.headers();
    const isTargetRsc =
      url.pathname === targetPath &&
      (url.searchParams.has('_rsc') || headers.rsc === '1');
    if (!isTargetRsc) {
      await route.fallback();
      return;
    }
    const isPrefetch =
      headers['next-router-prefetch'] !== undefined ||
      headers.purpose === 'prefetch' ||
      headers['sec-purpose']?.includes('prefetch');
    if (isPrefetch) {
      await route.abort();
      return;
    }

    resolveRequestStarted();
    await requestGate;
    await route.fallback();
  };

  await page.route('**/*', handler);
  try {
    await page.goto('/darkroom');
    await page.evaluate(() => {
      type Probe = {
        animations: { backdrop: number; container: number };
        mounts: { backdrop: number; dialog: number };
      };
      const state = window as typeof window & {
        __photoModalProbe?: Probe;
      };
      const probe: Probe = {
        animations: { backdrop: 0, container: 0 },
        mounts: { backdrop: 0, dialog: 0 },
      };
      state.__photoModalProbe = probe;
      const seen = new WeakSet<Element>();
      const recordMount = (element: Element) => {
        if (seen.has(element)) return;
        const slot = element.getAttribute('data-slot');
        if (slot === 'modal-backdrop') probe.mounts.backdrop += 1;
        if (slot === 'modal-dialog') probe.mounts.dialog += 1;
        seen.add(element);
      };
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (!(node instanceof Element)) continue;
            recordMount(node);
            for (const element of node.querySelectorAll('[data-slot]')) {
              recordMount(element);
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      document.addEventListener(
        'animationstart',
        (event) => {
          if (!(event.target instanceof Element)) return;
          const slot = event.target.getAttribute('data-slot');
          if (slot === 'modal-backdrop') probe.animations.backdrop += 1;
          if (slot === 'modal-container') probe.animations.container += 1;
        },
        true,
      );
    });
    const card = page.locator(`a[href^="${targetPath}"]`).first();
    await card.click({ noWaitAfter: true });
    const dialog = page.getByRole('dialog', { name: 'Photo preview' });
    const backdrop = page.locator('[data-slot="modal-backdrop"]');
    const frame = dialog.locator('[data-photo-modal-frame]');
    const image = dialog.locator('[data-photo-modal-image]');
    await expect(dialog).toBeVisible();
    await expect(backdrop).toHaveCount(1);
    await expect(page.locator('[data-route-progress]')).toHaveCount(0);
    await expect(page.locator('[data-photo-modal-pending]')).toHaveCount(0);
    await expect(dialog).toHaveAttribute('data-photo-modal-phase', 'opening');
    await requestStarted;
    await expect(page).toHaveURL(/\/darkroom$/);
    await expect
      .poll(() =>
        image.evaluate(
          (node) =>
            (node as HTMLImageElement).complete &&
            (node as HTMLImageElement).naturalWidth > 0,
        ),
      )
      .toBe(true);
    await backdrop.evaluate((node) =>
      node.setAttribute('data-e2e-modal-instance', 'backdrop'),
    );
    await dialog.evaluate((node) =>
      node.setAttribute('data-e2e-modal-instance', 'dialog'),
    );
    await frame.evaluate((node) =>
      node.setAttribute('data-e2e-modal-instance', 'frame'),
    );
    await image.evaluate((node) =>
      node.setAttribute('data-e2e-modal-instance', 'image'),
    );

    releaseRequest();
    await expect(page).toHaveURL(new RegExp(`${targetPath}$`));
    await expect(dialog).toHaveAttribute('data-photo-modal-phase', 'confirmed');
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(backdrop).toHaveAttribute(
      'data-e2e-modal-instance',
      'backdrop',
    );
    await expect(dialog).toHaveAttribute('data-e2e-modal-instance', 'dialog');
    await expect(frame).toHaveAttribute('data-e2e-modal-instance', 'frame');
    await expect(image).toHaveAttribute('data-e2e-modal-instance', 'image');
    expect(
      await page.evaluate(() => {
        const state = window as typeof window & {
          __photoModalProbe?: {
            animations: { backdrop: number; container: number };
            mounts: { backdrop: number; dialog: number };
          };
        };
        return state.__photoModalProbe;
      }),
    ).toEqual({
      animations: { backdrop: 1, container: 1 },
      mounts: { backdrop: 1, dialog: 1 },
    });
  } finally {
    releaseRequest();
    await page.unroute('**/*', handler);
  }
});

test('closing the modal before its RSC completes cancels the navigation', async ({
  page,
}) => {
  const response = await page.request.get('/api/photos?limit=1');
  expect(response.ok()).toBe(true);
  const photo = ((await response.json()) as PhotosPage).photos[0];
  if (!photo) throw new Error('A published Photo fixture is required.');
  const targetPath = `/darkroom/${photo.slug}`;
  let releaseRequest: () => void = () => undefined;
  const requestGate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  let resolveRequestStarted: () => void = () => undefined;
  const requestStarted = new Promise<void>((resolve) => {
    resolveRequestStarted = resolve;
  });

  const handler = async (route: import('@playwright/test').Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = request.headers();
    const isTargetRsc =
      url.pathname === targetPath &&
      (url.searchParams.has('_rsc') || headers.rsc === '1');
    if (!isTargetRsc) {
      await route.fallback();
      return;
    }
    if (
      headers['next-router-prefetch'] !== undefined ||
      headers.purpose === 'prefetch' ||
      headers['sec-purpose']?.includes('prefetch')
    ) {
      await route.abort();
      return;
    }

    resolveRequestStarted();
    await requestGate;
    await route.fallback();
  };

  await page.route('**/*', handler);
  try {
    await page.goto('/');
    await page.goto('/darkroom');
    await page.locator(`a[href^="${targetPath}"]`).first().click({
      noWaitAfter: true,
    });
    await requestStarted;
    const dialog = page.getByRole('dialog', { name: 'Photo preview' });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/darkroom$/);

    await page.getByRole('button', { name: 'Close photo' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/darkroom$/);
    await expect(
      page.locator('[data-photo-modal-coordinator]'),
    ).toHaveAttribute('data-photo-modal-phase', 'closed');

    releaseRequest();
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(/\/darkroom$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally {
    releaseRequest();
    await page.unroute('**/*', handler);
  }
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
    const card = page
      .locator('a[href^="/darkroom/"]')
      .filter({ has: page.locator('img') })
      .first();
    const href = await card.getAttribute('href');
    expect(href).toBeTruthy();
    await card.click();
    await expect(
      page.getByRole('dialog', { name: 'Photo preview' }),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${href}$`));

    return href!;
  };

  await open();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/darkroom$/);

  await open();
  await page.mouse.click(4, 4);
  await expect(page).toHaveURL(/\/darkroom$/);

  const targetHref = await open();
  await page.goBack();
  await expect(page).toHaveURL(/\/darkroom$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`${targetHref}$`));
  const restoredDialog = page.getByRole('dialog', { name: 'Photo preview' });
  await expect(restoredDialog).toBeVisible();
  await expect(restoredDialog).toHaveAttribute(
    'data-photo-modal-slug',
    targetHref.split('/').at(-1)!,
  );
});

test('modified Photo clicks keep native canonical navigation', async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-chromium',
    'Control-click popup behavior is covered by the desktop browser.',
  );
  await page.goto('/darkroom');
  const card = page
    .locator('a[href^="/darkroom/"]')
    .filter({ has: page.locator('img') })
    .first();
  const href = await card.getAttribute('href');
  expect(href).toBeTruthy();

  const popupPromise = context.waitForEvent('page');
  await card.click({ modifiers: ['Control'] });
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');

  await expect(page).toHaveURL(/\/darkroom$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-route-progress]')).toHaveCount(0);
  await expect(popup).toHaveURL(new RegExp(`${href}$`));
  await expect(popup.getByRole('dialog')).toHaveCount(0);
  await expect(popup.locator('article')).toBeVisible();
  await popup.close();
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

  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(breadcrumb.getByRole('link', { name: 'Home' })).toHaveAttribute(
    'href',
    '/',
  );
  await expect(
    breadcrumb.getByRole('link', { name: 'Darkroom' }),
  ).toHaveAttribute('href', '/darkroom');
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveCount(1);

  const documents = (
    await page.locator('script[type="application/ld+json"]').allTextContents()
  ).map((value) => JSON.parse(value));
  const image = documents.find(({ '@type': type }) => type === 'ImageObject');
  const breadcrumbData = documents.find(
    ({ '@type': type }) => type === 'BreadcrumbList',
  );
  expect(image?.creator).toMatchObject({
    '@type': 'Person',
    '@id': 'https://dejayvu.com/#person',
    name: 'Junhao Zhang',
    url: 'https://dejayvu.com/#person',
  });
  expect(breadcrumbData?.itemListElement).toHaveLength(3);
});
