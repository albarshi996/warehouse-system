/**
 * ‹DS-READS› حارسُ قراءة «التخزين والسحب الموجّه» — كسولةٌ ومقصورةٌ وحكمُها لا يتغيّر.
 *
 * ═══ العطبُ الذي يحرسه (كونسول Firebase 2026-10-21) ═══
 * فتحةٌ واحدةٌ للشاشة = ~14,380 قراءة: ثلاثةُ مستمعين على `bin_locations` و`Items_Master`
 * و`balances` كاملةً **عند التحميل**. فثلاثُ فتحاتٍ تُنفد حصّةَ اليوم.
 *
 * ═══ وما يُثبته هذا الملفّ ═══
 *  ① الفتحُ بلا ملفٍّ — وأمرُ التسليم — لا يقرأ شيئًا.
 *  ② والمعاينةُ تقرأ نطاقَ الورقة وحدَه، ولا تُعيد قراءةَ ما قرأته.
 *  ③ ★★★ والحكمُ لا يتغيّر: عالمٌ واحدٌ يُحسب فيه الاقتراحُ من المجموعات كاملةً ومن
 *     النطاق المقصور، ويُقارَنان بندًا بندًا — بما فيه رفٌّ لا يقبل الخلط، ورفٌّ يمنعه
 *     حِملُ صنفٍ **ليس في الورقة**، وباركودٌ مكرّرٌ بين صنفين، وبطاقةٌ مؤرشفة.
 *  ④ وبصماتُ منع التكرار تُقرأ بمعرّفاتها ويبقى التصنيفُ نفسَه حرفًا.
 *  ⑤ والشاشةُ لا تشترك في مجموعةٍ كاملةٍ إلّا خلف مفتاح الإطفاء.
 *
 * والقارئُ البديلُ يحاكي Firestore بعقده: `in` مساواةٌ تامّة، والمدى على النصّ
 * وحده، و`array-contains-any` تطابقُ عنصرٍ حرفًا، **وكلُّ استعلامٍ يُحتسب قراءةً
 * واحدةً على الأقلّ ولو عاد فارغًا** — كما يُحتسب في الفاتورة.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FULL_READS_KEY,
  REFERENCE_TTL_MS,
  SCOPED_READS,
  balanceWarehouseOf,
  fullReadsForced,
  isEmptyScope,
  itemIndexOf,
  itemOfIndex,
  loadReference,
  newReferenceMemo,
  scopeKey,
  scopeOfPreview,
  scopedSuggestionGap,
} from './directedScope.js';
import { IN_LIMIT, binPrefixRange, chunksOf } from './scopedQuery.js';
import { suggestLocations } from './putawaySuggest.js';
import { shapeLocation } from './locationsModel.js';
import { loadIndexOf } from '../items/itemDimensions.js';
import { classifyRows, fingerprintId, knownFingerprintsFor } from './sourceImport.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, rel), 'utf8');

/* ═══════════════════════════ العالَم ═══════════════════════════ */

const loc = (code, extra = {}) => ({ id: code, ...shapeLocation({ code, ...extra }) });

const LOCATIONS = [
  // RH — مستودعُ الورقة الأوّل
  loc('RH-A-R-01-01'),
  loc('RH-A-R-01-02', { capacity: { qty: 100 } }),
  loc('RH-A-R-01-03', { mixItems: false }), //               فيه صنفٌ آخر — يُرفض للخلط
  loc('RH-A-R-01-04', { capacity: { weightKg: 50 } }), //   حِملُه من صنفٍ ليس في الورقة
  loc('RH-A-R-01-05', { status: 'full' }),
  loc('RH-A-R-01-06', { status: 'archived' }),
  loc('RH-A-R-02-01', { storageType: 'chilled', priority: 3 }),
  loc('RH-A-R-02-02', { handling: 'pallet', distance: 4 }),
  loc('RH-B-L-01-01', { distance: 2 }),
  // TR — مستودعُ الورقة الثاني
  loc('TR-A-R-01-01'),
  loc('TR-A-R-01-02', { mixBatches: false }),
  // مستودعاتٌ لا تخصّ الورقة — ومنها بادئتان تبدآن بـRH عمدًا
  loc('RHX-A-R-01-01'),
  loc('RH2-A-R-01-01'),
  ...Array.from({ length: 40 }, (_, i) => loc(`OT-A-R-01-${String(i + 1).padStart(2, '0')}`)),
];

