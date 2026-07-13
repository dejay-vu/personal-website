import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function runPrewarm(...args: string[]) {
  return spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/prewarm-media-variants.ts', ...args],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        DATABASE_URL: 'postgres://ci:ci@127.0.0.1:1/ci',
        NODE_ENV: 'test',
        PATH: process.env.PATH,
        POSTGRES_URL_NON_POOLING: 'postgres://ci:ci@127.0.0.1:1/ci',
      },
      timeout: 5_000,
    },
  );
}

function outputOf(result: ReturnType<typeof runPrewarm>) {
  return `${result.stdout}${result.stderr}`;
}

test('rejects conflicting prewarm modes before database or network access', () => {
  const result = runPrewarm('--apply', '--dry-run');
  const output = outputOf(result);

  assert.notEqual(result.status, 0);
  assert.match(output, /Cannot combine --apply and --dry-run/);
  assert.doesNotMatch(output, /ECONNREFUSED|Prewarming|Dry run:/);
});

test('rejects unknown prewarm flags before database or network access', () => {
  const result = runPrewarm('--network');
  const output = outputOf(result);

  assert.notEqual(result.status, 0);
  assert.match(output, /Unknown prewarm option: --network/);
  assert.doesNotMatch(output, /ECONNREFUSED|Prewarming|Dry run:/);
});
