import { expect, test } from '@playwright/test';

import { installMediaRoute } from './support/browser';

const DETAIL_CASES = [
  {
    alignEdges: true,
    anchorSelector: '[data-note-content]',
    label: 'Field Notes',
    path: '/field-notes/e2e-note-01',
  },
  {
    alignEdges: true,
    anchorSelector: '[data-photo-detail-content]',
    label: 'Darkroom',
    path: '/darkroom/landscape-full-exif',
  },
  {
    alignEdges: true,
    anchorSelector: '[data-project-title]',
    label: 'The Lab',
    path: '/the-lab/slurmdeck',
  },
] as const;

test.beforeEach(async ({ page }) => {
  await installMediaRoute(page);
});

async function readBreadcrumbGeometry(
  page: import('@playwright/test').Page,
  anchorSelector: string,
) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  return page.evaluate((selector) => {
    const breadcrumb =
      document.querySelector<HTMLElement>('[data-breadcrumbs]');
    const list = breadcrumb?.querySelector<HTMLOListElement>('ol');
    const anchor = document.querySelector<HTMLElement>(selector);
    if (!breadcrumb || !list || !anchor) {
      throw new Error(`Missing breadcrumb layout anchor: ${selector}`);
    }

    const toRect = (element: HTMLElement) => {
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        width: bounds.width,
      };
    };

    return {
      anchor: toRect(anchor),
      breadcrumb: toRect(breadcrumb),
      breadcrumbOverflow: breadcrumb.scrollWidth - breadcrumb.clientWidth,
      lineHeight: Number.parseFloat(getComputedStyle(list).lineHeight),
      listHeight: list.getBoundingClientRect().height,
      listOverflow: list.scrollWidth - list.clientWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  }, anchorSelector);
}

function center({ left, right }: { left: number; right: number }) {
  return (left + right) / 2;
}

test('desktop detail breadcrumbs share the 3xl content axis', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-chromium',
    'Desktop content-column geometry is covered by the desktop browser.',
  );

  for (const detail of DETAIL_CASES) {
    await test.step(detail.label, async () => {
      await page.goto(detail.path);
      const breadcrumb = page.getByRole('navigation', {
        name: 'Breadcrumb',
      });
      await expect(breadcrumb).toBeVisible();
      await expect(breadcrumb.locator('[aria-current="page"]')).toHaveCount(1);

      const geometry = await readBreadcrumbGeometry(
        page,
        detail.anchorSelector,
      );
      expect(Math.abs(geometry.breadcrumb.width - 768)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(center(geometry.breadcrumb) - center(geometry.anchor)),
      ).toBeLessThanOrEqual(1);

      if (detail.alignEdges) {
        expect(
          Math.abs(geometry.breadcrumb.left - geometry.anchor.left),
        ).toBeLessThanOrEqual(2);
        expect(
          Math.abs(geometry.breadcrumb.right - geometry.anchor.right),
        ).toBeLessThanOrEqual(2);
      }
    });
  }
});

test('mobile detail breadcrumbs wrap without horizontal overflow', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'mobile-chromium',
    'Mobile wrapping is covered by the mobile browser.',
  );
  await page.setViewportSize({ height: 844, width: 320 });

  for (const detail of DETAIL_CASES) {
    await test.step(detail.label, async () => {
      await page.goto(detail.path);
      const breadcrumb = page.getByRole('navigation', {
        name: 'Breadcrumb',
      });
      await expect(breadcrumb).toBeVisible();
      await expect(breadcrumb.locator('[aria-current="page"]')).toHaveCount(1);

      const geometry = await readBreadcrumbGeometry(
        page,
        detail.anchorSelector,
      );
      expect(
        Math.abs(geometry.breadcrumb.left - geometry.anchor.left),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(geometry.breadcrumb.right - geometry.anchor.right),
      ).toBeLessThanOrEqual(1);
      expect(geometry.breadcrumb.left).toBeGreaterThanOrEqual(0);
      expect(geometry.breadcrumb.right).toBeLessThanOrEqual(
        geometry.viewportWidth,
      );
      expect(geometry.breadcrumbOverflow).toBeLessThanOrEqual(1);
      expect(geometry.listOverflow).toBeLessThanOrEqual(1);

      if (detail.label === 'Field Notes') {
        expect(geometry.listHeight).toBeGreaterThan(geometry.lineHeight + 1);
      }
    });
  }
});
