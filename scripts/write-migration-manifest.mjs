import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const migrationsRoot = 'prisma/migrations';
const outputPath =
  process.env.MIGRATION_MANIFEST_PATH ?? 'migration-manifests/migrations.json';

const entries = await readdir(migrationsRoot, { withFileTypes: true });
const names = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const migrations = [];
for (const name of names) {
  const bytes = await readFile(join(migrationsRoot, name, 'migration.sql'));
  migrations.push({
    name,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}

if (migrations.length === 0) {
  throw new Error('No committed Prisma migrations were found.');
}

const manifest = {
  generatedAt: new Date().toISOString(),
  gitSha: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  head: migrations.at(-1).name,
  migrations,
  version: 1,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote migration manifest to ${outputPath}.`);