const bal = (id, extra) => ({ id, qty: 1, warehouse: 'WH001', ...extra });

const BALANCES = [
  bal('b1', { sku: 'SKU-A', batch: 'L1', bin: 'RH-A-R-01-01', qty: 5 }),
  bal('b2', { sku: 'SKU-Z', bin: 'RH-A-R-01-02', qty: 60 }),
  bal('b3', { sku: 'SKU-Q', bin: 'RH-A-R-01-03', qty: 2 }), //  صنفٌ ليس في الورقة
  bal('b4', { sku: 'IRON', bin: 'RH-A-R-01-04', qty: 10 }), //    ٤٠ كجم من صنفٍ ليس في الورقة
  bal('b5', { sku: 'SKU-B', location: 'RH-A-R-02-01', qty: 3 }), // الحقلُ القديم وحدَه
  bal('b6', { sku: 'SKU-A', batch: 'L9', bin: 'TR-A-R-01-02', qty: 4 }),
  bal('b7', { sku: 'SKU-A', bin: 'RHX-A-R-01-01', qty: 7 }),
  bal('b8', { sku: 'SKU-A', bin: 'RH2-A-R-01-01', qty: 7 }),
  bal('b9', { sku: 'BYBC', barcode: 'ITEMSKU-BC', bin: 'RH-B-L-01-01', qty: 2 }), // `get(b.barcode)`
  // أرصدةٌ بلا خانة — جُلُّ الافتتاحيّ — لا أثرَ لها في الاقتراح
  ...Array.from({ length: 60 }, (_, i) => bal(`open${i}`, { sku: `OPEN-${i}`, qty: 9 })),
];

const ITEMS = [
  { sku: 'BC-ONLY', barcodes: ['6001'], unitWeightKg: 1 },
  { sku: 'DUP-1', barcodes: ['7001'], storageType: 'chilled' }, //  باركودٌ مكرّر: الأوّل بالكود يفوز
  { sku: 'DUP-2', barcodes: ['7001'] },
  { sku: 'HEAVY', barcodes: ['8001'], unitWeightKg: 4 },
  { sku: 'IRON', barcodes: ['8201'], unitWeightKg: 4 }, //       في الرفّ لا في الورقة
  { sku: 'ITEMSKU-BC', barcodes: ['8101'], unitWeightKg: 2 },
  { sku: 'OLD', barcodes: ['9001'], archived: true }, //           مؤرشفٌ — يسقط إلى الباركود
  { sku: 'OLD-NEW', barcodes: ['9002'], unitWeightKg: 3 },
  { sku: 'PALLETY', barcodes: ['5001'], uomFactors: { pallet: 48 } },
  { sku: 'SKU-A', barcodes: ['1001'], unitWeightKg: 1, storageType: 'ambient' },
  { sku: 'SKU-B', barcodes: ['1002'], unitWeightKg: 2 },
  { sku: 'SKU-Z', barcodes: ['1009'], unitWeightKg: 1 },
  ...Array.from({ length: 80 }, (_, i) => ({ sku: `CAT-${String(i).padStart(3, '0')}`, barcodes: [`4${i}`] })),
];

const line = (extra) => ({ sku: '', barcode: '', uom: '', batch: '', expiry: '', qty: 5, ...extra });

