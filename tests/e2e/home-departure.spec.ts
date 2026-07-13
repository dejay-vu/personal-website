import { type Page, type Route, expect, test } from '@playwright/test';

import { MOBILE_LITE_MEDIA_QUERY } from '../../src/config/media';
import { VENUES } from '../../src/config/venues';
import {
  installBrowserProbe,
  installMediaRoute,
  readBrowserProbe,
} from './support/browser';

async function holdNavigationRsc(page: Page, destination: string) {
  let releaseRequest: () => void = () => undefined;
  const requestGate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  let resolveRequestStarted: (startedAt: number) => void = () => undefined;
  const requestStarted = new Promise<number>((resolve) => {
    resolveRequestStarted = resolve;
  });
  let held = false;

  const handler = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = request.headers();
    const isTargetRsc =
      url.pathname === destination &&
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
    if (held) {
      await route.fallback();
      return;
    }

    held = true;
    resolveRequestStarted(Date.now());
    await requestGate;
    await route.fallback();
  };

  await page.route('**/*', handler);
  return {
    cleanup: () => page.unroute('**/*', handler),
    release: releaseRequest,
    requestStarted,
  };
}

async function projectStreet(
  page: import('@playwright/test').Page,
  venueIndex = 2,
) {
  const mobileLite = await page.evaluate(
    (query) => window.matchMedia(query).matches,
    MOBILE_LITE_MEDIA_QUERY,
  );
  if (mobileLite) {
    await expect(page.locator('html')).not.toHaveAttribute('data-neon-fx', '');
    const target = page.locator('[data-term]').nth(venueIndex);
    await target.scrollIntoViewIfNeeded();
    await expect(target).not.toHaveAttribute('inert', '');
    return;
  }

  await expect(page.locator('html')).toHaveAttribute('data-neon-fx', '');
  await page.evaluate(() => {
    const street = document.getElementById('street');
    const track = street?.closest<HTMLElement>('[data-track]');
    if (!street || !track) throw new Error('Street track unavailable');
    const top = track.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top + track.offsetHeight - window.innerHeight - 1);
  });
  await expect(page.locator('[data-term]').nth(venueIndex)).toHaveAttribute(
    'data-projected',
    '',
  );
}

test.beforeEach(async ({ page }) => {
  await installMediaRoute(page);
  await installBrowserProbe(page);
});

test('all venues navigate immediately without a transition layer', async ({
  page,
}) => {
  const destinations = [
    VENUES.notes.path,
    VENUES.photos.path,
    VENUES.projects.path,
  ];

  for (const [index, destination] of destinations.entries()) {
    const heldNavigation = await holdNavigationRsc(page, destination);
    try {
      await page.goto('/');
      await projectStreet(page, index);

      await expect(page.locator('[data-venue-transition]')).toHaveCount(0);

      const term = page.locator('[data-term]').nth(index);
      const clickStartedAt = Date.now();
      await term.dispatchEvent('click', { button: 0 });
      const requestStartedAt = await Promise.race([
        heldNavigation.requestStarted,
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error('Navigation did not start within 400ms')),
            400,
          );
        }),
      ]);
      expect(requestStartedAt - clickStartedAt).toBeLessThan(350);

      await expect(page).toHaveURL(/\/$/);
      const progress = page.locator('[data-route-progress]');
      await expect(progress).toHaveCount(1);
      await expect(progress).toBeVisible();
      await expect(page.locator('[data-venue-transition]')).toHaveCount(0);
      expect(
        await page.evaluate(() => sessionStorage.getItem('neonHomeGateReturn')),
      ).not.toBeNull();

      heldNavigation.release();
      await expect(page).toHaveURL(new RegExp(`${destination}$`));
      await expect(page.locator('[data-route-progress]')).toHaveCount(0);
      await expect(page.locator('[data-venue-transition]')).toHaveCount(0);

      const probe = await readBrowserProbe(page);
      expect(
        probe?.routePushes.filter((path) => path === destination),
      ).toHaveLength(1);

      await page.goBack();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.locator('[data-venue-transition]')).toHaveCount(0);
    } finally {
      heldNavigation.release();
      await heldNavigation.cleanup();
    }
  }
});

