import assert from 'node:assert/strict';
import test from 'node:test';

import { existsUnlessConfirmedMissing } from '../../src/lib/existenceCheck';

test('a lookup inside the budget decides the answer', async () => {
  assert.equal(
    await existsUnlessConfirmedMissing(async () => false, { budgetMs: 50 }),
    false,
  );
  assert.equal(
    await existsUnlessConfirmedMissing(async () => true, { budgetMs: 50 }),
    true,
  );
});

test('a lookup past the budget lets the page decide', async () => {
  const startedAt = Date.now();
  const exists = await existsUnlessConfirmedMissing(
    () => new Promise<boolean>(() => undefined),
    { budgetMs: 10 },
  );

  assert.equal(exists, true);
  assert.ok(Date.now() - startedAt < 1_000);
});

test('a failed lookup lets the page decide and reports the error', async () => {
  const failure = new Error('database unavailable');
  const logged: unknown[] = [];
  const exists = await existsUnlessConfirmedMissing(
    async () => {
      throw failure;
    },
    {
      budgetMs: 50,
      logError: (_message, error) => logged.push(error),
    },
  );

  assert.equal(exists, true);
  assert.deepEqual(logged, [failure]);
});

test('a failure after the budget is still reported, never unhandled', async () => {
  const failure = new Error('database unavailable');
  const logged: unknown[] = [];
  const exists = await existsUnlessConfirmedMissing(
    () =>
      new Promise<boolean>((_resolve, reject) => {
        setTimeout(() => reject(failure), 20);
      }),
    {
      budgetMs: 1,
      logError: (_message, error) => logged.push(error),
    },
  );

  assert.equal(exists, true);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(logged, [failure]);
});