const PREVIEW = {
  type: 'receipt',
  documents: [
    {
      docRef: 'IN-1',
      warehouse: 'RH',
      lines: [
        line({ sku: 'SKU-A', batch: 'L1' }),
        line({ sku: 'sku-b', qty: 2 }), //                          كودٌ بحروفٍ صغيرة
        line({ sku: 'HEAVY', qty: 3 }),
        line({ sku: 'NOPE', barcode: '6001' }), //                 كودٌ مجهول وباركودٌ معروف
        line({ barcode: '0007001' }), //                            بلا كود، وبأصفارٍ بادئة
        line({ sku: 'OLD', barcode: '9002' }), //                   كودُ مؤرشف ⇒ يُطلب بالباركود
        line({ sku: 'PALLETY', qty: 1 }),
        line({ sku: 'GHOST', barcode: '0000' }), //                 لا بطاقةَ أصلًا
        line({ sku: 'SKU-Z', qty: 0 }),
      ],
    },
    { docRef: 'IN-2', warehouse: ' tr ', lines: [line({ sku: 'SKU-A', batch: 'L1', qty: 1 })] },
    { docRef: 'IN-3', warehouse: 'ZZ', lines: [line({ sku: 'SKU-A' })] }, //  مستودعٌ بلا خانات
  ],
};

/** قارئٌ بعقد Firestore — ويعدّ القراءات كما تعدّها الفاتورة. */
function fakeFirestore({ locations = LOCATIONS, balances = BALANCES, items = ITEMS, catalog = null } = {}) {
  const stats = { queries: 0, reads: 0, calls: [] };
  const bill = (rows) => {
    stats.queries += 1;
    stats.reads += Math.max(1, rows.length);
    return rows;
  };
  const inChunks = (values, fn) =>
    chunksOf(values).flatMap((chunk) => {
      assert.ok(chunk.length <= IN_LIMIT, `استعلامٌ بـ${chunk.length} قيمة — والحدّ ${IN_LIMIT}`);
      return bill(fn(chunk));
    });
  const reader = {
    locationsIn: async (whs) => {
      stats.calls.push(['locationsIn', [...whs]]);
      return inChunks(whs, (c) => locations.filter((l) => c.includes(l.warehouse)));
    },
    balancesInBinsOf: async (prefixes) => {
      stats.calls.push(['balancesInBinsOf', [...prefixes]]);
      const seen = new Map();
      for (const p of prefixes) {
        const { start, end } = binPrefixRange(p);
        for (const field of ['bin', 'location']) {
          const rows = bill(balances.filter((b) => typeof b[field] === 'string' && b[field] >= start && b[field] < end));
          for (const r of rows) if (!seen.has(r.id)) seen.set(r.id, r);
        }
      }
      return [...seen.values()];
    },
    itemsBySkus: async (skus) => {
      stats.calls.push(['itemsBySkus', [...skus]]);
      return inChunks(skus, (c) => items.filter((it) => c.includes(it.sku)));
    },
    itemsByBarcodes: async (values) => {
      stats.calls.push(['itemsByBarcodes', [...values]]);
      return inChunks(values, (c) => items.filter((it) => (it.barcodes || []).some((b) => c.includes(b))));
    },
    cachedItems: () => catalog,
  };
  return { stats, reader };
}

/** ما كانت الشاشةُ تفعله: المجموعاتُ كلُّها، والأصنافُ غيرُ المؤرشفة مرتّبةً بالكود. */
function fullWorld() {
  const locations = [...LOCATIONS].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  const items = ITEMS.filter((it) => !it.archived).sort((a, b) => (a.sku < b.sku ? -1 : 1));
  const index = itemIndexOf(items);
  return { locations, balances: BALANCES, index, loads: items.length ? loadIndexOf(BALANCES, index.bySku) : null };
}

/** البندُ كما تبنيه `SuggestedBin` في الشاشة. */
const asEngineLine = (l, warehouse) => ({
  sku: l.sku,
  barcode: l.barcode,
  uom: l.uom,
  batch: l.batch,
  expiry: l.expiry,
  qty: Number(l.qty) || 0,
  warehouse,
});

const NOW = 1_800_000_000_000;

/** ما تفعله `SuggestedBin` حرفًا: ما يُقال قبل المحرّك، وإلّا المحرّكُ كما كان. */
const advise = ({ scoped, warehouse, locations, ...rest }) =>
  scopedSuggestionGap({ scoped, warehouse, locations }) || suggestLocations({ warehouse, locations, ...rest });

/* ═══════════════════════ ① لا قراءةَ بلا ورقة ═══════════════════════ */

