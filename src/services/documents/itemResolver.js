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
import { canonicalLineSku, normalizeItemCode } from '../items/itemIdentity.js';
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

/* ═══════════════ الجملة — عشرون كودًا في عمليّةٍ واحدة (BULK-103) ═══════════════ */

/**
 * يحلّ أكوادَ لصقةٍ دفعةً — بذاكرةٍ مؤقّتةٍ لها وحدَها (يسدّ ث‑٨).
 *
 * ثلاثةُ شروطٍ مكتوبةٌ في الخطّة، وكلٌّ منها هنا:
 *   ① **المكرّرُ يُسأل مرّةً واحدة** — الأكوادُ تُوحَّد بهويّتها قبل السؤال،
 *      فعشرون كودًا فيها ثلاثةُ مكرّراتٍ سبعةَ عشرَ سؤالًا لا عشرين.
 *   ② **الفشلُ في كودٍ لا يوقف بقيّتَه** (شرطُ المالك الصريح) — لكلّ كودٍ
 *      حالتُه، و«تعذّر السؤال» يبقى متمايزًا عن «مجهول».
 *   ③ **الأسئلةُ متوازية** — لا عشرون قراءةً متتابعةً ينتظرها الموظّف.
 *
 * @returns {Promise<{byCode: Map<string,{status:'ok'|'unknown'|'failed', resolved: object|null}>, ok: number, unknown: number, failed: number}>}
 */
export async function resolveItemCodes(values, { columnKey = 'barcode', partner = null, lookups } = {}) {
  // ① التوحيد بالهويّة — وأوّلُ صيغةٍ كُتبت هي التي تُسأل بها، فلا يتغيّر
  // سلوكُ السؤال عمّا كان في النداء المفرد.
  const firstByKey = new Map();
  for (const v of values || []) {
    const key = normalizeItemCode(v);
    if (key && !firstByKey.has(key)) firstByKey.set(key, String(v).trim());
  }

  const entries = await Promise.all(
    [...firstByKey].map(async ([key, code]) => {
      try {
        const resolved = await resolveItemCode(code, { columnKey, partner, lookups });
        return [key, resolved ? { status: 'ok', resolved } : { status: 'unknown', resolved: null }];
      } catch {
        // ② كودٌ سقط لا يُسقط اللصقة — والتمييزُ يُحفظ ليُقال في الرسالة.
        return [key, { status: 'failed', resolved: null }];
      }
    })
  );

  const byCode = new Map(entries);
  let ok = 0, unknown = 0, failed = 0;
  for (const { status } of byCode.values()) {
    if (status === 'ok') ok += 1;
    else if (status === 'unknown') unknown += 1;
    else failed += 1;
  }
  return { byCode, ok, unknown, failed };
}

/** حالةُ كودٍ بعينه من نتيجة الجملة — بهويّته لا بصيغته المكتوبة. */
export function outcomeFor(batch, value) {
  return batch?.byCode?.get(normalizeItemCode(value)) || null;
}

/**
 * الأكوادُ المتكرّرةُ في اللصقة — بهويّتها، ولكلٍّ فهارسُ بنوده.
 *
 * BULK-O01: المكرّرُ **يبقى بندَين** وينبّه، ولا يُدمج تلقائيًّا — الدمجُ
 * يفقد معلومة: دفعتان أو موقعان أو سعران للصنف نفسِه يُجمعان في رقمٍ
 * واحدٍ ويضيع التفريق، والمستودعُ يحتاجه.
 *
 * @param {Array<{index: number, value: string}>} codes
 * @returns {Map<string, number[]>} كودٌ مطبَّع ⇒ فهارسُ بنوده (اثنان فأكثر)
 */
export function duplicateGroups(codes) {
  const byKey = new Map();
  for (const { index, value } of codes || []) {
    const key = normalizeItemCode(value);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(index);
  }
  for (const [key, list] of byKey) if (list.length < 2) byKey.delete(key);
  return byKey;
}

/* ═══════════════ الحكم — علامةٌ تُعرض ولا تُحفظ (BULK-104) ═══════════════ */

