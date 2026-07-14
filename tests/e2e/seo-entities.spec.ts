import { expect, test } from '@playwright/test';

import { seoConfig } from '../../src/lib/seo';

test('homepage publishes one connected person profile graph', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-chromium',
    'Structured identity output is viewport-independent.',
  );

  await page.goto('/');
  await expect(page).toHaveTitle('DeJay Vu');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    'DeJay Vu',
  );
  await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute(
    'content',
    'DeJay Vu',
  );
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(
    'Junhao Zhang (Jay) — Machine Learning & HPC Engineer',
  );
  await expect(page.locator('#about')).toContainText(
    'I’m Junhao Zhang—Jay for short—a Machine Learning Software Engineer',
  );

  const scripts = page.locator('script[type="application/ld+json"]');
  await expect(scripts).toHaveCount(1);
  const jsonLd = await scripts.textContent();
  expect(jsonLd).toBeTruthy();
  const document = JSON.parse(jsonLd!);
  expect(document['@context']).toBe('https://schema.org');
  expect(Array.isArray(document['@graph'])).toBe(true);

  const byType = (type: string) => {
    const node = document['@graph'].find(
      (candidate: Record<string, unknown>) => candidate['@type'] === type,
    );
    expect(node, type).toBeTruthy();
    return node;
  };
  const person = byType('Person');
  const profile = byType('ProfilePage');
  const website = byType('WebSite');

  expect(profile.mainEntity['@id']).toBe(person['@id']);
  expect(person.mainEntityOfPage['@id']).toBe(profile['@id']);
  expect(website.publisher['@id']).toBe(person['@id']);
  expect(person.sameAs).toEqual(seoConfig.sameAs);
  expect(person).not.toHaveProperty('email');
  expect(website.alternateName).toEqual(['DeJay Vu', 'DeJayVu', 'dejayvu']);
});