test('① الفتحُ بلا ملفٍّ لا يقرأ شيئًا', async () => {
  const { stats, reader } = fakeFirestore();
  const scope = scopeOfPreview(null);
  assert.ok(isEmptyScope(scope));
  const out = await loadReference(scope, reader, newReferenceMemo(), { now: NOW });
  assert.deepEqual(out, { locations: [], balances: [], items: [], catalog: false });
  assert.equal(stats.queries, 0, 'فتحُ الشاشة أطلق استعلامًا');
});

test('① أمرُ التسليم لا عمودَ اقتراحٍ له — فلا يقرأ شيئًا ولو حمل مئةَ بند', async () => {
  const { stats, reader } = fakeFirestore();
  const scope = scopeOfPreview({ ...PREVIEW, type: 'delivery' });
  assert.ok(isEmptyScope(scope));
  await loadReference(scope, reader, newReferenceMemo(), { now: NOW });
  assert.equal(stats.queries, 0);
});

test('① مستندٌ يدويٌّ بلا مستودع لا يُطلق قراءةً — ويقول «حدّد المستودع» لا «لا مواقع»', async () => {
  const { stats, reader } = fakeFirestore();
  const manual = { type: 'receipt', documents: [{ docRef: 'M-1', warehouse: '', manual: true, lines: [line({ sku: 'SKU-A' })] }] };
  const scope = scopeOfPreview(manual);
  assert.ok(isEmptyScope(scope));
  await loadReference(scope, reader, newReferenceMemo(), { now: NOW });
  assert.equal(stats.queries, 0);
  const advice = advise({ line: asEngineLine(line({ sku: 'SKU-A' }), ''), warehouse: '', locations: [], balances: [], scoped: true });
  assert.match(advice.problem, /حدّد مستودع/);
});

/* ═══════════════════════ ② نطاقُ الورقة وحدَه ═══════════════════════ */

test('② النطاقُ: مستودعاتُ الورقة وأكوادُها — مطبَّعةً ومرتّبة', () => {
  const scope = scopeOfPreview(PREVIEW);
  assert.deepEqual(scope.warehouses, ['RH', 'TR', 'ZZ']);
  assert.ok(scope.skus.includes('SKU-B'), 'الكودُ يُطبَّع كما يطبّعه الكاتب');
  // تحريرُ الكمّيّة لا يغيّر النطاق — فلا يُطلق قراءة.
  const edited = structuredClone(PREVIEW);
  edited.documents[0].lines[0].qty = 999;
  edited.documents[0].lines[0].notes = 'ملاحظة';
  assert.equal(scopeKey(scopeOfPreview(edited)), scopeKey(scope));
});

test('② لا يُقرأ إلّا خاناتُ مستودعات الورقة وأرصدةُ تلك الخانات', async () => {
  const { stats, reader } = fakeFirestore();
  const out = await loadReference(scopeOfPreview(PREVIEW), reader, newReferenceMemo(), { now: NOW });

  assert.ok(out.locations.length > 0);
  assert.deepEqual([...new Set(out.locations.map((l) => l.warehouse))].sort(), ['RH', 'TR']);
  // ★ بادئتان تبدآن بـRH ولا تخصّان الورقة — مدى `RH-`…`RH.` لا يُدخلهما.
  assert.ok(!out.locations.some((l) => l.code.startsWith('RHX') || l.code.startsWith('RH2')));
  assert.ok(!out.balances.some((b) => ['b7', 'b8'].includes(b.id)));
  // ★ والرصيدُ المكتوب بالحقل القديم وحدَه يُقرأ — `balanceLocationCode` يقرؤه.
  assert.ok(out.balances.some((b) => b.id === 'b5'));
  // ★ والأرصدةُ بلا خانةٍ لا تُقرأ — لا أثرَ لها في الاقتراح.
  assert.ok(!out.balances.some((b) => b.id.startsWith('open')));

  const total = LOCATIONS.length + BALANCES.length + ITEMS.length;
  assert.ok(stats.reads < total / 3, `قرأ ${stats.reads} من ${total} — ليس نطاقَ الورقة`);
});