/** حالاتُ الأكواد التي لم تُستبن — كودٌ مطبَّع ⇒ `unknown` أو `failed`. */
export function codeStatuses(batch) {
  const out = new Map();
  for (const [key, { status }] of batch?.byCode || []) {
    if (status !== 'ok') out.set(key, status);
  }
  return out;
}

/**
 * حكمُ خانة الكود — **عرضٌ خالصٌ لا يُكتب في البند** (يسدّ ث‑٦ وث‑٧).
 *
 * ★ هذه هي النقطة الحسّاسة: علامةُ «مجهول» **حالةُ شاشةٍ لا حقلُ بيانات**.
 * ولو كُتبت على السطر لَحُفظت في المستند ولَظهرت في الطباعة والتقارير —
 * ولَبقيت بعد أن يُسجَّل الصنفُ ويصير معروفًا. فهي تُشتقّ عند العرض من
 * كودِ السطر نفسِه: يُصلح الموظّفُ الكودَ فتذهب العلامةُ بلا تنظيف.
 *
 * ولا يمنع شيءٌ من هذا الحفظَ ولا يوقف الإدخال (شرطُ المالك القائم):
 * الأصفرُ تنبيهٌ، والأحمرُ محجوزٌ للتحذير وحدَه في هذه البوّابة.
 *
 * @param {string} value كودُ السطر كما هو معروض
 * @param {{statuses?: Map<string,string>, duplicates?: Map<string,number[]>|Set<string>}} ctx
 * @returns {{level: 'warn', message: string}|null}
 */
export function skuCellVerdict(value, { statuses, duplicates } = {}) {
  const key = normalizeItemCode(value);
  if (!key) return null;
  const status = statuses?.get(key);
  if (status === 'unknown') {
    return { level: 'warn', message: 'الصنف غير موجود في دليل الأصناف — أكمل البند يدويًّا وسجِّل الصنف لاحقًا.' };
  }
  if (status === 'failed') {
    return { level: 'warn', message: 'تعذّر سؤال الماستر عن هذا الكود — أعد اللصق أو أكمل البند يدويًّا.' };
  }
  if (duplicates?.has(key)) {
    return {
      level: 'warn',
      message: 'صنفٌ مكرّر — يبقى بندَين عمدًا كي لا تُجمع دفعتان أو موقعان أو سعران في رقمٍ واحد. ادمجهما بزرّ الدمج إن أردت.',
    };
  }
  return null;
}

/**
 * دمجُ بنودٍ مكرّرةٍ **بقرار المستخدم** (BULK-O01): الكمّيّةُ تُجمع في أوّل
 * بندٍ منها، والبواقي تُحذف. ولا يُستدعى هذا تلقائيًّا أبدًا.
 *
 * الكمّيّاتُ غيرُ الرقميّة لا تُخترع لها أرقام: إن لم يكن فيها رقمٌ واحدٌ
 * صحيح بقيت قيمةُ الأوّل كما هي.
 *
 * @param {object[]} lines البنود
 * @param {number[]} indexes فهارسُ المكرّر (من `duplicateGroups`)
 * @param {string} qtyKey مفتاحُ عمود الكمّيّة
 */
export function mergeDuplicateLines(lines, indexes, qtyKey = 'qty') {
  const list = [...(lines || [])];
  const picks = [...new Set(indexes || [])].filter((i) => list[i]).sort((a, b) => a - b);
  if (picks.length < 2) return list;

  const [keep, ...drop] = picks;
  // الفارغُ ليس صفرًا: خانةٌ لم تُملأ لا تدخل الجمعَ ولا تدهس نصًّا مكتوبًا.
  const numbers = picks
    .map((i) => list[i]?.[qtyKey])
    .filter((v) => String(v ?? '').trim() !== '')
    .map(Number)
    .filter(Number.isFinite);
  const merged = { ...list[keep] };
  if (numbers.length) merged[qtyKey] = String(numbers.reduce((a, b) => a + b, 0));
  list[keep] = merged;

  const dropped = new Set(drop);
  return list.filter((_, i) => !dropped.has(i));
}
