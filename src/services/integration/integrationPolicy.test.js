/**
 * اختبارات سياسة التكامل (م٧-أ · يكمل سدّ ف‑٩).
 *
 * الاختبار الحاكم: **الافتراض هو الحالة المعتمدة اليوم** — فتفعيل اللوحة لا
 * يغيّر سلوكًا، والتغيير يقع بقرارٍ من المالك لا بترقيةٍ من مبرمج.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DIRECTIONS,
  DIRECTION_IDS,
  DATA_SCOPES,
  MATRIX_COLUMNS,
  MONEY_MODES,
  defaultPolicyFor,
  normalizePolicy,
  policyTypes,
  fullPolicy,
  pushDecision,
  fieldGate,
  simulate,
  policyProblems,
  policySummary,
} from './integrationPolicy.js';
import { DOC_ODOO_MAP } from '../odoo/docCrosswalk.js';
import { MONEY_FIELD_NAMES } from '../odoo/moneyFields.js';

/* ═══════════ ١. الافتراض = اليوم ═══════════ */

test('★★ الافتراض هو السياسة المعتمدة: كمّيّاتٌ ومراجعُ تُدفع، ومالٌ يُسحب ولا يُرفع', () => {
  const d = defaultPolicyFor('PO');
  assert.equal(d.direction, 'push');
  assert.equal(d.quantities, true);
  assert.equal(d.references, true);
  assert.equal(d.money, 'pull', 'م١-ب: اسحب المالي ولا ترفعه');
  assert.equal(d.timing, 'on_done');
  assert.equal(d.onConflict, 'adopt', 'الحقيقة عند النظام المرتبط لا عند مرآتنا');
});

test('★ والأصناف تُسحب — الماستر من أودو', () => {
  assert.equal(defaultPolicyFor('items').direction, 'pull');
});

test('★★ غياب السياسة كلّها = سلوك اليوم لكلّ نوع', () => {
  const full = fullPolicy({});
  for (const type of policyTypes()) {
    assert.equal(full[type].money, 'pull', `${type} يرفع مالًا افتراضًا`);
    assert.deepEqual(full[type], defaultPolicyFor(type));
  }
  assert.deepEqual(fullPolicy(), fullPolicy({}), 'والغياب التامّ كذلك');
});

test('★ القيمة الفاسدة تسقط إلى الافتراض ولا تُعطّل', () => {
  const p = normalizePolicy({ direction: 'مخترع', money: 'مخترع', timing: 'مخترع' }, 'PO');
  assert.equal(p.direction, 'push');
  assert.equal(p.money, 'pull');
  assert.equal(p.timing, 'on_done');
  assert.deepEqual(normalizePolicy(null, 'PO'), defaultPolicyFor('PO'));
  assert.deepEqual(normalizePolicy('نصّ', 'PO'), defaultPolicyFor('PO'));
});

/* ═══════════ ٢. النطاق من مصدرٍ واحد ═══════════ */

test('★ الأنواع تُقرأ من جدول العبور — لا قائمةٌ ثانية تنحرف', () => {
  assert.deepEqual(policyTypes(), Object.keys(DOC_ODOO_MAP).sort());
  assert.ok(policyTypes().length >= 35, 'المصفوفة تغطّي الأنواع المحكومة كلّها');
});

test('المصفوفة ستّة أعمدة، والفئات الستّ حاضرة', () => {
  assert.equal(MATRIX_COLUMNS.length, 6, 'نصّ الخطة: ٦ أعمدة');
  assert.equal(DATA_SCOPES.length, 6);
  assert.equal(DIRECTIONS.length, 4);
  for (const c of MATRIX_COLUMNS) assert.ok(c.key && c.labelAr);
});

/* ═══════════ ٣. قرار الدفع ═══════════ */

test('★★ الجسر يسأل السياسة بدل الثوابت المخبوزة', () => {
  const policy = fullPolicy({});
  assert.equal(pushDecision(policy, 'PO', { state: 'done' }).allowed, true);

  const isolated = fullPolicy({ PO: { direction: 'isolated', quantities: false, references: false } });
  const r = pushDecision(isolated, 'PO', { state: 'done' });
  assert.equal(r.allowed, false);
  assert.match(r.reason, /معزول/);
});

test('★ والاتّجاه سحبًا يمنع الدفع', () => {
  const pull = fullPolicy({ PO: { direction: 'pull' } });
  assert.equal(pushDecision(pull, 'PO').allowed, false);
});

test('★ والتوقيت يُحترم: «عند الإنجاز» لا يُدفع عند الاعتماد', () => {
  const policy = fullPolicy({});
  assert.equal(pushDecision(policy, 'PO', { state: 'approved' }).allowed, false);

  const onApprove = fullPolicy({ PO: { timing: 'on_approve' } });
  assert.equal(pushDecision(onApprove, 'PO', { state: 'approved' }).allowed, true);

  const manual = fullPolicy({ PO: { timing: 'manual' } });
  assert.equal(pushDecision(manual, 'PO', { state: 'done' }).allowed, false);
  assert.equal(pushDecision(manual, 'PO', { state: 'manual' }).allowed, true, 'والدفع اليدويّ يمرّ');
});

/* ═══════════ ٤. بوّابة الحقول ═══════════ */

