/**
 * 🔒 حرّاسُ نموذج بوابة الأمن ‹GATE-101/102/103›.
 *
 * وكلُّ حارسٍ هنا **يُختبر بالنقض**: يُعطى ما يجب أن يمنعه ويُتأكَّد أنّه منع.
 * فدرسُ ‹LPN› الذي لا يُكرَّر: حارسٌ يقرأ حقلًا لا يُكتب أبدًا لا يُطلق ولو
 * مرّة، ويبدو أخضرَ في كلّ اختبارٍ إيجابيّ.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GATE_REASONS,
  LOAD_STATES,
  EXIT_STATES,
  PALLET_TYPES,
  PALLET_OWNERSHIP,
  PALLET_CONDITIONS,
  gateReason,
  isGateReason,
  reasonLabel,
  purposeOf,
  needsDoor,
  fieldsFor,
  exitFieldsFor,
  shapeInLoad,
  shapeOutLoad,
  shapeGateLoad,
  shapeVisitor,
  shapePalletLines,
  palletTotal,
  loadGaps,
  visitorGaps,
  outLoadProblems,
  loadSummary,
  normalizePlate,
} from './gateModel.js';

import { shapeVisit, exitVerdict, doorAccepts, assignDoorVerdict } from '../fleet/yardModel.js';

/* ═══════════ ج‑١ · الأسبابُ التسعة ═══════════ */

test('ج‑١ الأسبابُ تسعةٌ بالضبط — كما أملاها المالك، بمعرّفاتٍ فريدة', () => {
  assert.equal(GATE_REASONS.length, 9);
  const ids = GATE_REASONS.map((r) => r.id);
  assert.equal(new Set(ids).size, 9, 'معرّفٌ مكرّرٌ يجعل سببين واحدًا');
  for (const r of GATE_REASONS) {
    assert.ok(r.label.trim().length > 2, `السبب «${r.id}» بلا تسميةٍ مفهومة`);
    assert.ok(['inbound', 'outbound', 'byLoad', ''].includes(r.purpose), `غرضٌ غير معروف على «${r.id}»`);
  }
});

test('ج‑١ التسعةُ الممليّة موجودةٌ بأعيانها — لا سببَ سقط في الترجمة', () => {
  for (const id of ['visit', 'supplier', 'companyReturn', 'customerReturn', 'internal', 'service', 'loading', 'staff', 'other']) {
    assert.ok(isGateReason(id), `السبب «${id}» مفقودٌ من القائمة`);
    assert.ok(reasonLabel(id), `السبب «${id}» بلا تسمية`);
  }
  assert.equal(isGateReason('nope'), false);
  assert.equal(gateReason('nope'), null);
});

/* ═══════════ ق-٣ · اشتقاقُ الغرض ═══════════ */

test('ق-٣ كلُّ سببٍ يشتقّ غرضًا صالحًا أو لا بابَ له — ولا واحدَ يعود مجهولًا', () => {
  for (const r of GATE_REASONS) {
    const p = purposeOf(r.id, 'loaded');
    assert.ok(['inbound', 'outbound', ''].includes(p), `السبب «${r.id}» اشتقّ غرضًا غير صالح: ${p}`);
  }
});

test('ق-٣ الخريطةُ التي أقرّها المالك حرفيًّا', () => {
  assert.equal(purposeOf('supplier', 'loaded'), 'inbound');
  assert.equal(purposeOf('customerReturn', 'loaded'), 'inbound');
  assert.equal(purposeOf('companyReturn', 'loaded'), 'inbound', 'المركبةُ العائدة قد تعود ببضاعةٍ لم تُسلَّم');
  assert.equal(purposeOf('loading', 'empty'), 'outbound');
  assert.equal(purposeOf('visit', 'empty'), '', 'الزائرُ لا يدخل طابور الأبواب');
  assert.equal(purposeOf('staff', 'empty'), '');
  assert.equal(purposeOf('service', 'empty'), '', 'الصيانةُ تذهب إلى الورشة لا إلى بابِ المستودع');
  assert.equal(purposeOf('other', 'loaded'), '');
});