test('GATE returns every venue to its previous homepage scroll position', async ({
  page,
}) => {
  for (let index = 0; index < 3; index += 1) {
    await page.goto('/');
    await projectStreet(page, index);

    const term = page.locator('[data-term]').nth(index);
    const destination = await term.getAttribute('href');
    if (!destination) throw new Error('Venue destination unavailable');

    await term.click();
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
    const departureScrollY = await page.evaluate(() => {
      const value = JSON.parse(
        sessionStorage.getItem('neonHomeGateReturn') ?? 'null',
      ) as { scrollY?: unknown } | null;
      if (typeof value?.scrollY !== 'number') {
        throw new Error('Saved homepage scroll position unavailable');
      }
      return value.scrollY;
    });
    await page
      .getByRole('navigation', { name: 'Return' })
      .getByRole('link', { name: /GATE/ })
      .click();
    await expect(page).toHaveURL(/\/$/);
    await expect
      .poll(
        async () =>
          Math.abs(
            (await page.evaluate(() => window.scrollY)) - departureScrollY,
          ),
        { timeout: 5_000 },
      )
      .toBeLessThanOrEqual(16);
    await page.waitForTimeout(350);
    expect(
      Math.abs((await page.evaluate(() => window.scrollY)) - departureScrollY),
    ).toBeLessThanOrEqual(16);
    expect(
      await page.evaluate(() => sessionStorage.getItem('neonHomeGateReturn')),
    ).toBeNull();
  }
});

test('GATE restores through a new home entry when intervening history exists', async ({
  page,
}) => {
  await page.goto('/');
  await projectStreet(page, 1);
  await page.locator('[data-term]').nth(1).click();
  await expect(page).toHaveURL(/\/darkroom$/);

  const departureScrollY = await page.evaluate(() => {
    const value = JSON.parse(
      sessionStorage.getItem('neonHomeGateReturn') ?? 'null',
    ) as { scrollY?: unknown } | null;
    if (typeof value?.scrollY !== 'number') {
      throw new Error('Saved homepage scroll position unavailable');
    }
    window.history.pushState({}, '', `${window.location.pathname}#inspection`);
    return value.scrollY;
  });

  await page
    .getByRole('navigation', { name: 'Return' })
    .getByRole('link', { name: /GATE/ })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect
    .poll(
      async () =>
        Math.abs(
          (await page.evaluate(() => window.scrollY)) - departureScrollY,
        ),
      { timeout: 5_000 },
    )
    .toBeLessThanOrEqual(16);
  await page.waitForTimeout(350);
  expect(
    Math.abs((await page.evaluate(() => window.scrollY)) - departureScrollY),
  ).toBeLessThanOrEqual(16);
});

test('a direct homepage visit does not consume an old venue scroll position', async ({
  page,
}) => {
  await page.goto('/');
  await projectStreet(page, 0);
  await page.locator('[data-term]').first().click();
  await expect(page).toHaveURL(/\/field-notes$/);

  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(16);
  expect(
    await page.evaluate(() => sessionStorage.getItem('neonHomeGateReturn')),
  ).toBeNull();
});

test('reduced motion uses the same immediate transition-free navigation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const destination = VENUES.photos.path;
  const heldNavigation = await holdNavigationRsc(page, destination);
  try {
    await page.goto('/');
    const term = page.locator('[data-term]').nth(1);
    await expect(term).not.toHaveAttribute('inert', '');
    await expect(page.locator('[data-venue-transition]')).toHaveCount(0);

    const clickStartedAt = Date.now();
    await term.dispatchEvent('click', { button: 0 });
    const requestStartedAt = await Promise.race([
      heldNavigation.requestStarted,
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('Navigation did not start within 400ms')),
          400,
        );
      }),
    ]);
    expect(requestStartedAt - clickStartedAt).toBeLessThan(350);
    const progress = page.locator('[data-route-progress]');
    await expect(progress).toHaveCount(1);
    await expect(progress.locator('span')).toHaveCSS('animation-name', 'none');
    await expect(page.locator('[data-venue-transition]')).toHaveCount(0);

    heldNavigation.release();
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
    await expect(page.locator('[data-route-progress]')).toHaveCount(0);
    await expect(page.locator('[data-venue-transition]')).toHaveCount(0);
  } finally {
    heldNavigation.release();
    await heldNavigation.cleanup();
  }
});

test('modified clicks keep native behavior without saving a return point', async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-chromium',
    'Control-click popup behavior is covered by the desktop browser.',
  );
  await page.goto('/');
  await projectStreet(page, 0);
  await page.evaluate(() => sessionStorage.removeItem('neonHomeGateReturn'));

  const popupPromise = context.waitForEvent('page');
  await page
    .locator('[data-term]')
    .first()
    .click({ modifiers: ['Control'] });
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await expect(popup).toHaveURL(new RegExp(`${VENUES.notes.path}$`));
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('[data-route-progress]')).toHaveCount(0);
  await expect(page.locator('[data-venue-transition]')).toHaveCount(0);
  expect(
    await page.evaluate(() => sessionStorage.getItem('neonHomeGateReturn')),
  ).toBeNull();
  await popup.close();
});
