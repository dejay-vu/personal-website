import { createHash } from 'node:crypto';

type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type MigrationInput = {
  bytes: Uint8Array;
  name: string;
};

export type ReleaseProvenanceInput = {
  aws: {
    contactTemplate: unknown;
    externalMediaContract: unknown;
  };
  database: {
    migrationLockBytes: Uint8Array;
    migrations: MigrationInput[];
    prismaSchemaBytes: Uint8Array;
    provider: 'postgresql';
  };
  release: {
    commitSha: string;
    lockVersion: string;
    manifestVersion: string;
    packageVersion: string;
    tag: string;
    treeSha: string;
    version: string;
  };
  storage: {
    contractLayoutVersion: number;
    keyBuilderBytes: Uint8Array;
    layoutVersion: number;
  };
  toolchain: {
    awsCdk: string;
    awsCdkLib: string;
    node: string;
    npm: string;
    prisma: string;
  };
};

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const MIGRATION_NAME = /^\d{14}_[a-z0-9][a-z0-9_]*$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9.+^~_x-]{0,63}$/;

function assertRecord(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function assertExactKeys(value: unknown, allowed: string[], label: string) {
  const record = assertRecord(value, label);
  const unknown = Object.keys(record).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${label} contains unknown fields: ${unknown.join(', ')}.`);
  }
}

function canonicalize(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error('JSON numbers must be finite.');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);

  const record = assertRecord(value, 'JSON value');
  const result = Object.create(null) as Record<string, JsonValue>;
  for (const key of Object.keys(record).sort()) {
    if (record[key] === undefined) {
      throw new Error(`JSON field ${key} is undefined.`);
    }
    result[key] = canonicalize(record[key]);
  }
  return result;
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

export function canonicalPrettyJson(value: unknown) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export function sha256Bytes(bytes: Uint8Array | string) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256CanonicalJson(value: unknown) {
  return sha256Bytes(canonicalJson(value));
}

function assertSafeVersion(value: string, label: string) {
  if (!SAFE_VERSION.test(value)) {
    throw new Error(`${label} is not a safe version string.`);
  }
}

export function buildReleaseProvenance(input: ReleaseProvenanceInput) {
  assertExactKeys(
    input,
    ['aws', 'database', 'release', 'storage', 'toolchain'],
    'provenance input',
  );
  assertExactKeys(
    input.release,
    [
      'commitSha',
      'lockVersion',
      'manifestVersion',
      'packageVersion',
      'tag',
      'treeSha',
      'version',
    ],
    'release input',
  );
  assertExactKeys(
    input.toolchain,
    ['awsCdk', 'awsCdkLib', 'node', 'npm', 'prisma'],
    'toolchain input',
  );
  assertExactKeys(
    input.database,
    ['migrationLockBytes', 'migrations', 'prismaSchemaBytes', 'provider'],
    'database input',
  );
  assertExactKeys(
    input.storage,
    ['contractLayoutVersion', 'keyBuilderBytes', 'layoutVersion'],
    'storage input',
  );
  assertExactKeys(
    input.aws,
    ['contactTemplate', 'externalMediaContract'],
    'AWS input',
  );

  const { release } = input;
  if (!SEMVER.test(release.version) || release.tag !== `v${release.version}`) {
    throw new Error('Release tag must be vX.Y.Z and match release version.');
  }
  if (
    release.packageVersion !== release.version ||
    release.manifestVersion !== release.version ||
    release.lockVersion !== release.version
  ) {
    throw new Error(
      'Release tag, package version, lockfile version, and release-please manifest must match.',
    );
  }
  if (!GIT_SHA.test(release.commitSha) || !GIT_SHA.test(release.treeSha)) {
    throw new Error('Release commit and tree must be full Git SHA-1 values.');
  }

  for (const [name, version] of Object.entries(input.toolchain)) {
    assertSafeVersion(version, `Toolchain ${name}`);
  }
  if (input.database.provider !== 'postgresql') {
    throw new Error('Release database provider must be postgresql.');
  }
  if (
    !Number.isInteger(input.storage.layoutVersion) ||
    input.storage.layoutVersion <= 0 ||
    input.storage.contractLayoutVersion !== input.storage.layoutVersion
  ) {
    throw new Error(
      'Storage layout version must be a positive integer shared by code and contract.',
    );
  }

  const migrations = [...input.database.migrations]
    .map((migration) => {
      assertExactKeys(migration, ['bytes', 'name'], 'migration input');
      if (!MIGRATION_NAME.test(migration.name)) {
        throw new Error(`Invalid migration name: ${migration.name}.`);
      }
      return {
        name: migration.name,
        sha256: sha256Bytes(migration.bytes),
      };
    })
    .sort((left, right) =>
      Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)),
    );
  if (migrations.length === 0) {
    throw new Error('At least one committed migration is required.');
  }
  if (new Set(migrations.map(({ name }) => name)).size !== migrations.length) {
    throw new Error('Migration names must be unique.');
  }

  const externalContract = assertRecord(
    input.aws.externalMediaContract,
    'external media contract',
  );
  if (externalContract.storageLayoutVersion !== input.storage.layoutVersion) {
    throw new Error(
      'External media contract does not match storage layout version.',
    );
  }

  return {
    aws: {
      contactTemplateSha256: sha256CanonicalJson(input.aws.contactTemplate),
      externalMediaContractSha256: sha256CanonicalJson(
        input.aws.externalMediaContract,
      ),
    },
    database: {
      historySha256: sha256CanonicalJson(migrations),
      migrationHead: migrations.at(-1)!.name,
      migrationLockSha256: sha256Bytes(input.database.migrationLockBytes),
      migrations,
      prismaSchemaSha256: sha256Bytes(input.database.prismaSchemaBytes),
      provider: input.database.provider,
    },
    release: {
      commitSha: release.commitSha,
      tag: release.tag,
      treeSha: release.treeSha,
      version: release.version,
    },
    schemaVersion: 1,
    storage: {
      keyBuilderSha256: sha256Bytes(input.storage.keyBuilderBytes),
      layoutVersion: input.storage.layoutVersion,
    },
    toolchain: input.toolchain,
  };
}
