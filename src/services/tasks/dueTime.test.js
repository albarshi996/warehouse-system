/**
 * اختبارات مهلة الشحن ‹EXE-301› — الدرجات لا نعم/لا، والاحتياط يُعلَن.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DUE_LEVELS,
  SHIP_DEADLINE_FIELD,
  SOON_HOURS,
  documentDeadline,
  documentDue,
  remainingFrom,
  sortByDue,
  toMillis,
} from './dueTime.js';
import { TIME_FIELD_MAP } from '../documents/timeFields.js';
import { remainingTime } from '../ledger/exceptions.js';

const NOW = Date.parse('2026-08-17T09:00:00Z');
const at = (iso) => Date.parse(iso);

test('★★ الحقل مصنَّفٌ «مخطّطًا» — موعدٌ متّفق عليه لا ختمُ واقعة', () => {
  // لو صُنّف ختمَ واقعةٍ لَرفضه الحارس لكونه في المستقبل — وهو مستقبلٌ بطبيعته.
  assert.equal(TIME_FIELD_MAP.SO[SHIP_DEADLINE_FIELD], 'planned');
  assert.equal(TIME_FIELD_MAP.PICK[SHIP_DEADLINE_FIELD], 'planned');
});

test('★★ الدرجات لا نعم/لا: على الوقت · قارب · تأخّر', () => {
  assert.equal(remainingFrom(at('2026-08-17T20:00:00Z'), NOW).level, 'ontime');
  assert.equal(remainingFrom(at('2026-08-17T12:00:00Z'), NOW).level, 'soon', `أقلّ من ${SOON_HOURS} ساعات`);
  assert.equal(remainingFrom(at('2026-08-17T06:00:00Z'), NOW).level, 'late');
});

test('★★ «بلا موعد» ليست «على الوقت» — الأولى جهلٌ والثانية حكم', () => {
  const r = remainingFrom(null, NOW);
  assert.equal(r.level, 'none');
  assert.equal(r.overdue, false);
  assert.equal(r.label, DUE_LEVELS.none.label);
  assert.equal(DUE_LEVELS.none.warn, false, 'ولا تُنذر');
});

test('التأخّر وحده يُنذر — والاقتراب لا', () => {
  assert.equal(DUE_LEVELS.late.warn, true);
  assert.equal(DUE_LEVELS.soon.warn, false);
  assert.equal(remainingFrom(at('2026-08-17T06:00:00Z'), NOW).warn, true);
});

test('الوقت يُمرَّر ولا يُقرأ — نتيجةٌ ثابتة لنفس المدخل', () => {
  const a = remainingFrom(at('2026-08-17T12:00:00Z'), NOW);
  const b = remainingFrom(at('2026-08-17T12:00:00Z'), NOW);
  assert.deepEqual(a, b);
});

/* ── المهلة من المستند ──────────────────────────────────────── */

test('★★ `mustShipBy` يسبق `requiredDate` — قيدُ الناقل لا وعدُ العميل', () => {
  const doc = { header: { mustShipBy: '2026-08-17T11:00:00Z', requiredDate: '2026-08-19' } };
  const d = documentDeadline(doc);
  assert.equal(d.source, SHIP_DEADLINE_FIELD);
  assert.equal(d.fallback, false);
});

test('★★ بلا مهلةٍ يُقرأ وعدُ العميل احتياطًا — **ويُعلَن أنّه احتياط**', () => {
  // مستندات اليوم كلّها بلا mustShipBy؛ ونظامٌ يقول «بلا موعد» لكلّ أمرٍ قائم
  // لا يُوثَق به. والفرق بين المصدرين ظاهرٌ لا مطموسٌ في رقمٍ واحد.
  const due = documentDue({ header: { requiredDate: '2026-08-19' } }, NOW);
  assert.equal(due.source, 'requiredDate');
  assert.equal(due.fallback, true);
  assert.match(due.hint, /وعد العميل/);
});

test('بلا موعدٍ أصلًا لا يُخترع شيء', () => {
  const due = documentDue({ header: {} }, NOW);
  assert.equal(due.level, 'none');
  assert.equal(due.source, '');
  assert.equal(due.hint, '');
});

test('يقرأ الرأس أو الجذر — فلا ينكسر مستهلكٌ بأيّ الشكلين', () => {
  assert.equal(documentDeadline({ mustShipBy: '2026-08-17T11:00:00Z' }).fallback, false);
});

/* ── الترتيب بالإلحاح ───────────────────────────────────────── */

test('★★ المتأخّر أوّلًا · ثمّ الأقرب · وما لا موعد له يُؤخَّر', () => {
  const docs = [
    { id: 'none', header: {} },
    { id: 'ontime', header: { mustShipBy: '2026-08-18T09:00:00Z' } },
    { id: 'late', header: { mustShipBy: '2026-08-17T06:00:00Z' } },
    { id: 'soon', header: { mustShipBy: '2026-08-17T11:00:00Z' } },
  ];
  assert.deepEqual(sortByDue(docs, NOW).map((d) => d.id), ['late', 'soon', 'ontime', 'none'], 'الجهل ليس إلحاحًا');
});

/* ── لا حاسبَ ثانٍ ──────────────────────────────────────────── */

test('★★ الاستثناء يُحيل إلى الحساب نفسه — فلا يفترق الوقتان', () => {
  const dueAt = '2026-08-17T06:00:00Z';
  assert.deepEqual(remainingTime({ dueAt }, NOW), remainingFrom(at(dueAt), NOW));
});

test('القراءة تحتمل النصّ والرقم وطابع Firestore', () => {
  assert.equal(toMillis('2026-08-17T09:00:00Z'), NOW);
  assert.equal(toMillis(NOW), NOW);
  assert.equal(toMillis({ seconds: NOW / 1000 }), NOW);
  assert.equal(toMillis({ toMillis: () => NOW }), NOW);
  assert.equal(toMillis(''), null);
  assert.equal(toMillis('ليس تاريخًا'), null);
});
