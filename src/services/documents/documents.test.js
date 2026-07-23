/**
 * اختبارات وحدة لمنطق محرّك المستندات — تُشغَّل بـ `node --test src/services/documents/`.
 * تغطّي المنطق الخالص وحده (بلا شبكة ولا متصفّح): الترقيم · آلة الحالات ·
 * الإجماليات المحسوبة · حدود CCP1 · الحقول الإلزامية.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { formatNumber, counterId, parseNumber } from './numberFormat.js';
import { isEditable, isLegalTransition, canDo, availableTransitions, TRANSITIONS } from './states.js';
import grn, { ccp1Violations } from './schemas/grn.js';
import { getSchema, readyTypes } from './schemas/index.js';
import { emptyDocument, missingRequired, checklistCount, fieldValue, isEmptyLine, applyItemToLine } from './schemaUtils.js';

// ── الترقيم ────────────────────────────────────────────────────────
test('الرقم الرسمي يتبع الصيغة المعتمدة GRN-2026-0001', () => {
  assert.equal(formatNumber('GRN', 2026, 1), 'GRN-2026-0001');
  assert.equal(formatNumber('GRN', 2026, 42), 'GRN-2026-0042');
  assert.equal(formatNumber('GP', 2027, 1234), 'GP-2027-1234');
});

test('التسلسل لا يفقد خاناته ويحتمل تجاوز الأربع', () => {
  assert.equal(formatNumber('GRN', 2026, 9999), 'GRN-2026-9999');
  assert.equal(formatNumber('GRN', 2026, 10000), 'GRN-2026-10000');
});

test('لكل نوع وسنة عدّاد مستقلّ — فالتسلسل يُصفَّر مع السنة', () => {
  assert.equal(counterId('GRN', 2026), 'GRN-2026');
  assert.notEqual(counterId('GRN', 2026), counterId('GRN', 2027));
  assert.notEqual(counterId('GRN', 2026), counterId('PO', 2026));
});

test('الرقم يُفكّ إلى أجزائه ذهابًا وإيابًا', () => {
  assert.deepEqual(parseNumber('GRN-2026-0007'), { type: 'GRN', year: 2026, seq: 7 });
  assert.equal(parseNumber('BFP-GRN-002'), null, 'الرقم الورقي القديم ليس صيغة صالحة');
  assert.equal(parseNumber(''), null);
});

// ── آلة الحالات ────────────────────────────────────────────────────
test('التحرير مسموح في المسودّة والمرفوض فقط', () => {
  assert.equal(isEditable('draft'), true);
  assert.equal(isEditable('rejected'), true);
  assert.equal(isEditable('submitted'), false, 'المُرسَل لا يُعدَّل من تحت من يعتمده');
  assert.equal(isEditable('approved'), false);
  assert.equal(isEditable('done'), false);
});

test('🥇 حارس الجودة: لا طريق من «مُرسَل» إلى «منجَز» دون اعتماد', () => {
  assert.equal(isLegalTransition('submitted', 'done'), false);
  assert.equal(isLegalTransition('draft', 'done'), false);
  assert.equal(isLegalTransition('draft', 'approved'), false);
  // الطريق الوحيد يمرّ بالاعتماد:
  assert.equal(isLegalTransition('submitted', 'approved'), true);
  assert.equal(isLegalTransition('approved', 'done'), true);
});

test('المنجَز نهاية الطريق — لا نقلة بعده', () => {
  assert.deepEqual(TRANSITIONS.done, []);
});

test('المرفوض يعود مسودّةً قابلة للتصحيح', () => {
  assert.equal(isLegalTransition('rejected', 'submitted'), true);
});

test('الإرسال لصاحب المستند وحده — لا لغيره', () => {
  const doc = { createdByUid: 'u1', state: 'draft' };
  const submit = TRANSITIONS.draft[0];
  assert.equal(canDo(submit, { role: 'storekeeper', uid: 'u1' }, grn, doc), true);
  assert.equal(canDo(submit, { role: 'storekeeper', uid: 'u2' }, grn, doc), false);
});

test('الاعتماد لمفتّش الجودة لا لأمين المخزن', () => {
  const doc = { createdByUid: 'u1', state: 'submitted' };
  const approve = TRANSITIONS.submitted.find((t) => t.to === 'approved');
  assert.equal(canDo(approve, { role: 'qc_inspector', uid: 'u9' }, grn, doc), true);
  assert.equal(canDo(approve, { role: 'warehouse_manager', uid: 'u9' }, grn, doc), true);
  assert.equal(canDo(approve, { role: 'storekeeper', uid: 'u1' }, grn, doc), false);
  assert.equal(canDo(approve, { role: 'gate_officer', uid: 'u3' }, grn, doc), false);
});

test('أمين المخزن لا يعتمد استلامه بنفسه ولو كان هو من أنشأه', () => {
  const doc = { createdByUid: 'u1', state: 'submitted' };
  const approve = TRANSITIONS.submitted.find((t) => t.to === 'approved');
  assert.equal(canDo(approve, { role: 'storekeeper', uid: 'u1' }, grn, doc), false);
});

test('الأدمن يملك كل النقلات', () => {
  const doc = { createdByUid: 'someone-else', state: 'submitted' };
  const approve = TRANSITIONS.submitted.find((t) => t.to === 'approved');
  assert.equal(canDo(approve, { role: 'admin', uid: 'boss' }, grn, doc), true);
});

test('الرفض يلزمه سبب مكتوب', () => {
  const reject = TRANSITIONS.submitted.find((t) => t.to === 'rejected');
  assert.equal(reject.needsNote, true);
});

test('المتاح لمفتّش الجودة على مستند مُرسَل: الاعتماد والرفض فقط', () => {
  const doc = { createdByUid: 'u1', state: 'submitted' };
  const list = availableTransitions(doc, { role: 'qc_inspector', uid: 'u9' }, grn);
  assert.deepEqual(list.map((t) => t.to).sort(), ['approved', 'rejected']);
});

test('لا يرى أمين المخزن أي إجراء على مستند ينتظر الجودة', () => {
  const doc = { createdByUid: 'u1', state: 'submitted' };
  assert.deepEqual(availableTransitions(doc, { role: 'storekeeper', uid: 'u1' }, grn), []);
});

// ── الإجماليات المحسوبة ────────────────────────────────────────────
test('الإجماليات تُجمع من البنود لا تُكتب يدويًّا', () => {
  const doc = {
    header: {},
    lines: [
      { qtyOrdered: '10', qtyReceived: '8', qtyRejected: '2' },
      { qtyOrdered: '5', qtyReceived: '5', qtyRejected: '0' },
    ],
  };
  const summary = grn.sections.find((s) => s.key === 'summary');
  const get = (key) => fieldValue(summary.fields.find((f) => f.key === key), doc);
  assert.equal(get('totalOrdered'), 15);
  assert.equal(get('totalReceived'), 13);
  assert.equal(get('totalRejected'), 2);
});

test('البنود الفارغة أو النصّية لا تُفسد الإجمالي', () => {
  const doc = { header: {}, lines: [{ qtyReceived: '' }, { qtyReceived: 'غير معروف' }, { qtyReceived: '3' }] };
  const summary = grn.sections.find((s) => s.key === 'summary');
  assert.equal(fieldValue(summary.fields.find((f) => f.key === 'totalReceived'), doc), 3);
});

// ── حدود CCP1 ──────────────────────────────────────────────────────
test('حدّ المبردات 4°م يُفحص فعلًا (الورق كان يكتبه ولا يفحصه)', () => {
  assert.deepEqual(ccp1Violations({ tempChilled: 3 }), []);
  assert.deepEqual(ccp1Violations({ tempChilled: 4 }), [], 'الحدّ نفسه مقبول');
  assert.equal(ccp1Violations({ tempChilled: 6 }).length, 1);
});

test('حدّ المجمدات -18°م: الأدفأ منه مخالفة', () => {
  assert.deepEqual(ccp1Violations({ tempFrozen: -20 }), []);
  assert.deepEqual(ccp1Violations({ tempFrozen: -18 }), []);
  assert.equal(ccp1Violations({ tempFrozen: -12 }).length, 1, '-12 أدفأ من -18 ⇒ مخالفة');
});

test('الحقل الفارغ ليس مخالفة (لم يُقَس بعد)', () => {
  assert.deepEqual(ccp1Violations({ tempChilled: '', tempFrozen: '' }), []);
  assert.deepEqual(ccp1Violations({}), []);
});

test('الخرقان معًا يُبلَّغ عنهما معًا', () => {
  assert.equal(ccp1Violations({ tempChilled: 9, tempFrozen: -5 }).length, 2);
});

// ── المخطّط والحقول ────────────────────────────────────────────────
test('المستند الفارغ يطابق المخطّط ولا يحمل رقمًا', () => {
  const doc = emptyDocument(grn);
  assert.ok('supplier' in doc.header);
  assert.ok('poRef' in doc.header);
  assert.equal(doc.lines.length, 1, 'صفّ واحد لا ثمانية صفوف مكتوبة في الكود');
  assert.equal(Object.keys(doc.header._checklist).length, 10);
});

test('الحقول المحسوبة والمشتقّة لا تُخزَّن في الرأس', () => {
  const doc = emptyDocument(grn);
  assert.ok(!('totalReceived' in doc.header), 'المحسوب يُشتقّ لا يُخزَّن');
  assert.ok(!('receiver' in doc.header), 'اسم المستلم من الهوية لا من الحقل');
});

test('الإرسال يمنعه نقص الحقول الإلزامية', () => {
  const doc = emptyDocument(grn);
  const missing = missingRequired(grn, doc);
  assert.ok(missing.includes('اسم المورد (Supplier)'));
  assert.ok(missing.includes('رقم أمر الشراء المرجعي (PO Ref.)'));
  assert.ok(missing.includes('تاريخ ووقت الاستلام (Date & Time)'));
});

test('اكتمال الإلزامي يرفع المانع', () => {
  const doc = emptyDocument(grn);
  doc.header.supplier = 'الشركة الليبية';
  doc.header.poRef = 'PO-2026-0001';
  doc.header.receivedAt = '2026-07-15T10:00';
  assert.deepEqual(missingRequired(grn, doc), []);
});

test('اسم المستلم يأتي من هوية المُنشئ، والفاحص من هوية المعتمِد', () => {
  const header = grn.sections.find((s) => s.key === 'header');
  const doc = { header: {}, createdByName: 'محمد البرشي', approvedByName: 'فاحص الجودة' };
  assert.equal(fieldValue(header.fields.find((f) => f.key === 'receiver'), doc), 'محمد البرشي');
  assert.equal(fieldValue(header.fields.find((f) => f.key === 'qcInspector'), doc), 'فاحص الجودة');
});

test('المستند غير المعتمَد لا يحمل اسم فاحص جودة', () => {
  const header = grn.sections.find((s) => s.key === 'header');
  const doc = { header: {}, createdByName: 'محمد البرشي' };
  assert.equal(fieldValue(header.fields.find((f) => f.key === 'qcInspector'), doc), '');
});

test('عدّاد قائمة الفحص يعدّ المؤشَّر وحده', () => {
  const doc = emptyDocument(grn);
  doc.header._checklist['ok-pack'].checked = true;
  doc.header._checklist['clean'].checked = true;
  doc.header._checklist['no-leak'].na = true;
  assert.deepEqual(checklistCount(grn, doc), { checked: 2, total: 10 });
});

test('البند الفارغ يُعرف فيُستبعد من الحفظ', () => {
  assert.equal(isEmptyLine({ sku: '', qty: '' }), true);
  assert.equal(isEmptyLine({ sku: '  ', qty: '' }), true);
  assert.equal(isEmptyLine({ sku: 'A-1', qty: '' }), false);
});

// ── I-ب/2: استدعاء الماستر في البنود ───────────────────────────────
test('الباركود يملأ الكود والوصف — والظلّ يلتحق بالوصف', () => {
  const item = { sku: 'WNW-001', nameAr: 'أساس سائل', shade: 'شفاف' };
  const { line, filled } = applyItemToLine({ barcode: '8059692040599', sku: '', description: '' }, item);
  assert.equal(line.sku, 'WNW-001');
  assert.equal(line.description, 'أساس سائل — شفاف');
  assert.deepEqual(filled.sort(), ['description', 'sku']);
});

test('🚨 ما كتبه الموظّف بيده لا يُدهس — الفارغ فقط يُملأ', () => {
  const item = { sku: 'WNW-001', nameAr: 'أساس سائل' };
  const { line, filled } = applyItemToLine(
    { sku: 'MY-CODE', description: '', barcode: 'x' },
    item
  );
  assert.equal(line.sku, 'MY-CODE', 'الكود اليدوي بقي');
  assert.equal(line.description, 'أساس سائل', 'الوصف الفارغ مُلئ');
  assert.deepEqual(filled, ['description']);
});

test('صنف بلا ظلّ: الوصف اسمه فقط بلا شرطة يتيمة', () => {
  const { line } = applyItemToLine({ description: '' }, { sku: 'A', nameAr: 'صنف' });
  assert.equal(line.description, 'صنف');
});

test('لا صنف = لا تغيير (المجهول لا يوقف العمل)', () => {
  const original = { barcode: '123', sku: '', description: '' };
  const { line, filled } = applyItemToLine(original, null);
  assert.deepEqual(line, original);
  assert.deepEqual(filled, []);
});

// ── تطابق المخطّط مع قواعد الأمان (منع الانحراف) ───────────────────
//
// الاختبار السابق كان يكتفي بوجود اسم الدور في أي موضع من الملف، فمرّت
// عليه أنواع F2 الثلاثة بلا تغطية أصلًا (كانت `approveRoles` تعرف GRN
// وحدها فيرتدّ اعتمادها بـpermission-denied). الآن يُقرأ **لكل نوع
// جاهز** ما تُعيده دالتا القواعد فعلًا، ويُطابَق بمخطّطه دورًا بدور.

/** يستخرج أدوار نوعٍ بعينه من دالة في قواعد الأمان. */
function rolesFromRules(rules, fnName, type) {
  const start = rules.indexOf(`function ${fnName}(`);
  if (start < 0) return null;
  const body = rules.slice(start, rules.indexOf('}', start));
  const re = new RegExp(`docType == '${type}'\\s*\\?\\s*\\[([^\\]]*)\\]`);
  const m = body.match(re);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
}

test('أدوار الاعتماد والإنهاء في كل مخطّط جاهز تطابق firestore.rules', async () => {
  const { readFileSync } = await import('node:fs');
  const rules = readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8');

  for (const type of readyTypes()) {
    const schema = getSchema(type);

    const approve = rolesFromRules(rules, 'approveRoles', type);
    assert.ok(approve, `النوع ${type} غير مذكور في approveRoles — اعتماده سيرتدّ من الخادم`);
    assert.deepEqual(approve, [...schema.roles.approve].sort(), `${type}: أدوار الاعتماد منحرفة بين المخطّط والقواعد`);

    const complete = rolesFromRules(rules, 'completeRoles', type);
    assert.ok(complete, `النوع ${type} غير مذكور في completeRoles — إنهاؤه سيرتدّ من الخادم`);
    assert.deepEqual(complete, [...schema.roles.complete].sort(), `${type}: أدوار الإنهاء منحرفة بين المخطّط والقواعد`);
  }
});
