import test from 'node:test';
import assert from 'node:assert/strict';
import {
  vanLocationName,
  customerLocationName,
  pickingRouteFor,
  lineToSaleLine,
  lineToStockMove,
  vanDocToSaleOrder,
  vanDocToPicking,
  settlementToOdoo,
  settlementCashVariance,
  vanDocTotal,
  mapVanDocument,
  isVanSalesType,
  VAN_SALES_TYPES,
  vanDocSummary,
} from './vanSalesMapper.js';
import {
  mirrorIdFor,
  resolveSyncAction,
  duplicateIds,
  sourceDomain,
  canPush,
} from './idempotency.js';
import { DOC_ODOO_MAP } from './docCrosswalk.js';
import { readyTypes } from '../documents/schemas/index.js';

const doc = (type, header = {}, lines = []) => ({
  id: 'D1',
  type,
  number: `${type}-2026-0001`,
  state: 'approved',
  header,
  lines,
});

/* ═══════════ المواقع ═══════════ */

test('أسماء المواقع تطابق دفترنا حرفيًّا', () => {
  assert.equal(vanLocationName('12-3456'), 'VAN/12-3456');
  assert.equal(vanLocationName('12-3456'), vanLocationName('12-3456'.toLowerCase()));
  assert.equal(customerLocationName('c-01'), 'CUST/C-01');
  assert.equal(vanLocationName(''), '');
});

test('★ مسارات المناقلة تطابق قواعد القيد اتجاهًا', () => {
  const h = { vehiclePlate: '12-3456', customerCode: 'C-01', warehouse: 'MAIN' };
  assert.deepEqual(pickingRouteFor('VLD', h), { from: 'MAIN', to: 'VAN/12-3456', kind: 'internal' });
  assert.deepEqual(pickingRouteFor('VRT', h), { from: 'VAN/12-3456', to: 'MAIN', kind: 'internal' });
  assert.equal(pickingRouteFor('VCD', h).to, 'CUST/C-01', 'الإيداع إلى رفّ العميل');
  assert.equal(pickingRouteFor('VCR', h).from, 'CUST/C-01', 'والاسترداد منه');
  assert.equal(pickingRouteFor('CRN', h).to, 'VAN/12-3456', 'المرتجع الميدانيّ إلى المركبة لا المستودع');
  assert.equal(pickingRouteFor('VSI', h), null, 'البيع ليس مناقلة');
});

/* ═══════════ البنود ═══════════ */

test('★ حدّ المال: سطر البيع بلا سعرٍ ولا خصم، ويبقى المجّانيّ والعرض', () => {
  const line = lineToSaleLine({ sku: 'A', qty: 10, unitPrice: 50, discount: 100 });
  assert.equal(line.product_uom_qty, 10, 'الكمّيّة تُدفع');
  assert.equal(line.price_unit, undefined, 'السعر لا يُدفع — أودو يسعّر من قوائمه');
  assert.equal(line.discount, undefined, 'ونسبة الخصم معه');
  assert.equal(line.price_subtotal, undefined);

  // `x_is_free` واقعةٌ تشغيليّة لا مبلغ: بندُ هديّةٍ يُحرّك مخزونًا، وأودو
  // يحتاجها ليفرّق بين البيع والهديّة. فتبقى.
  const free = lineToSaleLine({ sku: 'A', qty: 2, unitPrice: 0, promoCode: 'PR-1' });
  assert.equal(free.x_is_free, true);
  assert.equal(free.x_promo_code, 'PR-1');
});

test('سطر الحركة يحمل التشغيلة والصلاحية — بلا كلفة', () => {
  const m = lineToStockMove({ sku: 'a', qty: 5, batch: 'B1', expiry: '2027-01-01', unitCost: 6 });
  assert.equal(m.product_code, 'A');
  assert.equal(m.product_uom_qty, 5);
  assert.equal(m.x_batch, 'B1');
  assert.equal(m.x_expiry, '2027-01-01');
  assert.equal(m.price_unit, undefined, 'الكلفة لا تغادر البوابة');
});

