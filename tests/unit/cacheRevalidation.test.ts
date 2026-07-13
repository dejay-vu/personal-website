import assert from 'node:assert/strict';
import test from 'node:test';

import { runCacheRevalidation } from '../../src/lib/cacheRevalidation';

test('cache revalidation only suppresses the missing request-store invariant', () => {
  assert.doesNotThrow(() =>
    runCacheRevalidation(() => {
      throw new Error('Invariant: static generation store missing');
    }),
  );

  assert.throws(
    () =>
      runCacheRevalidation(() => {
        throw new Error('Cache backend unavailable');
      }),
    /Cache backend unavailable/,
  );
});
