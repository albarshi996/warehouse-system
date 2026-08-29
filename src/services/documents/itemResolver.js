/**
 * حلُّ كود الصنف — مصدرٌ واحدٌ للنداء الواحد وللّصقة (BULK-000 · يسدّ ث‑١).
 *
 * ═══ لماذا انتُزع ═══
 * كان المنطق محبوسًا داخل `DocumentEngine.handleLineLookup`: يقرأ حالة React
 * ويكتبها ويعرض رسالةً **لكلّ نداء**. فعشرون كودًا ملصوقًا تعني عشرين تحديثَ
 * حالةٍ وعشرين رسالةً تومض — لا لأنّ الحلّ يحتاج ذلك، بل لأنّ الحلّ والعرض
 * كانا خيطًا واحدًا.
 *
 * هنا يُنتزع النصف الخالص وحده: **ما هو الصنف؟** و**كيف يُختم على السطر؟**
 * والقرارُ بمن يُخبَر ومتى يبقى في المحرّك — حيث يعرف كم كودًا في اللصقة.
 *
 * ═══ ولماذا تُحقَن الاستدعاءات ═══
 * لا يعرف هذا الملفّ Firestore ولا React: الثلاثةُ (`getItem` ·
 * `lookupByBarcode` · `lookupItemByPartnerCode`) تُمرَّر في `lookups` —
 * فيُختبر الترتيبُ الخماسيّ بلا شبكةٍ ولا متصفّح (§22 ‹995›).
 *
 * ★ **والاستدعاء المفرد يمرّ من هنا هو الآخر.** نسختان تفترقان بعد شهرٍ
 * أسوأ من دالّةٍ واحدةٍ يقرؤها المسارَان.
 */
import { applyItemToLine } from './schemaUtils.js';
import { canonicalLineSku } from '../items/itemIdentity.js';
import { unitForBarcode, stampPartnerUom, defaultUomFor, refreshLineBase } from '../items/uomWiring.js';

/**
 * طرفُ المستند من رأسه — مورّدًا أوّلًا ثمّ عميلًا (SAP-2 · §21‑٤).
 * بلا طرفٍ لا كتالوجَ يُسأل، فيُعاد `null` ويقف البحثُ عند الماستر.
 */
export function documentPartner(header) {
  const h = header || {};
  if (h.supplierCode) return { partnerType: 'supplier', partnerCode: h.supplierCode };
  if (h.customerCode) return { partnerType: 'customer', partnerCode: h.customerCode };
  return null;
}

/**
 * يحلّ كودًا واحدًا إلى صنف — بالترتيب الحاكم نفسه، حرفيًّا:
 *   عمود الكود:  الماستر بالهويّة ← الماستر بالباركود ← كتالوج الطرف.
 *   عمود الباركود: الماستر بالباركود ← كتالوج الطرف.
 * (و`lookupByBarcode` نفسها تجرّب صيغتَي الباركود ثمّ الكود — فالخماسيّة
 * محفوظةٌ بلا إعادة بنائها هنا.)
 *
 * لا يرمي عند فشل كتالوج الطرف — طرفٌ بلا كتالوجٍ ليس خطأً يوقف الإدخال.
 * ويرمي عند فشل الماستر نفسه، فيبقى تمييزُ «مجهول» عن «تعذّر السؤال» بيد
 * المستدعي (المحرّك يمسك وقد كان يمسك).
 *
 * @returns {Promise<{item, viaPartner, unitFromBarcode}|null>} و`null` = مجهول.
 */
export async function resolveItemCode(value, { columnKey = 'barcode', partner = null, lookups } = {}) {
  const code = String(value ?? '').trim();
  if (!code) return null;
  const { getItem, lookupByBarcode, lookupItemByPartnerCode } = lookups || {};

  let item = columnKey === 'sku'
    ? (await getItem(code)) || (await lookupByBarcode(code))
    : await lookupByBarcode(code);
  let viaPartner = null;

  if (!item && partner && lookupItemByPartnerCode) {
    const hit = await lookupItemByPartnerCode({ ...partner, code }).catch(() => null);
    if (hit) {
      item = hit.item;
      viaPartner = hit.entry;
    }
  }
  if (!item) return null;

  // SAP-3: باركود الوحدة يحدّد الصنف **والوحدة والمعامل** معًا (§10.1 ‹238›).
  // وعمود الكود هويّةٌ لا باركود، فلا وحدةَ تُشتقّ منه.
  const unitFromBarcode = columnKey === 'sku' ? '' : unitForBarcode(item, code);
  return { item, viaPartner, unitFromBarcode };
}

/**
 * يختم صنفًا مستبانًا على سطر — الفارغ يُملأ وما كُتب بيدٍ لا يُدهس.
 *
 * الخمسة بترتيبها: تعبئةُ الكود والوصف · تثبيتُ الهويّة بصيغة الماستر ·
 * كودُ الطرف ووحدتُه · وحدةُ الباركود ثمّ افتراضُ عائلة المستند · ثمّ
 * المعاملُ والأساس (§10.1 ‹234›) فيحفظ السطرُ الأربعة ولا تُقدَّر يوم الترحيل.
 *
 * @param {object} line السطر الحالي
 * @param {{item, viaPartner, unitFromBarcode}} resolved ناتجُ `resolveItemCode`
 * @param {string} docType نوع المستند — منه تُعرف وحدة الشراء من وحدة البيع (ف‑٩)
 */
export function applyResolvedItem(line, resolved, docType) {
  if (!resolved?.item) return line;
  const { item, viaPartner, unitFromBarcode } = resolved;
  const { line: filled } = applyItemToLine(line, item);
  let next = { ...filled, sku: canonicalLineSku(filled, item) };
  // كود الطرف يظهر في مستنده بينما يبقى التخزين على الهويّة الداخليّة.
  if (viaPartner) {
    next.partnerItemCode = viaPartner.partnerItemCode;
    next = stampPartnerUom(next, viaPartner); // تعبئة هذا المورّد لا غيره (§10 ‹256›)
  }
  if (unitFromBarcode) next.uom = unitFromBarcode;
  // وحدةٌ فارغة تأخذ افتراض عائلة المستند: شراءً بوحدة الشراء وبيعًا بوحدة البيع (ف‑٩).
  if (!String(next.uom ?? '').trim()) next.uom = defaultUomFor(item, docType);
  return refreshLineBase(next, item);
}