test('② وما قُرئ لا يُقرأ ثانيةً — دورةُ «صحّح وارفع» مجّانيّة، وبعد عشر دقائق يُجدَّد', async () => {
  const { stats, reader } = fakeFirestore();
  const memo = newReferenceMemo();
  const scope = scopeOfPreview(PREVIEW);
  const first = await loadReference(scope, reader, memo, { now: NOW });
  const after = stats.queries;

  const again = await loadReference(scope, reader, memo, { now: NOW + 60_000 });
  assert.equal(stats.queries, after, 'إعادةُ الرفع خلال دقيقةٍ أعادت القراءة');
  assert.deepEqual(again, first);

  // بندٌ جديدٌ يُمسح ⇒ يُطلب صنفُه وحدَه.
  const grown = structuredClone(PREVIEW);
  grown.documents[0].lines.push(line({ sku: 'CAT-007' }));
  await loadReference(scopeOfPreview(grown), reader, memo, { now: NOW + 90_000 });
  const fresh = stats.calls.slice(-1);
  assert.deepEqual(fresh, [['itemsBySkus', ['CAT-007']]]);

  await loadReference(scope, reader, memo, { now: NOW + REFERENCE_TTL_MS + 1 });
  assert.ok(stats.queries > after + 1, 'بعد انقضاء العمر لم يُجدَّد شيء');
});

test('② الكتالوجُ الطازجُ في الذاكرة يُغني عن قراءة الأصناف كلِّها', async () => {
  const catalog = ITEMS.filter((it) => !it.archived);
  const { stats, reader } = fakeFirestore({ catalog });
  const out = await loadReference(scopeOfPreview(PREVIEW), reader, newReferenceMemo(), { now: NOW });
  assert.equal(out.catalog, true);
  assert.equal(out.items, catalog);
  assert.ok(!stats.calls.some(([name]) => name.startsWith('items')), 'قرأ أصنافًا والكتالوجُ حاضر');
});

test('② الدفعاتُ لا تتجاوز حدَّ `in` — ستّون كودًا تُقرأ في ثلاثة استعلامات', () => {
  assert.equal(IN_LIMIT, 30);
  assert.deepEqual(chunksOf(Array.from({ length: 61 }, (_, i) => i)).map((c) => c.length), [30, 30, 1]);
  assert.deepEqual(chunksOf([]), []);
  assert.deepEqual(binPrefixRange(' rh '), { start: 'RH-', end: 'RH.' });
  assert.equal(balanceWarehouseOf({ bin: 'rh-a-r-01-01' }), 'RH');
  assert.equal(balanceWarehouseOf({ location: 'TR-A-R-01-02' }), 'TR');
  assert.equal(balanceWarehouseOf({}), '');
});

/* ═══════════════ ③ ★★★ الحكمُ المقصورُ يطابق الكاملَ بندًا بندًا ═══════════════ */

test('③ الاقتراحُ من نطاق الورقة يطابق الاقتراحَ من المجموعات كاملةً — بندًا بندًا', async () => {
  const full = fullWorld();
  const { reader } = fakeFirestore();
  const scoped = await loadReference(scopeOfPreview(PREVIEW), reader, newReferenceMemo(), { now: NOW });
  const index = itemIndexOf(scoped.items);
  const loads = loadIndexOf(scoped.balances, index.bySku);

  let compared = 0;
  let withCandidate = 0;
  for (const doc of PREVIEW.documents) {
    for (const l of doc.lines) {
      const engineLine = asEngineLine(l, doc.warehouse);
      const fullItem = itemOfIndex(full.index, l);
      const scopedItem = itemOfIndex(index, l);
      assert.equal(scopedItem?.sku ?? null, fullItem?.sku ?? null, `بطاقةُ ${l.sku || l.barcode} افترقت`);

      const before = suggestLocations({
        line: engineLine,
        locations: full.locations,
        balances: full.balances,
        item: fullItem,
        loads: full.loads,
        warehouse: doc.warehouse,
      });
      const after = advise({
        line: engineLine,
        warehouse: doc.warehouse,
        locations: scoped.locations,
        balances: scoped.balances,
        item: scopedItem,
        loads,
        scoped: true,
      });
      assert.deepEqual(after, before, `${doc.docRef} · ${l.sku || l.barcode}: الاقتراحُ تغيّر`);
      compared += 1;
      if (before.candidates.length) withCandidate += 1;
    }
  }
  assert.equal(compared, 11);
  assert.ok(withCandidate >= 6, 'العالَمُ لا يُنتج اقتراحاتٍ تُقارَن — الحارسُ أعمى');
});

