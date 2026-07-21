/**
 * تكامل Astro يولّد «العامل الخفي» (Service Worker) بعد كل بناء.
 *
 * لماذا مولّد لا مكتوب يدويًّا؟ لأن Astro يبصم أسماء ملفات _astro بكل بناء،
 * فلا يمكن كتابة قائمة تخزين مسبق ثابتة. هذا التكامل يمسح مجلّد dist الفعلي
 * بعد البناء، يبني قائمة الملفات الأساسية (صفحات + حزم JS/CSS + الأيقونات)،
 * ويحقنها في sw.js مع بصمة بناء (BUILD_ID). تغيّر البصمة = المتصفّح يكتشف
 * نسخة جديدة تلقائيًّا ⇒ تحديث ذاتي عند عودة الاتصال.
 *
 * ملاحظة مهمّة: طلبات Firebase/Firestore (نطاق googleapis) لا يعترضها العامل
 * الخفي إطلاقًا — Firestore يدير كاشه الخاص بلا اتصال (persistentLocalCache).
 */
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

async function walk(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

// ما يُخزَّن مسبقًا: كل صفحات النظام (index.html) + حزم _astro + الأيقونات + الـmanifest.
// يُستثنى: تقارير public المستقلّة والصور والمكتبات الضخمة (تُخزَّن عند الطلب أول زيارة).
function includeInPrecache(rel) {
  if (rel === 'sw.js') return false;
  if (rel.endsWith('.map')) return false;
  if (rel.startsWith('_astro/')) return true;
  if (rel === 'index.html' || rel.endsWith('/index.html')) return true;
  if (rel.startsWith('icons/')) return true;
  if (rel === 'manifest.webmanifest') return true;
  if (rel.startsWith('favicon')) return true;
  return false;
}

function toUrl(rel, base) {
  if (rel === 'index.html') return base;
  if (rel.endsWith('/index.html')) return base + rel.slice(0, -'index.html'.length);
  return base + rel;
}

const SW_TEMPLATE = `/* Brandzo Hub — العامل الخفي (مولّد آليًّا، لا تُعدّل نسخة dist). */
const BUILD_ID = '__BUILD_ID__';
const BASE = '__BASE__';
const CACHE = 'brandzo-' + BUILD_ID;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  // لا skipWaiting هنا: النسخة الجديدة تنتظر موافقة المستخدم (زر «تحديث»).
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(
      PRECACHE.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {}))
    );
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('brandzo-') && k !== CACHE).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isFont(url) {
  return /fonts\\.(googleapis|gstatic)\\.com/.test(url.host);
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const root = await cache.match(BASE);
    if (root) return root;
    return new Response(
      '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;text-align:center;margin-top:20vh;direction:rtl"><h1>أنت غير متصل</h1><p>هذه الصفحة لم تُحفَظ بعد. افتحها مرّة والنت متاح ثم ستعمل دون اتصال.</p></body>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
    return res;
  } catch (e) {
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const fetching = fetch(request)
    .then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || fetching;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  let url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }

  // نطاق مختلف: Firebase/Firestore/Google APIs تمرّ كما هي (لها كاشها الخاص).
  // نخزّن الخطوط فقط لتعمل الهوية دون اتصال.
  if (url.origin !== self.location.origin) {
    if (isFont(url)) event.respondWith(staleWhileRevalidate(request));
    return;
  }

  const accept = request.headers.get('accept') || '';
  if (request.mode === 'navigate' || accept.includes('text/html')) {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});
`;

export default function pwaServiceWorker() {
  let base = '/';
  return {
    name: 'brandzo-pwa-sw',
    hooks: {
      'astro:config:done': ({ config }) => {
        base = config.base.endsWith('/') ? config.base : config.base + '/';
      },
      'astro:build:done': async ({ dir, logger }) => {
        const outDir = fileURLToPath(dir);
        const files = await walk(outDir);
        const rel = files.map((f) => path.relative(outDir, f).split(path.sep).join('/'));
        const included = rel.filter(includeInPrecache).sort();
        const urls = Array.from(new Set(included.map((r) => toUrl(r, base))));

        // بصمة البناء = خلاصة محتوى كل الملفات المحفوظة (لا أسماءها فقط).
        // أي تغيير في أي ملف ⇒ بصمة جديدة ⇒ المتصفّح يكتشف نسخة جديدة ويُحدّث؛
        // وبناءان متطابقان ⇒ بصمة متطابقة ⇒ لا إشعار تحديث كاذب.
        const hash = crypto.createHash('md5');
        for (const r of included) {
          hash.update(r);
          hash.update(await fs.readFile(path.join(outDir, r)));
        }
        const buildId = hash.digest('hex').slice(0, 12);
        const sw = SW_TEMPLATE.replace(/__BUILD_ID__/g, () => buildId)
          .replace(/__BASE__/g, () => base)
          .replace(/__PRECACHE__/g, () => JSON.stringify(urls));
        await fs.writeFile(path.join(outDir, 'sw.js'), sw, 'utf8');
        logger.info(`sw.js مكتوب (بناء ${buildId}) — ${urls.length} ملفًّا محفوظًا مسبقًا`);
      },
    },
  };
}
