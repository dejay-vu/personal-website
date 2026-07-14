import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';

import {
  type BreadcrumbItem,
  absoluteUrl,
  createBreadcrumbListJsonLd,
  createHomeJsonLd,
  createSoftwareSourceCodeJsonLd,
  seoConfig,
} from '../../src/lib/seo';
import { getPublishedProjectBySlug } from '../../src/modules/projects/read';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as JsonObject;
}

test('homepage identity graph stays connected and unambiguous', () => {
  const document = createHomeJsonLd();
  assert.equal(document['@context'], 'https://schema.org');

  const graph = document['@graph'].map(asObject);
  const byType = (type: string) => {
    const node = graph.find((candidate) => candidate['@type'] === type);
    assert.ok(node, `${type} must exist in the homepage graph`);
    return node;
  };
  const person = byType('Person');
  const profile = byType('ProfilePage');
  const website = byType('WebSite');
  const ids = graph.map((node) => node['@id']);

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(person['@id'], absoluteUrl('/#person'));
  assert.equal(profile['@id'], absoluteUrl('/#profile-page'));
  assert.equal(website['@id'], absoluteUrl('/#website'));
  assert.equal(asObject(profile.mainEntity)['@id'], person['@id']);
  assert.equal(asObject(person.mainEntityOfPage)['@id'], profile['@id']);
  assert.equal(asObject(website.publisher)['@id'], person['@id']);

  assert.equal(person.name, 'Junhao Zhang');
  assert.deepEqual(person.alternateName, ['Jay']);
  assert.equal(profile.name, 'Junhao Zhang (Jay)');
  assert.equal(asObject(person.affiliation).name, 'University of Oxford');
  assert.equal('email' in person, false);
  assert.equal(website.name, 'DeJay Vu');
  assert.deepEqual(website.alternateName, ['DeJay Vu', 'DeJayVu', 'dejayvu']);
});

test('sameAs is a valid HTTPS identity set', () => {
  const sameAs = new Set<string>(seoConfig.sameAs);
  assert.equal(sameAs.size, seoConfig.sameAs.length);

  for (const value of seoConfig.sameAs) {
    const url = new URL(value);
    assert.equal(url.protocol, 'https:', value);
    assert.equal(url.href.includes(' '), false, value);
  }

  for (const required of [
    'https://www.facebook.com/dejayyvu/',
    'https://github.com/dejay-vu',
    'https://www.linkedin.com/in/junhao-zh',
    'https://eng.ox.ac.uk/people/junhao-zhang',
    'https://orcid.org/0009-0003-7918-3208',
    'https://openreview.net/profile?id=~Junhao_Zhang10',
  ]) {
    assert.ok(sameAs.has(required), required);
  }

  const person = createHomeJsonLd()['@graph'].find(
    (node) => node['@type'] === 'Person',
  );
  assert.ok(person);
  assert.deepEqual(asObject(person).sameAs, seoConfig.sameAs);
});

test('breadcrumb JSON-LD keeps visible labels on canonical absolute URLs', () => {
  const cases: readonly (readonly BreadcrumbItem[])[] = [
    [
      { href: '/', label: 'Home' },
      { href: '/field-notes', label: 'Field Notes' },
      { href: '/field-notes/example', label: 'Example Note' },
    ],
    [
      { href: '/', label: 'Home' },
      { href: '/darkroom', label: 'Darkroom' },
      { href: '/darkroom/example', label: 'Example Photo' },
    ],
    [
      { href: '/', label: 'Home' },
      { href: '/the-lab', label: 'The Lab' },
      { href: '/the-lab/slurmdeck', label: 'SlurmDeck' },
    ],
  ];

  for (const items of cases) {
    const breadcrumb = createBreadcrumbListJsonLd(items);
    assert.equal(breadcrumb['@type'], 'BreadcrumbList');
    assert.deepEqual(
      breadcrumb.itemListElement,
      items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.label,
        item: absoluteUrl(item.href),
      })),
    );
  }
});

test('SlurmDeck exposes a complete software entity and raster social image', async () => {
  const project = await getPublishedProjectBySlug('slurmdeck');
  assert.ok(project);
  const schema = createSoftwareSourceCodeJsonLd({
    project,
    url: absoluteUrl('/the-lab/slurmdeck'),
  });
  const product = schema.targetProduct;

  assert.equal(
    project.seoTitle,
    'SlurmDeck — Slurm CLI & TUI over SSH | DeJay Vu',
  );
  assert.equal(schema.softwareVersion, '0.1.0');
  assert.equal(schema.operatingSystem, 'POSIX');
  assert.equal(schema.downloadUrl, 'https://pypi.org/project/slurmdeck/');
  assert.equal(schema.codeRepository, 'https://github.com/dejay-vu/slurmdeck');
  assert.equal(schema.author['@type'], 'Person');
  assert.equal(schema.author.url, absoluteUrl('/#person'));
  assert.equal(product.softwareVersion, project.version);
  assert.equal(product.operatingSystem, project.operatingSystem);
  assert.deepEqual(product.offers, {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  });
  assert.equal(schema.screenshot['@type'], 'ImageObject');
  assert.equal(
    schema.screenshot.contentUrl,
    absoluteUrl(project.screenshot.src),
  );

  const metadata = await sharp(`public${project.ogImage.src}`).metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 630);
  assert.notEqual(project.ogImage.src, project.screenshot.src);
});
