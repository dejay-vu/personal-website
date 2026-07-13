import { NextRequest } from 'next/server';

import assert from 'node:assert/strict';
import test from 'node:test';

import prisma from '../../src/lib/prisma';
import { proxy } from '../../src/proxy';
import { resetDatabase, seedNote } from './helpers';

test.beforeEach(resetDatabase);
test.after(() => prisma.$disconnect());

test('returns a hard 404 before missing public items can stream', async () => {
  for (const path of ['/field-notes/missing-note', '/darkroom/missing-photo']) {
    const response = await proxy(new NextRequest(`http://localhost${path}`));

    assert.equal(response.status, 404);
    assert.match(
      response.headers.get('x-middleware-rewrite') ?? '',
      /\/_not-found$/,
    );
  }
});

test('allows a published item slug to continue to its page', async () => {
  await seedNote({ content: '# Existing', slug: 'existing-note' });

  const response = await proxy(
    new NextRequest('http://localhost/field-notes/existing-note'),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-middleware-next'), '1');
});
