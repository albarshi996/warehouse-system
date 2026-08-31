/**
 * اختبارات هويّة الجهاز والمعرّف الحتميّ ‹CAP-301 · CAP-302› — منطق خالص.
 *
 * الخاصّيّتان اللتان يحرسهما:
 *   ★★ **إرسالُ القيد نفسه مرّتين يُنتج كمّيّةً واحدة** — لأنّ مساره واحد.
 *   ★★★ **والتسلسلُ لا يرتدّ أبدًا**: عدّادٌ يعود للصفر يجعل القيدَ الجديد
 *       يصطدم بمسار قيدٍ قديمٍ فيُرفض صامتًا — ويضيع عدٌّ حقيقيّ. وذلك أخطر
 *       من التضاعف الذي عولج.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deviceId,
  seqKey,
  nextSeq,
  scanDocId,
  issueScanId,
  dedupeScans,
} from './scanIdentity.js';
import { summarizeScans } from './scanMerge.js';

function fakeStore(init = {}) {
  const map = new Map(Object.entries(init));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

/** مولّدٌ حتميٌّ ليكون الاختبار قابلًا للإعادة. */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/* ───────────────── ★ هويّة الجهاز ───────────────── */

test('★ الهويّةُ ثابتةٌ عبر الاستدعاءات — تُولَّد مرّةً وتُحفظ', () => {
  const s = fakeStore();
  const a = deviceId(s, seeded(7));
  const b = deviceId(s, seeded(99));
  assert.equal(a, b, 'المولّدُ اختلف والهويّةُ لم تختلف — لأنّها محفوظة');
  assert.match(a, /^[a-z0-9]{12}$/);
});

test('جهازان مختلفان هويّتان مختلفتان', () => {
  const a = deviceId(fakeStore(), seeded(1));
  const b = deviceId(fakeStore(), seeded(2));
  assert.notEqual(a, b);
});

test('★ الهويّةُ المعطوبةُ في التخزين تُستبدل ولا تُستعمل', () => {
  const s = fakeStore({ bzDeviceId: 'ليست هويّة' });
  assert.match(deviceId(s, seeded(3)), /^[a-z0-9]{12}$/);
});

test('★ بلا تخزينٍ لا ينهار — هويّةٌ عابرةٌ والعدُّ يمضي (ق-٣)', () => {
  assert.match(deviceId(null, seeded(4)), /^[a-z0-9]{12}$/);
  const throwing = fakeStore();
  throwing.getItem = () => {
    throw new Error('SecurityError');
  };
  throwing.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  assert.match(deviceId(throwing, seeded(5)), /^[a-z0-9]{12}$/);
});

/* ───────────────── ★★★ التسلسل لا يرتدّ ───────────────── */

test('يبدأ من ١ ويزيد', () => {
  const s = fakeStore();
  assert.equal(nextSeq(s, 'op1'), 1);
  assert.equal(nextSeq(s, 'op1'), 2);
  assert.equal(nextSeq(s, 'op1'), 3);
});

test('★★★ لا يرتدّ بعد «إعادة تحميل» — التخزين هو الذاكرة لا المتغيّر', () => {
  const s = fakeStore();
  nextSeq(s, 'op1');
  nextSeq(s, 'op1');
  // إعادةُ تحميلٍ = استدعاءٌ جديدٌ على التخزين نفسِه
  assert.equal(nextSeq(s, 'op1'), 3, 'لا يعود إلى ١ فيصطدم بمسارٍ قائم');
});

test('★ قيمةٌ معطوبةٌ أو سالبةٌ تُقرأ صفرًا ولا تُنقص العدّاد', () => {
  assert.equal(nextSeq(fakeStore({ 'bzScanSeq:op1': 'كلام' }), 'op1'), 1);
  assert.equal(nextSeq(fakeStore({ 'bzScanSeq:op1': '-8' }), 'op1'), 1);
  assert.equal(nextSeq(fakeStore({ 'bzScanSeq:op1': '4.7' }), 'op1'), 5);
});

test('كلُّ جلسةٍ عدّادٌ مستقلّ', () => {
  const s = fakeStore();
  nextSeq(s, 'op1');
  nextSeq(s, 'op1');
  assert.equal(nextSeq(s, 'op2'), 1);
  assert.equal(nextSeq(s, 'op1'), 3);
  assert.equal(seqKey('op1'), 'bzScanSeq:op1');
});