test('★ حساب الخصم لم يضع — انتقل إلى `vanDocTotal` للعرض المحلّيّ', () => {
  const d = doc('VSI', { customerCode: 'C-01' }, [
    { sku: 'A', qty: 10, unitPrice: 50, discount: 100 },
    { sku: 'B', qty: 2, unitPrice: 0, promoCode: 'PR-1' }, // مجّانيّ
    { sku: 'C', qty: 0, unitPrice: 99 }, // صفريّ يُستبعد
  ]);
  assert.equal(vanDocTotal(d), 400, '٥٠٠ ناقص خصم ١٠٠، والمجّانيّ صفر');
});

/* ═══════════ المستندات ═══════════ */

test('فاتورة المركبة تُسحب من موقع المركبة، وتحقّق الأمانة من رفّ العميل', () => {
  const h = { customerCode: 'C-01', customer: 'بقالة', vehiclePlate: '12-3456', saleDate: '2026-08-10' };
  const vsi = vanDocToSaleOrder(doc('VSI', h, [{ sku: 'A', qty: 10, unitPrice: 50 }]));
  assert.equal(vsi.x_source_location, 'VAN/12-3456');
  assert.equal(vsi.state, 'draft', 'كلّ ما يُدفع يصل مسوّدةً');
  assert.equal(vsi.amount_total, undefined, 'حدّ المال: الإجماليّ لا يُرفع');
  assert.equal(vsi.x_amount_collected, undefined, 'ولا المحصَّل نقدًا');
  assert.equal(vsi.x_payment_mode, '', 'أمّا طريقة السداد فواقعةٌ تشغيليّة تمرّ');
  assert.equal(vsi.x_source_number, 'VSI-2026-0001');

  const vcs = vanDocToSaleOrder(doc('VCS', h, [{ sku: 'A', qty: 4, unitPrice: 12 }]));
  assert.equal(vcs.x_source_location, 'CUST/C-01');
});

test('البنود الصفريّة لا تُدفع', () => {
  const so = vanDocToSaleOrder(doc('VSI', { customerCode: 'C-01' }, [
    { sku: 'A', qty: 10, unitPrice: 50 },
    { sku: 'B', qty: 0, unitPrice: 99 },
  ]));
  assert.equal(so.order_line.length, 1);
});

test('المناقلة تحمل مسارها وبنودها ورقم مصدرها', () => {
  const p = vanDocToPicking(doc('VLD', { vehiclePlate: '12-3456', warehouse: 'MAIN', loadDate: '2026-08-10' }, [
    { sku: 'A', qty: 20, batch: 'B1', unitCost: 6 },
  ]));
  assert.equal(p.location_id, 'MAIN');
  assert.equal(p.location_dest_id, 'VAN/12-3456');
  assert.equal(p.move_ids.length, 1);
  assert.equal(p.origin, 'VLD-2026-0001');
  assert.equal(p.state, 'draft');
});

test('★ التسوية تُدفع بفرق المخزون وحده — وفرق النقد يبقى عندنا', () => {
  const d = doc('VSR', { tripRef: 'TRIP-1', vehiclePlate: '12-3456', cashSales: 1000, cashDeposited: 940 }, [
    { counted: 8, ledgerQty: 10 },
  ]);
  const s = settlementToOdoo(d);
  assert.equal(s.x_stock_variance, -2, 'فرق العدّ كمّيّةٌ لا مبلغ — واقعةٌ تشغيليّة تُدفع');
  assert.equal(s.x_cash_variance, undefined, 'أمّا الفرق النقديّ فلا');
  assert.equal(s.x_cash_sales, undefined);
  assert.equal(s.x_cash_deposited, undefined);
  assert.equal(s.x_total_sales, undefined);
  // الحساب لم يضع — ينتقل إلى الذمم (م‑٤) والتحصيل الميدانيّ (م‑٥).
  assert.equal(settlementCashVariance(d), 60);
});

test('الموزّع يُرجع النموذج الصحيح لكلّ نوع', () => {
  assert.equal(mapVanDocument(doc('VSI', {}, [])).model, 'sale.order');
  assert.equal(mapVanDocument(doc('VCS', {}, [])).model, 'sale.order');
  assert.equal(mapVanDocument(doc('VLD', {}, [])).model, 'stock.picking');
  assert.equal(mapVanDocument(doc('VCD', {}, [])).model, 'stock.picking');
  assert.equal(mapVanDocument(doc('VSR', {}, [])).model, 'x_van.settlement');
  assert.equal(mapVanDocument(doc('PO', {}, [])), null, 'خارج تغطية هذا المخطِّط');
});

