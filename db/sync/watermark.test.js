/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  حارسُ سياسةِ المزامنة — والميزانيّةُ شرطُ قبولٍ لا ملاحظة
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★★ يُشغَّل في **Node العاري**: لا سحابةَ ولا حاويةَ ولا `node_modules`.
 *     وهذا شرطُ وجودِه لا تفضيلٌ — شجرةُ العمل هنا بلا حزم، فاختبارٌ يحتاجها
 *     اختبارٌ لا يعمل. والجردُ مُثبَّتٌ في `inventory.measured.json` (قياسُ
 *     2026-09-02) فالأرقامُ مقيسةٌ لا مفترَضة.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MODE,
  TIER,
  BUDGET_READS_PER_DAY,
  FREE_TIER_READS_PER_DAY,
  markFor,
  tierFor,
  planFor,
  queriesPerCycle,
  idleReadsPerDay,
  advanceWatermark,
  windowStart,
  isDue,
} from './watermark.js';
import { appendOnlyFromRules, pathsFromRules } from './rules-paths.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

const INVENTORY = JSON.parse(readFileSync(join(HERE, 'inventory.measured.json'), 'utf8'));
const RULES = readFileSync(join(ROOT, 'firestore.rules'), 'utf8');
const APPEND_ONLY = appendOnlyFromRules(RULES);

/* ═══════════════════ ١ · ختمُ الإنشاء ليس ختمَ تعديل ═══════════════════ */

test('★★★ مجموعةٌ تُعدَّل ولا تحمل إلّا ختمَ إنشاءٍ ⇒ مسحٌ كامل، لا تدريجيّ', () => {
  // ★ هذه الستّةُ **مقيسةٌ** من الجرد: تغطيةُ `createdAt` كاملةٌ فيها،
  //   ولا `updatedAt` لها، وليست ملحقةً-فقط في القواعد.
  //   ولو قُبل ختمُ الإنشاءِ علامةً لصار كلُّ تعديلٍ عليها غيرَ مرئيّ للأبد.
  const mutableWithCreationStampOnly = [
    'operations',
    'receiving_sessions',
    'crews',
    'labor_tasks',
    'warehouses',
    'hiring_requests',
  ];

  for (const path of mutableWithCreationStampOnly) {
    const entry = INVENTORY[path];
    assert.ok(entry, `المسار «${path}» مفقودٌ من الجرد المقيس`);
    assert.equal(entry.fields.createdAt, entry.count, `${path}: تغطيةُ createdAt ليست كاملة`);
    // ★ ولا `updatedAt` **بتغطيةٍ كاملة**. و`operations` أوضحُها: اثنان من
    //   ثلاثة. فقبولُ التغطيةِ الجزئيّةِ كان سيُسقط عمليّةً كاملةً بلا أثر.
    assert.notEqual(
      entry.fields.updatedAt,
      entry.count,
      `${path}: صار له updatedAt بتغطيةٍ كاملة — راجع السياسة`
    );

    const decision = markFor(path, entry, APPEND_ONLY);
    assert.equal(decision.mode, MODE.FULL, `${path} يجب أن يُمسح كاملًا`);
    assert.equal(decision.field, null);
    assert.match(decision.why, /ختمُ إنشاء/);
  }
});

test('ختمُ تعديلٍ بتغطيةٍ كاملة ⇒ تدريجيّ', () => {
  const decision = markFor('Items_Master', INVENTORY.Items_Master, APPEND_ONLY);
  assert.equal(decision.mode, MODE.INCREMENTAL);
  assert.equal(decision.field, 'updatedAt');
});

test('★★ الملحقةُ-فقط وحدَها يصلح ختمُ إنشائها علامةً — والشرطُ يُشتقّ من القواعد', () => {
  for (const path of ['documents/audit', 'operations/scans', 'portal_visits']) {
    assert.ok(APPEND_ONLY.has(path), `«${path}» ليست ملحقةً-فقط في القواعد`);
    const decision = markFor(path, INVENTORY[path], APPEND_ONLY);
    assert.equal(decision.mode, MODE.INCREMENTAL, `${path} تدريجيّ`);
    assert.equal(decision.field, 'at');
  }

  // والنقض: نفسُ الجرد بالضبط، لكن بلا صفةِ «ملحقة-فقط» ⇒ ينقلب الحكم.
  const asMutable = markFor('operations/scans', INVENTORY['operations/scans'], new Set());
  assert.equal(asMutable.mode, MODE.FULL);
});

