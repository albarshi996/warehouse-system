/**
 * جسر المزامنة الحيّ مع أودو — منطق التنسيق.
 * ─────────────────────────────────────────────────────────────────────────
 * يدفع مستنداتك الحقيقيّة (أمر الشراء + ماستر الأصناف) إلى أودو **مسوّدةً حتى
 * الاعتماد**، ويسحب أصناف أودو إلى الماستر، بتزامنٍ مستمرّ وإشعارات.
 *
 * **لماذا واقعيّ:** كلّ دفع/سحب يمرّ بـ`odoo.*` (العميل المبدَّل في `index.js`):
 * في التدريب يُصيب العميل المحاكى، وفي الإنتاج يُصيب أودو الحقيقيّ عبر الوسيط
 * — بلا تغيير كود. المخطِّطات (`odooMapper` + `poMapper`) مخطِّطات الإنتاج نفسها.
 *
 * **الدوام:** أودو المحاكى في الذاكرة يُصفَّر بالتحديث؛ لذا نحفظ **مرآةً دائمة**
 * في Firestore تعطي الاستمراريّة والإشعارات وتنجو من التحديث:
 *   odoo_sync/{PO_<docId> | ITEM_<sku>}  ← حالة المرآة الحاليّة لكلّ عنصر
 *   odoo_sync_events/{autoId}            ← سجلّ ملحق-فقط يغذّي الجرس والخلاصة
 * العميل المحاكى يبقى نقيًّا (لا يلمس Firestore)؛ الدوام هنا لا فيه.
 */
import {
  collection,
  doc,
  setDoc,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  limit as fsLimit,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { odoo, describeOdooConfig } from './index.js';
import { itemToProductValues, productToItem } from './odooMapper.js';
import { poDocToPurchaseOrder } from './poMapper.js';
import { grnDocToStockPicking, autoReceiptFromPo } from './grnMapper.js';
import { getItem, createItem, updateItem } from '../itemService.js';

const COL_SYNC = 'odoo_sync';
const COL_EVENTS = 'odoo_sync_events';

/** وصف الوضع الحاليّ (تدريب/إنتاج) لشارة الحالة في الواجهة. */
export { describeOdooConfig };

/** الفاعل: من ضغط الزرّ (للأثر في سجلّ الأحداث). */
function whoami(profile) {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
  };
}

/** يُلحق حدثًا في السجلّ الملحق-فقط. لا يفشل الدفع إن تعذّر التسجيل. */
async function logEvent(kind, { sourceType, sourceId = null, message = '' }, profile) {
  const who = whoami(profile);
  try {
    await addDoc(collection(db, COL_EVENTS), {
      ts: serverTimestamp(),
      kind, // 'push' | 'approve' | 'pull' | 'error'
      sourceType,
      sourceId,
      message,
      actorUid: who.byUid,
      actorName: who.byName,
    });
  } catch (e) {
    console.error('odoo_sync_events log failed:', e);
  }
}

/* ═══════════════ الدفع: البوابة → أودو (مسوّدةً) ═══════════════ */

/**
 * يدفع مستند أمر شراء إلى أودو بحالة `draft`، ويسجّل المرآة والحدث.
 * @param {object} poDoc  مستند البوابة { id, number, header, lines }
 * @returns {Promise<number>} معرّف أودو للسجلّ المُنشأ
 */
export async function pushPurchaseOrder(poDoc, profile) {
  if (!poDoc?.id) throw new Error('مستند أمر الشراء بلا معرّف.');
  const values = poDocToPurchaseOrder(poDoc);
  const odooId = await odoo.create('purchase.order', {
    ...values,
    name: poDoc.number || `P${poDoc.id}`,
  });
  const who = whoami(profile);
  await setDoc(
    doc(db, COL_SYNC, `PO_${poDoc.id}`),
    {
      sourceType: 'PO',
      sourceId: poDoc.id,
      sourceNumber: poDoc.number || '',
      odooModel: 'purchase.order',
      odooId,
      odooState: 'draft',
      direction: 'push',
      title: values.x_supplier || poDoc.number || 'أمر شراء',
      supplier: values.x_supplier || '',
      amountTotal: values.amount_total || 0,
      lineCount: (values.order_line || []).length,
      syncedAt: serverTimestamp(),
      byUid: who.byUid,
      byName: who.byName,
    },
    { merge: true }
  );
  await logEvent(
    'push',
    { sourceType: 'PO', sourceId: poDoc.id, message: `دُفع أمر الشراء ${poDoc.number || ''} إلى أودو مسوّدةً` },
    profile
  );
  return odooId;
}

/**
 * يدفع صنفًا من الماستر إلى أودو (`product.product`)، ويكتب `odooId` عائدًا.
 * @param {object} item  شكل Items_Master { sku, nameAr, … }
 */