test('ق-٣ النقلُ الداخليُّ وحده يُشتقّ من حالة الحمولة — لأنّه يحتمل الوجهين', () => {
  assert.equal(purposeOf('internal', 'loaded'), 'inbound', 'داخلةٌ محمّلةً ⇐ بابُ تنزيل');
  assert.equal(purposeOf('internal', 'partial'), 'inbound');
  assert.equal(purposeOf('internal', 'empty'), 'outbound', 'فارغةٌ لتُحمَّل ⇐ بابُ تحميل');
});

test('★ سببٌ مجهولٌ يعود null — «لا رأيَ لي» لا «لا باب»', () => {
  assert.equal(purposeOf('', 'loaded'), null);
  assert.equal(purposeOf(undefined, 'loaded'), null);
  assert.equal(purposeOf('غير-موجود', 'loaded'), null);
});

test('needsDoor يفصل من يقف عند بابٍ عمّن يمرّ', () => {
  assert.equal(needsDoor('supplier', 'loaded'), true);
  assert.equal(needsDoor('loading', 'empty'), true);
  assert.equal(needsDoor('visit', 'empty'), false);
  assert.equal(needsDoor('service', 'empty'), false);
});

/* ═══════════ ★ رجعة: زيارةُ الأمس لا تتغيّر تحت قدمَي المشرف ═══════════ */

test('★★ رجعةٌ: زيارةٌ قديمةٌ بلا reason تحتفظ بغرضها المخزَّن — ولا يُدهَس', () => {
  const old = shapeVisit({ plate: 'ABC 1', purpose: 'outbound' });
  assert.equal(old.purpose, 'outbound', 'الاشتقاقُ دهس غرضًا مخزَّنًا — وهذا يكسر أبوابَ زياراتِ الأمس');
  assert.equal(old.reason, '');
});

test('★★ رجعةٌ: doorAccepts لم يتغيّر سلوكُه لزيارةٍ قديمة', () => {
  const old = shapeVisit({ plate: 'ABC 1', purpose: 'outbound' });
  assert.equal(doorAccepts({ code: 'D1', flow: 'outbound' }, old.purpose), true);
  assert.equal(doorAccepts({ code: 'D2', flow: 'inbound' }, old.purpose), false);
  assert.equal(doorAccepts({ code: 'D3', flow: 'both' }, old.purpose), true);
});

test('★ زيارةٌ بسببٍ جديد تُسنَد إلى البابِ الذي يقبل غرضَها المشتقّ', () => {
  const v = shapeVisit({ plate: 'B 2', reason: 'supplier', load: { in: { state: 'loaded' } } });
  assert.equal(v.purpose, 'inbound');
  assert.equal(assignDoorVerdict(v, { code: 'IN1', flow: 'inbound' }, []).ok, true);
  const wrong = assignDoorVerdict(v, { code: 'OUT1', flow: 'outbound' }, []);
  assert.equal(wrong.ok, false, 'بابُ تحميلٍ قُبِل لشاحنةِ تنزيل');
});

/* ═══════════ ج‑٢ · حالاتُ الحمولة ═══════════ */

test('ج‑٢ حالاتُ الدخول ثلاثٌ وحالاتُ الخروج خمس — بلا زيادةٍ ولا نقص', () => {
  assert.deepEqual(LOAD_STATES.map((x) => x.id), ['loaded', 'partial', 'empty']);
  assert.equal(EXIT_STATES.length, 5);
  assert.deepEqual(
    EXIT_STATES.map((x) => x.id),
    ['empty', 'goods', 'returns', 'emptyPallets', 'goodsAndPallets']
  );
});

/* ═══════════ ج‑٤ · الإظهارُ المشروط — اختبارٌ لكلّ سببٍ من التسعة ═══════════ */

