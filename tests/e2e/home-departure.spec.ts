import { expect, test } from '@playwright/test';

import {
  installBrowserProbe,
  installMediaRoute,
  readBrowserProbe,
} from './support/browser';

async function projectStreet(
  page: import('@playwright/test').Page,
  venueIndex = 2,
) {
  await expect(page.locator('html')).toHaveAttribute('data-neon-fx', '');
  await page.evaluate((targetIndex) => {
    const street = document.getElementById('street');
    const track = street?.closest<HTMLElement>('[data-track]');
    if (!street || !track) throw new Error('Street track unavailable');
    if (window.innerWidth <= 720) {
      const terms = street.querySelectorAll<HTMLElement>('[data-term]');
      const target = terms.item(targetIndex);
      const rect = target.getBoundingClientRect();
      const root = document.documentElement;
      const previousBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      window.scrollTo(
        0,
        rect.top + window.scrollY + rect.height / 2 - window.innerHeight * 0.25,
      );
      root.style.scrollBehavior = previousBehavior;
      return;
    }
    const top = track.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top + track.offsetHeight - window.innerHeight - 1);
  }, venueIndex);
  await expect(page.locator('[data-term]').nth(venueIndex)).toHaveAttribute(
    'data-projected',
    '',
  );
}

test.beforeEach(async ({ page }) => {
  await installMediaRoute(page);
  await installBrowserProbe(page);
});

test('all venues use one document-level blackout and one route push', async ({
  page,
}) => {
  for (let index = 0; index < 3; index += 1) {
    await page.goto('/');
    await projectStreet(page, index);

    const term = page.locator('[data-term]').nth(index);
    const destination = await term.getAttribute('href');
    await term.click();
    const blackout = page.locator('[data-departure-blackout]');
    await expect(blackout).toHaveCount(1);
    expect(
      await blackout.evaluate((node) => node.parentElement === document.body),
    ).toBe(true);

    const layer = await blackout.evaluate((node) => {
      const center = document.elementFromPoint(
        window.innerWidth / 2,
        window.innerHeight / 2,
      );
      const style = getComputedStyle(node);
      return {
        capturesCenter: center === node,
        opacity: Number(style.opacity),
        pointerEvents: style.pointerEvents,
        zIndex: Number(style.zIndex),
      };
    });
    expect(layer.zIndex).toBeGreaterThan(30);
    expect(layer.pointerEvents).toBe('auto');
    expect(layer.capturesCenter).toBe(true);
    await expect
      .poll(
        () =>
          blackout.evaluate((node) => Number(getComputedStyle(node).opacity)),
        { intervals: [16], timeout: 400 },
      )
      .toBeGreaterThan(0);

    await expect(page).toHaveURL(new RegExp(`${destination}$`));
    await expect(blackout).toHaveCount(0);
    const probe = await readBrowserProbe(page);
    expect(
      probe?.routePushes.filter((path) => path === destination),
    ).toHaveLength(1);

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    const restoredBlackout = page.locator('[data-departure-blackout]');
    await expect(restoredBlackout).toHaveCount(1);
    expect(
      await restoredBlackout.evaluate(
        (node) => getComputedStyle(node).pointerEvents,
      ),
    ).toBe('none');
  }
});

test('reduced motion and modified clicks skip the departure overlay', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  if (testInfo.project.name === 'desktop-chromium') {
    await page
      .locator('[data-term]')
      .first()
      .evaluate((node) => {
        node.addEventListener('click', (event) => event.preventDefault(), {
          capture: true,
          once: true,
        });
        node.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            button: 0,
            cancelable: true,
            ctrlKey: true,
          }),
        );
      });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('[data-departure-blackout]')).toHaveCount(1);
    expect(
      await page
        .locator('[data-departure-blackout]')
        .evaluate((node) => getComputedStyle(node).opacity),
    ).toBe('0');
  }

  const href = await page.locator('[data-term]').nth(1).getAttribute('href');
  await page.locator('[data-term]').nth(1).click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.locator('[data-departure-blackout]')).toHaveCount(0);
});
