import { config } from 'dotenv';
import { setDefaultResultOrder } from 'node:dns';
import { Client } from 'pg';

setDefaultResultOrder('ipv4first');

config({ path: '.env.local' });
config();

type MediaRow = {
  kind: 'photo' | 'noteCover';
  originalKey: string;
};

type PrewarmTarget = {
  accept: string;
  kind: MediaRow['kind'];
  key: string;
  url: string;
  width: number;
};

function parsePrewarmMode(args: string[]) {
  const allowedOptions = new Set(['--apply', '--dry-run']);
  const unknownOption = args.find((arg) => !allowedOptions.has(arg));

  if (unknownOption) {
    throw new Error(`Unknown prewarm option: ${unknownOption}`);
  }

  const options = new Set(args);

  if (options.has('--apply') && options.has('--dry-run')) {
    throw new Error('Cannot combine --apply and --dry-run.');
  }

  return {
    shouldApply: options.has('--apply'),
  };
}

function requiredEnv(name: string, fallbackName?: string) {
  const value =
    process.env[name] ?? (fallbackName ? process.env[fallbackName] : undefined);

  if (!value) {
    throw new Error(
      fallbackName ? `Missing ${name} or ${fallbackName}.` : `Missing ${name}.`,
    );
  }

  return value;
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<void>,
) {
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
}

async function fetchWithRetry(
  url: string,
  accept: string,
  retryDelaysMs: readonly number[],
) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { Accept: accept },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      await response.arrayBuffer();
      return;
    } catch (error) {
      lastError = error;
      const retryDelayMs = retryDelaysMs[attempt];
      if (retryDelayMs === undefined) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw lastError;
}

async function main() {
  const { shouldApply } = parsePrewarmMode(process.argv.slice(2));
  const databaseURL = requiredEnv('POSTGRES_URL_NON_POOLING', 'DATABASE_URL');
  const {
    MEDIA_BROWSER_IMAGE_ACCEPT,
    MEDIA_PREWARM_RETRY_DELAYS_MS,
    MEDIA_PREWARM_WIDTHS,
    MEDIA_VARIANT_WIDTHS,
    getMediaImageURL,
  } = await import('../src/lib/media');

  const client = new Client({
    connectionString: databaseURL,
  });

  await client.connect();

  try {
    const { rows } = await client.query<MediaRow>(`
      select 'photo' as kind, m."originalKey"
      from photos p
      join media_assets m on m.id = p."mediaAssetId"
      union all
      select 'noteCover' as kind, m."originalKey"
      from notes n
      join media_assets m on m.id = n."coverMediaId"
      order by kind asc, "originalKey" asc
    `);

    const targets: PrewarmTarget[] = rows.flatMap((row) => {
      const widths = [
        ...new Set(
          row.kind === 'photo'
            ? [
                ...MEDIA_PREWARM_WIDTHS,
                MEDIA_VARIANT_WIDTHS.card,
                MEDIA_VARIANT_WIDTHS.modal,
              ]
            : [...MEDIA_PREWARM_WIDTHS, MEDIA_VARIANT_WIDTHS.noteCover],
        ),
      ];

      return [
        ...widths.map((width) => ({
          accept: MEDIA_BROWSER_IMAGE_ACCEPT,
          kind: row.kind,
          key: row.originalKey,
          url: getMediaImageURL({
            key: row.originalKey,
            width,
          }),
          width,
        })),
        // og:image URLs are width=1200&format=jpeg — a distinct resizer
        // cache entry from the format=webp variants above.
        {
          accept: '*/*',
          kind: row.kind,
          key: row.originalKey,
          url: getMediaImageURL({
            format: 'jpeg',
            key: row.originalKey,
            width: MEDIA_VARIANT_WIDTHS.noteCover,
          }),
          width: MEDIA_VARIANT_WIDTHS.noteCover,
        },
      ];
    });

    console.log(
      `${shouldApply ? 'Prewarming' : 'Dry run:'} ${targets.length} variants from ${rows.length} media assets.`,
    );

    if (!shouldApply) {
      for (const target of targets.slice(0, 10)) {
        console.log(`${target.kind} width=${target.width} ${target.key}`);
      }
      if (targets.length > 10) {
        console.log(`...and ${targets.length - 10} more.`);
      }
      console.log('Run with --apply to fetch and cache these variants.');
      return;
    }

    await mapLimit(targets, 3, async (target, index) => {
      try {
        await fetchWithRetry(
          target.url,
          target.accept,
          MEDIA_PREWARM_RETRY_DELAYS_MS,
        );
      } catch (error) {
        throw new Error(
          `Failed to prewarm ${target.key} width=${target.width}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      console.log(
        `[${index + 1}/${targets.length}] ${target.kind} width=${target.width} ${target.key}`,
      );
    });
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