test('★★ الافتراض يحجب كلّ حقل مال — وحدّ م١-ب باقٍ حتّى لو فُتحت اللوحة', () => {
  const gate = fieldGate(fullPolicy({}), 'PO');
  assert.equal(gate.money, false);
  assert.equal(gate.quantities, true);
  assert.deepEqual(gate.blockedNames.sort(), [...MONEY_FIELD_NAMES].sort());
});

test('★ وفتحُ المال قرارٌ صريحٌ لا سهو', () => {
  const open = fullPolicy({ PO: { money: 'push' } });
  const gate = fieldGate(open, 'PO');
  assert.equal(gate.money, true);
  assert.deepEqual(gate.blockedNames, []);
});

/* ═══════════ ٥. المحاكاة قبل التفعيل ═══════════ */

test('★★ المحاكاة تُخرج ما سيتغيّر — فالسياسة تُغيَّر وهي مرئيّة لا في الظلام', () => {
  const current = fullPolicy({});
  const next = fullPolicy({ PO: { direction: 'isolated', quantities: false, references: false } });
  const { changes } = simulate(current, next);
  const poChanges = changes.filter((c) => c.type === 'PO');
  assert.ok(poChanges.some((c) => c.field === 'direction' && c.from === 'push' && c.to === 'isolated'));
  assert.equal(changes.filter((c) => c.type === 'GRN').length, 0, 'وما لم يتغيّر لا يُذكر');
});

test('★★ ورفعُ المال يحمل تحذيره: مصدران لرقمٍ واحد', () => {
  const { warnings } = simulate(fullPolicy({}), fullPolicy({ INV: { money: 'push' } }));
  assert.ok(warnings.some((w) => /INV/.test(w) && /مصدرَين لرقمٍ واحد/.test(w)));
  assert.ok(warnings.some((w) => /القرار ٢/.test(w)), 'ويُذكّر بأنّ أودو مولّد القيد');
});

test('★ والكتابة فوق الموجود وقلبُ الاتّجاه والعزل — كلّها تُحذَّر', () => {
  assert.ok(simulate(fullPolicy({}), fullPolicy({ PO: { onConflict: 'overwrite' } })).warnings.some((w) => /تُفقد/.test(w)));
  assert.ok(simulate(fullPolicy({}), fullPolicy({ PO: { direction: 'pull' } })).warnings.some((w) => /مرآةً تُدهَس/.test(w)));
  assert.ok(
    simulate(fullPolicy({}), fullPolicy({ PO: { direction: 'isolated', quantities: false, references: false } }))
      .warnings.some((w) => /العزل يوقف التبادل/.test(w))
  );
});

test('لا تغييرَ لا محاكاةَ له', () => {
  const p = fullPolicy({});
  assert.deepEqual(simulate(p, p), { changes: [], warnings: [] });
});

/* ═══════════ ٦. التحقّق والملخّص ═══════════ */

test('★ التناقض الصريح يُرفض: معزولٌ ويُمرّر، أو دفعٌ بلا حقلٍ واحد', () => {
  assert.ok(policyProblems({ PO: { direction: 'isolated', quantities: true } }).some((p) => /تناقضٌ صريح/.test(p)));
  assert.ok(
    policyProblems({ PO: { direction: 'push', quantities: false, references: false, money: 'pull' } })
      .some((p) => /دفعٌ فارغ/.test(p))
  );
  assert.ok(policyProblems({ PO: { direction: 'مخترع' } }).some((p) => /اتّجاهٌ غير معروف/.test(p)));
  assert.deepEqual(policyProblems(fullPolicy({})), [], 'والافتراض سليم');
});

test('★ الملخّص يكشف كم نوعًا يرفع مالًا — وهو الرقم الذي يُقرأ أوّلًا', () => {
  const s = policySummary({});
  assert.equal(s.moneyPush, 0, 'صفرٌ افتراضًا');
  assert.equal(s.byDirection.push + s.byDirection.pull + s.byDirection.import_once + s.byDirection.isolated, s.total);

  assert.equal(policySummary({ INV: { money: 'push' } }).moneyPush, 1);
});

test('كلّ اتّجاهٍ معلَنٌ في القائمة موجودٌ في المعرّفات', () => {
  for (const d of DIRECTIONS) assert.ok(DIRECTION_IDS.includes(d.id));
  for (const m of MONEY_MODES) assert.ok(m.id && m.labelAr);
});

/* ═══════════ ٧. ربط الجسر (م٧-ب) ═══════════ */

test('★★ الافتراض يُبقي الدفع التلقائيّ عاملًا لكلّ مستند — لا شيء يتوقّف بتفعيل اللوحة', () => {
  const policy = fullPolicy({});
  for (const type of policyTypes()) {
    const r = pushDecision(policy, type, { state: 'done' });
    assert.equal(r.allowed, true, `${type} توقّف دفعُه بالافتراض`);
  }
});

test('★★ وفئة «الأصناف» افتراضها سحب — ولذلك يمرّ دفعُها اليدويّ خارج حارس الاتّجاه', () => {
  // العطب الذي كاد يقع: تمريرُ `items` إلى حارس الاتّجاه كان سيمنع زرّ «ادفع
  // هذا الصنف» العامل اليوم. فالحارس للأتمتة، والضغطةُ الصريحة قرارٌ بشريّ.
  const policy = fullPolicy({});
  assert.equal(pushDecision(policy, 'items').allowed, false, 'تلقائيًّا: ممنوع');
  assert.equal(fieldGate(policy, 'items').money, false, 'وحدّ المال قائمٌ عليه في الحالين');
});
