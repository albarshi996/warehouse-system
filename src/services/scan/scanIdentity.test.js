/**
 * اختبارات «تعرَّفْ ثمّ أدخِلْ» — الباركودُ أوّلًا، ثمّ الاسم، ثمّ البيانات.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCAN_PHASES,
  identifyScan,
  expectationOf,
  expectationBadge,
  isRescanOfSame,
  missingForCommit,
  canCommit,
  missingText,
  acceptedText,
} from './scanIdentity.js';

/** ترجمةٌ مزيّفةٌ بشكل `resolveScan` الحقيقيّة. */
const ITEMS = {
  '6281007021234': { item: { sku: 'MLK-500', nameAr: 'لبن طازج 500مل' }, uom: 'box', factor: 12 },
  '6281007021227': { item: { sku: 'MLK-200', nameAr: 'لبن طازج 200مل' }, uom: 'pcs', factor: 1 },
  'NONAME': { item: { sku: 'X-1' }, uom: 'pcs', factor: 1 },
};
const resolve = (code) => ITEMS[code] || { item: null, uom: '', factor: null };

/* ═══════════════ التعريف ═══════════════ */

test('★★★ المسحُ يُظهر الاسمَ — لا الرقمَ الذي لا يقرؤه إنسان', () => {
  const id = identifyScan('6281007021234', resolve);
  assert.equal(id.phase, SCAN_PHASES.identified.id);
  assert.equal(id.name, 'لبن طازج 500مل');
  assert.equal(id.sku, 'MLK-500');
  assert.equal(id.code, '6281007021234');
  // والاسمُ ليس الباركود — وهو جوهرُ الطلب.
  assert.notEqual(id.name, id.code);
});

test('★★ والصنفان المتشابهان يُفرَّقان بالاسم لا بخانةٍ في الوسط', () => {
  // ١٣ رقمًا تختلف في خانةٍ واحدة — وهذا عينُ ما يُخطئ فيه العامل.
  const a = identifyScan('6281007021234', resolve);
  const b = identifyScan('6281007021227', resolve);
  assert.notEqual(a.name, b.name);
  assert.match(a.name, /500/);
  assert.match(b.name, /200/);
});

test('المجهولُ طورٌ مستقلٌّ بسببٍ مكتوب — لا يُقيَّد ولا يُصمت عنه', () => {
  const id = identifyScan('0000000000000', resolve);
  assert.equal(id.phase, SCAN_PHASES.unknown.id);
  assert.equal(id.item, null);
  assert.match(id.problem, /غير معروف/);
  assert.equal(id.code, '0000000000000', 'الرمزُ ضاع فلا يُسجَّل استثناءً');
});

test('الفارغُ يبقى في طور الانتظار ولا يُحسب مجهولًا', () => {
  const id = identifyScan('', resolve);
  assert.equal(id.phase, SCAN_PHASES.idle.id);
  assert.match(id.problem, /فارغة/);
  assert.equal(identifyScan(null, resolve).phase, SCAN_PHASES.idle.id);
  assert.equal(identifyScan('  ', resolve).phase, SCAN_PHASES.idle.id);
});

test('★ صنفٌ بلا اسمٍ يُعرض برمزه — ورمزٌ خيرٌ من فراغٍ تحت عنوان «الصنف»', () => {
  const id = identifyScan('NONAME', resolve);
  assert.equal(id.name, 'X-1');
  assert.notEqual(id.name, '');
});

test('بلا دالّةِ ترجمةٍ لا يُدَّعى تعريف', () => {
  assert.equal(identifyScan('123', null).phase, SCAN_PHASES.unknown.id);
});

test('★★ سطورُ البطاقة تحمل الرمزَ والباركودَ والوحدة', () => {
  const id = identifyScan('6281007021234', resolve, { uomLabel: (u) => (u === 'box' ? 'كرتونة' : u) });
  assert.equal(id.uomText, 'كرتونة');
  const labels = id.lines.map((l) => l.label);
  assert.ok(labels.includes('الرمز'));
  assert.ok(labels.includes('الباركود الممسوح'));
  assert.ok(labels.includes('الوحدة'));
  // والمعامِلُ يظهر حين يخالف الواحد — «كرتونة = 12» تمنع إدخال 12 حيث تكفي 1.
  assert.ok(id.lines.some((l) => l.label === 'المعامل' && /12/.test(l.value)));
});

test('★ والمعامِلُ يُخفى حين يساوي واحدًا — ضجيجٌ بلا معنى', () => {
  const id = identifyScan('6281007021227', resolve);
  assert.ok(!id.lines.some((l) => l.label === 'المعامل'));
});

/* ═══════════════ التوقّع ═══════════════ */

test('★★ «غيرُ متوقَّع» لا يُقال بلا أمرٍ يُقاس عليه', () => {
  assert.equal(expectationOf({ sku: 'A', code: '1' }, {}), 'unknown-order');
  assert.equal(expectationOf({ sku: 'A', code: '1' }, { expectedSkus: [], expectedCodes: [] }), 'unknown-order');
  // ولا شارةَ على المجهول — الادّعاءُ بجهلٍ أسوأ من الصمت.
  assert.equal(expectationBadge('unknown-order'), null);
});

test('المتوقَّعُ يُعرف بالرمز أو بالباركود', () => {
  assert.equal(expectationOf({ sku: 'MLK-500', code: '628' }, { expectedSkus: ['MLK-500'] }), 'expected');
  assert.equal(expectationOf({ sku: 'Z', code: '628' }, { expectedCodes: ['628'] }), 'expected');
  assert.equal(expectationOf({ sku: 'Z', code: '999' }, { expectedSkus: ['MLK-500'] }), 'unexpected');
});

