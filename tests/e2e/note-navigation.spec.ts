import type { NotesPage } from '@/modules/notes/types';
import { expect, test } from '@playwright/test';

import { installMediaRoute } from './support/browser';

test.beforeEach(async ({ page }) => {
  await installMediaRoute(page);
});

test('Note navigation shows top progress before the article RSC completes', async ({
  page,
}) => {
  const response = await page.request.get('/api/notes?limit=1');
  expect(response.ok()).toBe(true);
  const note = ((await response.json()) as NotesPage).notes[0];
  if (!note) throw new Error('A published Note fixture is required.');
  const targetPath = `/field-notes/${note.slug}`;
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
    await page.goto('/field-notes');
    await page.locator(`a[href="${targetPath}"]`).first().click({
      noWaitAfter: true,
    });
    await requestStarted;

    await expect(page).toHaveURL(/\/field-notes$/);
    const progress = page.getByRole('progressbar', { name: 'Loading note' });
    await expect(progress).toBeVisible({ timeout: 1_000 });
    await expect(page.locator('.neon-storefront-grid')).toBeVisible();
    expect(
      await progress.evaluate((node) => {
        const bounds = node.getBoundingClientRect();
        return {
          height: bounds.height,
          position: getComputedStyle(node).position,
          top: bounds.top,
        };
      }),
    ).toEqual({ height: 3, position: 'fixed', top: 0 });

    releaseRequest();
    await expect(page).toHaveURL(new RegExp(`${targetPath}$`));
    await expect(page.locator('[data-note-title]')).toHaveText(note.title);
    await expect(page.locator('[data-route-progress]')).toHaveCount(0);
  } finally {
    releaseRequest();
    await page.unroute('**/*', handler);
  }
});

test('Note cards navigate to the canonical full article', async ({ page }) => {
  await page.goto('/field-notes');
  const card = page
    .locator('article.neon-card a[href^="/field-notes/"]')
    .nth(1);
  const href = await card.getAttribute('href');
  const title = await card.getAttribute('aria-label');
  expect(href).toBeTruthy();
  expect(title).toBeTruthy();

  await card.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-note-title]')).toHaveText(title!);

  await page.goBack();
  await expect(page).toHaveURL(/\/field-notes$/);
  await expect(page.locator('[data-route-progress]')).toHaveCount(0);
});

test('a later featured Note uses the same canonical navigation path', async ({
  page,
}) => {
  const response = await page.request.get('/api/notes?limit=6');
  expect(response.ok()).toBe(true);
  const base = ((await response.json()) as NotesPage).notes[0];
  if (!base) throw new Error('A published Note fixture is required.');

  const notes = Array.from({ length: 8 }, (_, index) => ({
    ...base,
    coverMedia: {
      ...base.coverMedia,
      originalKey: `e2e-media/notes/navigation-${index}/cover.jpg`,
    },
    id: `e2e-navigation-note-${index}`,
    slug: index === 7 ? base.slug : `e2e-navigation-placeholder-${index}`,
    title: index === 7 ? base.title : `E2E Navigation Note ${index}`,
  }));
  const requests: Array<{
    category: string[];
    cursor: string | null;
    limit: string | null;
  }> = [];

  await page.route('**/api/notes?**', async (route) => {
    const url = new URL(route.request().url());
    const cursor = url.searchParams.get('cursor');
    requests.push({
      category: url.searchParams.getAll('category'),
      cursor,
      limit: url.searchParams.get('limit'),
    });
    await route.fulfill({
      body: JSON.stringify(
        cursor
          ? { nextCursor: null, notes: notes.slice(6) }
          : { nextCursor: 'e2e-navigation-cursor', notes: notes.slice(0, 6) },
      ),
      contentType: 'application/json',
    });
  });

  await page.goto('/field-notes?category=e2e-navigation');
  const cards = page.locator('article.neon-card');
  await expect(cards).toHaveCount(6);
  await expect(cards.nth(0)).toContainText('FEATURED');
  await expect(cards.nth(1)).not.toContainText('FEATURED');
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await expect(cards).toHaveCount(8);
  await expect(cards.nth(7)).toContainText('FEATURED');
  expect(requests).toEqual([
    { category: ['e2e-navigation'], cursor: null, limit: '6' },
    {
      category: ['e2e-navigation'],
      cursor: 'e2e-navigation-cursor',
      limit: '6',
    },
  ]);

  const loadedCard = cards.nth(7).locator('a');
  await loadedCard.click();
  await expect(page).toHaveURL(new RegExp(`/field-notes/${base.slug}$`));
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('modified Note clicks preserve native new-tab behavior', async ({
  context,
  page,
}) => {
  await page.goto('/field-notes');
  const card = page
    .locator('article.neon-card a[href^="/field-notes/"]')
    .first();
  const href = await card.getAttribute('href');
  expect(href).toBeTruthy();

  const popupPromise = context.waitForEvent('page');
  await card.click({ modifiers: ['Control'] });
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');

  await expect(page).toHaveURL(/\/field-notes$/);
  await expect(page.locator('[data-route-progress]')).toHaveCount(0);
  await expect(popup).toHaveURL(new RegExp(`${href}$`));
  await expect(popup.getByRole('dialog')).toHaveCount(0);
  await popup.close();
});

test('direct Note loads and invalid slugs keep canonical behavior', async ({
  page,
}) => {
  await page.goto('/field-notes');
  const href = await page
    .locator('article.neon-card a[href^="/field-notes/"]')
    .first()
    .getAttribute('href');
  expect(href).toBeTruthy();

  await page.goto(href!);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-note-title]')).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    new RegExp(`${href}$`),
  );
  const jsonLd = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  expect(jsonLd.map((value) => JSON.parse(value)['@type'])).toContain(
    'BlogPosting',
  );

  const response = await page.goto('/field-notes/e2e-definitely-missing');
  expect(response?.status()).toBe(404);
});