test('★ نموذج الموزّع يطابق جدول العبور — فلا ينحرف الجسر عن الكروسووك', () => {
  for (const type of VAN_SALES_TYPES) {
    const mapped = mapVanDocument(doc(type, {}, []));
    assert.equal(mapped.model, DOC_ODOO_MAP[type].model, `${type}: النموذج مختلف بين المخطِّط والجدول`);
  }
});

test('كلّ الأنواع الثمانية مغطّاة ومسجّلة في المحرّك', () => {
  assert.equal(VAN_SALES_TYPES.length, 8);
  const ready = new Set(readyTypes());
  for (const t of VAN_SALES_TYPES) {
    assert.ok(isVanSalesType(t));
    assert.ok(ready.has(t), `${t} غير مسجّل في سجلّ المخطّطات`);
  }
});

test('الملخّص يصلح للعرض', () => {
  const s = vanDocSummary(doc('VSI', { customerCode: 'C-01', customer: 'بقالة', vehiclePlate: '12-3456' }, [
    { sku: 'A', qty: 10, unitPrice: 50 },
  ]));
  assert.equal(s.model, 'sale.order');
  assert.equal(s.lineCount, 1);
  assert.equal(s.amountTotal, 500);
});

/* ═══════════ ★ الدفع مرّةً واحدة ═══════════ */

test('معرّف المرآة حتميّ', () => {
  assert.equal(mirrorIdFor('vsi', 'abc'), 'VSI_abc');
  assert.equal(mirrorIdFor('', 'abc'), '');
});

test('★ مرآةٌ بمعرّف أودو ⇒ تحديثٌ لا إنشاء', () => {
  const r = resolveSyncAction({ mirror: { odooId: 42 }, existing: [] });
  assert.equal(r.action, 'update');
  assert.equal(r.odooId, 42);
});

test('★ ضياع المرآة لا يعني نسخةً ثانية — يُتبنّى ما في أودو', () => {
  const r = resolveSyncAction({ mirror: null, existing: [{ id: 7 }], sourceNumber: 'VSI-1' });
  assert.equal(r.action, 'adopt');
  assert.equal(r.odooId, 7);
  assert.match(r.reason, /بدل إنشاء نسخةٍ ثانية/);
});

test('نسخٌ متعدّدة: تُتبنّى الأقدم ويُبلَّغ عن الباقي — ولا تُحذف تلقائيًّا', () => {
  const r = resolveSyncAction({ mirror: null, existing: [{ id: 9 }, { id: 4 }, { id: 6 }], sourceNumber: 'VSI-1' });
  assert.equal(r.odooId, 4, 'الأقدم');
  assert.match(r.reason, /٣ نسخٍ|3 نسخ/);
  assert.deepEqual(duplicateIds([{ id: 9 }, { id: 4 }, { id: 6 }], 4).sort(), [6, 9]);
});

test('لا سجلّ سابق ⇒ إنشاءٌ مسوّدةً — آخر الخيارات لا أوّلها', () => {
  const r = resolveSyncAction({ mirror: null, existing: [] });
  assert.equal(r.action, 'create');
  assert.equal(r.odooId, null);
});

test('مرآةٌ بمعرّفٍ فاسد تُعامَل كغيابه', () => {
  assert.equal(resolveSyncAction({ mirror: { odooId: 0 }, existing: [] }).action, 'create');
  assert.equal(resolveSyncAction({ mirror: { odooId: 'x' }, existing: [{ id: 3 }] }).action, 'adopt');
});

test('شرط البحث يُبنى من الأثر الراجع وحده', () => {
  assert.deepEqual(sourceDomain('VSI-1'), [['x_source_number', '=', 'VSI-1']]);
  assert.equal(sourceDomain(''), null);
});

test('★ حارس ما قبل الاتصال: لا دفع بلا رقمٍ رسميّ ولا للمسوّدة', () => {
  assert.equal(canPush({ id: 'a', number: 'VSI-1', state: 'approved' }).ok, true);
  assert.equal(canPush({ id: 'a', number: '', state: 'approved' }).ok, false);
  assert.match(canPush({ id: 'a', number: '', state: 'approved' }).reason, /أثر راجع/);
  assert.equal(canPush({ id: 'a', number: 'VSI-1', state: 'draft' }).ok, false);
  assert.equal(canPush({ number: 'VSI-1', state: 'done' }).ok, false, 'بلا معرّف');
});