test('ج‑٤ كلُّ سببٍ من التسعة له جوابُ إظهارٍ محدَّد — لا سببَ بلا قرار', () => {
  for (const r of GATE_REASONS) {
    for (const st of LOAD_STATES) {
      const f = fieldsFor(r.id, st.id);
      assert.ok(Array.isArray(f.fields) && f.fields.length > 0, `«${r.id}/${st.id}» بلا حقولٍ إطلاقًا`);
      assert.equal(typeof f.visitor, 'boolean');
      assert.equal(typeof f.cargo, 'boolean');
      assert.equal(typeof f.pallets, 'boolean');
    }
  }
});

test('ج‑٤ «زيارة» تُظهر حقولَ الزائر وحدها — ولا PO ولا طبليات', () => {
  const f = fieldsFor('visit', 'empty');
  assert.equal(f.visitor, true);
  assert.equal(f.cargo, false);
  assert.equal(f.pallets, false);
  assert.ok(!f.fields.includes('poRef'), 'رقمُ أمرِ شراءٍ ظهر لزائر');
  assert.ok(!f.fields.includes('invoiceRef'));
});

test('ج‑٤ «موظّف/إدارة» كالزائر — ولا تُطلب منه حمولة', () => {
  const f = fieldsFor('staff', 'empty');
  assert.equal(f.visitor, true);
  assert.equal(f.cargo, false);
});

test('ج‑٤ «مورّد لتسليم بضاعة» محمّلةً تُظهر PO والفاتورة والختم والطرود', () => {
  const f = fieldsFor('supplier', 'loaded');
  assert.equal(f.cargo, true);
  assert.equal(f.pallets, true);
  for (const k of ['cargoType', 'party', 'poRef', 'invoiceRef', 'dnRef', 'containerNo', 'sealNo', 'packages']) {
    assert.ok(f.fields.includes(k), `الحقل «${k}» غائبٌ عن شاشة المورّد`);
  }
});

test('ج‑٤ «تحميل بضاعة» عند الدخول لا يطلب حقولَ حمولة — وصفُها عند الخروج', () => {
  const f = fieldsFor('loading', 'empty');
  assert.equal(f.cargo, false, 'المركبةُ تأتي فارغةً لتُحمَّل — لا حمولةَ تُوصف على الحاجز');
  assert.equal(f.pallets, true, 'وقد تُعيد خشبَنا معها فتُسجَّل');
  assert.ok(!f.fields.includes('poRef'));
});

test('ج‑٤ «صيانة» جهةٌ وملاحظةٌ فقط — ولا طبليات', () => {
  const f = fieldsFor('service', 'empty');
  assert.equal(f.pallets, false);
  assert.equal(f.cargo, false);
  assert.deepEqual(f.fields, ['party', 'notes']);
});

test('ج‑٤ الفارغةُ لا تُظهر حقولَ بضاعةٍ ولو كان سببُها مورّدًا', () => {
  const f = fieldsFor('supplier', 'empty');
  assert.equal(f.cargo, false);
  assert.ok(!f.fields.includes('poRef'), 'طُلب رقمُ أمرِ شراءٍ من شاحنةٍ فارغة');
  assert.equal(f.pallets, true);
});

test('ج‑٥ حقولُ الخروج تتبع حالتَه — والفارغةُ لا تطلب شيئًا', () => {
  assert.deepEqual(exitFieldsFor('empty').fields, ['notes']);
  const goods = exitFieldsFor('goods');
  assert.equal(goods.goods, true);
  for (const k of ['cargoType', 'destination', 'doRef', 'soRef', 'issueRef', 'receivedBy']) {
    assert.ok(goods.fields.includes(k), `حقلُ الخروج «${k}» غائب`);
  }
  const pallets = exitFieldsFor('emptyPallets');
  assert.equal(pallets.pallets, true);
  assert.equal(pallets.goods, false);
  const both = exitFieldsFor('goodsAndPallets');
  assert.equal(both.goods, true);
  assert.equal(both.pallets, true);
});

