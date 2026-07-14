import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const WIDTH = 1200;
const HEIGHT = 630;
const input = fileURLToPath(
  new URL('../public/assets/slurmdeck-tui.svg', import.meta.url),
);
const output = fileURLToPath(
  new URL('../public/assets/slurmdeck-og.jpg', import.meta.url),
);

const screenshot = await sharp(input, { density: 144 })
  .resize({ width: 1080, withoutEnlargement: true })
  .png()
  .toBuffer({ resolveWithObject: true });
const screenshotLeft = Math.round((WIDTH - screenshot.info.width) / 2);
const screenshotTop = 166;

const background = Buffer.from(`
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="mag" cx="0" cy="0" r="1" gradientTransform="translate(180 100) rotate(18) scale(760 430)" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ff2e88" stop-opacity=".20"/>
      <stop offset="1" stop-color="#ff2e88" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="cyan" cx="0" cy="0" r="1" gradientTransform="translate(1040 530) rotate(-160) scale(690 360)" gradientUnits="userSpaceOnUse">
      <stop stop-color="#35e6ff" stop-opacity=".16"/>
      <stop offset="1" stop-color="#35e6ff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="frame" x1="48" y1="150" x2="1152" y2="580" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ff2e88" stop-opacity=".72"/>
      <stop offset=".48" stop-color="#9a8ac4" stop-opacity=".32"/>
      <stop offset="1" stop-color="#35e6ff" stop-opacity=".68"/>
    </linearGradient>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M32 0H0V32" fill="none" stroke="#9a8ac4" stroke-opacity=".055"/>
    </pattern>
  </defs>
  <rect width="1200" height="630" fill="#07040d"/>
  <rect width="1200" height="630" fill="url(#mag)"/>
  <rect width="1200" height="630" fill="url(#cyan)"/>
  <rect width="1200" height="630" fill="url(#grid)"/>
  <text x="60" y="82" fill="#f4efff" font-family="DejaVu Sans Mono, monospace" font-size="52" font-weight="700" letter-spacing="5">SLURMDECK</text>
  <text x="62" y="122" fill="#c7bddf" font-family="DejaVu Sans Mono, monospace" font-size="18" letter-spacing="3">SLURM CLI + TUI OVER SSH</text>
  <text x="1140" y="88" text-anchor="end" fill="#35e6ff" fill-opacity=".82" font-family="DejaVu Sans Mono, monospace" font-size="14" letter-spacing="2">DEJAYVU.COM</text>
  <rect x="47" y="151" width="1106" height="428" rx="13" fill="#05030a" stroke="#020108" stroke-width="12"/>
  <rect x="48" y="152" width="1104" height="426" rx="12" fill="none" stroke="url(#frame)" stroke-width="2"/>
  <text x="60" y="608" fill="#9a8ac4" font-family="DejaVu Sans Mono, monospace" font-size="13" letter-spacing="2">RUN · MONITOR · FETCH</text>
  <text x="1140" y="608" text-anchor="end" fill="#9a8ac4" font-family="DejaVu Sans Mono, monospace" font-size="13" letter-spacing="2">JUNHAO ZHANG</text>
</svg>
`);

await mkdir(fileURLToPath(new URL('../public/assets/', import.meta.url)), {
  recursive: true,
});
await sharp(background)
  .composite([
    {
      input: screenshot.data,
      left: screenshotLeft,
      top: screenshotTop,
    },
  ])
  .jpeg({
    chromaSubsampling: '4:4:4',
    progressive: true,
    quality: 88,
  })
  .toFile(output);
