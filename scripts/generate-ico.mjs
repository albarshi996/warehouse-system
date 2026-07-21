/**
 * توليد أيقونة ويندوز src-tauri/icons/icon.ico من هوية Brandzo.
 * صيغة ICO حاوية تضمّ صور PNG بمقاسات 32/48/256 (المدعومة من Vista فصاعدًا).
 * يُشغَّل يدويًّا عند تغيير الهوية:  node scripts/generate-ico.mjs
 */
import puppeteer from 'puppeteer';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../src-tauri/icons');

// نفس رسمة أيقونة الـPWA (icon.svg) — مصدر هوية واحد.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#1A1A2E"/>
  <rect x="116" y="116" width="280" height="280" rx="60" fill="#C41E3A"/>
  <rect x="116" y="116" width="280" height="280" rx="60" fill="none" stroke="#DAAA3C" stroke-width="12"/>
  <text x="256" y="256" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="196" fill="#FFFFFF">B</text>
</svg>`;

async function renderPng(browser, size) {
  const page = await browser.newPage();
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><style>` +
    `*{margin:0;padding:0}html,body{width:${size}px;height:${size}px;overflow:hidden}` +
    `svg{display:block;width:${size}px;height:${size}px}</style></head><body>${SVG}</body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const buf = await page.screenshot({
    type: 'png',
    clip: { x: 0, y: 0, width: size, height: size },
  });
  await page.close();
  return buf;
}

/** يحزم صور PNG في حاوية ICO (رأس + فهرس + البيانات). */
function packIco(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // محجوز
  header.writeUInt16LE(1, 2); // النوع: أيقونة
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  entries.forEach(({ size, png }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o); // العرض (0 = 256)
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1); // الارتفاع
    dir.writeUInt8(0, o + 2); // عدد الألوان
    dir.writeUInt8(0, o + 3); // محجوز
    dir.writeUInt16LE(1, o + 4); // planes
    dir.writeUInt16LE(32, o + 6); // عمق البت
    dir.writeUInt32LE(png.length, o + 8); // حجم البيانات
    dir.writeUInt32LE(offset, o + 12); // موضع البيانات
    offset += png.length;
  });

  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  await fs.mkdir(outDir, { recursive: true });
  const sizes = [32, 48, 256];
  const entries = [];
  for (const size of sizes) {
    entries.push({ size, png: await renderPng(browser, size) });
    console.info('✓ رُسم مقاس', size);
  }
  const ico = packIco(entries);
  await fs.writeFile(path.join(outDir, 'icon.ico'), ico);
  console.info('تمّ: src-tauri/icons/icon.ico —', ico.length, 'بايت');
} finally {
  await browser.close();
}
