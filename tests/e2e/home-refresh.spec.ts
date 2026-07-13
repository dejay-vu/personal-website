import { expect, test } from '@playwright/test';

import {
  downsampleRGB,
  installBrowserProbe,
  installMediaRoute,
  intermediatePixelRatio,
  readBrowserProbe,
  startScreencast,
} from './support/browser';

function translateY(transform: string) {
  const values = transform.match(/matrix(?:3d)?\(([^)]+)\)/)?.[1].split(',');
  if (!values) return 0;
  return Number(values.length === 6 ? values[5] : values[13]);
}

async function maskAnimatedCanvases(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const stylesheet = new CSSStyleSheet();
    stylesheet.replaceSync(
      'canvas[class*="rainFar"],canvas[class*="rainNear"]{visibility:hidden!important}',
    );
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, stylesheet];
  });
}

test.beforeEach(async ({ page }) => {
  await installMediaRoute(page);
  await installBrowserProbe(page);
});

test('homepage emits a high-priority image preload and an inline preview', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByRole('progressbar')).toHaveCount(0);

  const preload = page.locator(
    'link[rel="preload"][as="image"][href="/background.webp"]',
  );
  await expect(preload).toHaveCount(1);
  await expect(preload).toHaveAttribute('type', 'image/webp');
  await expect(preload).toHaveAttribute('fetchpriority', 'high');

  const backgroundImage = await page
    .locator('div[class*="bgImage"]')
    .evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(backgroundImage).toContain('/background.webp');
  expect(backgroundImage).toContain('data:image/webp;base64,');
});

test('background discovery does not wait for stylesheet completion', async ({
  page,
}) => {
  let releaseStylesheets: () => void = () => undefined;
  const stylesheetGate = new Promise<void>((resolve) => {
    releaseStylesheets = resolve;
  });
  let sawStylesheet = false;
  let backgroundStarted = false;

  await page.route('**/*.css*', async (route) => {
    sawStylesheet = true;
    await stylesheetGate;
    await route.continue();
  });
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/background.webp') {
      backgroundStarted = true;
    }
  });

  const navigation = page.goto('/');
  try {
    await expect.poll(() => sawStylesheet).toBe(true);
    await expect.poll(() => backgroundStarted).toBe(true);
  } finally {
    releaseStylesheets();
  }
  await navigation;
});

test('HUD fallback reserves stable geometry without wrapping', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto('/');

  const status = page.locator('nav[aria-label="Sections"] small');
  const computed = await status.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      content: getComputedStyle(element, '::after').content,
      whiteSpace: style.whiteSpace,
      width: element.getBoundingClientRect().width,
    };
  });
  expect(computed.content).toContain('SECTOR GATE · DEJAYVU STABLE');
  expect(computed.whiteSpace).toBe('nowrap');
  expect(computed.width).toBeGreaterThan(200);

  await context.close();
});

test('hard refresh stays below the CLS and geometry budgets', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForTimeout(1_000);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1_000);

  const probe = await readBrowserProbe(page);
  expect(probe).toBeTruthy();
  const cls =
    probe?.layoutShifts.reduce((sum, entry) => sum + entry.value, 0) ?? 1;
  expect(cls, JSON.stringify(probe?.layoutShifts ?? [], null, 2)).toBeLessThan(
    0.0005,
  );

  for (const key of ['hud', 'hero'] as const) {
    const rects = (probe?.rects ?? [])
      .map((sample) => sample[key])
      .filter(Boolean);
    if (rects.length < 2) continue;
    const first = rects[0];
    expect(
      Math.max(...rects.map((rect) => Math.abs(rect!.left - first!.left))),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.max(...rects.map((rect) => Math.abs(rect!.top - first!.top))),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.max(...rects.map((rect) => Math.abs(rect!.right - first!.right))),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.max(...rects.map((rect) => Math.abs(rect!.bottom - first!.bottom))),
    ).toBeLessThanOrEqual(1);
  }
});

