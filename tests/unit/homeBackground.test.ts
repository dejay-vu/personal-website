import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';
import sharp from 'sharp';

test('the preloaded cityscape stays compact and keeps its preview layer', async () => {
  const backgroundPath = 'public/background.webp';
  const metadata = await sharp(backgroundPath).metadata();
  const css = readFileSync(
    'src/components/home/NeonLanding.module.css',
    'utf8',
  );

  assert.ok(statSync(backgroundPath).size <= 225_000);
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 724);
  assert.equal(metadata.height, 2172);
  assert.match(css, /url\('\/background\.webp'\)/);
  assert.match(css, /url\('data:image\/webp;base64,/);
});
