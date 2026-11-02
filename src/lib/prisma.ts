import { Prisma, PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { attachDatabasePool } from '@vercel/functions/db-connections';
import { Pool } from 'pg';

// Neon's pooler multiplexes server connections, so each instance stays small.
const POOL_MAX_CLIENTS = 5;
const POOL_IDLE_TIMEOUT_MS = 5_000;
// A first connection may wait for Neon to wake from scale to zero.
const CONNECTION_TIMEOUT_MS = 10_000;

const prismaClientSingleton = () => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to initialize Prisma.');
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
    max: POOL_MAX_CLIENTS,
  });
  attachDatabasePool(pool);

  return new PrismaClient({
    adapter: new PrismaPg(pool, { disposeExternalPool: true }),
    // Prisma's 2s default is shorter than a cold connection can take.
    transactionOptions: { maxWait: CONNECTION_TIMEOUT_MS },
  });
};

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;

export { Prisma };
