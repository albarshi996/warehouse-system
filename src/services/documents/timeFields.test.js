/**
 * حارس تصنيف الحقول الزمنيّة (م٢-أ · يمهّد لسدّ ف‑٨).
 *
 * الجوهريّ هنا اختبارٌ واحد: **لا حقل زمنيّ بلا تصنيف.** فمن يضيف `dispatchedAt`
 * إلى مخطّطٍ بعد شهرين يُسقط الاختبار حتّى يقرّر: أختمُ واقعةٍ هو أم تاريخٌ
 * مخطّط؟ وبغيره يمرّ الحقل الجديد **خارج الحراسة** — وهو بالضبط كيف نشأت ف‑٨.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import SCHEMAS from './schemas/index.js';
import {
  TIME_CLASSES,
  TIME_FIELD_MAP,
  TIME_KINDS,
  TYPES_WITHOUT_EVENT_STAMP,
  timeFieldsOf,
  timeFieldDrift,
  timeFieldStats,
  classOf,
  behaviorOf,
  isEventStamp,
  fieldsByClass,
} from './timeFields.js';

/* ═══════════ ١. الحارس ═══════════ */

test('★★ لا حقل زمنيّ بلا تصنيف، ولا تصنيف لحقلٍ محذوف', () => {
  const drift = timeFieldDrift(SCHEMAS);
  assert.deepEqual(
    drift.unclassified,
    [],
    'حقولٌ زمنيّة في المخطّطات بلا قرار — صنّفها في timeFields.js قبل المتابعة'
  );
  assert.deepEqual(drift.stale, [], 'تصنيفٌ لحقلٍ لم يعد موجودًا — نظّف السجلّ');
  assert.equal(drift.ok, true);
});

test('★ الحارس يفشل فعلًا عند حقلٍ زمنيّ جديد — لا يمرّ صامتًا', () => {
  // بلا هذا الاختبار يبقى الحارس السابق ادّعاءً: نثبت أنّه يُمسك.
  const fake = {
    ...SCHEMAS,
    GRN: {
      ...SCHEMAS.GRN,
      sections: [
        ...SCHEMAS.GRN.sections,
        { key: 'extra', kind: 'fields', fields: [{ key: 'dispatchedAt', kind: 'datetime', label: 'وقت المغادرة' }] },
      ],
    },
  };
  const drift = timeFieldDrift(fake);
  assert.equal(drift.ok, false);
  assert.deepEqual(drift.unclassified, [
    { type: 'GRN', key: 'dispatchedAt', kind: 'datetime', label: 'وقت المغادرة' },
  ]);
});

test('★ والحارس يمسك الانحراف المعاكس: تصنيفٌ لنوعٍ لا وجود له', () => {
  const { GRN, ...withoutGrn } = SCHEMAS;
  assert.ok(GRN);
  const drift = timeFieldDrift(withoutGrn);
  assert.equal(drift.ok, false);
  assert.ok(drift.stale.some((s) => s.type === 'GRN'));
});

/* ═══════════ ٢. سلامة السجلّ ═══════════ */

test('كلّ صنفٍ مستعمَلٍ معرَّفٌ في TIME_CLASSES', () => {
  for (const [type, fields] of Object.entries(TIME_FIELD_MAP)) {
    for (const [key, cls] of Object.entries(fields)) {
      assert.ok(TIME_CLASSES[cls], `${type}.${key}: صنفٌ غير معرَّف «${cls}»`);
    }
  }
});

test('كلّ المستندات ممثَّلة — لا نوع بلا زمن', () => {
  const stats = timeFieldStats();
  // الأعداد تُحدَّث **بقصد** عند إضافة نوعٍ جديد — فتغيّرها إعلانٌ لا مفاجأة.
  assert.equal(stats.types, Object.keys(SCHEMAS).length, 'كلّ نوعٍ ممثَّل');
  assert.equal(stats.types, 38, 'الـ٣٥ الأصليّة + RCP وSPV وRCV');
  // ‹EXE-301› +2: `mustShipBy` في SO وPICK — مهلة الشحن التشغيليّة.
  // ‹FNB-405› +3: `mfgDate` في GRN وQC وPUTAWAY — سمةُ دفعةٍ تعبر السلسلة.
  assert.equal(stats.total, 73, 'مجموع الحقول الزمنيّة المصنَّفة');
});

test('التوزيع: ختم الواقعة هو الغالب، والسمة تليه', () => {
  const { counts } = timeFieldStats();
  assert.equal(counts.event, 37);
  // ‹FNB-405› +3: تاريخ الإنتاج سمةٌ كالصلاحيّة — وقع في مصنع المورّد لا عندنا.
  assert.equal(counts.attribute, 21);
  assert.equal(counts.planned, 11, 'ومنها mustShipBy في SO وPICK ‹EXE-301›');
  assert.equal(counts.reference, 4);
  assert.equal(counts.event + counts.attribute + counts.planned + counts.reference, 73);
});

/* ═══════════ ٣. القواعد التي لا تُخرق ═══════════ */

