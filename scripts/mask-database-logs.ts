import { parseDatabaseTarget } from './database-target';

function main() {
  const raw = process.env.POSTGRES_URL_NON_POOLING;
  if (!raw) throw new Error('POSTGRES_URL_NON_POOLING is required.');

  const target = parseDatabaseTarget(raw, { allowDefaultPort: true });
  const values = new Set([
    target.databaseName,
    target.hostname,
    target.username,
  ]);

  for (const value of values) {
    if (!value || /[\r\n]/.test(value)) {
      throw new Error('Database log mask contains an invalid value.');
    }
    console.log(`::add-mask::${value}`);
  }
  console.log('Database log identity masking configured.');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