test('hard refresh has no unrelated intermediate compositor frame', async ({
  page,
}, testInfo) => {
  await maskAnimatedCanvases(page);
  await page.goto('/');
  await page.waitForTimeout(800);
  const cacheSession = await page.context().newCDPSession(page);
  await cacheSession.send('Network.enable');
  await cacheSession.send('Network.clearBrowserCache');
  await cacheSession.detach();
  const { stableBefore, stop } = await startScreencast(page);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(800);
  const frames = await stop();
  const firstContentfulPaint = await page.evaluate(() => {
    const entry = performance.getEntriesByName('first-contentful-paint')[0];
    return entry ? performance.timeOrigin + entry.startTime : null;
  });

  expect(firstContentfulPaint).not.toBeNull();
  // Chromium may clear its renderer surface before the new document exists.
  // Keep every app-controlled frame from the new document's first paint on.
  const paintedFrames = frames.filter(
    (frame) => frame.timestamp >= firstContentfulPaint!,
  );
  expect(paintedFrames.length).toBeGreaterThan(0);
  const stableAfter = paintedFrames.at(-1)!;

  const width = 144;
  const height = 90;
  const beforeRGB = await downsampleRGB(stableBefore.data, width, height);
  const afterRGB = await downsampleRGB(stableAfter.data, width, height);
  let worstFrame: Buffer | null = null;
  let worstRatio = 0;
  for (const frame of paintedFrames) {
    const frameRGB = await downsampleRGB(frame.data, width, height);
    const ratio = intermediatePixelRatio(frameRGB, beforeRGB, afterRGB);
    if (ratio > worstRatio) {
      worstRatio = ratio;
      worstFrame = frame.data;
    }
  }
  if (worstRatio >= 0.2 && worstFrame) {
    await testInfo.attach('stable-before', {
      body: stableBefore.data,
      contentType: 'image/jpeg',
    });
    await testInfo.attach('worst-intermediate', {
      body: worstFrame,
      contentType: 'image/jpeg',
    });
    await testInfo.attach('stable-after', {
      body: stableAfter.data,
      contentType: 'image/jpeg',
    });
  }
  expect(worstRatio).toBeLessThan(0.2);
});