test('★ صلاحيّة الدفعة سمةُ بيانات لا ختمَ واقعة — وإلّا رُفض كلّ استلامٍ لبضاعةٍ صالحة', () => {
  for (const [type, fields] of Object.entries(TIME_FIELD_MAP)) {
    for (const key of Object.keys(fields)) {
      if (/^expiry/i.test(key)) {
        assert.equal(fields[key], 'attribute', `${type}.${key} يجب أن يكون سمةً`);
      }
    }
  }
});

test('★ لكلّ مستندٍ ختمُ واقعةٍ — أو استثناءٌ مُعلَنٌ بسببه وعلاجه', () => {
  // القاعدة لا تُضعَّف من أجل خرق: الخرق يُسجَّل ويُرى ويُعالَج.
  for (const type of Object.keys(SCHEMAS)) {
    if (fieldsByClass(type, 'event').length >= 1) continue;
    const ex = TYPES_WITHOUT_EVENT_STAMP[type];
    assert.ok(ex, `${type}: لا ختم واقعة ولا استثناء مُعلَن`);
    assert.ok(ex.reason && ex.fallback && ex.fix, `${type}: استثناءٌ بلا سببٍ أو بديلٍ أو علاج`);
  }
});

test('★ الاستثناءات محصورة ولا تتضخّم — وكلٌّ منها خرقٌ فعليّ لا احتياطيّ', () => {
  assert.deepEqual(Object.keys(TYPES_WITHOUT_EVENT_STAMP), ['PICK'], 'استثناءٌ واحد لا غير');
  for (const type of Object.keys(TYPES_WITHOUT_EVENT_STAMP)) {
    assert.equal(fieldsByClass(type, 'event').length, 0, `${type} صار له ختمٌ — احذف استثناءه`);
  }
});

test('★ سلوك الأصناف متّسق: الواقعة تُختم ولا تُحرَّر ولا تكون في المستقبل', () => {
  const e = TIME_CLASSES.event;
  assert.equal(e.serverStamped, true);
  assert.equal(e.editable, false);
  assert.equal(e.futureAllowed, false);

  // وما عداها حرٌّ ويقبل المستقبل — الصلاحيّة وموعد السداد والوصول المتوقّع.
  for (const id of ['planned', 'attribute', 'reference']) {
    assert.equal(TIME_CLASSES[id].serverStamped, false, `${id} لا يُختم`);
    assert.equal(TIME_CLASSES[id].futureAllowed, true, `${id} يقبل المستقبل`);
  }
});

test('★ لا يُصنَّف ختمَ واقعةٍ حقلٌ تسميتُه نيّةٌ لا حدث', () => {
  // «المطلوب» و«المتوقّع» و«الاحتياج» و«الاستحقاق» رغباتٌ واتّفاقات، وختمُها
  // بالخادم يعني إلغاء قدرة الموظّف على كتابة موعدٍ مستقبليّ أصلًا.
  const intents = [
    ['PO', 'requiredDelivery'], ['SO', 'requiredDate'], ['TR', 'requiredDate'],
    ['TRN', 'expectedArrival'], ['PR', 'neededBy'], ['IPR', 'neededBy'],
    ['IPO', 'requiredDelivery'], ['INV', 'dueDate'], ['VSI', 'dueDate'],
  ];
  for (const [type, key] of intents) {
    assert.equal(classOf(type, key), 'planned', `${type}.${key}`);
    assert.equal(isEventStamp(type, key), false);
  }
});

/* ═══════════ ٤. القارئات ═══════════ */

test('classOf وbehaviorOf: يقرأ الحارس السلوك ولا يحمل أسماء حقول', () => {
  assert.equal(classOf('GRN', 'receivedAt'), 'event');
  assert.equal(behaviorOf('GRN', 'receivedAt').serverStamped, true);
  assert.equal(behaviorOf('GRN', 'expiryDate').futureAllowed, true);

  assert.equal(classOf('GRN', 'لا وجود له'), null);
  assert.equal(behaviorOf('لا نوع', 'x'), null, 'المجهول لا يُفترض له سلوك');
  assert.equal(isEventStamp('لا نوع', 'x'), false);
});

test('timeFieldsOf: يمسح الرأس والجداول وextraFields معًا', () => {
  const found = timeFieldsOf(SCHEMAS.GRN).map((f) => f.key);
  assert.ok(found.includes('receivedAt'), 'حقل رأس');
  assert.ok(found.includes('expiryDate'), 'عمود جدول');

  assert.deepEqual(timeFieldsOf(null), [], 'مخطّطٌ فارغ لا يرمي');
  assert.deepEqual(timeFieldsOf({ sections: [{ key: 'x', kind: 'checklist', items: ['أ'] }] }), []);
});

test('TIME_KINDS هو تعريف «الزمنيّ» — موضعٌ واحد يُغيَّر لو أضيف نوعٌ ثالث', () => {
  assert.deepEqual(TIME_KINDS, ['date', 'datetime']);
});
