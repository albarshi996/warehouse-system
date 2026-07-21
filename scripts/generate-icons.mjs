/**
 * توليد أيقونات PWA (PNG) من هوية Brandzo باستخدام puppeteer المتوفّر أصلًا.
 * يُشغَّل يدويًّا عند تغيير الهوية:  node scripts/generate-icons.mjs
 * المخرجات تُحفَظ في public/icons وتُرفَع مع المشروع (لا يعتمد البناء على puppeteer).
 */
import puppeteer from 'puppeteer';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../public/icons');

// الأيقونة العادية (تملأ الإطار) — نفس هوية شارة «B» في الواجهة.
const NORMAL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#1A1A2E"/>
  <rect x="116" y="116" width="280" height="280" rx="60" fill="#C41E3A"/>
  <rect x="116" y="116" width="280" height="280" rx="60" fill="none" stroke="#DAAA3C" stroke-width="12"/>
  <text x="256" y="256" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="196" fill="#FFFFFF">B</text>
</svg>`;

// أيقونة maskable — خلفية كاملة والمحتوى داخل المنطقة الآمنة (لأندرويد التكيّفي).
const MASKABLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1A1A2E"/>
  <rect x="156" y="156" width="200" height="200" rx="44" fill="#C41E3A"/>
  <rect x="156" y="156" width="200" height="200" rx="44" fill="none" stroke="#DAAA3C" stroke-width="9"/>
  <text x="256" y="256" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="140" fill="#FFFFFF">B</text>
</svg>`;

async function render(browser, svg, size, outPath) {
  const page = await browser.newPage();
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><style>` +
    `*{margin:0;padding:0}html,body{width:${size}px;height:${size}px;overflow:hidden}` +
    `svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svg}</body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const buf = await page.screenshot({
    type: 'png',
    omitBackground: false,
    clip: { x: 0, y: 0, width: size, height: size },
  });
  await fs.writeFile(outPath, buf);
  await page.close();
  console.info('✓', path.basename(outPath), size + 'x' + size);
}

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  await fs.mkdir(outDir, { recursive: true });
  await render(browser, NORMAL_SVG, 192, path.join(outDir, 'icon-192.png'));
  await render(browser, NORMAL_SVG, 512, path.join(outDir, 'icon-512.png'));
  await render(browser, NORMAL_SVG, 180, path.join(outDir, 'apple-touch-icon.png'));
  await render(browser, NORMAL_SVG, 32, path.join(outDir, 'favicon-32.png'));
  await render(browser, MASKABLE_SVG, 512, path.join(outDir, 'icon-maskable-512.png'));
} finally {
  await browser.close();
}
console.info('تمّ توليد كل الأيقونات في public/icons');
