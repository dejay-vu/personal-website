import type { Page } from '@playwright/test';
import sharp from 'sharp';

const TEST_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAHgQCAcpD8WAAAAAASUVORK5CYII=',
  'base64',
);

export async function installMediaRoute(page: Page) {
  await page.route('**/monitoring**', (route) => route.abort());
  await page.route('**/e2e-media/**', async (route) => {
    await route.fulfill({
      body: TEST_IMAGE,
      contentType: 'image/png',
      status: 200,
    });
  });
}

export async function installBrowserProbe(page: Page) {
  await page.addInitScript(() => {
    type Rect = {
      bottom: number;
      height: number;
      left: number;
      right: number;
      top: number;
      width: number;
      x: number;
      y: number;
    };
    type RectSample = {
      backgroundTransform: string | null;
      hero: Rect | null;
      hud: Rect | null;
      scrollY: number;
      time: number;
    };
    type Probe = {
      intersectionRootMargins: string[];
      layoutShifts: Array<{ sources: string[]; value: number }>;
      rects: RectSample[];
      resources: Array<{
        initiatorType: string;
        name: string;
        startTime: number;
      }>;
      routePushes: string[];
    };
    type ProbeWindow = Window & { __e2eProbe?: Probe };

    const probe: Probe = {
      intersectionRootMargins: [],
      layoutShifts: [],
      rects: [],
      resources: [],
      routePushes: [],
    };
    (window as ProbeWindow).__e2eProbe = probe;

    const nativePushState = history.pushState.bind(history);
    history.pushState = (data, unused, url) => {
      probe.routePushes.push(url?.toString() ?? location.href);
      return nativePushState(data, unused, url);
    };

    const NativeIntersectionObserver = window.IntersectionObserver;
    window.IntersectionObserver = class extends NativeIntersectionObserver {
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        probe.intersectionRootMargins.push(options?.rootMargin ?? '0px');
        super(callback, options);
      }
    };

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            hadRecentInput?: boolean;
            sources?: Array<{ node?: Node }>;
            value?: number;
          };
          if (shift.hadRecentInput || !shift.value) continue;
          probe.layoutShifts.push({
            sources: (shift.sources ?? []).map(({ node }) => {
              if (!(node instanceof Element)) return 'unknown';
              return (
                node.getAttribute('aria-label') ||
                node.id ||
                `${node.tagName}.${Array.from(node.classList).join('.')}`
              );
            }),
            value: shift.value,
          });
        }
      });
      observer.observe({ buffered: true, type: 'layout-shift' });
    } catch {
      // LayoutShift is unavailable in a minority of browser builds.
    }

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
          probe.resources.push({
            initiatorType: entry.initiatorType,
            name: entry.name,
            startTime: entry.startTime,
          });
        }
      });
      observer.observe({ buffered: true, type: 'resource' });
    } catch {
      // Resource timing is optional in embedded browser environments.
    }

    const started = performance.now();
    const sample = () => {
      const hud = document.querySelector<HTMLElement>(
        'nav[aria-label="Sections"]',
      );
      const hero = document.querySelector<HTMLElement>(
        '[aria-label="DeJayVu"]',
      );
      const background = document.querySelector<HTMLElement>(
        'div[class*="bgImage"]',
      );
      probe.rects.push({
        backgroundTransform: background
          ? getComputedStyle(background).transform
          : null,
        hero: hero?.getBoundingClientRect().toJSON() ?? null,
        hud: hud?.getBoundingClientRect().toJSON() ?? null,
        scrollY: window.scrollY,
        time: performance.now(),
      });
      if (performance.now() - started < 5_000) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

export async function readBrowserProbe(page: Page) {
  return page.evaluate(() => {
    type Rect = {
      bottom: number;
      height: number;
      left: number;
      right: number;
      top: number;
      width: number;
      x: number;
      y: number;
    };
    type ProbeWindow = Window & {
      __e2eProbe?: {
        intersectionRootMargins: string[];
        layoutShifts: Array<{ sources: string[]; value: number }>;
        rects: Array<{
          backgroundTransform: string | null;
          hero: Rect | null;
          hud: Rect | null;
          scrollY: number;
          time: number;
        }>;
        resources: Array<{
          initiatorType: string;
          name: string;
          startTime: number;
        }>;
        routePushes: string[];
      };
    };
    return (window as ProbeWindow).__e2eProbe;
  });
}

export async function startScreencast(page: Page) {
  type ScreencastFrame = {
    data: Buffer;
    timestamp: number;
    viewportHeight: number;
    viewportWidth: number;
  };

  const frames: ScreencastFrame[] = [];
  let resolveFirstFrame: ((frame: ScreencastFrame) => void) | undefined;
  const firstFrame = new Promise<ScreencastFrame>((resolve) => {
    resolveFirstFrame = resolve;
  });
  // The public API multiplexes safely with Playwright's trace screencast.
  await page.screencast.start({
    onFrame: (frame) => {
      frames.push(frame);
      resolveFirstFrame?.(frame);
      resolveFirstFrame = undefined;
    },
  });
  const stableBefore = await firstFrame;
  frames.length = 0;

  return {
    stableBefore,
    stop: async () => {
      await page.screencast.stop();
      return frames;
    },
  };
}

export async function downsampleRGB(
  image: Buffer,
  width: number,
  height: number,
) {
  return sharp(image)
    .resize(width, height, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();
}

export function intermediatePixelRatio(
  frame: Buffer,
  before: Buffer,
  after: Buffer,
  threshold = 8,
) {
  let affected = 0;
  const pixels = frame.length / 3;
  for (let index = 0; index < frame.length; index += 3) {
    const beforeDifference =
      (Math.abs(frame[index] - before[index]) +
        Math.abs(frame[index + 1] - before[index + 1]) +
        Math.abs(frame[index + 2] - before[index + 2])) /
      3;
    const afterDifference =
      (Math.abs(frame[index] - after[index]) +
        Math.abs(frame[index + 1] - after[index + 1]) +
        Math.abs(frame[index + 2] - after[index + 2])) /
      3;
    if (beforeDifference >= threshold && afterDifference >= threshold) {
      affected += 1;
    }
  }
  return affected / pixels;
}
