/**
 * اختبارات نحو الشحنة والطرد — الصورة التي كتبها النصّ، و«١ من ٤» المحسوبة.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_PARCELS,
  formatParcelCode,
  formatShipmentCode,
  parcelCodeProblem,
  parcelCodes,
  parcelOfTotal,
  parseShipmentCode,
  shipmentCodeProblem,
  shipmentCounterKey,
  shipmentDateStamp,
  shipmentOf,
  shortShipmentLabel,
} from './shipmentCode.js';

const SHP = 'SHP-RH-20260827-000125';

test('★ الصورة التي كتبها النصّ حرفيًّا — شحنةً وطردًا', () => {
  assert.equal(formatShipmentCode({ branch: 'RH', date: '2026-08-27', seq: 125 }), SHP);
  assert.equal(formatParcelCode(SHP, 1), `${SHP}-01`);
  assert.equal(formatParcelCode(SHP, 12), `${SHP}-12`);
});

test('★★ ختم اليوم محلّيٌّ لا UTC — الورديّة الليليّة كانت تحمل تاريخ أمس', () => {
  const night = new Date(2026, 7, 27, 1, 30); // ٢٧ أغسطس ١:٣٠ محلّيًّا
  assert.equal(shipmentDateStamp(night), '20260827');
  assert.equal(shipmentDateStamp('20260827'), '20260827', 'ويقبل الختم جاهزًا');
  assert.equal(shipmentDateStamp('لا تاريخ'), '');
});

test('★ لا رقمًا أعرج — ما لا يُبنى سليمًا يُعاد فارغًا', () => {
  assert.equal(formatShipmentCode({ branch: '', date: '2026-08-27', seq: 1 }), '');
  assert.equal(formatShipmentCode({ branch: 'RH', date: 'شيء', seq: 1 }), '');
  assert.equal(formatShipmentCode({ branch: 'RH', date: '2026-08-27', seq: 0 }), '');
  assert.equal(formatParcelCode('W01-A01', 1), '', 'ولا طردَ لغير شحنة');
  assert.equal(formatParcelCode(SHP, MAX_PARCELS + 1), '');
});

test('★★ الطرد لاحقةٌ على شحنته — فتُقرأ العلاقة من الباركود وحده بلا قراءةٍ ثانية', () => {
  const p = parseShipmentCode(`${SHP}-03`);
  assert.equal(p.isParcel, true);
  assert.equal(p.shipment, SHP, 'الشحنة مقروءةٌ من الطرد بلا شبكة');
  assert.equal(p.parcelNo, 3);
  assert.equal(p.branch, 'RH');
  assert.equal(p.seq, 125);

  assert.equal(shipmentOf(`${SHP}-03`), SHP);
  assert.equal(shipmentOf(SHP), SHP);
  assert.equal(shipmentOf('W01-A01'), '');
});

test('الأحكام تسمّي ما مُسح وما هو مطلوب', () => {
  assert.equal(shipmentCodeProblem(SHP), '');
  assert.match(shipmentCodeProblem(''), /مطلوب/);
  assert.match(shipmentCodeProblem(`${SHP}-01`), /رقم طردٍ لا شحنة/);
  assert.match(shipmentCodeProblem('W01-A01'), /ليس رقم شحنة/);

  assert.equal(parcelCodeProblem(`${SHP}-01`), '');
  assert.match(parcelCodeProblem(SHP), /رقم شحنةٍ لا طرد/);
  assert.match(parcelCodeProblem(''), /مطلوب/);
});

test('★★ طردٌ رقمُه يتجاوز الإجماليّ = ملصقٌ لطردٍ لا وجود له', () => {
  assert.equal(parcelCodeProblem(`${SHP}-04`, { total: 4 }), '');
  assert.match(parcelCodeProblem(`${SHP}-05`, { total: 4 }), /الطرد رقم 5 والشحنة 4 طرودًا/);
});

test('★ طردٌ من شحنةٍ أخرى يُردّ عند الباب — والرسالة تسمّي الشحنتين', () => {
  const other = 'SHP-RH-20260827-000126';
  const out = parcelCodeProblem(`${other}-01`, { shipment: SHP });
  assert.match(out, new RegExp(other));
  assert.match(out, new RegExp(SHP));
});

test('★★ «١ من ٤» محسوبةٌ لا مكتوبة — بالأرقام اللاتينيّة كنمط البوّابة', () => {
  assert.equal(parcelOfTotal(1, 4), '1 من 4');
  assert.equal(parcelOfTotal(4, 4), '4 من 4');
  assert.equal(parcelOfTotal(2, 0), '2', 'وبلا إجماليٍّ يُعرض الرقم وحده لا كذبٌ عنه');
  assert.equal(parcelOfTotal(0, 4), '');
});

test('أكواد طرود شحنةٍ تُولَّد دفعةً — وبحاجزٍ ضدّ غلطة الرقم', () => {
  const out = parcelCodes(SHP, 4);
  assert.deepEqual(out.codes, [`${SHP}-01`, `${SHP}-02`, `${SHP}-03`, `${SHP}-04`]);
  assert.match(parcelCodes(SHP, 0).problem, /يبدأ من ١/);
  assert.match(parcelCodes(SHP, MAX_PARCELS + 1).problem, /لا تتجاوز/);
  assert.match(parcelCodes('W01-A01', 2).problem, /ليس رقم شحنة/);
});

test('العدّاد لكلّ فرعٍ ويوم — والمختصر يُقرأ من بعيد', () => {
  assert.equal(shipmentCounterKey({ branch: 'RH', date: '2026-08-27' }), 'SHP-RH-20260827');
  assert.equal(shipmentCounterKey({ branch: '', date: '2026-08-27' }), '');
  assert.equal(shortShipmentLabel(SHP), '125');
  assert.equal(shortShipmentLabel(`${SHP}-03`), '125/03');
  assert.equal(shortShipmentLabel('لا شيء'), 'لا-شيء');
});
