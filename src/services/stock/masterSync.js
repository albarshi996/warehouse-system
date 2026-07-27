/**
 * ═══════════════════════════════════════════════════════════════════
 *  الماستر الحيّ — تحديث حقول الكتالوج أثناء الجلسة دون مسّ حالة الجرد.
 * ═══════════════════════════════════════════════════════════════════
 *
 * **المشكلة:** كانت شاشة العمليات تقرأ الماستر لقطةً واحدة عند البدء
 * (`fetchAll` تشترك ثم تُلغي فورًا). فتعديلُ رصيدٍ دفتريّ أو سعرٍ في الماستر
 * أثناء الجرد يبقى **غير مرئي** حتى إعادة تحميل الصفحة.
 *
 * **الحلّ:** اشتراكٌ دائمٌ يُغذّي هذه الوحدة عند كل تغيّر (وعند عودة الشبكة
 * — `onSnapshot` يعيد الإرسال تلقائيًّا). الوحدة تُحدّث **حقول الماستر فقط**:
 *   • `systemQty` (الرصيد الدفتري = balance)   • `unitPrice`
 * ولا تمسّ أبدًا حالة الجلسة: `actualQty` · `scanned` · `notes` · `operationMeta`
 * (الكمية الفعلية مصدرها المسح لا الماستر). والأصناف اليدوية (`isManual`)
 * لا مصدر لها في الماستر فتُتجاوَز.
 *
 * الوحدة **خالصة** (بلا Firestore ولا DOM) ليحرسها الاختبار.
 */

/** مفتاح المطابقة الافتراضي؛ الصفحة تمرّر `bzCanonCode` ليطابق `findInvIdx`. */
const defaultKey = (s) => String(s ?? '').trim().toLowerCase();

/**
 * يفهرس أصناف الماستر بكل رموزها القانونية (SKU + كل باركود).
 * @returns {Map<string, object>} رمزٌ قانونيّ ← صنف الماستر
 */
export function indexMaster(masterItems, keyFn = defaultKey) {
  const byCode = new Map();
  for (const m of masterItems || []) {
    const sku = keyFn(m?.sku || '');
    if (sku) byCode.set(sku, m);
    for (const b of m?.barcodes || []) {
      const c = keyFn(b);
      if (c) byCode.set(c, m);
    }
  }
  return byCode;
}

/** حقول الماستر التي يُسمح بتحديثها حيًّا (لا وصفيّة تُدهس تعديل الموظّف). */
export function masterFieldsOf(m) {
  return {
    systemQty: Number(m?.balance) || 0,
    unitPrice: Number(m?.unitPrice != null ? m.unitPrice : m?.costPrice) || 0,
  };
}

/** يجد صنف الماستر المطابق لصنف الجلسة: بالكود ثم بالباركود الأساسي ثم بأيّ باركود. */
export function findMasterFor(item, byCode, keyFn = defaultKey) {
  if (!item) return null;
  const ic = keyFn(item.itemCode || '');
  if (ic && byCode.has(ic)) return byCode.get(ic);
  const bl = keyFn(item.barcodeLower || item.barcode || '');
  if (bl && byCode.has(bl)) return byCode.get(bl);
  for (const b of item.barcodes || []) {
    const c = keyFn(b);
    if (byCode.has(c)) return byCode.get(c);
  }
  return null;
}

/**
 * يحدّث الرصيد الدفتري والسعر لأصناف الجلسة المطابقة، **في المكان**.
 *
 * @param {object[]} items أصناف الجلسة (تُعدَّل في المكان)
 * @param {object[]} masterItems لقطة الماستر الحيّة
 * @param {(code:string)=>string} [keyFn] دالّة التطبيع (افتراضها حروف صغيرة)
 * @returns {{updated:number, changes:{itemCode:string, from:number, to:number}[]}}
 *   عدد الأصناف التي تغيّر رصيدها/سعرها، وتفصيل تغيّرات الرصيد للعرض.
 */
export function refreshMasterFields(items, masterItems, keyFn = defaultKey) {
  const byCode = indexMaster(masterItems, keyFn);
  let updated = 0;
  const changes = [];
  for (const it of items || []) {
    if (!it || it.isManual) continue;
    const m = findMasterFor(it, byCode, keyFn);
    if (!m) continue;
    const f = masterFieldsOf(m);
    let rowChanged = false;
    if (it.systemQty !== f.systemQty) {
      changes.push({ itemCode: it.itemCode || it.barcode || '', from: it.systemQty, to: f.systemQty });
      it.systemQty = f.systemQty;
      rowChanged = true;
    }
    if (it.unitPrice !== f.unitPrice) {
      it.unitPrice = f.unitPrice;
      rowChanged = true;
    }
    if (rowChanged) updated++;
  }
  return { updated, changes };
}