/* ───────────────── ★★ المعرّف الحتميّ ───────────────── */

test('★★ المدخلاتُ نفسُها تُنتج المعرّفَ نفسَه — حتميٌّ لا عشوائيّ', () => {
  assert.equal(scanDocId('opBEN', 'abc123def456', 7), scanDocId('opBEN', 'abc123def456', 7));
});

test('اختلافُ التسلسل أو الجهاز أو الجلسة يُنتج معرّفًا مختلفًا', () => {
  const base = scanDocId('op1', 'dev1', 1);
  assert.notEqual(base, scanDocId('op1', 'dev1', 2));
  assert.notEqual(base, scanDocId('op1', 'dev2', 1));
  assert.notEqual(base, scanDocId('op2', 'dev1', 1));
});

test('★ يُطبَّع إلى أبجديّةٍ آمنةٍ في مسار Firestore — لا شرطةَ مائلةٌ ولا نقاط', () => {
  const id = scanDocId('op/1..x', 'dev ice', 3);
  assert.ok(!id.includes('/'), 'الشرطةُ المائلة تكسر المسار');
  assert.ok(!id.includes('.'), 'النقاطُ المفردة محجوزةٌ في Firestore');
  assert.match(id, /^[a-z0-9-]+$/);
});

test('التسلسلُ مبطَّنٌ بالأصفار — فيُرتَّب نصًّا كما يُرتَّب رقمًا', () => {
  assert.match(scanDocId('op', 'dev', 7), /000007$/);
  assert.match(scanDocId('op', 'dev', 1234), /001234$/);
});

test('مدخلاتٌ فارغةٌ لا تُنتج معرّفًا معطوبًا', () => {
  const id = scanDocId('', '', 0);
  assert.equal(id, 's-op-dev-000001');
});

test('`issueScanId` يجمع الثلاثة ويزيد التسلسل', () => {
  const s = fakeStore();
  const a = issueScanId(s, 'op1', seeded(11));
  const b = issueScanId(s, 'op1', seeded(11));
  assert.equal(a.seq, 1);
  assert.equal(b.seq, 2);
  assert.equal(a.device, b.device, 'الجهازُ واحد');
  assert.notEqual(a.id, b.id, 'والمعرّفان مختلفان');
});

/* ───────────────── ★★ إثبات الغرض ───────────────── */

test('★★ إرسالُ القيد نفسه مرّتين يُنتج كمّيّةً واحدة', () => {
  const s = fakeStore();
  const { id } = issueScanId(s, 'op1', seeded(21));
  // المحاولةُ الثانية تُصيب المسارَ نفسَه — فالدفترُ يحمل مستندًا واحدًا.
  const ledger = summarizeScans(dedupeScans([
    { id, barcode: '801', qty: 5 },
    { id, barcode: '801', qty: 5 },
  ]));
  assert.equal(ledger.get('801').qty, 5, 'لا ١٠');
  assert.equal(ledger.get('801').count, 1);
});

test('★ قيدان بمعرّفَين مختلفَين يُجمعان — التكرارُ المشروع لا يُبتلع', () => {
  const s = fakeStore();
  const a = issueScanId(s, 'op1', seeded(31));
  const b = issueScanId(s, 'op1', seeded(31));
  const ledger = summarizeScans(dedupeScans([
    { id: a.id, barcode: '801', qty: 5 },
    { id: b.id, barcode: '801', qty: 5 },
  ]));
  assert.equal(ledger.get('801').qty, 10, 'من عدّ الصنفَ مرّتين قصدًا يُحسب مرّتين');
});

test('★ القيدُ القديم بلا معرّفٍ لا يُسقَط — ترحيلٌ صفرُ الأثر', () => {
  const rows = dedupeScans([{ barcode: '1', qty: 1 }, { barcode: '2', qty: 2 }]);
  assert.equal(rows.length, 2);
});

test('الأوّلُ يفوز لا الأخير — الثاني محاولةٌ مرتدّة', () => {
  const rows = dedupeScans([{ id: 'x', qty: 1 }, { id: 'x', qty: 99 }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].qty, 1);
});

test('لا ينهار على مُدخَلٍ غير قائمة', () => {
  assert.deepEqual(dedupeScans(null), []);
  assert.deepEqual(dedupeScans(undefined), []);
});
