import { expect, test } from '@playwright/test';

import { installMediaRoute } from './support/browser';

type CanvasKind = 'far' | 'fx' | 'near' | 'other';

type MobileRuntimeProbe = {
  canvas: Record<
    CanvasKind,
    { clearRect: number; drawImage: number; stroke: number }
  >;
  scrollToCalls: Array<{ top: number | null }>;
};

async function installMobileRuntimeProbe(
  page: import('@playwright/test').Page,
) {
  await page.addInitScript(() => {
    type Kind = 'far' | 'fx' | 'near' | 'other';
    type Probe = {
      canvas: Record<
        Kind,
        { clearRect: number; drawImage: number; stroke: number }
      >;
      scrollToCalls: Array<{ top: number | null }>;
    };
    type ProbeWindow = Window & { __mobileRuntimeProbe?: Probe };

    const blank = () => ({ clearRect: 0, drawImage: 0, stroke: 0 });
    const probe: Probe = {
      canvas: {
        far: blank(),
        fx: blank(),
        near: blank(),
        other: blank(),
      },
      scrollToCalls: [],
    };
    (window as ProbeWindow).__mobileRuntimeProbe = probe;

    const kindOf = (context: CanvasRenderingContext2D): Kind => {
      const canvasClass =
        typeof context.canvas.className === 'string'
          ? context.canvas.className
          : '';
      const parentClass = context.canvas.parentElement?.className;
      if (canvasClass.includes('rainFar')) return 'far';
      if (canvasClass.includes('rainNear')) return 'near';
      if (typeof parentClass === 'string' && parentClass.includes('fx')) {
        return 'fx';
      }
      return 'other';
    };

    const prototype = CanvasRenderingContext2D.prototype;
    for (const method of ['clearRect', 'drawImage', 'stroke'] as const) {
      const nativeMethod = prototype[method];
      Object.defineProperty(prototype, method, {
        configurable: true,
        value: function (this: CanvasRenderingContext2D, ...args: unknown[]) {
          probe.canvas[kindOf(this)][method] += 1;
          return Reflect.apply(nativeMethod, this, args);
        },
        writable: true,
      });
    }

    const nativeScrollTo = window.scrollTo.bind(window);
    window.scrollTo = ((first?: number | ScrollToOptions, second?: number) => {
      probe.scrollToCalls.push({
        top:
          typeof first === 'object'
            ? typeof first.top === 'number'
              ? first.top
              : null
            : typeof second === 'number'
              ? second
              : null,
      });
      if (typeof first === 'object') {
        nativeScrollTo(first);
      } else {
        nativeScrollTo(first ?? 0, second ?? 0);
      }
    }) as typeof window.scrollTo;
  });
}

async function readProbe(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    type Kind = 'far' | 'fx' | 'near' | 'other';
    type ProbeWindow = Window & {
      __mobileRuntimeProbe?: {
        canvas: Record<
          Kind,
          { clearRect: number; drawImage: number; stroke: number }
        >;
        scrollToCalls: Array<{ top: number | null }>;
      };
    };
    return (window as ProbeWindow).__mobileRuntimeProbe;
  });
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'mobile-chromium',
    'This suite measures the touch/mobile runtime contract.',
  );
  await installMediaRoute(page);
  await installMobileRuntimeProbe(page);
});

test('mobile keeps only one low-resolution, frame-capped rain layer', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveAttribute('data-neon-fx', '');
  await expect(page.locator('div[class*="fx"] canvas')).toHaveCount(0);
  const background = await page
    .locator('div[class*="bgImage"]')
    .evaluate((node) => ({
      filter: getComputedStyle(node).filter,
      transform: getComputedStyle(node).transform,
    }));
  expect(background.filter).toContain('blur(7px)');
  expect(background.transform).toBe('none');

  const before = await readProbe(page);
  expect(before).toBeTruthy();
  await page.waitForTimeout(2_500);
  const after = await readProbe(page);
  expect(after).toBeTruthy();

  const farStrokes = after!.canvas.far.stroke - before!.canvas.far.stroke;
  const farFrames = after!.canvas.far.clearRect - before!.canvas.far.clearRect;
  expect(farStrokes).toBeGreaterThan(0);
  expect(farStrokes).toBeLessThan(5_000);
  expect(farFrames).toBeGreaterThan(0);
  expect(farFrames).toBeLessThanOrEqual(75);
  expect(after!.canvas.near.stroke - before!.canvas.near.stroke).toBe(0);
  expect(after!.canvas.fx.drawImage - before!.canvas.fx.drawImage).toBe(0);

  const backingStore = await page
    .locator('canvas[class*="rainFar"]')
    .evaluate((canvas: HTMLCanvasElement) => ({
      height: canvas.height,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      width: canvas.width,
    }));
  expect(backingStore.width).toBeLessThanOrEqual(backingStore.viewportWidth);
  expect(backingStore.height).toBeLessThanOrEqual(backingStore.viewportHeight);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  const beforeReduce = await readProbe(page);
  await page.waitForTimeout(300);
  const afterReduce = await readProbe(page);
  expect(afterReduce!.canvas.far.stroke).toBe(beforeReduce!.canvas.far.stroke);
});

