import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

async function main() {
  // Next's persistent data cache can outlive a production build and retain
  // pages read from a different database. E2E preparation has already passed
  // the destructive test-DB guard and seeded its fixture at this point, so the
  // browser build must start without any prior route/data artifacts.
  await rm(resolve(process.cwd(), '.next'), {
    force: true,
    recursive: true,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
