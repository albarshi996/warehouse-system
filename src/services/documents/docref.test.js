/**
 * اختبارات الربط التسلسليّ اليدويّ بالرقم (docref) — «العملية الجراحية» المحور ٦.
 * الطبقة الخالصة: الربط التراكميّ + حارس اعتماد الأب + اكتشاف نوع الأب.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mergeParentLink, parentApprovalProblem, DOCREF_PARENT_TYPE } from './chain.js';
import { primaryParentType, docrefFields } from './schemaUtils.js';
import { getSchema } from './schemas/index.js';

test('mergeParentLink: يربط الأب تراكميًّا كالاشتقاق (روابط الأب + الأب نفسه)', () => {
  // أب GRN يحمل أصله PO — ربط QC بالـGRN يورّث PO أيضًا.
  const parentGRN = { id: 'grn1', type: 'GRN', number: 'GRN-2026-0001', links: { PO: { id: 'po1', number: 'PO-2026-0001' } } };
  const links = mergeParentLink({}, parentGRN);
  assert.deepEqual(links.GRN, { id: 'grn1', number: 'GRN-2026-0001' });
  assert.deepEqual(links.PO, { id: 'po1', number: 'PO-2026-0001' }); // مُورّث
});

test('mergeParentLink: يحفظ روابط الابن القائمة ولا يدهسها', () => {
  const existing = { QC: { id: 'qc1', number: 'QC-2026-0001' } };
  const parent = { id: 'grn1', type: 'GRN', number: 'GRN-2026-0001', links: {} };
  const links = mergeParentLink(existing, parent);
  assert.equal(links.QC.id, 'qc1'); // باقٍ
  assert.equal(links.GRN.id, 'grn1'); // مُضاف
});

test('mergeParentLink: أب بلا id/type يُعيد الروابط كما هي (سقوط آمن)', () => {
  assert.deepEqual(mergeParentLink({ A: 1 }, null), { A: 1 });
  assert.deepEqual(mergeParentLink({ A: 1 }, { number: 'X' }), { A: 1 });
});

test('parentApprovalProblem: يمنع الإنجاز إن كان الأب غير معتمَد', () => {
  assert.ok(parentApprovalProblem('PO', { state: 'submitted', number: 'PO-2026-0001' }));
  assert.ok(parentApprovalProblem('PO', { state: 'draft' }));
  assert.ok(parentApprovalProblem('PO', null)); // أب مفقود
});

test('parentApprovalProblem: يسمح إن كان الأب معتمَدًا أو منجَزًا', () => {
  assert.equal(parentApprovalProblem('PO', { state: 'approved' }), null);
  assert.equal(parentApprovalProblem('PO', { state: 'done' }), null);
  assert.equal(parentApprovalProblem(null, null), null); // لا أب معلن ⇒ لا قيد
});

test('primaryParentType: يعيد نوع الأب من حقل docref الإلزاميّ في الأنواع الستة', () => {
  assert.equal(primaryParentType(getSchema('GRN')), 'PO');
  assert.equal(primaryParentType(getSchema('QC')), 'GRN');
  assert.equal(primaryParentType(getSchema('PUTAWAY')), 'GRN');
  assert.equal(primaryParentType(getSchema('GP')), 'DN');
  assert.equal(primaryParentType(getSchema('CN')), 'RET');
  assert.equal(primaryParentType(getSchema('ADJ')), 'CC');
});

test('primaryParentType: null لنوعٍ بلا حقل docref (لا قيد على PR مثلًا)', () => {
  assert.equal(primaryParentType(getSchema('PR')), null);
});

test('التعميم: بقية أزواج السلسلة صارت docref بنوع الأب الصحيح', () => {
  const has = (type, key, docType) =>
    docrefFields(getSchema(type)).some((f) => f.key === key && f.docType === docType);
  assert.ok(has('PO', 'prRef', 'PR'));
  assert.ok(has('INV', 'deliveryRef', 'DN'));
  assert.ok(has('TRN', 'transferReqRef', 'TR'));
  assert.ok(has('TRC', 'transferNoteRef', 'TRN'));
});

test('docrefFields: يعلن نوع الأب الصحيح، ومتّسق مع خريطة العكس', () => {
  const grnRefs = docrefFields(getSchema('GRN'));
  const poRef = grnRefs.find((f) => f.key === 'poRef');
  assert.equal(poRef.docType, 'PO');
  assert.equal(DOCREF_PARENT_TYPE.poRef, 'PO'); // اتّساق مع خريطة الاشتقاق
});
