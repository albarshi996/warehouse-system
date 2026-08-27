/**
 * اختبارات الجرد بالطبلية — «الالتقاط لا يُحاسِب» مُمَكْنَنًا (ح-٣ · ق-٢).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SIGHTING,
  applySighting,
  counterView,
  palletDiff,
  palletSightingVerdict,
  reconcileInput,
  sightingTotals,
} from './countPallet.js';

const A = 'LPN-MAIN-20260827-000001';
const B = 'LPN-MAIN-20260827-000002';
const C = 'LPN-MAIN-20260827-000003';

const UNIT = {
  code: A, state: 'STORED', warehouse: 'MAIN', bin: 'MAIN-A01-R01-B01',
  lines: [{ sku: 'WNW-001', name: 'ماء نوفا', batch: 'B2408', baseQty: 60 }],
};
const CTX = { bin: 'MAIN-A01-R01-B01', unit: UNIT, actor: 'العادّ', at: '2026-08-27T09:00:00Z' };

test('★★★ ح-٣: المشاهدة لا تُعيد كمّيّةً واحدة — لا في الحكم ولا في العرض', () => {
  const v = palletSightingVerdict({ sightings: [] }, A, CTX);
  assert.ok(v.ok);

  // فحصٌ بنيويّ لا نصّيّ: لا مفتاحَ يشبه الكمّيّة في أيّ عمقٍ من المخرَج.
  // (والنصّيّ يخدع: «20260827» في الهويّة يحوي «60».)
  const keys = (o, out = []) => {
    if (!o || typeof o !== 'object') return out;
    for (const [k, val] of Object.entries(o)) { out.push(k); keys(val, out); }
    return out;
  };
  const quantityish = /qty|quantity|count|amount|total/i;
  assert.deepEqual(keys(v).filter((k) => quantityish.test(k)), [], 'لا مفتاحَ كمّيّةٍ في الحكم');
  assert.deepEqual(
    keys(counterView(v.sighting, UNIT)).filter((k) => quantityish.test(k) && k !== 'needsManualCount'),
    [],
    'ولا في ما يراه العادّ — عدا وسمِ «تحتاج عدًّا» وهو نعم/لا لا رقم'
  );
  assert.equal(typeof counterView(v.sighting, UNIT).needsManualCount, 'boolean');
});

test('★★ ما يراه العادّ وصفٌ لا عدد — «ماء نوفا» لا «٦٠»', () => {
  const v = palletSightingVerdict({ sightings: [] }, A, CTX);
  const view = counterView(v.sighting, UNIT);
  assert.equal(view.itemsHint, 'ماء نوفا');
  assert.ok(!view.needsManualCount);
  assert.match(view.hint, /لا حاجة لفتحها/);

  const many = { lines: [{ name: 'ماء' }, { name: 'عصير' }, { name: 'حليب' }, { name: 'شاي' }] };
  assert.equal(counterView(v.sighting, many).itemsHint, 'ماء وعصير و2 غيرها', 'عددُ الأصناف لا كمّيّاتها');
});

test('★★ المفتوحةُ تُعدّ فعليًّا — والمغلقةُ السليمة تكفيها مسحة', () => {
  const sealed = palletSightingVerdict({ sightings: [] }, A, CTX).sighting;
  assert.ok(!counterView(sealed, UNIT).needsManualCount);

  const opened = palletSightingVerdict({ sightings: [] }, A, { ...CTX, sighting: 'OPENED' }).sighting;
  const view = counterView(opened, UNIT);
  assert.ok(view.needsManualCount);
  assert.match(view.hint, /عُدّ محتواها صنفًا صنفًا/);
  assert.equal(Object.keys(SIGHTING).length, 3);
});

test('🔒 مشاهدةٌ بلا موقعٍ أو فاعلٍ لا تُسجَّل — والمكرّرة تُردّ', () => {
  assert.match(palletSightingVerdict({}, A, { ...CTX, bin: '' }).message, /امسح باركود الموقع أوّلًا/);
  assert.match(palletSightingVerdict({}, A, { ...CTX, actor: '' }).message, /من رآها/);
  assert.match(palletSightingVerdict({}, 'B2408', CTX).message, /ليس ملصق طبلية/);

  const s = applySighting({ sightings: [] }, palletSightingVerdict({}, A, CTX).sighting);
  const again = palletSightingVerdict(s, A, CTX);
  assert.ok(!again.ok);
  assert.match(again.message, /مُسجَّلةٌ في هذه الجلسة/);
});

test('خلاصةُ الجلسة عددُ مشاهداتٍ لا كمّيّات', () => {
  let s = { sightings: [] };
  s = applySighting(s, palletSightingVerdict(s, A, CTX).sighting);
  s = applySighting(s, palletSightingVerdict(s, B, { ...CTX, sighting: 'OPENED' }).sighting);
  const t = sightingTotals(s);
  assert.deepEqual({ seen: t.seen, sealed: t.sealed, opened: t.opened, bins: t.bins }, { seen: 2, sealed: 1, opened: 1, bins: 1 });
  assert.ok(!('qty' in t), 'لا كمّيّة في الخلاصة');
});

// ═══ ما بعد الختم — طبقة المطابقة ═══

test('★★★ المفقودة والمنقولة قائمتان منفصلتان — وخلطُهما يجعل جردًا سليمًا كارثة', () => {
  const units = [
    UNIT,
    { code: B, state: 'STORED', bin: 'MAIN-A01-R01-B02', lines: [{ sku: 'X', baseQty: 10 }] },
    { code: C, state: 'STORED', bin: 'MAIN-A01-R01-B03', lines: [{ sku: 'Y', baseQty: 5 }] },
  ];
  // A رُئيت في مكانها · B رُئيت في رفٍّ آخر · C لم تُرَ
  const session = {
    warehouse: 'MAIN',
    sightings: [
      { lpn: A, bin: 'MAIN-A01-R01-B01', sighting: 'SEALED' },
      { lpn: B, bin: 'MAIN-A01-R09-B09', sighting: 'SEALED' },
    ],
  };
  const d = palletDiff(session, units);
  assert.deepEqual(d.missing.map((m) => m.lpn), [C], 'المفقودة وحدها');
  assert.deepEqual(d.misplaced.map((m) => m.lpn), [B], 'والمنقولة وحدها');
  assert.equal(d.misplaced[0].recordedBin, 'MAIN-A01-R01-B02');
  assert.equal(d.misplaced[0].seenBin, 'MAIN-A01-R09-B09');
});

test('★★ رُئيت ولا سجلَّ لها — حمولةٌ في المستودع لا يعرفها النظام', () => {
  const session = { warehouse: 'MAIN', sightings: [{ lpn: C, bin: 'MAIN-A01-R01-B05', sighting: 'SEALED' }] };
  const d = palletDiff(session, [UNIT]);
  assert.deepEqual(d.stray.map((s) => s.lpn), [C]);
  assert.equal(d.stray[0].seenBin, 'MAIN-A01-R01-B05');
});

test('★ النطاق يحصر المتوقَّع — طبليةُ منطقةٍ أخرى ليست مفقودةً من جلسةٍ لا تشملها', () => {
  const units = [UNIT, { code: B, state: 'STORED', bin: 'MAIN-A09-R01-B01', lines: [] }];
  const scoped = { warehouse: 'MAIN', zone: 'MAIN-A01', sightings: [{ lpn: A, bin: 'MAIN-A01-R01-B01', sighting: 'SEALED' }] };
  assert.deepEqual(palletDiff(scoped, units).missing, [], 'خارج النطاق لا يُحسب فقدًا');

  const wide = { warehouse: 'MAIN', sightings: [{ lpn: A, bin: 'MAIN-A01-R01-B01', sighting: 'SEALED' }] };
  assert.deepEqual(palletDiff(wide, units).missing.map((m) => m.lpn), [B], 'وبلا تضييقٍ تُحسب');
});

test('★★★ القاعدة ١٧: المخرَج مدخلاتُ تسويةٍ لا تسوية — ولا رصيدَ يُكتب', () => {
  const units = [UNIT];
  const session = { warehouse: 'MAIN', sightings: [] };
  const d = palletDiff(session, units);
  const r = reconcileInput(d, units);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].kind, 'MISSING_PALLET');
  assert.equal(r.rows[0].bookQty, 60, 'الكمّيّة تظهر **هنا** — بعد الختم لا أمام العادّ');
  assert.equal(r.rows[0].countedQty, 0);
  assert.match(r.rows[0].note, /تحقيقٌ قبل التسوية/);
});

test('★★ المنقولة لا تدخل التسوية — تصحيحُها نقلُ موقعٍ لا تسويةُ رصيد', () => {
  const units = [{ code: B, state: 'STORED', bin: 'MAIN-A01-R01-B02', lines: [{ sku: 'X', baseQty: 10 }] }];
  const session = { warehouse: 'MAIN', sightings: [{ lpn: B, bin: 'MAIN-A01-R09-B09', sighting: 'SEALED' }] };
  const r = reconcileInput(palletDiff(session, units), units);
  assert.deepEqual(r.rows, [], 'لا صفَّ تسويةٍ — الكمّيّة لم تتغيّر');
  assert.equal(r.relocations.length, 1, 'بل نقلُ موقع');
});

test('🔒 حارسٌ نصّيّ: لا حقلَ كمّيّةٍ في مسار العادّ — من أراد إظهاره سيصطدم بهذا', () => {
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'countPallet.js'), 'utf8');
  const counterSection = src.slice(0, src.indexOf('ما بعد الختم'));
  assert.doesNotMatch(counterSection, /baseQty|bookQty|totalBaseQty/, 'مسارُ العادّ خالٍ من الكمّيّات نصًّا');
  assert.match(src, /شهادةُ رؤيةٍ لا احتسابُ كمّيّة/, 'والقاعدة مكتوبةٌ في الملفّ');
});