test('mobile viewport changes cannot refresh the page back to the top', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => window.scrollTo(0, 1_400));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1_400);
  await page.evaluate(() => {
    const probe = (
      window as Window & {
        __mobileRuntimeProbe?: MobileRuntimeProbe;
      }
    ).__mobileRuntimeProbe;
    if (probe) probe.scrollToCalls.length = 0;
  });

  for (const height of [780, 844, 760, 844]) {
    await page.setViewportSize({ width: 390, height });
    await page.waitForTimeout(220);
    expect(await page.evaluate(() => window.scrollY)).toBe(1_400);
  }

  const probe = await readProbe(page);
  expect(probe?.scrollToCalls.filter(({ top }) => top !== null)).toEqual([]);

  const oldGateHotspot = await page.evaluate(() => {
    const hit = document.elementFromPoint(330, 66);
    return {
      inHud: Boolean(hit?.closest('nav[aria-label="Sections"]')),
      tagName: hit?.tagName ?? null,
    };
  });
  expect(oldGateHotspot.inHud).toBe(false);
  await page.touchscreen.tap(330, 66);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.scrollY)).toBe(1_400);
  expect(new URL(page.url()).hash).not.toBe('#home');
});

test('mobile titles stay in flow and the fixed HUD has no layout or hit region', async ({
  page,
}) => {
  await page.goto('/');

  const hud = page.locator('nav[aria-label="Sections"]');
  await expect(hud).toHaveCount(1);
  await expect(hud).toBeHidden();
  expect(await hud.boundingBox()).toBeNull();
  for (const link of await hud.locator('a[data-navlink]').all()) {
    await expect(link).toBeHidden();
    expect(
      await link.evaluate((node) => {
        node.focus();
        return document.activeElement === node;
      }),
    ).toBe(false);
  }

  await expect(page.locator('div[class*="fx"] canvas')).toHaveCount(0);
  for (const pin of await page.locator('[data-pin-inner]').all()) {
    expect(await pin.evaluate((node) => getComputedStyle(node).transform)).toBe(
      'none',
    );
  }

  const sectionGaps = async () =>
    page.evaluate(() =>
      ['about', 'timeline', 'contact'].map((id) => {
        const section = document.getElementById(id);
        const title = section?.querySelector<HTMLElement>('[data-sign]');
        const content = section?.querySelector<HTMLElement>('[data-holo-at]');
        if (!title || !content) throw new Error(`${id} geometry unavailable`);
        const titleRect = title.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();
        return {
          gap: contentRect.top - titleRect.bottom,
          titleOpacity: Number(getComputedStyle(title).opacity),
          userSelect: getComputedStyle(title).userSelect,
        };
      }),
    );
  const firstGaps = await sectionGaps();
  for (const y of [700, 1_400, 2_200]) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    const currentGaps = await sectionGaps();
    for (const [index, current] of currentGaps.entries()) {
      expect(Math.abs(current.gap - firstGaps[index].gap)).toBeLessThanOrEqual(
        1,
      );
      expect(current.titleOpacity).toBeGreaterThan(0);
      expect(current.userSelect).not.toBe('none');
    }
  }

  const outerGaps = await page.evaluate(() => {
    const aboutContent = document.querySelector<HTMLElement>(
      '#about [data-holo-at]',
    );
    const timelineTitle = document.querySelector<HTMLElement>(
      '#timeline [data-sign]',
    );
    const timelineRows = document.querySelectorAll<HTMLElement>(
      '#timeline [data-holo-at]',
    );
    const terms = document.querySelectorAll<HTMLElement>('[data-term]');
    const notesTitle = terms[0]?.querySelector<HTMLElement>('[data-vname]');
    const labPreview = terms[2]?.querySelector<HTMLElement>(
      '[data-term-preview]',
    );
    const contactTitle = document.querySelector<HTMLElement>(
      '#contact [data-sign]',
    );
    const timelineContent = timelineRows[timelineRows.length - 1];
    if (
      !aboutContent ||
      !timelineTitle ||
      !timelineContent ||
      !notesTitle ||
      !labPreview ||
      !contactTitle
    ) {
      throw new Error('Projection-run outer geometry unavailable');
    }

    return [
      timelineTitle.getBoundingClientRect().top -
        aboutContent.getBoundingClientRect().bottom,
      notesTitle.getBoundingClientRect().top -
        timelineContent.getBoundingClientRect().bottom,
      contactTitle.getBoundingClientRect().top -
        labPreview.getBoundingClientRect().bottom,
    ];
  });
  for (const gap of outerGaps.slice(1)) {
    expect(Math.abs(gap - outerGaps[0])).toBeLessThanOrEqual(1);
  }

  await page.locator('#street').scrollIntoViewIfNeeded();
  for (const term of await page.locator('[data-term]').all()) {
    const rows = await term.evaluate((node) => {
      const name = node.querySelector<HTMLElement>('[data-vname]');
      const cta = node.querySelector<HTMLElement>('[data-term-cta]');
      const preview = node.querySelector<HTMLElement>('[data-term-preview]');
      if (!name || !cta || !preview) {
        throw new Error('Venue row geometry unavailable');
      }
      const nameRect = name.getBoundingClientRect();
      const ctaRect = cta.getBoundingClientRect();
      const previewRect = preview.getBoundingClientRect();
      return {
        ctaDisplay: getComputedStyle(cta).display,
        ctaHeight: ctaRect.height,
        ctaWidth: ctaRect.width,
        gridRows: getComputedStyle(node).gridTemplateRows.split(' ').length,
        nameBottom: nameRect.bottom,
        previewTop: previewRect.top,
      };
    });
    expect(rows.ctaDisplay).toBe('none');
    expect(rows.ctaHeight).toBe(0);
    expect(rows.ctaWidth).toBe(0);
    expect(rows.gridRows).toBe(2);
    expect(rows.previewTop).toBeGreaterThanOrEqual(rows.nameBottom);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);

  await page.evaluate(() => document.getElementById('home')?.scrollIntoView());
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(16);
});
