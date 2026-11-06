/**
 * تكوينُ المستودع — طبقةُ الكتابة التي تُنفّذ خطّة `formation.js` الخالصة.
 *
 * تُستدعى عند **اعتماد جردِ المخزن** (CC → معتمَد في `documentsService`): ترقّي
 * ماستر الأصناف، وتكتب الأرصدةَ الافتتاحيّة، وترفع علَمَ `formed` على وثيقة
 * المخزن — فيصير تكوينُ المخزن واقعةً لا نيّة، ويسقط عنه حارسُ `formationViolation`.
 *
 * ═══ idempotent — إعادةُ الاعتماد لا تُضاعف ═══
 * ① العلَمُ أوّلًا: مخزنٌ `formed === true` **لا يُعاد تكوينُه** — فلا تُدهس
 *    أرصدةٌ تحرّكت بعد التكوين (الحارسُ يمنع الحركةَ قبل `formed`، فما بعده
 *    حقيقةٌ لا تُمحى). ② والأرصدةُ تُكتب كتابةً **مُطلقة** (قيمةٌ لا `increment`)
 *    نمطَ `commitBalancesImport` — فإعادةُ المحاولة قبل رفع العلَم تضع القيمةَ
 *    نفسَها لا ضِعفَها.
 *
 * ═══ الكاتبُ مديرٌ ═══
 * الكتابةُ على `warehouses` و`Items_Master` تحتاج `isManager()` في القواعد،
 * فالتكوينُ يكتمل حين يعتمد الجردَ **مديرُ مستودعٍ أو أدمن**. ومن اعتمده مدقّقُ
 * جردٍ (ليس مديرًا) يرتدّ طلبُه ويُسجَّل أفضلَ جهد — فلا يُكسر اعتمادُ الجرد.
 */
import { collection, doc, getDocs, serverTimestamp, writeBatch, db } from '../_db/index.js';
import { buildFormation } from './formation.js';
import { upsertItems, fetchItemsBySkus, normalizeSku, normalizeBarcode } from '../items/itemService.js';

const WAREHOUSES = 'warehouses';
const BALANCES = 'balances';
const BATCH_LIMIT = 500;

/**
 * يجد وثيقةَ المخزن بكوده — المجموعةُ صغيرةٌ (~١٥ وثيقة) فقراءتُها كاملةً رخيصة،
 * ومعرّفُها auto-id لا الكود، فالتطابقُ على حقل `code` مطبَّعًا.
 */
async function findWarehouseByCode(code) {
  const wh = String(code ?? '').trim().toUpperCase();
  if (!wh) return null;
  const snap = await getDocs(collection(db, WAREHOUSES));
  for (const d of snap.docs) {
    if (String(d.data()?.code ?? '').trim().toUpperCase() === wh) {
      return { id: d.id, data: d.data() };
    }
  }
  return null;
}

/**
 * يُكوّن مخزنًا من بنود جردٍ معتمد.
 *
 * @param {object} opts
 * @param {string} opts.warehouseCode كودُ المخزن (E1 …).
 * @param {Array}  opts.countedLines بنودُ الجرد المعتمَد.
 * @param {string} [opts.countId] معرّفُ مستند الجرد (للأثر).
 * @param {string} [opts.countNumber] رقمُ مستند الجرد الرسميّ.
 * @param {string} [opts.countDate] تاريخُ الجرد (يُختم على الأرصدة).
 * @returns {Promise<{ok:boolean, skipped?:boolean, reason?:string, warehouseId?:string, items?:number, balances?:number}>}
 */
export async function formWarehouseFromCount({
  warehouseCode,
  countedLines = [],
  countId = '',
  countNumber = '',
  countDate = '',
} = {}) {
  const wh = String(warehouseCode ?? '').trim().toUpperCase();
  if (!wh) return { ok: false, reason: 'لا كود مخزن — لا تكوين.' };

  const found = await findWarehouseByCode(wh);
  if (!found) return { ok: false, reason: `المخزن «${wh}» غير معروف في سجلّ المستودعات.` };

  // ① idempotent: المكوَّنُ لا يُعاد — كيلا تُدهس أرصدةٌ تحرّكت بعد التكوين.
  if (found.data?.formed === true) {
    return { ok: true, skipped: true, warehouseId: found.id, items: 0, balances: 0 };
  }

  // بطاقاتُ الأصناف المعدودة — قراءةٌ محدودةٌ بأكوادها (لاستبعاد الخدمات واسمها/سعرها).
  let items = null;
  const skus = [...new Set((countedLines || []).map((l) => normalizeSku(l?.sku)).filter(Boolean))];
  if (skus.length) {
    try {
      items = new Map((await fetchItemsBySkus(skus)).map((it) => [normalizeSku(it.sku), it]));
    } catch {
      items = null; // تعذّرُ القراءة لا يوقف التكوين — الكلُّ يُعدّ بضاعةً
    }
  }

  const { itemUpserts, openingBalances } = buildFormation(countedLines, wh, { items });

  // ترقيةُ الماستر (merge) — الأصنافُ المعدودةُ تصير سجلّات.
  if (itemUpserts.length) {
    await upsertItems(itemUpserts, { existingBySku: items || new Map() });
  }

  // الأرصدةُ الافتتاحيّة — كتابةٌ مُطلقة (set لا increment) نمطَ commitBalancesImport.
  for (let i = 0; i < openingBalances.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const b of openingBalances.slice(i, i + BATCH_LIMIT)) {
      batch.set(
        doc(db, BALANCES, b.id),
        {
          sku: normalizeSku(b.sku),
          barcode: normalizeBarcode(b.barcode),
          nameAr: String(b.nameAr || '').trim(),
          warehouse: b.warehouse,
          bin: b.bin || '',
          batch: String(b.batch || '').trim(),
          expiry: String(b.expiry || '').trim(),
          stockStatus: b.stockStatus || 'OK',
          qty: Number(b.qty) || 0,
          unitCost: Number(b.unitCost) || 0,
          countDate: String(countDate || '').trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();
  }

  // ② ختمُ التكوين **بعد** كتابة الأرصدة — فلا يُرفع العلَمُ قبل واقعته.
  const whBatch = writeBatch(db);
  whBatch.set(
    doc(db, WAREHOUSES, found.id),
    {
      formed: true,
      formedAt: serverTimestamp(),
      formedByCount: String(countNumber || countId || ''),
    },
    { merge: true }
  );
  await whBatch.commit();

  return {
    ok: true,
    skipped: false,
    warehouseId: found.id,
    items: itemUpserts.length,
    balances: openingBalances.length,
  };
}