test('تغطيةٌ جزئيّةٌ لا تُقبل علامة — المستندُ بلا الحقل يسقط من الاستعلام صامتًا', () => {
  const partial = { count: 5, fields: { createdAt: 4 } };
  const decision = markFor('synthetic/partial', partial, new Set(['synthetic/partial']));
  assert.equal(decision.mode, MODE.FULL);
  assert.match(decision.why, /لا ختمَ بتغطيةٍ كاملة/);
});

/* ═══════════════════ ٢ · العلامةُ تتقدّم بما رأت ═══════════════════ */

test('العلامةُ تتقدّم بأقصى ما قُرئ، ولا تتراجع، ولا تتحرّك بلا صفوف', () => {
  const rows = [
    { at: { __type: 'timestamp', iso: '2026-09-01T10:00:00.000Z' } },
    { at: { __type: 'timestamp', iso: '2026-09-01T12:00:00.000Z' } },
    { at: { __type: 'timestamp', iso: '2026-09-01T11:00:00.000Z' } },
  ];
  assert.equal(advanceWatermark(null, rows, 'at'), '2026-09-01T12:00:00.000Z');

  // دورةٌ ثانيةٌ بلا جديد ⇒ العلامةُ كما هي. وهذا **برهانُ اللاتكرار**:
  // ما دامت لا تتقدّم بلا صفوف، فإعادةُ التشغيل لا تنقل شيئًا.
  assert.equal(advanceWatermark('2026-09-01T12:00:00.000Z', [], 'at'), '2026-09-01T12:00:00.000Z');

  // صفٌّ أقدمُ من العلامة لا يجرّها إلى الوراء.
  assert.equal(
    advanceWatermark('2026-09-01T12:00:00.000Z', [{ at: '2026-08-01T00:00:00.000Z' }], 'at'),
    '2026-09-01T12:00:00.000Z'
  );

  // مسارٌ بلا حقلٍ (مسحٌ كامل) لا علامةَ له بحال.
  assert.equal(advanceWatermark('2026-09-01T12:00:00.000Z', rows, null), null);
});

test('نافذةُ القراءة تتراجع بمقدار التداخل — تأمينٌ ثمنُه صفر', () => {
  assert.equal(windowStart('2026-09-01T12:00:00.000Z', 60000), '2026-09-01T11:59:00.000Z');
  assert.equal(windowStart(null), null, 'بلا علامةٍ ⇒ من الأوّل');
});

/* ═══════════════════ ٣ · الميزانيّة — شرطُ القبول ═══════════════════ */

test('★★★ الوتيرةُ الموحّدةُ الساذجةُ تخرق الحصّةَ — والرقمُ مُثبَّتٌ كي لا يُعاد', () => {
  // تصميمُ البطاقة الأصليّ: كلُّ مسارٍ كلَّ دقيقتين، والفرعيّاتُ أبًا أبًا.
  let queries = 0;
  for (const path of Object.keys(INVENTORY)) {
    queries += queriesPerCycle(path, INVENTORY, false);
  }
  const naive = queries * (1440 / 2);

  assert.equal(queries, 637, 'كلفةُ الدورة الساذجة تغيّرت — أعِد القياس قبل تعديل الرقم');
  assert.equal(naive, 458640);
  assert.ok(
    naive > FREE_TIER_READS_PER_DAY * 9,
    'التصميمُ الساذج يجب أن يبقى مبرهَنَ الخرق — هذا هو الحارس'
  );

  // و٥٢٥ من الـ٦٣٧ سببُها مجموعاتُ `documents` الفرعيّةُ الثلاث وحدَها.
  const documentsSubs = ['documents/audit', 'documents/attachments', 'documents/control'].reduce(
    (sum, p) => sum + queriesPerCycle(p, INVENTORY, false),
    0
  );
  assert.equal(documentsSubs, 525);
});