/* ═══════════ ج‑٣ و ج‑٧ · التسوية ═══════════ */

test('ج‑٣ حمولةُ الدخول تُسوَّى بحقولها ولا تنهار على مدخلٍ فارغ', () => {
  const l = shapeInLoad(null);
  assert.equal(l.state, 'empty');
  assert.equal(l.packages, 0);
  assert.deepEqual(l.pallets, []);
  const full = shapeInLoad({ state: 'loaded', poRef: ' po-2026-00125 ', packages: '14', party: ' XYZ ' });
  assert.equal(full.poRef, 'PO-2026-00125');
  assert.equal(full.packages, 14);
  assert.equal(full.party, 'XYZ');
});

test('ج‑٧ سطرُ الطبليات العائدة يُسوّى — والصفرُ يسقط فليس حركة', () => {
  const lines = shapePalletLines([
    { count: 10, ownership: 'supplier' },
    { count: 0, ownership: 'company' },
    { count: '5', type: 'eur', condition: 'damaged' },
    { count: -3 },
  ]);
  assert.equal(lines.length, 2, 'سطرٌ بصفرٍ أو بسالبٍ ليس حركةَ طبليات');
  assert.equal(lines[0].ownership, 'supplier');
  assert.equal(lines[1].type, 'EUR');
  assert.equal(lines[1].condition, 'damaged');
  assert.equal(palletTotal(lines), 15);
});

test('ج‑٧ الملكيّةُ لا تُخمَّن مورّدًا — الافتراضُ «ملك الشركة» أقلُّ ادّعاءً', () => {
  assert.equal(shapePalletLines([{ count: 3 }])[0].ownership, 'company');
  assert.equal(shapePalletLines([{ count: 3, ownership: 'زائف' }])[0].ownership, 'company');
});

test('ج‑٧ القوائمُ الثلاث معلَنةٌ ومعرّفاتُها فريدة', () => {
  for (const list of [PALLET_TYPES, PALLET_OWNERSHIP, PALLET_CONDITIONS]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const x of list) assert.ok(x.label.trim(), `عنصرٌ بلا تسمية في ${JSON.stringify(ids)}`);
  }
});

test('ق-٧ الزائرُ ثلاثةُ حقولٍ لا أكثر — ولا رقمَ هويّةٍ ولا صورة', () => {
  const v = shapeVisitor({ name: ' سعد ', phone: '0500', host: 'المالية', idNumber: '1234567890', photo: 'x' });
  assert.deepEqual(Object.keys(v).sort(), ['host', 'name', 'phone']);
  assert.equal(v.name, 'سعد');
  assert.ok(!('idNumber' in v), 'رقمُ الهويّة تسرّب إلى نموذج الزائر — وهو ممنوعٌ بقرار ق-٧');
});

/* ═══════════ النقصُ يُعلَن ولا يمنع ═══════════ */

test('★ loadGaps يُعلن ولا يمنع — والشاحنةُ على الرصيف تُسجَّل ناقصةً', () => {
  const gaps = loadGaps('supplier', { state: 'loaded' });
  assert.ok(gaps.length > 0, 'حمولةٌ خاليةٌ من كلّ شيءٍ ولا نقصَ أُعلن');
  assert.ok(gaps.some((g) => g.includes('أمر شراء')));
  // ولا يمنع: التسوية نجحت والزيارة قائمة.
  const v = shapeVisit({ plate: 'C 3', reason: 'supplier', load: { in: { state: 'loaded' } } });
  assert.equal(v.plate, 'C 3');
});

test('★ ولا يُزعج بنقصِ حقلٍ لا يظهر أصلًا — زائرٌ لا يُسأل عن PO', () => {
  const gaps = loadGaps('visit', { state: 'empty' });
  assert.ok(!gaps.some((g) => g.includes('أمر شراء')), 'طُلب رقمُ أمرِ شراءٍ من زائر — فيتعلّم الحارسُ تجاهلَ التنبيهات');
});

