import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildReleaseVerification,
  serializeReleaseVerification,
} from './release-verification';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const deploymentId = requiredEnvironment('VERCEL_DEPLOYMENT_ID');
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const token = requiredEnvironment('VERCEL_TOKEN');
  const url = new URL(
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId)}`,
  );
  url.searchParams.set('withGitRepoInfo', 'true');
  if (teamId) url.searchParams.set('teamId', teamId);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(
      `Vercel deployment verification failed: ${response.status}.`,
    );
  }

  const verification = buildReleaseVerification({
    commitSha: requiredEnvironment('RELEASE_COMMIT_SHA'),
    deployment: (await response.json()) as unknown,
    deploymentId,
    productionDomain: requiredEnvironment('PRODUCTION_DOMAIN'),
    projectId: requiredEnvironment('VERCEL_PROJECT_ID'),
    tag: requiredEnvironment('RELEASE_TAG'),
  });
  const preflight = process.env.RELEASE_VERIFICATION_PREFLIGHT?.trim();
  if (preflight && preflight !== 'true') {
    throw new Error('RELEASE_VERIFICATION_PREFLIGHT must be true when set.');
  }
  if (preflight === 'true') {
    console.log('Vercel release deployment preflight verified.');
    return;
  }
  const outputPath = resolve(requiredEnvironment('RELEASE_VERIFICATION_PATH'));
  if (basename(outputPath) !== 'release-verification.json') {
    throw new Error('Release verification output filename must be fixed.');
  }
  const relativeOutput = relative(repositoryRoot, outputPath).replaceAll(
    '\\',
    '/',
  );
  if (
    relativeOutput &&
    !relativeOutput.startsWith('../') &&
    !relativeOutput.startsWith('.release-evidence/')
  ) {
    throw new Error(
      'Workspace release verification must be written under .release-evidence/.',
    );
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serializeReleaseVerification(verification));
  console.log('Vercel release deployment verified.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