export async function pushItem(item, profile) {
  if (!item?.sku) throw new Error('الصنف بلا كود (SKU).');
  const values = itemToProductValues(item);
  const odooId = await odoo.create('product.product', values);
  const who = whoami(profile);
  await setDoc(
    doc(db, COL_SYNC, `ITEM_${item.sku}`),
    {
      sourceType: 'item',
      sourceId: item.sku,
      sourceNumber: item.sku,
      odooModel: 'product.product',
      odooId,
      odooState: 'synced',
      direction: 'push',
      title: item.nameAr || item.sku,
      syncedAt: serverTimestamp(),
      byUid: who.byUid,
      byName: who.byName,
    },
    { merge: true }
  );
  // أثر الربط على الماستر — الحقل `odooId` موجودٌ أصلًا لهذا الغرض.
  try {
    await updateItem(item.sku, { odooId });
  } catch (e) {
    console.error('write-back odooId failed:', e);
  }
  await logEvent(
    'push',
    { sourceType: 'item', sourceId: item.sku, message: `دُفع الصنف ${item.sku} إلى أودو` },
    profile
  );
  return odooId;
}

/* ═══════════════ الاعتماد في أودو: draft → purchase ═══════════════ */

/**
 * يعتمد أمر شراءٍ مدفوعًا (مسوّدة) فيتحوّل إلى `purchase` (مؤكّد) في أودو —
 * **ويُنشئ أودو استلامًا مجدولًا تلقائيًّا** (WH/IN، حالة `assigned`)، محاكاةً
 * حرفيّة لسلوك أودو الحقيقيّ عند تأكيد أمر شراء.
 * @param {object} rec  سجلّ مرآةٍ من `listenSyncState` { id, odooId, sourceNumber }
 */
export async function approveInOdoo(rec, profile) {
  if (!rec?.odooId) throw new Error('لا يوجد معرّف أودو لهذا السجلّ.');
  await odoo.write('purchase.order', rec.odooId, { state: 'purchase' });
  await setDoc(
    doc(db, COL_SYNC, rec.id),
    { odooState: 'purchase', approvedAt: serverTimestamp() },
    { merge: true }
  );
  await logEvent(
    'approve',
    { sourceType: 'PO', sourceId: rec.sourceId, message: `اعتُمد أمر الشراء ${rec.sourceNumber || ''} في أودو (مؤكّد)` },
    profile
  );

  // سلوك أودو الحقيقيّ: تأكيد الأمر يجدول استلامًا واردًا تلقائيًّا.
  const who = whoami(profile);
  const receiptValues = autoReceiptFromPo(rec);
  const pickingId = await odoo.create('stock.picking', {
    ...receiptValues,
    name: `WH/IN/${String(rec.odooId).padStart(5, '0')}`,
  });
  await setDoc(
    doc(db, COL_SYNC, `PICK_PO_${rec.sourceId}`),
    {
      sourceType: 'GRN',
      sourceId: null, // وُلد في أودو — لا مستند بوابة مصدرًا
      sourceNumber: '',
      poNumber: rec.sourceNumber || '',
      odooModel: 'stock.picking',
      odooId: pickingId,
      odooState: 'assigned',
      direction: 'auto',
      autoCreated: true,
      title: `استلام مجدول — ${rec.sourceNumber || ''}`,
      supplier: rec.supplier || '',
      lineCount: 0,
      syncedAt: serverTimestamp(),
      byUid: who.byUid,
      byName: who.byName,
    },
    { merge: true }
  );
  await logEvent(
    'push',
    { sourceType: 'GRN', sourceId: null, message: `أنشأ أودو استلامًا مجدولًا تلقائيًّا لأمر ${rec.sourceNumber || ''} (سلوك تأكيد الأمر)` },
    profile
  );
}

/* ═══════════════ الاستلام: البوابة → أودو (stock.picking) ═══════════════ */

/**
 * يدفع مذكرة استلام (GRN) إلى أودو بحالة `draft`، مربوطةً بأمر الشراء (origin).
 * @param {object} grnDoc  مستند البوابة { id, number, header, lines }
 */
export async function pushGoodsReceipt(grnDoc, profile) {
  if (!grnDoc?.id) throw new Error('مستند الاستلام بلا معرّف.');
  const values = grnDocToStockPicking(grnDoc);
  const odooId = await odoo.create('stock.picking', {
    ...values,
    name: grnDoc.number || `WH/IN/${grnDoc.id}`,
  });
  const who = whoami(profile);
  await setDoc(
    doc(db, COL_SYNC, `GRN_${grnDoc.id}`),
    {
      sourceType: 'GRN',
      sourceId: grnDoc.id,
      sourceNumber: grnDoc.number || '',
      poNumber: values.origin || '',
      odooModel: 'stock.picking',
      odooId,
      odooState: 'draft',
      direction: 'push',
      autoCreated: false,
      title: values.x_supplier || grnDoc.number || 'استلام',
      supplier: values.x_supplier || '',
      totalReceived: values.x_total_received || 0,
      lineCount: (values.move_lines || []).length,
      syncedAt: serverTimestamp(),
      byUid: who.byUid,
      byName: who.byName,
    },
    { merge: true }
  );
  await logEvent(
    'push',
    { sourceType: 'GRN', sourceId: grnDoc.id, message: `دُفعت مذكرة الاستلام ${grnDoc.number || ''} إلى أودو مسوّدةً` },
    profile
  );
  return odooId;
}

