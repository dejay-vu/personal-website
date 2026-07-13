import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { STORAGE_LAYOUT_VERSION } from '../src/modules/media/storageKeys';
import {
  buildReleaseProvenance,
  canonicalPrettyJson,
} from './release-provenance';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function git(...args: string[]) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function readJson(path: string) {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

function exactLockedVersion(lock: Record<string, unknown>, name: string) {
  const packages = lock.packages as Record<
    string,
    { version?: unknown } | undefined
  >;
  const version = packages?.[`node_modules/${name}`]?.version;
  if (typeof version !== 'string' || !version) {
    throw new Error(`package-lock.json does not pin ${name}.`);
  }
  return version;
}

async function main() {
  const tag = requiredEnvironment('RELEASE_TAG');
  const cdkTemplatePath = resolve(
    requiredEnvironment('RELEASE_CDK_TEMPLATE_PATH'),
  );
  const outputPath = resolve(requiredEnvironment('RELEASE_PROVENANCE_PATH'));
  if (basename(outputPath) !== 'release-provenance.json') {
    throw new Error('Release provenance output filename must be fixed.');
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
      'Workspace release provenance must be written under .release-evidence/.',
    );
  }

  execFileSync('git', ['diff', '--quiet', '--exit-code'], {
    cwd: repositoryRoot,
  });
  execFileSync('git', ['diff', '--cached', '--quiet', '--exit-code'], {
    cwd: repositoryRoot,
  });
  if (git('ls-files', '--others', '--exclude-standard')) {
    throw new Error(
      'Release provenance requires a checkout without untracked source files.',
    );
  }

  const commitSha = git('rev-parse', 'HEAD');
  const taggedCommitSha = git('rev-parse', `${tag}^{commit}`);
  if (taggedCommitSha !== commitSha) {
    throw new Error('Release tag does not resolve to the checked-out commit.');
  }

  const packageManifest = (await readJson(
    join(repositoryRoot, 'package.json'),
  )) as {
    engines?: { node?: unknown };
    name?: unknown;
    packageManager?: unknown;
    version?: unknown;
  };
  const releaseManifest = (await readJson(
    join(repositoryRoot, '.release-please-manifest.json'),
  )) as Record<string, unknown>;
  const lock = (await readJson(join(repositoryRoot, 'package-lock.json'))) as {
    name?: unknown;
    packages?: Record<
      string,
      { name?: unknown; version?: unknown } | undefined
    >;
    version?: unknown;
  };
  const lockVersion = lock.packages?.['']?.version;
  if (
    typeof packageManifest.version !== 'string' ||
    typeof packageManifest.name !== 'string' ||
    typeof packageManifest.engines?.node !== 'string' ||
    typeof packageManifest.packageManager !== 'string' ||
    !packageManifest.packageManager.startsWith('npm@') ||
    typeof releaseManifest['.'] !== 'string' ||
    typeof lockVersion !== 'string' ||
    lock.version !== packageManifest.version ||
    lockVersion !== packageManifest.version ||
    lock.name !== packageManifest.name ||
    lock.packages?.['']?.name !== packageManifest.name
  ) {
    throw new Error('Package or release manifest version metadata is invalid.');
  }

  const migrationRoot = join(repositoryRoot, 'prisma/migrations');
  const migrationEntries = await readdir(migrationRoot, {
    withFileTypes: true,
  });
  const migrations = await Promise.all(
    migrationEntries
      .filter((entry) => entry.isDirectory())
      .map(async ({ name }) => ({
        bytes: await readFile(join(migrationRoot, name, 'migration.sql')),
        name,
      })),
  );
  const migrationLockBytes = await readFile(
    join(migrationRoot, 'migration_lock.toml'),
  );
  const providerMatch = migrationLockBytes
    .toString('utf8')
    .match(/^provider\s*=\s*"([a-z0-9_-]+)"\s*$/m);
  if (providerMatch?.[1] !== 'postgresql') {
    throw new Error('Prisma migration lock must declare postgresql.');
  }

  const externalMediaContract = await readJson(
    join(repositoryRoot, 'infra/external-media-contract.json'),
  );
  const contactTemplate = await readJson(cdkTemplatePath);
  const version = tag.startsWith('v') ? tag.slice(1) : tag;
  const provenance = buildReleaseProvenance({
    aws: { contactTemplate, externalMediaContract },
    database: {
      migrationLockBytes,
      migrations,
      prismaSchemaBytes: await readFile(
        join(repositoryRoot, 'prisma/schema.prisma'),
      ),
      provider: 'postgresql',
    },
    release: {
      commitSha,
      lockVersion,
      manifestVersion: releaseManifest['.'],
      packageVersion: packageManifest.version,
      tag,
      treeSha: git('rev-parse', 'HEAD^{tree}'),
      version,
    },
    storage: {
      contractLayoutVersion: (
        externalMediaContract as { storageLayoutVersion?: unknown }
      ).storageLayoutVersion as number,
      keyBuilderBytes: await readFile(
        join(repositoryRoot, 'src/modules/media/storageKeys.ts'),
      ),
      layoutVersion: STORAGE_LAYOUT_VERSION,
    },
    toolchain: {
      awsCdk: exactLockedVersion(lock, 'aws-cdk'),
      awsCdkLib: exactLockedVersion(lock, 'aws-cdk-lib'),
      node: packageManifest.engines.node,
      npm: packageManifest.packageManager.slice('npm@'.length),
      prisma: exactLockedVersion(lock, 'prisma'),
    },
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, canonicalPrettyJson(provenance));
  console.log('Release provenance generated.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
