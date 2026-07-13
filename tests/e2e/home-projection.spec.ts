import { expect, test } from '@playwright/test';

import { installMediaRoute } from './support/browser';

const sectionSigns = '[data-sign]';
const venueNames = '[data-vname]';
const venueTerms = '[data-term]';

test.beforeEach(async ({ page }) => {
  await installMediaRoute(page);
});

test('unprojected titles and venue links follow the canvas readiness state', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-chromium',
    'Touch/mobile uses the in-flow DOM projection instead of the canvas gate.',
  );
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-neon-fx', '');

  const titles = page.locator(`${sectionSigns}, ${venueNames}`);
  await expect(titles).toHaveCount(6);
  for (const title of await titles.all()) {
    await expect(title).not.toHaveAttribute('data-projected', '');
    expect(
      await title.evaluate((node) => getComputedStyle(node).userSelect),
    ).toBe('none');
  }

  const terms = page.locator(venueTerms);
  await expect(terms).toHaveCount(3);
  for (const term of await terms.all()) {
    await expect(term).not.toHaveAttribute('data-projected', '');
    await expect(term).toHaveAttribute('inert', '');
    expect(
      await term.evaluate((node) => getComputedStyle(node).pointerEvents),
    ).toBe('none');
    await term.evaluate((node) => node.focus());
    expect(await term.evaluate((node) => node.matches(':focus'))).toBe(false);
    await expect
      .poll(() =>
        term.evaluate((node) =>
          getComputedStyle(node).gridTemplateRows.endsWith(' 0px'),
        ),
      )
      .toBe(true);
    const readyCue = term.locator('[data-ready-cue]');
    await expect(readyCue).toBeHidden();
    expect(
      await readyCue.evaluate((node) => Number(getComputedStyle(node).opacity)),
    ).toBe(0);
  }
});

test('Street links activate at completion and deactivate on reverse scroll', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-chromium',
    'Touch/mobile venue links are immediately available in the static layout.',
  );
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-neon-fx', '');

  await page.evaluate(() => {
    const street = document.getElementById('street');
    const track = street?.closest<HTMLElement>('[data-track]');
    if (!track) throw new Error('Street track unavailable');
    if (window.innerWidth <= 720) {
      const terms = street?.querySelectorAll<HTMLElement>('[data-term]');
      const last = terms?.item(terms.length - 1);
      if (!last) throw new Error('Street venue unavailable');
      const rect = last.getBoundingClientRect();
      const documentCenter = rect.top + window.scrollY + rect.height / 2;
      const root = document.documentElement;
      const previousBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      window.scrollTo(0, documentCenter - window.innerHeight * 0.05);
      root.style.scrollBehavior = previousBehavior;
      return;
    }
    const top = track.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top + track.offsetHeight - window.innerHeight - 1);
  });

  for (const term of await page.locator(venueTerms).all()) {
    await expect(term).toHaveAttribute('data-projected', '');
    await expect(term).not.toHaveAttribute('inert', '');
    expect(
      await term.evaluate((node) => getComputedStyle(node).pointerEvents),
    ).toBe('auto');
    await term.focus();
    expect(await term.evaluate((node) => node.matches(':focus'))).toBe(true);
    const readyCue = term.locator('[data-ready-cue]');
    await expect(readyCue).toBeVisible();
    expect(
      await readyCue.evaluate((node) => Number(getComputedStyle(node).opacity)),
    ).toBeGreaterThan(0.7);
    expect(
      await readyCue.evaluate((node) =>
        Number(getComputedStyle(node.parentElement!).opacity),
      ),
    ).toBeGreaterThan(0.9);
  }

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    root.style.scrollBehavior = previousBehavior;
  });
  for (const term of await page.locator(venueTerms).all()) {
    await expect(term).not.toHaveAttribute('data-projected', '');
    await expect(term).toHaveAttribute('inert', '');
    await expect(term.locator('[data-ready-cue]')).toBeHidden();
  }
});

test('touch/mobile exposes one selectable, interactive DOM projection', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'mobile-chromium',
    'The lite projection contract is specific to touch/mobile.',
  );
  await page.goto('/');

  await expect(page.locator('html')).not.toHaveAttribute('data-neon-fx', '');
  await expect(page.locator('div[class*="fx"] canvas')).toHaveCount(0);

  const titles = page.locator(`${sectionSigns}, ${venueNames}`);
  await expect(titles).toHaveCount(6);
  for (const title of await titles.all()) {
    expect(
      await title.evaluate((node) => getComputedStyle(node).userSelect),
    ).not.toBe('none');
    expect(
      await title.evaluate(
        (node) => Number(getComputedStyle(node).opacity) > 0,
      ),
    ).toBe(true);
  }

  for (const term of await page.locator(venueTerms).all()) {
    await expect(term).not.toHaveAttribute('inert', '');
    expect(
      await term.evaluate((node) => getComputedStyle(node).pointerEvents),
    ).toBe('auto');
    await expect(term.locator('[data-ready-cue]')).toBeVisible();
  }
});

test('reduced motion exposes the visible static fallback immediately', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expect(page.locator('html')).not.toHaveAttribute('data-neon-fx', '');
  for (const title of await page
    .locator(`${sectionSigns}, ${venueNames}`)
    .all()) {
    expect(
      await title.evaluate((node) => getComputedStyle(node).userSelect),
    ).not.toBe('none');
  }
  for (const term of await page.locator(venueTerms).all()) {
    await expect(term).not.toHaveAttribute('inert', '');
    expect(
      await term.evaluate((node) => getComputedStyle(node).pointerEvents),
    ).toBe('auto');
    await expect(term.locator('[data-ready-cue]')).toBeVisible();
    expect(
      await term
        .locator('[data-ready-cue]')
        .evaluate((node) =>
          Number(getComputedStyle(node.parentElement!).opacity),
        ),
    ).toBeGreaterThan(0.9);
  }
});

test('canvas failure releases a restored projection gate', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
    sessionStorage.setItem('neonFx', '1');
  });
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveAttribute('data-neon-fx', '', {
    timeout: 5_000,
  });

  for (const term of await page.locator(venueTerms).all()) {
    await expect(term).not.toHaveAttribute('inert', '');
    expect(
      await term.evaluate((node) => getComputedStyle(node).pointerEvents),
    ).toBe('auto');
    await expect(term.locator('[data-ready-cue]')).toBeVisible();
  }
});
