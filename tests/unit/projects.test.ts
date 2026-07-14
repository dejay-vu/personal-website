import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  getPublishedProjectBySlug,
  getPublishedProjectSitemapEntries,
  getPublishedProjects,
  getPublishedProjectsCount,
} from '../../src/modules/projects/read';
import { projectMetaLine } from '../../src/modules/projects/types';

test('exposes published projects through the read seam', async () => {
  const projects = await getPublishedProjects();
  const count = await getPublishedProjectsCount();

  assert.ok(projects.length >= 1);
  assert.equal(count, projects.length);
  assert.equal(projects[0].slug, 'slurmdeck');
  assert.ok(projects.every((project) => project.published));
  // List reads must not leak detail-only fields.
  assert.ok(projects.every((project) => !('workflow' in project)));

  const detail = await getPublishedProjectBySlug('slurmdeck');
  assert.ok(detail);
  assert.equal(detail.workflow.length, 5);
  assert.equal(detail.features.length, 3);
  assert.ok(detail.overview.length >= 1);
  assert.ok(detail.installCommand.length > 0);
  assert.equal(projectMetaLine(detail), 'PYTHON · CLI + TUI · V0.1.0 · MIT');

  assert.equal(await getPublishedProjectBySlug('definitely-missing'), null);

  const sitemapEntries = await getPublishedProjectSitemapEntries();
  assert.deepEqual(
    sitemapEntries.map(({ slug }) => slug),
    projects.map(({ slug }) => slug),
  );
  assert.ok(
    sitemapEntries.every(
      (entry) =>
        entry.publishedAt instanceof Date && entry.updatedAt instanceof Date,
    ),
  );
});

test('project data keeps unique slugs and checked-in screenshots', async () => {
  const projects = await getPublishedProjects();
  const slugs = projects.map(({ slug }) => slug);

  assert.equal(new Set(slugs).size, slugs.length);

  for (const project of projects) {
    assert.match(project.screenshot.src, /^\/assets\//);
    assert.ok(
      existsSync(`public${project.screenshot.src}`),
      `screenshot asset missing: public${project.screenshot.src}`,
    );
  }
});

test('the TUI capture stays sanitized of external font fetches', () => {
  const svg = readFileSync('public/assets/slurmdeck-tui.svg', 'utf8');

  // SVG-as-<img> cannot fetch external resources and CSP would block them;
  // the capture must rely on local()/monospace fallbacks only.
  assert.doesNotMatch(svg, /url\(\s*['"]?https?:/);
  assert.match(svg, /local\(/);
});

test('keeps client project type imports on the lightweight types seam', () => {
  const clientFiles = [
    'src/components/home/NeonJunction.tsx',
    'src/components/home/NeonLanding.tsx',
  ];
  const barrelImports = clientFiles.filter((file) =>
    /import type .* from ['"]@\/modules\/projects['"]/.test(
      readFileSync(file, 'utf8'),
    ),
  );

  assert.deepEqual(
    barrelImports,
    [],
    'Client components must import project types from @/modules/projects/types',
  );
});

test('routes consume projects through the read API, never the data file', () => {
  const routeFiles = [
    'src/app/page.tsx',
    'src/app/sitemap.ts',
    'src/app/the-lab/page.tsx',
    'src/app/the-lab/[projectSlug]/page.tsx',
  ];

  for (const file of routeFiles) {
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /modules\/projects\/data/,
      `${file} must not import the projects data file directly`,
    );
  }

  // Static data means every slug is known at build time; unknown slugs must
  // 404 at the router instead of rendering.
  assert.match(
    readFileSync('src/app/the-lab/[projectSlug]/page.tsx', 'utf8'),
    /export const dynamicParams = false/,
  );
});
