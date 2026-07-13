import { createHash } from 'node:crypto';
import { parse } from 'pg-connection-string';

export type DatabaseTarget = {
  databaseName: string;
  hostname: string;
  port: string;
  protocol: 'postgresql:';
  schema: string;
  username: string;
};

const SUPPORTED_PROTOCOLS = new Set(['postgres:', 'postgresql:']);
const FILE_BASED_SSL_PARAMETERS = ['sslcert', 'sslkey', 'sslrootcert'];
const CONNECTION_START_PARAMETERS = ['options'];
const TARGET_ENVIRONMENT_OVERRIDES = [
  'PGOPTIONS',
  'PGSERVICE',
  'PGSERVICEFILE',
];

function requireExplicitString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Database URL must include an explicit ${field}.`);
  }
  return value;
}

export function parseDatabaseTarget(
  raw: string,
  { allowDefaultPort = false }: { allowDefaultPort?: boolean } = {},
): DatabaseTarget {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      'Database connection value must be a valid PostgreSQL URL.',
    );
  }

  if (!SUPPORTED_PROTOCOLS.has(url.protocol)) {
    throw new Error('Database connection value must be a PostgreSQL URL.');
  }
  for (const parameter of FILE_BASED_SSL_PARAMETERS) {
    if (url.searchParams.has(parameter)) {
      throw new Error(`Database URL parameter ${parameter} is not supported.`);
    }
  }
  for (const parameter of CONNECTION_START_PARAMETERS) {
    if (url.searchParams.has(parameter)) {
      throw new Error(
        `Database URL parameter ${parameter} is not supported because it can change the connection target.`,
      );
    }
  }

  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(raw);
  } catch {
    throw new Error(
      'Database connection value must be a valid PostgreSQL URL.',
    );
  }

  const databaseName = requireExplicitString(parsed.database, 'database name');
  const hostname = requireExplicitString(parsed.host, 'host');
  const rawPort = parsed.port || (allowDefaultPort ? '5432' : undefined);
  const explicitPort = requireExplicitString(rawPort, 'port');
  const schema = requireExplicitString(parsed.schema ?? 'public', 'schema');
  const username = requireExplicitString(parsed.user, 'user');
  const numericPort = Number(explicitPort);

  if (
    !/^\d+$/.test(explicitPort) ||
    !Number.isInteger(numericPort) ||
    numericPort < 1 ||
    numericPort > 65_535
  ) {
    throw new Error('Database URL must include a valid explicit port.');
  }
  if (hostname.startsWith('/')) {
    throw new Error('Database URL must include an explicit network host.');
  }

  return {
    databaseName,
    hostname: hostname.toLowerCase(),
    port: String(numericPort),
    protocol: 'postgresql:',
    schema,
    username,
  };
}

export function databaseTargetsEqual(
  left: DatabaseTarget,
  right: DatabaseTarget,
) {
  return (
    left.protocol === right.protocol &&
    left.hostname === right.hostname &&
    left.port === right.port &&
    left.username === right.username &&
    left.databaseName === right.databaseName &&
    left.schema === right.schema
  );
}

export function assertNoDatabaseTargetEnvironmentOverrides() {
  for (const name of TARGET_ENVIRONMENT_OVERRIDES) {
    if (process.env[name]) {
      throw new Error(
        `${name} is not supported because it can change the database target outside the connection URL.`,
      );
    }
  }
}

export function databaseTargetFingerprint(target: DatabaseTarget) {
  return createHash('sha256')
    .update(
      [
        target.protocol,
        target.hostname,
        target.port,
        target.username,
        target.databaseName,
        target.schema,
      ].join('\0'),
    )
    .digest('hex');
}

export function isDisposableDatabaseName(databaseName: string) {
  return (
    databaseName === 'ci' ||
    databaseName === 'test' ||
    databaseName.endsWith('_test') ||
    databaseName.endsWith('-test')
  );
}

export function isDevelopmentDatabaseName(databaseName: string) {
  return (
    databaseName === 'development' ||
    databaseName === 'dev' ||
    databaseName.endsWith('_dev') ||
    databaseName.endsWith('-dev')
  );
}
