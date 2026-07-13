import { Prisma, PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { withAccelerate } from '@prisma/extension-accelerate';

const prismaClientSingleton = () => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to initialize Prisma.');
  }

  const protocol = new URL(databaseUrl).protocol;

  if (protocol === 'postgres:' || protocol === 'postgresql:') {
    return new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    }).$extends(withAccelerate());
  }

  return new PrismaClient({ accelerateUrl: databaseUrl }).$extends(
    withAccelerate(),
  );
};

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;

export { Prisma };