test('★ حمولةٌ مكتملةٌ لا نقصَ فيها — فراغُ القائمة اكتمال', () => {
  const gaps = loadGaps('supplier', {
    state: 'loaded',
    party: 'XYZ',
    poRef: 'PO-1',
    invoiceRef: 'INV-1',
    packages: 20,
    pallets: [{ count: 12, ownership: 'supplier' }],
  });
  assert.deepEqual(gaps, []);
});

test('ق-٧ نواقصُ الزائر تُقال باسمها', () => {
  assert.equal(visitorGaps({}).length, 3);
  assert.deepEqual(visitorGaps({ name: 'سعد', host: 'المالية', phone: '0500' }), []);
});

/* ═══════════ ★★ حارسُ الخروج المحمّل — بالنقض ═══════════ */

test('★★ نقضٌ: خروجٌ محمّلٌ ببضاعةٍ بلا وصفٍ يُمنع بأربعة أسباب', () => {
  const problems = outLoadProblems({ state: 'goods' });
  assert.ok(problems.length >= 4, `الحارسُ لم يُطلق: ${JSON.stringify(problems)}`);
  assert.ok(problems.some((p) => p.includes('نوعِ بضاعة')));
  assert.ok(problems.some((p) => p.includes('وجهة')));
  assert.ok(problems.some((p) => p.includes('مستندٍ مرجعيّ')));
  assert.ok(problems.some((p) => p.includes('المستلِم')));
});

test('★★ نقضٌ: خروجُ طبلياتٍ عائدةٍ وعددُها صفرٌ يُمنع', () => {
  const problems = outLoadProblems({ state: 'emptyPallets', destination: 'المورّد' });
  assert.ok(problems.some((p) => p.includes('صفر')), 'أُعلن خروجُ طبلياتٍ ولا عددَ لها ومرّ');
});

test('★ والفارغةُ تمرّ بضغطةٍ — الحارسُ لا يعطّل ما كان يمرّ', () => {
  assert.deepEqual(outLoadProblems({ state: 'empty' }), []);
  assert.deepEqual(outLoadProblems(null), [], 'زيارةٌ قديمةٌ بلا حمولةِ خروجٍ لا تُمنع');
  assert.deepEqual(outLoadProblems(undefined), []);
});

test('★ وخروجٌ محمّلٌ موصوفٌ كاملًا يمرّ', () => {
  assert.deepEqual(
    outLoadProblems({
      state: 'goods',
      cargoType: 'مرتجعات',
      destination: 'مستودع المورّد',
      doRef: 'DO-9',
      receivedBy: 'سائق المورّد',
    }),
    []
  );
});

/* ═══════════ ★★ القفلُ الرابع داخل exitVerdict — الوصلُ لا الدعوى ═══════════ */

const permitted = (extra) => ({
  plate: 'D 4',
  stage: 'permitted',
  permitRef: 'GP-2026-0001',
  stamps: { atDoorAt: 1, clearedAt: 2 },
  ...extra,
});

test('★★★ الوصل: exitVerdict يستدعي الحارسَ الرابع فعلًا — لا منطقٌ بلا مستدعٍ', () => {
  const blocked = exitVerdict(permitted({ load: { out: { state: 'goods' } } }));
  assert.equal(blocked.ok, false, 'الحارسُ الرابع مبنيٌّ ولا يستدعيه أحد — عينُ عطبِ LPN');
  assert.ok(blocked.problems.some((p) => p.includes('نوعِ بضاعة')));
});

test('★★ والأقفالُ الثلاثةُ القائمة لم تُمسّ', () => {
  assert.equal(exitVerdict(permitted({ stage: 'working' })).ok, false, 'قفلُ المرحلة');
  assert.equal(exitVerdict(permitted({ permitRef: '' })).ok, false, 'قفلُ التصريح');
  assert.equal(
    exitVerdict(permitted({ doorCode: 'D1', stamps: { atDoorAt: 1 } })).ok,
    false,
    'قفلُ إخلاء الباب'
  );
});