test('③ والعالَمُ يمتحن ما يُفسده القصرُ الخاطئ — لا مطابقةً سهلة', () => {
  const full = fullWorld();
  const heavy = PREVIEW.documents[0].lines[2];
  const advice = suggestLocations({
    line: asEngineLine(heavy, 'RH'),
    locations: full.locations,
    balances: full.balances,
    item: itemOfIndex(full.index, heavy),
    loads: full.loads,
    warehouse: 'RH',
  });
  const codes = (list) => list.map((c) => c.code);
  // حِملُ صنفٍ ليس في الورقة يُسقط رفًّا — فبطاقاتُ أرصدة الخانات لازمة.
  assert.ok(codes(advice.rejected).includes('RH-A-R-01-04'));
  // وصنفٌ آخرُ في رفٍّ لا يقبل الخلط — فأرصدةُ الخانة كلُّها لازمة لا أرصدةُ الورقة.
  assert.ok(codes(advice.rejected).includes('RH-A-R-01-03'));
  // والمؤرشفُ يسقط إلى الباركود، والمكرّرُ يفوز فيه الأوّلُ بالكود.
  assert.equal(itemOfIndex(full.index, PREVIEW.documents[0].lines[5]).sku, 'OLD-NEW');
  assert.equal(itemOfIndex(full.index, PREVIEW.documents[0].lines[4]).sku, 'DUP-1');
});

/* ═══════════════════ ④ بصماتُ منع التكرار بمعرّفاتها ═══════════════════ */

test('④ بصماتُ الورقة بمعرّفاتها تُصنّف الصفوفَ كما صنّفتها القراءةُ الكاملة حرفًا', async () => {
  // المخزنُ كما يكتبه الكاتبُ الوحيد: `batch.set(doc(COL, fingerprintId(fp)), {...})` —
  // والكتابةُ الثانية على المعرّف نفسِه تحلّ محلّ الأولى.
  const store = new Map();
  const write = (fp, kind) => store.set(fingerprintId(fp), { fingerprint: fp, kind });
  const long = 'X'.repeat(420);
  write('IN-1|1|2026-10-19', 'receipt');
  write('IN-1|2|2026-10-19', 'receipt');
  write('OUT/7.1 #a', 'delivery'); //          محارفُ يُنظّفها المعرّف
  write('IN-9|1', 'delivery'); //              بصمةٌ واحدةٌ بنوعين: آخرُ كتابةٍ تفوز
  write('IN-9|1', 'receipt');
  write(`${long}A`, 'receipt'); //              معرّفان يتصادمان بالقصّ عند ٤٠٠
  write(`${long}B`, 'receipt');
  for (let i = 0; i < 300; i++) write(`OLD-${i}`, 'receipt');

  const rows = [
    { fingerprint: 'IN-1|1|2026-10-19' },
    { fingerprint: ' IN-1|2|2026-10-19 ' },
    { fingerprint: 'OUT/7.1 #a' },
    { fingerprint: 'IN-9|1' },
    { fingerprint: `${long}A` },
    { fingerprint: `${long}B` },
    { fingerprint: 'NEW-1' },
    { fingerprint: '' },
    { fingerprint: '__reserved__' },
    { fingerprint: 'NEW-1' },
  ];

  let reads = 0;
  const fetchByIds = async (ids) => {
    assert.ok(ids.length <= IN_LIMIT);
    assert.ok(!ids.includes('__reserved__'), 'معرّفٌ محجوزٌ أُرسل — يُسقط الاستعلامَ كلَّه');
    const hits = ids.map((id) => store.get(id)).filter(Boolean);
    reads += Math.max(1, hits.length);
    return hits;
  };

  for (const kind of ['receipt', 'delivery']) {
    const all = new Set([...store.values()].filter((d) => d.kind === kind).map((d) => d.fingerprint));
    const mine = await knownFingerprintsFor(kind, rows.map((r) => r.fingerprint), fetchByIds);
    assert.deepEqual(classifyRows(rows, mine), classifyRows(rows, all), `التصنيفُ افترق في ${kind}`);
  }
  assert.ok(reads < 20, `قرأ ${reads} — والمخزنُ ${store.size}`);
});