test('ومطابقةُ الرمز لا تُبالي بحالة الأحرف', () => {
  assert.equal(expectationOf({ sku: 'mlk-500', code: '' }, { expectedSkus: ['MLK-500'] }), 'expected');
});

test('الشاراتُ لها نبرةٌ ونصّ — والأحمرُ ليس منها (التحذيرُ وحده)', () => {
  assert.equal(expectationBadge('expected').tone, 'ok');
  assert.equal(expectationBadge('unexpected').tone, 'warn');
  assert.ok(expectationBadge('expected').label);
  assert.ok(expectationBadge('unexpected').label);
});

test('★ والتعريفُ يحمل حكمَ التوقّع معه', () => {
  const id = identifyScan('6281007021234', resolve, { expectedSkus: ['MLK-500'] });
  assert.equal(id.expectation, 'expected');
  const other = identifyScan('6281007021234', resolve, { expectedSkus: ['OTHER'] });
  assert.equal(other.expectation, 'unexpected');
});

/* ═══════════════ إعادةُ المسح ═══════════════ */

test('★★ إعادةُ مسحِ المعروضِ تُعرَف — فتبقى السرعةُ لمن يعمل بسرعة', () => {
  const id = identifyScan('6281007021234', resolve);
  assert.equal(isRescanOfSame(id, '6281007021234'), true);
  assert.equal(isRescanOfSame(id, '6281007021227'), false);
  assert.equal(isRescanOfSame(null, '6281007021234'), false);
  assert.equal(isRescanOfSame(id, ''), false);
});

/* ═══════════════ الجاهزيّة ═══════════════ */

test('★★ الناقصُ يُسمّى بالعربيّة — لا «أكمل البيانات» المبهمة', () => {
  const id = identifyScan('6281007021234', resolve);
  assert.deepEqual(missingForCommit(id, {}), ['الكمّيّة']);
  assert.deepEqual(missingForCommit(id, { qty: 3 }), []);
  assert.deepEqual(
    missingForCommit(id, {}, { needsBatch: true, needsExpiry: true }),
    ['الكمّيّة', 'رقم الدفعة', 'تاريخ الصلاحية']
  );
  assert.match(missingText(id, {}), /تنقص/);
  assert.equal(missingText(id, { qty: 1 }), '');
});

test('الكمّيّةُ الصفرُ والسالبةُ وغيرُ الرقميّة كلُّها «لا كمّيّة»', () => {
  const id = identifyScan('6281007021234', resolve);
  for (const q of ['', '0', 0, -2, 'اثنان', null, undefined]) {
    assert.deepEqual(missingForCommit(id, { qty: q }), ['الكمّيّة'], `قُبلت كمّيّةٌ غيرُ صالحة: ${q}`);
  }
  assert.deepEqual(missingForCommit(id, { qty: '0.5' }), []);
});

test('والكمّيّةُ تُسقَط من الشرط حين لا تلزم (شهادةُ رؤيةٍ بلا كمّيّات)', () => {
  const id = identifyScan('6281007021234', resolve);
  assert.deepEqual(missingForCommit(id, {}, { needsQty: false }), []);
});

test('★★★ ولا تأكيدَ بلا تعريف — المجهولُ لا يُقيَّد', () => {
  const unknown = identifyScan('0000', resolve);
  assert.equal(canCommit(unknown, { qty: 5 }), false);
  assert.deepEqual(missingForCommit(unknown, { qty: 5 }), ['باركودٌ معرَّف']);
  assert.equal(canCommit(null, { qty: 5 }), false);
  // والمعرَّفُ بكمّيّةٍ صالحةٍ يُؤكَّد.
  assert.equal(canCommit(identifyScan('6281007021234', resolve), { qty: 5 }), true);
});

/* ═══════════════ نصُّ القبول ═══════════════ */

test('★★★ القبولُ يُعلَن بالاسم لا بالرقم — وهذا كلُّ الفرق', () => {
  const id = identifyScan('6281007021234', resolve, { uomLabel: (u) => (u === 'box' ? 'كرتونة' : u) });
  const msg = acceptedText(id, 3);
  assert.match(msg, /لبن طازج 500مل/);
  assert.match(msg, /3/);
  assert.match(msg, /كرتونة/);
  // والنصُّ القديمُ كان الرقمَ وحده — فنثبت أنّه لم يبقَ وحده.
  assert.ok(!/^قُبلت: 6281007021234$/.test(msg));
});

test('وبلا كمّيّةٍ يُذكر الاسمُ وحده، وبلا اسمٍ يُذكر الرمز', () => {
  const id = identifyScan('6281007021234', resolve);
  assert.match(acceptedText(id, 0), /لبن طازج/);
  assert.ok(!/—/.test(acceptedText(id, 0)));
  assert.match(acceptedText({ code: 'ABC' }, 2), /ABC/);
  assert.match(acceptedText(null, 2), /الصنف/);
});

/* ═══════════════ الأطوار ═══════════════ */

test('كلُّ طورٍ له عنوانٌ وإرشاد — والفراغُ دعوةٌ لا صمت', () => {
  for (const p of Object.values(SCAN_PHASES)) {
    assert.ok(p.title, `${p.id} بلا عنوان`);
    assert.ok(p.hint, `${p.id} بلا إرشاد`);
  }
  assert.match(SCAN_PHASES.idle.hint, /الكاميرا|امسح|اكتب/);
});
