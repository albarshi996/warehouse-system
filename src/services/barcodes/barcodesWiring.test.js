/**
 * 🔒🔒 حارسُ الربط ‹LPN-723› — لا منطقَ بلا مستدعٍ، ولا شاشةَ بلا باب.
 *
 * ═══ الدرس الذي كلّفنا شهورًا ═══
 * `bz-barcode.js` عاش يُبنى ويُنشر من الخادم **ولا يستدعيه أحد**. وسبعةُ
 * ملفّاتِ طبقة الطبالي عُدّت «منجَزة» وهي بلا شاشة. والمتتبّع كان يفحص **وجود
 * البيّنة** لا تحقّقَ الشرط — فمرّ الوهم.
 *
 * فهذا الحارس يفحص ما لا يفحصه المتتبّع:
 *   ① كلُّ وحدةٍ جديدة **يستوردها مستدعٍ حقيقيّ** (خدمةٌ أو شاشة) لا اختبارُها وحده.
 *   ② كلُّ شاشةٍ لها **ملفُّ صفحةٍ** على القرص.
 *   ③ كلُّ صفحةٍ لها **مدخلٌ في كتالوج التنقّل** — وإلّا فهي رابطٌ لا يعرفه أحد.
 *   ④ كلُّ صفحةٍ **تُركّب مكوّنها فعلًا** — لا عنوانٌ فوق فراغ.
 *
 * ⚠️ ولا يُضاف ملفٌّ إلى `MODULES` إلّا وله مستدعٍ. وإن سقط الحارس فالعلاج
 * **وصلُ الملفّ** لا حذفُه من القائمة.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { internalPaths } from '../auth/navCatalog.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', '..');
const ROOT = path.join(SRC, '..');

/** كلُّ ملفّات المصدر — مرّةً واحدة، فلا يُمشى الشجرةُ في كلّ اختبار. */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|astro)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const FILES = walk(SRC).map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }));

/** من يستورد هذه الوحدة — عدا نفسها واختبارها. */
function importersOf(moduleFile) {
  const base = path.basename(moduleFile);
  const needle = `/${base.replace(/\.js$/, '.js')}`;
  return FILES.filter(({ file, text }) => {
    if (path.basename(file) === base) return false;
    if (file.endsWith('.test.js')) return false;
    return text.includes(needle) || text.includes(`./${base}`);
  }).map(({ file }) => path.relative(ROOT, file));
}

/**
 * وحداتُ م٧ — ولكلٍّ **نوعُ مستدعٍ متوقَّع**.
 * `screen` تعني: يجب أن يستوردها مكوّنٌ أو صفحة، لا خدمةٌ فقط.
 */
const MODULES = [
  { file: 'services/barcodes/barcodeCode.js', why: 'مصنّف المسحات' },
  { file: 'services/barcodes/barcodeKinds.js', why: 'فئتا الصلاحية' },
  { file: 'services/barcodes/barcodeRegistry.js', why: 'سجلّ الباركود' },
  { file: 'services/barcodes/barcodeService.js', why: 'خدمة السجلّ', screen: true },
  { file: 'services/barcodes/vehicleCode.js', why: 'هويّة المركبة' },
  { file: 'services/barcodes/labelSheet.js', why: 'ورقة الملصقات', screen: true },
  { file: 'services/locations/serviceLocations.js', why: 'مواقع الخدمة' },
  { file: 'services/locations/qualifiedCode.js', why: 'الكود الكامل' },
  { file: 'services/shipping/shipmentCode.js', why: 'نحو الشحنة' },
  { file: 'services/shipping/packingFlow.js', why: 'دورة التعبئة', screen: true },
  { file: 'services/shipping/customerLabel.js', why: 'ملصق العميل', screen: true },
  { file: 'services/shipping/shippingService.js', why: 'خدمة الشحنات', screen: true },
  { file: 'services/lpn/movementProof.js', why: 'بيّنة الحركة' },
  { file: 'services/lpn/dockLoading.js', why: 'التحميل عند الباب', screen: true },
  { file: 'services/lpn/exitGate.js', why: 'بوّابة الخروج', screen: true },
  { file: 'services/lpn/inboundDock.js', why: 'باب الاستلام', screen: true },
  { file: 'services/lpn/custodyChain.js', why: 'سلسلة العهدة' },
  { file: 'services/lpn/dockService.js', why: 'خدمة جلسات الأبواب', screen: true },
  // ★★ الوصلُ الذي كشفه الطلب: `putawayTask.js` كان مبنيًّا مختبَرًا **بلا
  // مستدعٍ** منذ LPN-210 — والمرحلتان الأولى والثالثة في الطلب تقومان عليه.
  { file: 'services/lpn/putawayTask.js', why: 'مهمّة التخزين ومقترحاتها', screen: false },
  { file: 'services/lpn/putawayService.js', why: 'خدمة مهامّ التخزين', screen: true },
];

