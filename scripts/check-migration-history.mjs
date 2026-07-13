import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function parseArguments(argv) {
  const result = { base: null, head: 'HEAD' };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value || (flag !== '--base' && flag !== '--head')) {
      throw new Error(
        'Usage: node scripts/check-migration-history.mjs [--base <git-revision>] [--head <git-revision>]',
      );
    }
    result[flag === '--base' ? 'base' : 'head'] = value;
  }
  if (!result.base && result.head !== 'HEAD') {
    throw new Error('--head requires --base.');
  }
  return result;
}

const { base, head } = parseArguments(process.argv.slice(2));
const lock = readFileSync('prisma/migrations/migration_lock.toml', 'utf8');
if (!/^provider = "postgresql"$/m.test(lock)) {
  throw new Error('migration_lock.toml must declare the PostgreSQL provider.');
}
const entries = readdirSync('prisma/migrations', { withFileTypes: true });
const directories = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (directories.length === 0) throw new Error('No Prisma migrations found.');
for (const directory of directories) {
  if (!/^\d{14}_[a-z0-9_]+$/.test(directory)) {
    throw new Error(`Invalid migration directory name: ${directory}`);
  }
  const files = readdirSync(`prisma/migrations/${directory}`).sort();
  if (files.length !== 1 || files[0] !== 'migration.sql') {
    throw new Error(
      `Migration ${directory} must contain exactly migration.sql.`,
    );
  }
}

if (base) {
  const baseMigrationNames = git([
    'ls-tree',
    '-rz',
    '--name-only',
    base,
    '--',
    'prisma/migrations',
  ])
    .split('\0')
    .filter(Boolean)
    .map(
      (path) =>
        path.match(/^prisma\/migrations\/([^/]+)\/migration\.sql$/)?.[1],
    )
    .filter(Boolean)
    .sort();
  const baseHead = baseMigrationNames.at(-1) ?? null;
  const changes = git([
    'diff',
    '--name-status',
    '-z',
    base,
    head,
    '--',
    'prisma/migrations',
  ])
    .split('\0')
    .filter(Boolean);
  const forbidden = [];
  const addedMigrationNames = new Set();
  for (let index = 0; index < changes.length; ) {
    const status = changes[index++];
    const pathCount = /^[RC]/.test(status) ? 2 : 1;
    const paths = changes.slice(index, index + pathCount);
    index += pathCount;
    if (status !== 'A') {
      forbidden.push(`${status}\t${paths.join(' -> ')}`);
      continue;
    }
    for (const path of paths) {
      const name = path.match(
        /^prisma\/migrations\/([^/]+)\/migration\.sql$/,
      )?.[1];
      if (name) addedMigrationNames.add(name);
    }
  }
  if (forbidden.length > 0) {
    throw new Error(
      `Applied migration history is append-only:\n${forbidden.join('\n')}`,
    );
  }
  if (baseHead && [...addedMigrationNames].some((name) => name <= baseHead)) {
    throw new Error(
      `New migrations must sort after the existing migration head: ${baseHead}`,
    );
  }
}

console.log(
  `Migration history check passed (${directories.length} migration(s)).`,
);
