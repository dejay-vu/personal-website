import { expect, test } from '@playwright/test';

import { installMediaRoute } from './support/browser';

async function projectStreet(
  page: import('@playwright/test').Page,
  mobile: boolean,
) {
  if (mobile) {
    await expect(page.locator('html')).not.toHaveAttribute('data-neon-fx', '');
    await page.locator('#street').scrollIntoViewIfNeeded();
    for (const term of await page.locator('[data-term]').all()) {
      await expect(term).not.toHaveAttribute('inert', '');
    }
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
  await expect(page.locator('[data-term]').last()).toHaveAttribute(
    'data-projected',
    '',
  );
}

test.beforeEach(async ({ page }) => {
  await installMediaRoute(page);
});

test('Street venue rows stay borderless and omit hover background glow', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await projectStreet(page, testInfo.project.name === 'mobile-chromium');

  for (const term of await page.locator('[data-term]').all()) {
    const idle = await term.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borders: [style.borderTopWidth, style.borderBottomWidth],
        boxShadow: style.boxShadow,
      };
    });
    expect(idle).toEqual({
      backgroundColor: 'rgba(0, 0, 0, 0)',
      backgroundImage: 'none',
      borders: ['0px', '0px'],
      boxShadow: 'none',
    });
    if (testInfo.project.name === 'mobile-chromium') continue;
    await term.hover();
    const hover = await term.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borders: [style.borderTopWidth, style.borderBottomWidth],
        boxShadow: style.boxShadow,
      };
    });
    expect(hover).toEqual({
      backgroundColor: 'rgba(0, 0, 0, 0)',
      backgroundImage: 'none',
      borders: ['0px', '0px'],
      boxShadow: 'none',
    });
  }
});

test('Darkroom uses a unique sequence with two seamless thumbnail groups', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const mobile = testInfo.project.name === 'mobile-chromium';
  await projectStreet(page, mobile);

  const darkroom = page.locator('[data-term]').nth(1);
  const marquee = darkroom.locator('[data-photo-marquee]');
  const groups = marquee.locator('[data-photo-marquee-group]');
  await expect(groups).toHaveCount(2);

  const photoIds = await groups.evaluateAll((nodes) =>
    nodes.map((node) =>
      Array.from(
        node.querySelectorAll<HTMLElement>('[data-photo-marquee-item]'),
        (item) => item.dataset.photoMarqueeItem,
      ),
    ),
  );
  expect(photoIds[0]).toEqual(photoIds[1]);
  expect(photoIds[0]).toHaveLength(9);
  expect(new Set(photoIds[0]).size).toBe(photoIds[0].length);
  await expect(groups.nth(1)).toHaveAttribute('aria-hidden', 'true');

  const idleState = await marquee.evaluate(
    (node) => getComputedStyle(node).animationPlayState,
  );
  if (mobile) {
    expect(
      await marquee.evaluate((node) => getComputedStyle(node).animationName),
    ).toBe('none');
  } else {
    expect(idleState).toBe('paused');
    await darkroom.hover();
    expect(
      await marquee.evaluate(
        (node) => getComputedStyle(node).animationPlayState,
      ),
    ).toBe('running');
  }

  if (!mobile) {
    const geometry = await marquee.evaluate((node) => {
      const clipWidth = node.parentElement?.getBoundingClientRect().width ?? 0;
      const groupWidths = Array.from(
        node.querySelectorAll<HTMLElement>('[data-photo-marquee-group]'),
        (group) => group.getBoundingClientRect().width,
      );
      const thumbWidth =
        node
          .querySelector<HTMLElement>('[data-photo-marquee-item]')
          ?.getBoundingClientRect().width ?? 0;

      return {
        clipWidth,
        groupWidths,
        thumbWidth,
        trackWidth: node.getBoundingClientRect().width,
      };
    });
    expect(geometry.groupWidths[0]).toBeGreaterThanOrEqual(
      geometry.clipWidth + geometry.thumbWidth - 1,
    );
    expect(
      Math.abs(geometry.groupWidths[0] - geometry.groupWidths[1]),
    ).toBeLessThan(1);

    const gapDelta = await marquee.evaluate((node) => {
      const groups = node.querySelectorAll<HTMLElement>(
        '[data-photo-marquee-group]',
      );
      const firstItems = groups[0].querySelectorAll<HTMLElement>(
        '[data-photo-marquee-item]',
      );
      const secondFirst = groups[1].querySelector<HTMLElement>(
        '[data-photo-marquee-item]',
      );
      if (firstItems.length < 2 || !secondFirst) {
        throw new Error('Darkroom marquee spacing is unavailable');
      }

      const internalGaps = Array.from(firstItems)
        .slice(1)
        .map((item, index) => {
          const previous = firstItems[index].getBoundingClientRect();
          return item.getBoundingClientRect().left - previous.right;
        });
      const last = firstItems[firstItems.length - 1].getBoundingClientRect();
      const boundaryGap = secondFirst.getBoundingClientRect().left - last.right;

      return Math.max(
        ...internalGaps.map((gap) => Math.abs(gap - boundaryGap)),
      );
    });
    expect(gapDelta).toBeLessThan(1);
    expect(
      Math.abs(
        geometry.trackWidth - geometry.groupWidths[0] - geometry.groupWidths[1],
      ),
    ).toBeLessThan(1);

    const seamDelta = await marquee.evaluate((node) => {
      const animation = node.getAnimations()[0];
      const duration = animation?.effect?.getTiming().duration;
      const groups = node.querySelectorAll<HTMLElement>(
        '[data-photo-marquee-group]',
      );
      if (!animation || typeof duration !== 'number' || groups.length !== 2) {
        throw new Error('Darkroom marquee animation is unavailable');
      }

      animation.pause();
      animation.currentTime = 0;
      const firstStart = groups[0].getBoundingClientRect().left;
      animation.currentTime = Math.max(0, duration - 0.01);
      const secondEnd = groups[1].getBoundingClientRect().left;

      return Math.abs(firstStart - secondEnd);
    });
    expect(seamDelta).toBeLessThan(1);
  }
});

test('Darkroom marquee is static on touch and under reduced motion', async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === 'mobile-chromium') {
    await page.goto('/');
    await projectStreet(page, true);
    const marquee = page.locator('[data-photo-marquee]');
    expect(
      await marquee.evaluate((node) => getComputedStyle(node).animationName),
    ).toBe('none');
  } else {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
  }

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