test('★★★ الخطّةُ المعتمدةُ تحت السقف — بفهرسِ المجموعات وبدونه', () => {
  for (const collectionGroup of [true, false]) {
    const plan = planFor(INVENTORY, { appendOnly: APPEND_ONLY, collectionGroup });
    const reads = idleReadsPerDay(plan);

    assert.ok(
      reads <= BUDGET_READS_PER_DAY,
      `أرضيّةُ القراءات ${reads} تتجاوز السقفَ ${BUDGET_READS_PER_DAY}` +
        ` (فهرسُ المجموعات: ${collectionGroup})`
    );
    assert.ok(reads > 0, 'خطّةٌ بلا قراءاتٍ تعني مزامنةً لا تعمل');
  }
});

test('بلا فهرسِ مجموعةٍ تُجبَر الفرعيّاتُ على «بارد» — الكلفةُ لا الحاجة', () => {
  const withoutIndex = planFor(INVENTORY, { appendOnly: APPEND_ONLY, collectionGroup: false });
  const withIndex = planFor(INVENTORY, { appendOnly: APPEND_ONLY, collectionGroup: true });

  assert.equal(withoutIndex['documents/audit'].tier, TIER.COLD);
  assert.equal(withoutIndex['documents/audit'].queries, 175);

  assert.equal(withIndex['documents/audit'].tier, TIER.HOT);
  assert.equal(withIndex['documents/audit'].queries, 1);

  assert.ok(
    idleReadsPerDay(withIndex) < idleReadsPerDay(withoutIndex),
    'الفهرسُ يجب أن يوفّر قراءاتٍ لا أن يزيدها'
  );
});

test('الوتيرةُ تتبع الحجمَ المقيس، والاستثناءُ بسببه', () => {
  assert.equal(tierFor('Items_Master', INVENTORY.Items_Master), TIER.HOT);
  assert.equal(tierFor('users', INVENTORY.users), TIER.WARM);
  assert.equal(tierFor('assignments', INVENTORY.assignments), TIER.COLD);
  // سجلّان اثنان — لكنّه مصدرُ الترقيم، فيُنقَض حجمُه بقرارٍ مكتوب.
  assert.equal(tierFor('counters', INVENTORY.counters), TIER.WARM);
});

test('جدولةُ الدورات: البارد لا يعمل كلَّ دقيقتين', () => {
  const plan = planFor(INVENTORY, { appendOnly: APPEND_ONLY, collectionGroup: true });
  assert.equal(isDue(plan, 'Items_Master', 2), true);
  assert.equal(isDue(plan, 'assignments', 2), false);
  assert.equal(isDue(plan, 'assignments', 60), true);
  assert.equal(isDue(plan, 'لا-وجود-له', 60), false);
});

/* ═══════════════════ ٤ · لا مسارَ يسقط بلا حكم ═══════════════════ */

test('★★★ مجموعةٌ أُضيفت بعد آخر قياسٍ تُقرأ ولا تسقط صامتة', () => {
  // الجردُ لا يعرفها — والقواعدُ تعرفها. والقواعدُ هي المرجع.
  const plan = planFor(INVENTORY, {
    appendOnly: APPEND_ONLY,
    collectionGroup: true,
    paths: [...Object.keys(INVENTORY), 'مجموعةٌ_جديدة'],
  });

  assert.ok(plan['مجموعةٌ_جديدة'], 'المسارُ غيرُ المقيس يجب أن يدخل الخطّة');
  assert.equal(plan['مجموعةٌ_جديدة'].mode, MODE.FULL, 'المجهولُ يُمسح كاملًا');
  assert.equal(plan['مجموعةٌ_جديدة'].tier, TIER.COLD, 'وبأبرد وتيرة');
  assert.equal(plan['مجموعةٌ_جديدة'].queries, 1);
});

test('كلُّ مسارٍ في القواعد له حكمٌ في الخطّة — ولا مسارَ بلا كلفةٍ محسوبة', () => {
  const plan = planFor(INVENTORY, { appendOnly: APPEND_ONLY, collectionGroup: false });
  const fromRules = pathsFromRules(RULES);

  for (const path of fromRules) {
    assert.ok(plan[path], `المسار «${path}» في القواعد وليس في الخطّة — فرقٌ صامت`);
    assert.ok([MODE.FULL, MODE.INCREMENTAL].includes(plan[path].mode));
    assert.equal(typeof plan[path].tier, 'number');
    assert.ok(plan[path].why.length > 0, 'كلُّ حكمٍ يحمل سببَه');
  }

  assert.equal(fromRules.length, Object.keys(INVENTORY).length);
});