/**
 * يصدّق استلامًا في أودو (draft/assigned → done) — «تصديق» أودو الحقيقيّ.
 * @param {object} rec  سجلّ مرآةٍ { id, odooId, sourceNumber }
 */
export async function validateReceiptInOdoo(rec, profile) {
  if (!rec?.odooId) throw new Error('لا يوجد معرّف أودو لهذا السجلّ.');
  await odoo.write('stock.picking', rec.odooId, { state: 'done' });
  await setDoc(
    doc(db, COL_SYNC, rec.id),
    { odooState: 'done', approvedAt: serverTimestamp() },
    { merge: true }
  );
  await logEvent(
    'approve',
    { sourceType: 'GRN', sourceId: rec.sourceId, message: `صُدّق الاستلام ${rec.sourceNumber || rec.title || ''} في أودو (منجَز)` },
    profile
  );
}

/* ═══════════════ السحب: أودو → البوابة (upsert في الماستر) ═══════════════ */

/**
 * يقرأ أصناف أودو ويُنشئها/يحدّثها في `Items_Master` عبر `productToItem`،
 * ويكتب `odooId` رابطًا. يعكس الاتجاه المضادّ للدفع («والعكس» في طلب المالك).
 * @returns {Promise<{ total:number, created:number, updated:number }>}
 */
export async function pullProducts(profile) {
  const recs = await odoo.searchRead(
    'product.product',
    [],
    ['default_code', 'name', 'x_name_en', 'categ_id', 'uom_id', 'qty_available', 'x_min_stock']
  );
  let created = 0;
  let updated = 0;
  const who = whoami(profile);

  for (const rec of recs) {
    const it = productToItem(rec);
    if (!it.sku || !it.nameAr) continue;
    const existing = await getItem(it.sku);
    if (existing) {
      await updateItem(it.sku, {
        nameEn: it.nameEn,
        category: it.category,
        unit: it.unit,
        minStock: it.minStock,
        odooId: it.odooId,
      });
      updated++;
    } else {
      await createItem({
        sku: it.sku,
        nameAr: it.nameAr,
        nameEn: it.nameEn,
        category: it.category,
        unit: it.unit,
        minStock: it.minStock,
        balance: it.balance,
      });
      await updateItem(it.sku, { odooId: it.odooId });
      created++;
    }
    await setDoc(
      doc(db, COL_SYNC, `ITEM_${it.sku}`),
      {
        sourceType: 'item',
        sourceId: it.sku,
        sourceNumber: it.sku,
        odooModel: 'product.product',
        odooId: it.odooId,
        odooState: 'synced',
        direction: 'pull',
        title: it.nameAr || it.sku,
        syncedAt: serverTimestamp(),
        byUid: who.byUid,
        byName: who.byName,
      },
      { merge: true }
    );
  }

  await logEvent(
    'pull',
    {
      sourceType: 'item',
      sourceId: null,
      message: `سُحب ${recs.length} صنفًا من أودو (${created} جديد · ${updated} محدَّث)`,
    },
    profile
  );
  return { total: recs.length, created, updated };
}

/* ═══════════════ الاستماع الحيّ (التزامن المستمرّ) ═══════════════ */

/** حالة المرآة الحاليّة (الأحدث مزامنةً أولًا). يُعيد دالّة إلغاء الاشتراك. */
export function listenSyncState(cb, onError) {
  const q = query(collection(db, COL_SYNC), orderBy('syncedAt', 'desc'));
  return onSnapshot(
    q,
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => onError?.(e)
  );
}

/** سجلّ الأحداث (الأحدث أولًا) — يغذّي الجرس وخلاصة النشاط. */
export function listenSyncEvents(cb, max = 30, onError) {
  const q = query(collection(db, COL_EVENTS), orderBy('ts', 'desc'), fsLimit(max));
  return onSnapshot(
    q,
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => onError?.(e)
  );
}

/** فهرسة المرآة بمعرّف المصدر (PO_<id> / ITEM_<sku>) للعرض المتقاطع في البوابة. */
export function indexSyncBySource(records) {
  const map = new Map();
  for (const r of records || []) map.set(r.id, r);
  return map;
}