test('★ وزيارةٌ فارغةٌ مصرَّحٌ لها تخرج كما كانت تخرج قبل الطبقة', () => {
  assert.equal(exitVerdict(permitted({})).ok, true, 'الطبقةُ الجديدة عطّلت خروجًا كان يمرّ');
});

/* ═══════════ ج‑٦ · حمولةُ الدخول ≠ حمولةُ الخروج ═══════════ */

test('ج‑٦ مثالُ المالك حرفيًّا: دخلت بـ١٥ وخرجت بـ٦ — ويُقرأ الرقمان معًا', () => {
  const summary = loadSummary({
    in: { state: 'loaded', pallets: [{ count: 15, ownership: 'supplier' }] },
    out: { state: 'returns', cargoType: 'مرتجعات', pallets: [{ count: 6, ownership: 'supplier' }] },
  });
  assert.equal(summary.in.pallets, 15);
  assert.equal(summary.out.pallets, 6);
  assert.equal(summary.differs, true, 'الفرقُ لم يُعلَن — والنظامُ افترض أنّ الخروج صورةُ الدخول');
  assert.ok(summary.text.includes('15'));
  assert.ok(summary.text.includes('6'));
});

test('ج‑٦ ولا يُطرح رقمٌ من رقم — بضاعةُ الدخول غيرُ مرتجَعِ الخروج', () => {
  const summary = loadSummary({
    in: { state: 'loaded', pallets: [{ count: 15 }] },
    out: { state: 'returns', pallets: [{ count: 6 }] },
  });
  assert.ok(!('net' in summary), 'حُسب صافٍ — وهو رقمٌ بلا معنًى يخلط بضاعتين');
});

test('ج‑٦ زيارةٌ فارغةٌ دخولًا وخروجًا لا تُعلن فرقًا', () => {
  assert.equal(loadSummary({}).differs, false);
});

/* ═══════════ ق-٦ · اللوحة ═══════════ */

test('ق-٦ اللوحةُ تُطبَّع ولا تُشوَّه — الشرطةُ والحروفُ هويّةٌ لا زخرفة', () => {
  assert.equal(normalizePlate('  27-123456 '), '27-123456');
  assert.equal(normalizePlate('a b   c 1234'), 'A B C 1234');
  assert.equal(normalizePlate('ا ب ج ١٢٣'), 'ا ب ج ١٢٣');
  assert.equal(normalizePlate(null), '');
});

/* ═══════════ الوصلُ إلى الزيارة ═══════════ */

test('★★★ الوصل: shapeVisit يحمل السببَ والحمولتين والزائر — لا حقلَ بلا كاتب', () => {
  const v = shapeVisit({
    plate: 'e 5',
    reason: 'supplier',
    load: { in: { state: 'loaded', poRef: 'po-9', pallets: [{ count: 12, ownership: 'supplier' }] } },
    visitor: { name: 'x' },
  });
  assert.equal(v.reason, 'supplier');
  assert.equal(v.purpose, 'inbound');
  assert.equal(v.load.in.poRef, 'PO-9');
  assert.equal(palletTotal(v.load.in.pallets), 12);
  assert.equal(v.load.out.state, 'empty');
  assert.equal(v.visitor.name, 'x');
});

test('★ وسببٌ مجهولٌ يُسقَط ولا يُخزَّن — فلا قيمةَ لا يعرفها أحد', () => {
  assert.equal(shapeVisit({ plate: 'F 6', reason: 'زائف' }).reason, '');
});

test('★ shapeGateLoad يعيد حمولتين دائمًا — فلا شاشةَ تنهار على حقلٍ غائب', () => {
  const l = shapeGateLoad(undefined);
  assert.equal(l.in.state, 'empty');
  assert.equal(l.out.state, 'empty');
  assert.deepEqual(shapeOutLoad(undefined).pallets, []);
});