/* ═══════════════════ ⑤ الشاشةُ ومفتاحُ الإطفاء ═══════════════════ */

test('⑤ مفتاحُ الإطفاء: «1» في المتصفّح يُعيد القديم — وغيابُه أو تعذُّرُه لا يُعيده', () => {
  assert.equal(SCOPED_READS, true, 'المفتاحُ العامّ مُطفأ — الشاشةُ تقرأ المجموعاتِ كاملةً للجميع');
  assert.equal(FULL_READS_KEY, 'bz.directedStorage.fullReads');
  assert.equal(fullReadsForced(null), false);
  assert.equal(fullReadsForced({ getItem: () => null }), false);
  assert.equal(fullReadsForced({ getItem: () => '0' }), false);
  assert.equal(fullReadsForced({ getItem: (k) => (k === FULL_READS_KEY ? '1' : null) }), true);
  assert.equal(
    fullReadsForced({
      getItem() {
        throw new Error('SecurityError');
      },
    }),
    false
  );
});

/** النصُّ بلا تعليقات — كي لا يُسقط الشرحُ الحارسَ بذكره الأسماء. */
const code = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');

const FULL_READERS = ['listenLocations', 'listenBalances', 'subscribeItems', 'fetchLocationsOnce', 'fetchBalancesOnce'];

test('⑤ الشاشةُ لا تشترك في مجموعةٍ كاملة — ولا تستورد قارئًا كاملًا أصلًا', () => {
  const screen = code(read('../../components/brandzo-erp/locations/DirectedStorage.jsx'));
  const hits = FULL_READERS.filter((name) => new RegExp(`\\b${name}\\b`).test(screen));
  assert.deepEqual(hits, [], `DirectedStorage.jsx يستعمل قارئًا كاملًا: ${hits.join(' · ')}`);
  assert.match(screen, /useDirectedReference\(preview, fullReads\)/, 'الشاشةُ لا تأخذ مراجعَها من النطاق');
  // وتُركّب الاقتراحَ كما يركّبه الحارسُ ③ — فما طابقه هناك هو ما يُرسم هنا.
  assert.match(
    screen,
    /scopedSuggestionGap\(\{ scoped, warehouse, locations \}\) \|\|\s*suggestLocations\(/,
    'الشاشةُ لا تُركّب الاقتراحَ المقصورَ كما يُختبر'
  );
  assert.match(screen, /analyzeSourceFile\(file, kind, \{ fullReads \}\)/, 'المعاينةُ لا تمرّر مفتاحَ الإطفاء');
});

test('⑤ المستمعون الكاملون في الخطّاف خلف مفتاح الإطفاء وحدَه — والمقصورُ لا يُطلق بلا نطاق', () => {
  const hook = code(read('../../components/brandzo-erp/locations/useDirectedReference.js'));
  const gate = hook.indexOf('if (!fullReads) return');
  assert.ok(gate > 0, 'لا بوّابةَ لمفتاح الإطفاء قبل المستمعين الكاملين');
  const gateEnd = hook.indexOf('}, [fullReads]);', gate);
  assert.ok(gateEnd > gate);
  for (const name of ['listenLocations', 'listenBalances', 'subscribeItems']) {
    const calls = [...hook.matchAll(new RegExp(`\\b${name}\\(`, 'g'))].map((m) => m.index);
    assert.equal(calls.length, 1, `${name} يُستدعى ${calls.length} مرّة`);
    assert.ok(calls[0] > gate && calls[0] < gateEnd, `${name} يُستدعى خارج بوّابة مفتاح الإطفاء`);
  }
  assert.match(hook, /if \(fullReads \|\| isEmptyScope\(scope\)\) return/, 'القراءةُ المقصورةُ تُطلق بلا نطاق');
});
