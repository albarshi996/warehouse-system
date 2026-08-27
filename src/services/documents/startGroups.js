/**
 * مجموعات «بدء مستند جديد» — منطقٌ خالصٌ يصنّف أزرار البدء بسلسلتها.
 *
 * لماذا خرجت من `DocumentsInbox.jsx`؟ كانت مصفوفةً محلّيّةً داخل المكوّن،
 * فلم يستطع حارسٌ أن يقرأها — **فانحرفت**: بلغت المخطّطات المبنيّة ٤١ نوعًا
 * بينما تغطّي المجموعات ٣٤، فبقيت سبعةُ أنواعٍ مبنيّةً ومختبَرةً ولا زرَّ
 * يبدأها — ومنها **سلسلة الإنتاج كاملةً** (`PRO → MIS → PRC`). لم تكن ناقصةً
 * في المحرّك ولا في المخطّطات؛ كانت غائبةً عن هذه المصفوفة وحدها.
 *
 * نفس درس `navCatalog.js` حرفيًّا: ما لا يُقرأ من مكانٍ واحدٍ ينحرف، وما لا
 * يقرؤه حارسٌ لا يُكتشف انحرافه.
 *
 * مستهلكان اثنان:
 *   1. `DocumentsInbox.jsx` — يرسم الأزرار.
 *   2. `scripts/audit-portal.mjs` — يمنع أن يعود نوعٌ جاهزٌ بلا مدخل.
 */
import {
  PURCHASE_CHAIN,
  OUTBOUND_CHAIN,
  RETURN_CHAIN,
  COUNT_CHAIN,
  TRANSFER_CHAIN,
  INTERNAL_PROCUREMENT_CHAIN,
  VAN_CHAIN,
  PRODUCTION_CHAIN,
} from './chain.js';
import { GOVERNED_FORMS } from './schemas/index.js';

/**
 * الأزرار مجمّعةً بسلسلتها — أربعون زرًّا مسطّحًا تُربك لا تُيسّر.
 *
 * الترتيب يتبع رحلة البضاعة: تدخل (وارد) ← تُصنَّع (إنتاج) ← تخرج (مبيعات)
 * ← تُفوتَر ← تُحصَّل. ثمّ الحركات الجانبيّة: نقلٌ ومركبةٌ ومرتجعاتٌ وجردٌ
 * وتالف. والمشتريات الداخليّة آخرًا لأنّها دورةٌ مستقلّةٌ لا تمسّ المخزون.
 *
 * الأنواع الخارجة عن السلاسل تُلحق بمجموعةٍ بحكم معناها لا بحكم سلسلةٍ لا
 * تخصّها: `CTR` مناولةُ حاويةٍ واردة، و`RCV` تحصيلٌ ميدانيٌّ من المركبة.
 */
export const START_GROUPS = [
  { title: 'الوارد', icon: 'arrowDownTray', types: [...PURCHASE_CHAIN, 'SRN', 'CTR'] },
  // ‹FNB-502› المطبخ المركزيّ: أمرٌ ← صرفُ موادّ ← استلامُ منتَج.
  { title: 'الإنتاج', icon: 'factory', types: PRODUCTION_CHAIN },
  { title: 'المبيعات والصرف', icon: 'shoppingCart', types: [...OUTBOUND_CHAIN, 'POD'] },
  { title: 'الفوترة', icon: 'fileText', types: ['INV'] },
  // سندا الخزينة: قبضٌ من عميلٍ وسدادٌ لمورّد. خارج السلاسل عمدًا لأنّ
  // السندَ يقاصّ **فاتورةً أو أكثر** فلا يحتمل أبًا واحدًا (م٤-أ).
  { title: 'التحصيل والسداد', icon: 'dollarSign', types: ['RCP', 'SPV'] },
  // ‹LPN-405› ومحضرُ الفرق معها: يُحرَّر على استلامٍ وقع، فبيتُه بيتُ النقل.
  { title: 'النقل بين المستودعات', icon: 'truck', types: [...TRANSFER_CHAIN, 'TDR'] },
  // البيع من المركبة (SAP-20 · طلب المالك): كانت العائلة كلّها غائبةً عن
  // «بدء مستند جديد» — فبدا كأنّ «لا مستند يعبّئ البضاعة من المخزن إلى
  // المندوب» والمستند موجود: **أمر تحميل المركبة** (مخزن ← عهدة مندوب).
  { title: 'البيع من المركبة', icon: 'car', types: [...VAN_CHAIN, 'CRN', 'VCD', 'VCS', 'VCR', 'RCV'] },
  { title: 'المرتجعات', icon: 'arrowLeftRight', types: RETURN_CHAIN },
  { title: 'الجرد', icon: 'clipboardList', types: COUNT_CHAIN },
  { title: 'التالف', icon: 'alertTriangle', types: ['DMG'] },
  { title: 'المشتريات الداخلية', icon: 'shoppingCart', types: INTERNAL_PROCUREMENT_CHAIN },
];

/** كل نوعٍ تغطّيه مجموعةٌ ما — للمقارنة لا للعرض. */
export function coveredTypes() {
  return new Set(START_GROUPS.flatMap((g) => g.types));
}

/**
 * الأنواع **الجاهزة في المحرّك** التي لا تغطّيها مجموعة — أي مستندٌ مبنيٌّ
 * لا يستطيع أحدٌ أن يبدأه. هذا ما يقيسه الحارس، ويجب أن يبقى صفرًا.
 */
export function uncoveredReadyTypes(forms = GOVERNED_FORMS) {
  const covered = coveredTypes();
  return forms.filter((f) => f.ready && !covered.has(f.type)).map((f) => f.type);
}

/**
 * العكس: نوعٌ في مجموعةٍ ولا مخطّط له. لا يُعدّ عطبًا — الزرّ لا يُرسم أصلًا
 * لأنّ العرض يفلتر بـ`ready` — لكنّه يكشف تصنيفًا سبق بناءه، فيُعلَن.
 */
export function plannedTypes(forms = GOVERNED_FORMS) {
  const ready = new Set(forms.filter((f) => f.ready).map((f) => f.type));
  return [...coveredTypes()].filter((t) => !ready.has(t));
}
