import { expect, test } from '@playwright/test';

import { installMediaRoute } from './support/browser';

async function projectStreet(page: import('@playwright/test').Page) {
  await expect(page.locator('html')).toHaveAttribute('data-neon-fx', '');
  await page.evaluate(() => {
    const street = document.getElementById('street');
    const track = street?.closest<HTMLElement>('[data-track]');
    if (!street || !track) throw new Error('Street track unavailable');
    if (window.innerWidth <= 720) {
      const terms = street.querySelectorAll<HTMLElement>('[data-term]');
      const last = terms.item(terms.length - 1);
      const rect = last.getBoundingClientRect();
      const root = document.documentElement;
      const previousBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      window.scrollTo(
        0,
        rect.top + window.scrollY + rect.height / 2 - window.innerHeight * 0.05,
      );
      root.style.scrollBehavior = previousBehavior;
      return;
    }
    const top = track.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top + track.offsetHeight - window.innerHeight - 1);
  });
  await expect(page.locator('[data-term]').last()).toHaveAttribute(
    'data-projected',
    '',
  );
}

test.beforeEach(async ({ page }) => {
  await installMediaRoute(page);
});

test('Street venue rows are borderless in every interactive state', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await projectStreet(page);

  for (const term of await page.locator('[data-term]').all()) {
    const idle = await term.evaluate((node) => {
      const style = getComputedStyle(node);
      return [style.borderTopWidth, style.borderBottomWidth];
    });
    expect(idle).toEqual(['0px', '0px']);
    if (testInfo.project.name === 'mobile-chromium') continue;
    await term.hover();
    const hover = await term.evaluate((node) => {
      const style = getComputedStyle(node);
      return [style.borderTopWidth, style.borderBottomWidth];
    });
    expect(hover).toEqual(['0px', '0px']);
  }
});

test('Darkroom uses two identical seamless thumbnail groups', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await projectStreet(page);

  const darkroom = page.locator('[data-term]').nth(1);
  const marquee = darkroom.locator('[data-photo-marquee]');
  const groups = marquee.locator('[data-photo-marquee-group]');
  await expect(groups).toHaveCount(2);

  const sources = await groups.evaluateAll((nodes) =>
    nodes.map((node) =>
      Array.from(node.querySelectorAll('img')).map((image) => image.currentSrc),
    ),
  );
  expect(sources[0]).toEqual(sources[1]);
  await expect(groups.nth(1)).toHaveAttribute('aria-hidden', 'true');

  const idleState = await marquee.evaluate(
    (node) => getComputedStyle(node).animationPlayState,
  );
  if (testInfo.project.name === 'mobile-chromium') {
    expect(idleState).toBe('running');
    return;
  }
  expect(idleState).toBe('paused');
  await darkroom.hover();
  expect(
    await marquee.evaluate((node) => getComputedStyle(node).animationPlayState),
  ).toBe('running');
});

test('Darkroom marquee is continuous on touch and static for reduced motion', async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === 'mobile-chromium') {
    await page.goto('/');
    await projectStreet(page);
    const marquee = page.locator('[data-photo-marquee]');
    expect(
      await marquee.evaluate(
        (node) => getComputedStyle(node).animationPlayState,
      ),
    ).toBe('running');
    return;
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const groups = page.locator('[data-photo-marquee-group]');
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0)).toBeVisible();
  await expect(groups.nth(1)).toBeHidden();
  expect(
    await page
      .locator('[data-photo-marquee]')
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe('none');
});
