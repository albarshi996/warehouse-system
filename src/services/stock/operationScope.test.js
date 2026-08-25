/**
 * حارس نطاق عمليّة الجرد ‹CAP-201›.
 *
 * أخطر ما يحرسه **قيد المالك ق-٣**: النطاق يُطلب ولا يُلزم. فكلّ اختبارٍ هنا
 * يسأل سؤالَين: أيُكتب النطاق حين يُعطى؟ و**أتبقى الجلسة عاملةً حين لا يُعطى؟**
 * ومن حوّل «لا يُلزم» إلى «يمنع» كسر القرار وهو يظنّ أنّه ينفّذه.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCOPE_FIELDS,
  normalizeScope,
  scopeLabel,
  scopeOf,
  scopeVerdict,
  scopeChoices,
  withinScope,
} from './operationScope.js';

/* ═══════════ التطبيع ═══════════ */

test('المستودع والمنطقة يصيران بادئةَ كود موقعٍ واحدة', () => {
  const s = normalizeScope({ warehouse: 'main', zone: 'a01' });
  assert.equal(s.warehouse, 'MAIN');
  assert.equal(s.zone, 'A01');
  assert.equal(s.code, 'MAIN-A01');
  assert.equal(s.declared, true);
});

test('مستودعٌ وحده نطاقٌ صالح — والمنطقة اختياريّة', () => {
  const s = normalizeScope({ warehouse: 'MAIN' });
  assert.equal(s.code, 'MAIN');
  assert.equal(s.declared, true);
  assert.deepEqual(s.notes, []);
});

test('الأرقام العربيّة والفراغات والحروف الصغيرة تلتقي على صيغةٍ واحدة', () => {
  assert.equal(normalizeScope({ warehouse: ' rhb ', zone: 'a٠١' }).code, 'RHB-A01');
});

test('★ منطقةٌ بلا مستودعٍ تُسقَط ويُعلَن إسقاطها — والكودُ موضعيٌّ فتُقرأ مستودعًا', () => {
  const s = normalizeScope({ zone: 'A01' });
  assert.equal(s.code, '');
  assert.equal(s.declared, false);
  assert.equal(s.zone, '');
  assert.match(s.notes.join(' '), /بلا مستودع/);
});

test('★ مقطعٌ بمحارف لا يقبلها كود الموقع يُسقَط كلُّه بسببه المكتوب — لا يُقتطع', () => {
  // `MAIN/1` **لا تُقصّ إلى `MAIN`**: الشرطة المائلة فاصلُ مسارٍ في Firestore،
  // واقتطاعُها يقبل نطاقًا لم يكتبه أحد ويُقاس عليه اكتمالٌ لم يقع.
  const s = normalizeScope({ warehouse: 'MAIN/1' });
  assert.equal(s.code, '');
  assert.match(s.notes.join(' '), /ليست كود مستودعٍ صالحًا/);

  const bad = normalizeScope({ warehouse: 'مستودع' });
  assert.equal(bad.code, '');
  assert.match(bad.notes.join(' '), /ليست كود مستودعٍ صالحًا/);
});

test('مقطعٌ أطول من الحدّ يُسقَط — لا تُلصق فقرةٌ في خانة نطاق', () => {
  assert.equal(normalizeScope({ warehouse: 'A'.repeat(40) }).code, '');
});

/* ═══════════ ق-٣: لا يُلزم ولا يمنع ═══════════ */

test('★★ بلا نطاقٍ إطلاقًا: نطاقٌ غيرُ معلَن — ولا مشكلةَ تمنع', () => {
  const s = normalizeScope({});
  assert.equal(s.declared, false);
  assert.equal(s.code, '');
  assert.deepEqual(s.notes, [], 'الغياب ليس خطأً يُشتكى منه');
});

test('★★ الحكم `ok` صحيحٌ دائمًا — فلا بوّابةَ على فتح الجلسة (ق-٣)', () => {
  for (const input of [{}, { zone: 'A01' }, { warehouse: 'مستودع' }, { warehouse: 'MAIN', zone: 'A01' }]) {
    assert.equal(scopeVerdict(input).ok, true, `مُنع الفتح عند ${JSON.stringify(input)}`);
  }
});

test('★ وبلا نطاقٍ يُعلَن الوسم صراحةً: الكشف لا يُثبت تغطية', () => {
  const v = scopeVerdict({});
  assert.equal(v.declared, false);
  assert.match(v.notes.join(' '), /لا يُثبت تغطية/);
});

test('وبنطاقٍ معلَنٍ لا وسمَ ولا شكوى', () => {
  const v = scopeVerdict({ warehouse: 'MAIN', zone: 'A01' });
  assert.equal(v.declared, true);
  assert.deepEqual(v.notes, []);
});

/* ═══════════ القراءة من الرأس ═══════════ */

test('نطاقُ العمليّة يُقرأ من حقلَي رأسها', () => {
  const s = scopeOf({ type: 'count', warehouse: 'MAIN', zone: 'A01' });
  assert.equal(s.code, 'MAIN-A01');
});

test('★★ عمليّةٌ قديمةٌ بلا الحقلين تبقى مقروءةً — لا ترمي ولا تُكسر (معيار ٣)', () => {
  for (const old of [{ type: 'count' }, {}, null, undefined]) {
    const s = scopeOf(old);
    assert.equal(s.declared, false);
    assert.equal(s.code, '');
  }
});