/** الشاشات الثلاث: الصفحة ← المكوّن ← مدخلُ الكتالوج. */
const SCREENS = [
  {
    path: '/dashboard/barcode-center',
    page: 'pages/dashboard/barcode-center.astro',
    component: 'components/brandzo-erp/barcodes/BarcodeCenter.jsx',
  },
  {
    path: '/dashboard/packing-shipping',
    page: 'pages/dashboard/packing-shipping.astro',
    component: 'components/brandzo-erp/shipping/PackingFlow.jsx',
  },
  {
    path: '/dashboard/dock-operations',
    page: 'pages/dashboard/dock-operations.astro',
    component: 'components/brandzo-erp/lpn/DockOperations.jsx',
  },
];

test('★★★ كلُّ وحدةٍ من م٧ يستوردها مستدعٍ حقيقيّ — لا اختبارُها وحده', () => {
  const orphans = [];
  for (const m of MODULES) {
    const full = path.join(SRC, m.file);
    assert.ok(fs.existsSync(full), `الملفّ غائب: ${m.file}`);
    const callers = importersOf(full);
    if (callers.length === 0) orphans.push(`${m.file} (${m.why})`);
  }
  assert.deepEqual(
    orphans,
    [],
    `وحداتٌ مبنيّةٌ بلا مستدعٍ — «منطقٌ بلا مستدعٍ يُعدّ منجَزًا» هو العطب نفسه:\n${orphans.join('\n')}`
  );
});

test('★★ ما وُسم `screen` تستورده شاشةٌ فعلًا — لا خدمةٌ تستورد خدمة', () => {
  const notOnScreen = [];
  for (const m of MODULES.filter((x) => x.screen)) {
    const callers = importersOf(path.join(SRC, m.file));
    const onScreen = callers.some((c) => c.includes('components') || c.includes('pages'));
    if (!onScreen) notOnScreen.push(`${m.file} (${m.why})`);
  }
  assert.deepEqual(notOnScreen, [], `مبنيٌّ ولا تصله يدُ مستخدم:\n${notOnScreen.join('\n')}`);
});

test('★★★ كلُّ شاشةٍ لها صفحةٌ ومكوّنٌ ومدخلٌ في الكتالوج', () => {
  const catalog = new Set(internalPaths());
  for (const s of SCREENS) {
    assert.ok(fs.existsSync(path.join(SRC, s.page)), `الصفحة غائبة: ${s.page}`);
    assert.ok(fs.existsSync(path.join(SRC, s.component)), `المكوّن غائب: ${s.component}`);
    assert.ok(catalog.has(s.path), `«${s.path}» بلا مدخلٍ في كتالوج التنقّل — رابطٌ لا يعرفه أحد.`);
  }
});

test('★★ الصفحة تُركّب مكوّنها فعلًا — لا عنوانٌ فوق فراغ', () => {
  for (const s of SCREENS) {
    const page = fs.readFileSync(path.join(SRC, s.page), 'utf8');
    const name = path.basename(s.component, '.jsx');
    assert.match(page, new RegExp(`import ${name} from`), `${s.page} لا تستورد ${name}`);
    assert.match(page, new RegExp(`<${name}\\s`), `${s.page} تستورد ${name} ولا تُركّبه`);
    assert.match(page, /client:load/, `${s.page} تُركّب المكوّن بلا ترطيب — فلا يعمل زرٌّ فيه`);
  }
});

test('★ الحارس نفسه لا يمرّ على ملفٍّ غائب — فلا يُخفي حذفًا', () => {
  // لو حُذف ملفٌّ من `MODULES` بدل وصله لَمرّ الاختبار صامتًا. فيُقاس العدد.
  assert.equal(MODULES.length, 20, 'عشرون ملفًّا في م٧ — والعدد يُحدَّث مع كلّ إضافة');
  assert.equal(SCREENS.length, 3);
});