test('retained-scroll refresh restores scroll and parallax before sampling', async ({
  page,
}, testInfo) => {
  await maskAnimatedCanvases(page);
  await page.goto('/');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.documentElement;
        const previousBehavior = root.style.scrollBehavior;
        root.style.scrollBehavior = 'auto';
        window.scrollTo(0, 1_800);
        const scrollY = window.scrollY;
        root.style.scrollBehavior = previousBehavior;
        return scrollY;
      }),
    )
    .toBeGreaterThan(1_700);

  await expect
    .poll(
      async () => {
        const { persisted, target, transform } = await page
          .locator('div[class*="bgImage"]')
          .evaluate((element) => ({
            persisted: sessionStorage.getItem('neonBgY'),
            target:
              -Math.min(
                Math.max(
                  window.scrollY /
                    Math.max(
                      1,
                      document.documentElement.scrollHeight -
                        window.innerHeight,
                    ),
                  0,
                ),
                1,
              ) *
              Math.max(
                0,
                (element as HTMLElement).offsetHeight - window.innerHeight,
              ),
            transform: getComputedStyle(element).transform,
          }));
        const currentBackgroundY = translateY(transform);
        const persistedBackgroundY = Number(persisted);
        if (persisted === null || !Number.isFinite(persistedBackgroundY)) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(currentBackgroundY - target),
          Math.abs(persistedBackgroundY - target),
        );
      },
      { intervals: [50], timeout: 2_000 },
    )
    .toBeLessThanOrEqual(1);

  const beforeScrollY = await page.evaluate(() => window.scrollY);
  const { stableBefore, stop } = await startScreencast(page);
  await page.reload({ waitUntil: 'load' });
  await expect
    .poll(
      async () => {
        const state = await page
          .locator('div[class*="bgImage"]')
          .evaluate((element) => ({
            persisted: sessionStorage.getItem('neonBgY'),
            target:
              -Math.min(
                Math.max(
                  window.scrollY /
                    Math.max(
                      1,
                      document.documentElement.scrollHeight -
                        window.innerHeight,
                    ),
                  0,
                ),
                1,
              ) *
              Math.max(
                0,
                (element as HTMLElement).offsetHeight - window.innerHeight,
              ),
            transform: getComputedStyle(element).transform,
          }));
        if (state.persisted === null) return Number.POSITIVE_INFINITY;
        return Math.max(
          Math.abs(translateY(state.transform) - state.target),
          Math.abs(Number(state.persisted) - state.target),
        );
      },
      { intervals: [25], timeout: 2_000 },
    )
    .toBeLessThanOrEqual(1);
  const settledEpoch = await page.evaluate(
    () => performance.timeOrigin + performance.now(),
  );
  await page.waitForTimeout(100);
  const frames = await stop();

  const firstContentfulPaintEpoch = await page.evaluate(() => {
    const entry = performance.getEntriesByName('first-contentful-paint')[0];
    return entry ? performance.timeOrigin + entry.startTime : null;
  });
  expect(firstContentfulPaintEpoch).not.toBeNull();
  const compositorFrames = frames.filter(
    (frame) => frame.timestamp >= firstContentfulPaintEpoch!,
  );
  expect(compositorFrames.length).toBeGreaterThan(0);
  const settledFrames = compositorFrames.filter(
    (frame) => frame.timestamp >= settledEpoch,
  );
  expect(settledFrames.length).toBeGreaterThan(0);
  const stableAfter = settledFrames.at(-1)!;

  const width = 144;
  const height = 90;
  const beforeRGB = await downsampleRGB(stableBefore.data, width, height);
  const afterRGB = await downsampleRGB(stableAfter.data, width, height);
  let worstFrame: Buffer | null = null;
  let worstRatio = 0;
  for (const frame of compositorFrames) {
    const frameRGB = await downsampleRGB(frame.data, width, height);
    const ratio = intermediatePixelRatio(frameRGB, beforeRGB, afterRGB);
    if (ratio > worstRatio) {
      worstRatio = ratio;
      worstFrame = frame.data;
    }
  }
  if (worstRatio >= 0.2 && worstFrame) {
    await testInfo.attach('retained-stable-before', {
      body: stableBefore.data,
      contentType: 'image/jpeg',
    });
    await testInfo.attach('retained-worst-intermediate', {
      body: worstFrame,
      contentType: 'image/jpeg',
    });
    await testInfo.attach('retained-stable-after', {
      body: stableAfter.data,
      contentType: 'image/jpeg',
    });
  }
  expect(worstRatio).toBeLessThan(0.2);

  const after = await page
    .locator('div[class*="bgImage"]')
    .evaluate((element) => ({
      persisted: Number(sessionStorage.getItem('neonBgY')),
      scrollY: window.scrollY,
      target:
        -Math.min(
          Math.max(
            window.scrollY /
              Math.max(
                1,
                document.documentElement.scrollHeight - window.innerHeight,
              ),
            0,
          ),
          1,
        ) *
        Math.max(0, (element as HTMLElement).offsetHeight - window.innerHeight),
      transform: getComputedStyle(element).transform,
    }));
  expect(Math.abs(after.scrollY - beforeScrollY)).toBeLessThanOrEqual(16);
  expect(
    Math.abs(translateY(after.transform) - after.target),
  ).toBeLessThanOrEqual(1);
  expect(Math.abs(after.persisted - after.target)).toBeLessThanOrEqual(1);
});

test('reduced-motion refresh remains stable without the FX gate', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(750);

  await expect(page.locator('html')).not.toHaveAttribute('data-neon-fx', '');
  const probe = await readBrowserProbe(page);
  const cls =
    probe?.layoutShifts.reduce((sum, entry) => sum + entry.value, 0) ?? 1;
  expect(cls, JSON.stringify(probe?.layoutShifts ?? [], null, 2)).toBeLessThan(
    0.0005,
  );
});

test('an unresolved homepage navigation retains the current document', async ({
  page,
}) => {
  let releaseHomepage: () => void = () => undefined;
  const homepageGate = new Promise<void>((resolve) => {
    releaseHomepage = resolve;
  });
  let homepageRequestStarted = false;

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/' && url.searchParams.has('_rsc')) {
      homepageRequestStarted = true;
      await homepageGate;
    }
    await route.continue();
  });

  await page.goto('/the-lab');
  const click = page
    .getByRole('navigation', { name: 'Return' })
    .getByRole('link')
    .click();
  try {
    await expect.poll(() => homepageRequestStarted).toBe(true);
    await page.waitForTimeout(500);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'The Lab',
    );
    await expect(page.getByRole('progressbar')).toHaveCount(0);
  } finally {
    releaseHomepage();
  }
  await click;
  await expect(page).toHaveURL(/\/$/);
});