test('أسماءُ الحقول تُؤخذ من نحو كود الموقع لا تُكتب بيد', () => {
  assert.deepEqual([...SCOPE_FIELDS], ['warehouse', 'zone']);
});

/* ═══════════ الانتماء للنطاق ═══════════ */

test('الرفّ تحت المنطقة داخل النطاق، وتحت منطقةٍ أخرى خارجه', () => {
  const s = normalizeScope({ warehouse: 'MAIN', zone: 'A01' });
  assert.equal(withinScope(s, 'MAIN-A01-R01'), true);
  assert.equal(withinScope(s, 'MAIN-A01-R01-B09-LF'), true);
  assert.equal(withinScope(s, 'MAIN-A02-R01'), false);
  assert.equal(withinScope(s, 'RHB-A01-R01'), false, 'مستودعٌ آخر');
});

test('النطاق يشمل نفسه — منطقةٌ عُدّت كوحدةٍ ليست خارج نفسها', () => {
  assert.equal(withinScope(normalizeScope({ warehouse: 'MAIN', zone: 'A01' }), 'main-a01'), true);
});

test('نطاقُ مستودعٍ يشمل كلّ مناطقه', () => {
  const s = normalizeScope({ warehouse: 'MAIN' });
  assert.equal(withinScope(s, 'MAIN-A01-R01'), true);
  assert.equal(withinScope(s, 'RHB-A01'), false);
});

test('★★ بلا نطاقٍ لا يخرج شيء — والغيابُ ليس نطاقًا فارغًا يرفض كلّ رفّ', () => {
  assert.equal(withinScope(normalizeScope({}), 'MAIN-A01-R01'), true);
  assert.equal(withinScope({}, 'ANY-Z9'), true);
  assert.equal(withinScope(null, 'MAIN-A01'), true);
});

test('موقعٌ فارغٌ داخل نطاقٍ معلَنٍ خارجُه — بندٌ بلا موقعٍ لا يُحسب تغطيةً', () => {
  assert.equal(withinScope(normalizeScope({ warehouse: 'MAIN' }), ''), false);
});

test('يقبل النطاق مُدخَلًا خامًا كما يقبله مطبَّعًا', () => {
  assert.equal(withinScope({ warehouse: 'main', zone: 'a01' }, 'MAIN-A01-R02'), true);
});

/* ═══════════ العرض ═══════════ */

test('النصُّ يقول الحال — وبلا نطاقٍ يقولها صراحةً لا يترك فراغًا', () => {
  assert.equal(scopeLabel({ warehouse: 'MAIN', zone: 'A01' }), 'المستودع MAIN · المنطقة A01');
  assert.equal(scopeLabel({ warehouse: 'MAIN' }), 'المستودع MAIN');
  assert.match(scopeLabel({}), /بلا نطاق/);
});

/* ═══════════ ‹CAP-202› الخيارات من الشجرة لا من نصٍّ حرّ ═══════════ */

const LOCS = [
  { code: 'MAIN-A01', nameAr: 'ممرّ أ', status: 'active' },
  { code: 'MAIN-A01-R01', status: 'active' },
  { code: 'MAIN-A02', status: 'active' },
  { code: 'RHB-PIK', nameAr: 'منطقة التجميع', status: 'active' },
  { code: 'RHB-OLD', nameAr: 'مهجورة', status: 'archived' },
];

test('المستودعات تُشتقّ من جذور الشجرة — ولا يُبنى لها مصدرٌ ثانٍ', () => {
  const { warehouses } = scopeChoices(LOCS);
  assert.deepEqual(warehouses.map((w) => w.value), ['MAIN', 'RHB']);
});

test('المناطق مقصورةٌ على المستودع المختار', () => {
  assert.deepEqual(scopeChoices(LOCS, { warehouse: 'MAIN' }).zones.map((z) => z.value), ['A01', 'A02']);
  assert.deepEqual(scopeChoices(LOCS, { warehouse: 'RHB' }).zones.map((z) => z.value), ['PIK']);
});

test('★ بلا اختيار مستودعٍ لا تُعرض مناطقُ الجميع مختلطةً', () => {
  assert.deepEqual(scopeChoices(LOCS).zones, []);
});

test('★ المؤرشَف يخرج من الاقتراح — لا يُفتح جردٌ على منطقةٍ أُغلقت', () => {
  const zones = scopeChoices(LOCS, { warehouse: 'RHB' }).zones.map((z) => z.value);
  assert.ok(!zones.includes('OLD'), 'اقتُرحت منطقةٌ مؤرشَفة');
});

test('الاسم العربيّ يُعرض مع الكود حين وُجد', () => {
  const [z] = scopeChoices(LOCS, { warehouse: 'RHB' }).zones;
  assert.equal(z.label, 'PIK — منطقة التجميع');
});

test('الرفُّ لا يصير منطقةً — المستوى الثاني وحده', () => {
  const zones = scopeChoices(LOCS, { warehouse: 'MAIN' }).zones.map((z) => z.value);
  assert.ok(!zones.includes('R01'));
});

test('قائمةٌ فارغةٌ لا ترمي — سيّد المواقع قد لا يكون مبنيًّا بعد', () => {
  const c = scopeChoices([], { warehouse: 'MAIN' });
  assert.deepEqual(c.warehouses, []);
  assert.deepEqual(c.zones, []);
});
