import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertAwsContract } from '../src/modules/media/awsContract';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const contract = JSON.parse(
    await readFile(
      resolve(repositoryRoot, 'infra/external-media-contract.json'),
      'utf8',
    ),
  ) as unknown;

  assertAwsContract(contract);
  console.log('AWS structure contract is valid.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
