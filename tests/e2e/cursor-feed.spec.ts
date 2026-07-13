import { expect, test } from '@playwright/test';

import {
  installBrowserProbe,
  installMediaRoute,
  readBrowserProbe,
} from './support/browser';

test.beforeEach(async ({ page }) => {
  await installMediaRoute(page);
  await installBrowserProbe(page);
});

test('default feeds seed from the server page without a cursor-null refetch', async ({
  page,
}) => {
  const noteRequests: Array<string | null> = [];
  await page.route('**/api/notes?**', async (route) => {
    const url = new URL(route.request().url());
    noteRequests.push(url.searchParams.get('cursor'));
    await route.fulfill({
      body: JSON.stringify({ nextCursor: null, notes: [] }),
      contentType: 'application/json',
    });
  });
  await page.goto('/field-notes');
  await expect(page.locator('article.neon-card')).not.toHaveCount(0);
  await page.waitForTimeout(300);
  expect(noteRequests.every((cursor) => cursor !== null)).toBe(true);

  const photoRequests: Array<string | null> = [];
  await page.route('**/api/photos?**', async (route) => {
    const url = new URL(route.request().url());
    photoRequests.push(url.searchParams.get('cursor'));
    await route.fulfill({
      body: JSON.stringify({ nextCursor: null, photos: [] }),
      contentType: 'application/json',
    });
  });
  await page.goto('/darkroom');
  await expect(page.locator('.neon-tile')).not.toHaveCount(0);
  await page.waitForTimeout(300);
  expect(photoRequests.every((cursor) => cursor !== null)).toBe(true);
});

test('adapters canonicalize query parameters and retain empty-state copy', async ({
  page,
}) => {
  let noteRequest: URL | null = null;
  await page.route('**/api/notes?**', async (route) => {
    noteRequest = new URL(route.request().url());
    await route.fulfill({
      body: JSON.stringify({ nextCursor: null, notes: [] }),
      contentType: 'application/json',
    });
  });
  await page.goto('/field-notes?category=zeta&category=alpha&category=zeta');
  await expect(
    page.getByText('no field notes match the selected categories', {
      exact: false,
    }),
  ).toBeVisible();
  expect(noteRequest).not.toBeNull();
  expect(noteRequest!.searchParams.get('limit')).toBe('6');
  expect(noteRequest!.searchParams.getAll('category')).toEqual([
    'alpha',
    'zeta',
  ]);
  expect(noteRequest!.searchParams.has('cursor')).toBe(false);

  let photoRequest: URL | null = null;
  await page.route('**/api/photos?**', async (route) => {
    photoRequest = new URL(route.request().url());
    await route.fulfill({
      body: JSON.stringify({ nextCursor: null, photos: [] }),
      contentType: 'application/json',
    });
  });
  await page.goto(
    '/darkroom?q=%20signal%20&make=zeta&iso=400&make=alpha&make=zeta',
  );
  await expect(page.getByText('no photos match this search')).toBeVisible();
  expect(photoRequest).not.toBeNull();
  expect(photoRequest!.searchParams.get('limit')).toBe('36');
  expect(photoRequest!.searchParams.get('q')).toBe('signal');
  expect(photoRequest!.searchParams.getAll('iso')).toEqual(['400']);
  expect(photoRequest!.searchParams.getAll('make')).toEqual(['alpha', 'zeta']);
  expect(photoRequest!.searchParams.has('cursor')).toBe(false);
});

test('Note feed retains its error copy and explicitly retries the same query', async ({
  page,
}) => {
  let attempts = 0;
  await page.route('**/api/notes?**', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        body: '{}',
        contentType: 'application/json',
        status: 500,
      });
      return;
    }
    const url = new URL(route.request().url());
    url.searchParams.delete('category');
    const response = await route.fetch({ url: url.toString() });
    await route.fulfill({ response });
  });

  await page.goto('/field-notes?category=e2e-retry');
  await expect(page.getByText('Unable to load Field Notes.')).toBeVisible();
  const retry = page.getByRole('button', { name: 'Retry loading Field Notes' });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(page.locator('article.neon-card')).not.toHaveCount(0);
  expect(attempts).toBe(2);
});

test('Photo feed retains its error copy and explicitly retries the same query', async ({
  page,
}) => {
  let attempts = 0;
  await page.route('**/api/photos?**', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        body: '{}',
        contentType: 'application/json',
        status: 500,
      });
      return;
    }
    const url = new URL(route.request().url());
    url.searchParams.delete('q');
    const response = await route.fetch({ url: url.toString() });
    await route.fulfill({ response });
  });

  await page.goto('/darkroom?q=e2e-retry');
  await expect(page.getByText('Unable to load Darkroom photos.')).toBeVisible();
  const retry = page.getByRole('button', { name: 'Retry loading photos' });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(page.locator('.neon-tile')).not.toHaveCount(0);
  expect(attempts).toBe(2);
});

test('domain adapters retain their distinct observer lookahead', async ({
  page,
}) => {
  let notePage = 0;
  await page.route('**/api/notes?**', async (route) => {
    notePage += 1;
    if (notePage > 1) {
      await route.fulfill({
        body: JSON.stringify({ nextCursor: null, notes: [] }),
        contentType: 'application/json',
      });
      return;
    }
    const url = new URL(route.request().url());
    url.searchParams.delete('category');
    const response = await route.fetch({ url: url.toString() });
    const body = (await response.json()) as {
      nextCursor: string | null;
      notes: Array<{ id: string }>;
    };
    await route.fulfill({
      body: JSON.stringify({
        ...body,
        nextCursor: body.notes.at(-1)?.id ?? 'e2e-note-cursor',
      }),
      contentType: 'application/json',
    });
  });
  await page.goto('/field-notes?category=e2e-lookahead');
  await expect
    .poll(async () => (await readBrowserProbe(page))?.intersectionRootMargins)
    .toContain('240px 0px');

  let photoPage = 0;
  await page.route('**/api/photos?**', async (route) => {
    photoPage += 1;
    if (photoPage > 1) {
      await route.fulfill({
        body: JSON.stringify({ nextCursor: null, photos: [] }),
        contentType: 'application/json',
      });
      return;
    }
    const url = new URL(route.request().url());
    url.searchParams.delete('q');
    const response = await route.fetch({ url: url.toString() });
    const body = (await response.json()) as {
      nextCursor: string | null;
      photos: Array<{ id: string }>;
    };
    await route.fulfill({
      body: JSON.stringify({
        ...body,
        nextCursor: body.photos.at(-1)?.id ?? 'e2e-photo-cursor',
      }),
      contentType: 'application/json',
    });
  });
  await page.goto('/darkroom?q=e2e-lookahead');
  await expect
    .poll(async () => (await readBrowserProbe(page))?.intersectionRootMargins)
    .toContain('800px 0px');
});

test('load-more failure keeps items and retry deduplicates the same cursor', async ({
  page,
}) => {
  let calls = 0;
  const cursors: Array<string | null> = [];
  let baseNotes: Array<Record<string, unknown>> = [];
  await page.route('**/api/notes?**', async (route) => {
    calls += 1;
    const url = new URL(route.request().url());
    cursors.push(url.searchParams.get('cursor'));
    if (calls === 1) {
      url.searchParams.delete('category');
      const response = await route.fetch({ url: url.toString() });
      const body = (await response.json()) as {
        notes: Array<Record<string, unknown>>;
      };
      baseNotes = body.notes.slice(0, 2);
      await route.fulfill({
        body: JSON.stringify({
          nextCursor: 'e2e-cursor-one',
          notes: baseNotes,
        }),
        contentType: 'application/json',
      });
      return;
    }
    if (calls === 2) {
      await route.fulfill({
        body: '{}',
        contentType: 'application/json',
        status: 500,
      });
      return;
    }
    const duplicate = baseNotes[0];
    const appended = {
      ...baseNotes[1],
      id: 'e2e-note-appended',
      slug: 'e2e-note-appended',
      title: 'E2E Appended Note',
    };
    await route.fulfill({
      body: JSON.stringify({
        nextCursor: null,
        notes: [duplicate, appended],
      }),
      contentType: 'application/json',
    });
  });

  await page.goto('/field-notes?category=e2e-load-more');
  await expect(page.locator('article.neon-card')).toHaveCount(2);
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await expect(
    page.getByText('Unable to load more Field Notes.'),
  ).toBeVisible();
  await expect(page.locator('article.neon-card')).toHaveCount(2);

  await page.getByRole('button', { name: 'Retry loading Field Notes' }).click();
  await expect(page.locator('article.neon-card')).toHaveCount(3);
  await expect(page.getByText('E2E Appended Note')).toBeVisible();
  expect(cursors).toEqual([null, 'e2e-cursor-one', 'e2e-cursor-one']);
  expect(calls).toBe(3);
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await page.waitForTimeout(300);
  expect(calls).toBe(3);
});

test('rapid Photo query changes abort and ignore a stale completion', async ({
  page,
}) => {
  let releaseSlow: () => void = () => undefined;
  const slowGate = new Promise<void>((resolve) => {
    releaseSlow = resolve;
  });
  await page.route('**/api/photos?**', async (route) => {
    const url = new URL(route.request().url());
    const q = url.searchParams.get('q');
    url.searchParams.delete('q');
    const response = await route.fetch({ url: url.toString() });
    const body = (await response.json()) as {
      photos: Array<Record<string, unknown>>;
    };
    const title = q === 'fast' ? 'FAST RESULT' : 'SLOW RESULT';
    const photos = body.photos
      .slice(0, 1)
      .map((photo) => ({ ...photo, title }));
    if (q === 'slow') {
      await slowGate;
      await route
        .fulfill({
          body: JSON.stringify({ nextCursor: null, photos }),
          contentType: 'application/json',
        })
        .catch(() => undefined);
      return;
    }
    await route.fulfill({
      body: JSON.stringify({ nextCursor: null, photos }),
      contentType: 'application/json',
    });
    if (q === 'fast') releaseSlow();
  });

  await page.goto('/darkroom');
  const search = page.getByRole('searchbox', { name: 'Search Darkroom' });
  const slowRequest = page.waitForRequest(
    (request) =>
      request.url().includes('/api/photos?') &&
      request.url().includes('q=slow'),
  );
  await search.fill('slow');
  await slowRequest;
  await search.fill('fast');

  await expect(page.locator('img[alt="FAST RESULT"]')).toHaveCount(1);
  await expect(page.locator('img[alt="SLOW RESULT"]')).toHaveCount(0);
});
