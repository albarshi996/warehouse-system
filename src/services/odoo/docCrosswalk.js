/**
 * جدول العبور التقنيّ: كلّ نوع مستندٍ محكوم → نموذج أودو المقابل — ضمان الشمول.
 * ─────────────────────────────────────────────────────────────────────────
 * ملفّ الميزان (`reference-crosswalk.json`) يخطّط بالمسارات البشريّة
 * («Purchase › Orders»)؛ هذا الجدول أخوه التقنيّ: اسم النموذج البرمجيّ
 * (`purchase.order`) وحالة الاعتماد المستهدفة وفعلها العربيّ — ما يحتاجه
 * الجسر لينفّذ `odoo.create/write` فعلًا.
 *
 * **حارس الشمول:** اختبار `docCrosswalk.test.js` يقارن هذا الجدول بـ
 * `readyTypes()` من سجلّ المخطّطات — أيّ نوعٍ يُضاف للمحرّك بلا صفٍّ هنا
 * يُفشل الاختبار، فلا يفترق الجسر عن الدورة أبدًا (درس «تحقّق قبل الثقة»).
 *
 * قاعدة الجسر واحدة للجميع: **كلّ ما يُدفع يصل أودو `draft`**، والاعتماد
 * الصريح ينقله لحالة `confirmState` الخاصّة بنموذجه.
 */

/**
 * نوع البوابة → { model: نموذج أودو، confirmState: حالة الاعتماد،
 *                confirmLabel: تسمية الحالة المعتمدة، verb: نصّ زرّ الاعتماد }
 *
 * البادئة `x_` = نماذج/حقول مخصّصة (studio) لما لا مقابل أصليًّا له في أودو —
 * كما في موديول brandzo_warehouse الحقيقيّ.
 */
export const DOC_ODOO_MAP = {
  /* ── سلسلة الشراء ── */
  PR: { model: 'purchase.requisition', confirmState: 'approved', confirmLabel: 'معتمد', verb: 'اعتمد' },
  PO: { model: 'purchase.order', confirmState: 'purchase', confirmLabel: 'مؤكّد', verb: 'اعتمد' },
  GRN: { model: 'stock.picking', confirmState: 'done', confirmLabel: 'منجَز', verb: 'صدّق' },
  QC: { model: 'quality.check', confirmState: 'done', confirmLabel: 'مفحوص', verb: 'اعتمد الفحص' },
  SRN: { model: 'x_rejection.notice', confirmState: 'done', confirmLabel: 'منجَز', verb: 'صدّق' },

  /* ── التخزين والحركة الداخلية ── */
  PUTAWAY: { model: 'stock.picking', confirmState: 'done', confirmLabel: 'منجَز', verb: 'صدّق' },
  // ‹FNB-502› دورة الإنتاج: أودو يمثّلها بـ`mrp.production` (أمر التصنيع)
  // وحركاتِ مخزونٍ لصرف الموادّ واستلام المنتَج. والأمرُ نفسه لا يقيّد عندنا
  // فحالتُه المؤكَّدة `confirmed` لا `done` — يُصدَّق حين يُعتمد لا حين يُنتَج.
  PRO: { model: 'mrp.production', confirmState: 'confirmed', confirmLabel: 'مؤكَّد', verb: 'أكّد' },
  MIS: { model: 'stock.picking', confirmState: 'done', confirmLabel: 'منجَز', verb: 'صدّق' },
  PRC: { model: 'stock.picking', confirmState: 'done', confirmLabel: 'منجَز', verb: 'صدّق' },
  PICK: { model: 'stock.picking', confirmState: 'done', confirmLabel: 'منجَز', verb: 'صدّق' },
  PACK: { model: 'stock.picking', confirmState: 'done', confirmLabel: 'منجَز', verb: 'صدّق' },
  CTR: { model: 'x_container.handling', confirmState: 'done', confirmLabel: 'منجَز', verb: 'صدّق' },

  /* ── البيع والتسليم ── */
  SO: { model: 'sale.order', confirmState: 'sale', confirmLabel: 'مؤكّد', verb: 'اعتمد' },
  DN: { model: 'stock.picking', confirmState: 'done', confirmLabel: 'منجَز', verb: 'صدّق' },
  POD: { model: 'stock.picking', confirmState: 'done', confirmLabel: 'مُوقَّع', verb: 'وثّق التسليم' },
  GP: { model: 'x_gate.pass', confirmState: 'done', confirmLabel: 'معتمد', verb: 'اعتمد (أمن)' },
  INV: { model: 'account.move', confirmState: 'posted', confirmLabel: 'مُرحّل', verb: 'رحّل' },

  /* ── النقل بين المستودعات ── */
  TR: { model: 'stock.picking', confirmState: 'done', confirmLabel: 'منجَز', verb: 'صدّق' },
  TRN: { model: 'stock.picking', confirmState: 'done', confirmLabel: 'منجَز', verb: 'صدّق' },
  TRC: { model: 'stock.picking', confirmState: 'done', confirmLabel: 'منجَز', verb: 'صدّق' },
  // ‹LPN-405› محضر الفرق لا مقابلَ أصليًّا له في أودو: هو محضرٌ رقابيٌّ يوثّق
  // فرقَ الحمولة والمسؤوليّة، وأودو يمثّل النقص كفرقِ جردٍ أو خصمٍ على المورّد
  // لا كمستندٍ قائمٍ بذاته. فنموذجٌ مخصّص — كنمط تسوية المركبة سواء.
  TDR: { model: 'x_transfer.discrepancy', confirmState: 'done', confirmLabel: 'محسوم', verb: 'احسم' },

  /* ── البيع من المركبة (المستودع المتنقّل) ──
     أودو يمثّل حركة المركبة بمناقلات مخزون (`stock.picking`) بين موقع المستودع
     وموقع المركبة، والبيع الميدانيّ بأمر بيعٍ يُفوتَر فورًا. أمّا التسوية فلا
     مقابل أصليّ لها — فهي محضر إقفالٍ لا حركة، ولذلك نموذجٌ مخصّص. */
  VLD: { model: 'stock.picking', confirmState: 'done', confirmLabel: 'منجَز', verb: 'صدّق' },
  VSI: { model: 'sale.order', confirmState: 'sale', confirmLabel: 'مؤكّد', verb: 'اعتمد' },
  CRN: { model: 'stock.picking', confirmState: 'done', confirmLabel: 'منجَز', verb: 'صدّق' },
  VRT: { model: 'stock.picking', confirmState: 'done', confirmLabel: 'منجَز', verb: 'صدّق' },
  VSR: { model: 'x_van.settlement', confirmState: 'done', confirmLabel: 'مُقفَلة', verb: 'اعتمد التسوية' },

  /* ── البضاعة المحميّة والأمانة ──
     أودو يمثّل الأمانة بموقعٍ من نوع `consignment` تحت العميل، فحركاتها
     مناقلات مخزون. أمّا تحقّق البيع فأمر بيعٍ حقيقيّ — عنده تخرج الملكيّة. */
  VCD: { model: 'stock.picking', confirmState: 'done', confirmLabel: 'منجَز', verb: 'صدّق' },
  VCS: { model: 'sale.order', confirmState: 'sale', confirmLabel: 'مؤكّد', verb: 'اعتمد' },
  VCR: { model: 'stock.picking', confirmState: 'done', confirmLabel: 'منجَز', verb: 'صدّق' },

  /* ── المرتجعات والتالف والجرد ── */
  RET: { model: 'stock.picking', confirmState: 'done', confirmLabel: 'منجَز', verb: 'صدّق' },
  DMG: { model: 'stock.scrap', confirmState: 'done', confirmLabel: 'منجَز', verb: 'صدّق' },
  CC: { model: 'stock.inventory', confirmState: 'done', confirmLabel: 'مُصادَق', verb: 'صادِق' },
  ADJ: { model: 'stock.inventory', confirmState: 'done', confirmLabel: 'مُصادَق', verb: 'صادِق' },
  CN: { model: 'account.move', confirmState: 'posted', confirmLabel: 'مُرحّل', verb: 'رحّل' },

  /* ── المشتريات الداخلية (S12) ── */
  IPR: { model: 'purchase.requisition', confirmState: 'approved', confirmLabel: 'معتمد', verb: 'اعتمد' },
  RFQ: { model: 'purchase.order', confirmState: 'sent', confirmLabel: 'مُرسَل', verb: 'اعتمد المقارنة' },
  IPO: { model: 'purchase.order', confirmState: 'purchase', confirmLabel: 'مؤكّد', verb: 'اعتمد' },
  PV: { model: 'account.payment', confirmState: 'posted', confirmLabel: 'مُرحّل', verb: 'رحّل' },
  // سند القبض (م٤-أ): نظير الصرف في أودو — `account.payment` وارِدًا.
  // ولا حقول مالٍ تُدفع (حدّ المال م١-ب): أودو يولّد القيد ونحن نُنتج الواقعة.
  RCP: { model: 'account.payment', confirmState: 'posted', confirmLabel: 'مُرحّل', verb: 'رحّل' },
  SPV: { model: 'account.payment', confirmState: 'posted', confirmLabel: 'مُرحّل', verb: 'رحّل' },
  RCV: { model: 'account.payment', confirmState: 'posted', confirmLabel: 'مُرحّل', verb: 'رحّل' },
  DLV: { model: 'stock.picking', confirmState: 'done', confirmLabel: 'مُسلَّم', verb: 'وثّق التسليم' },
};

/** صفّ العبور لنوعٍ ما، أو null إن كان النوع خارج الدورة المحكومة. */
export function odooTargetFor(type) {
  return DOC_ODOO_MAP[type] || null;
}

/** الأنواع المُغطّاة — يقارنها اختبار الانجراف بـ readyTypes(). */
export function coveredTypes() {
  return Object.keys(DOC_ODOO_MAP);
}

/**
 * المخطِّط العامّ: أيّ مستندٍ محكوم → قِيَم إنشاءٍ في نموذج أودو المقابل.
 * (PO وGRN لهما مخطِّطان مخصوصان أغنى — هذا للأنواع الأخرى.)
 *
 * الظرف المشترك (envelope) واحد: رقم المصدر ونوعه وأصل السلسلة والأطراف
 * والتواريخ — وبنودٌ عامّة تلتقط أوّل حقول الكمية/السعر المتاحة في المخطّط.
 *
 * @param {object} docObj  مستند البوابة { type, number, header, lines, links }
 */
/**
 * مرجعٌ نصّيّ من قيمةٍ قد تكون نصًّا أو رابطًا `{ id, number }`.
 *
 * لا يُعيد أبدًا «[object Object]»: ما لا يُفكَّك يُعاد فارغًا. ومرجعٌ فارغ
 * أصدقُ من نصٍّ لا يدلّ على شيء ويُخزَّن في نظامٍ حاكم.
 */
export function refText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return refText(value[1] ?? value[0]);
  if (typeof value === 'object') return refText(value.number ?? value.name ?? value.id);
  return '';
}

export function docToOdooValues(docObj = {}) {
  const h = docObj.header ?? {};
  const links = docObj.links ?? {};
  const lines = Array.isArray(docObj.lines) ? docObj.lines : [];

  // أصل السلسلة: أوّل مرجعٍ مربوط (links) أو أيّ حقل *Ref في الرأس.
  //
  // ⚠️ رابط المستند **كائن** `{ id, number }` لا نصّ (انظر `chainOf` في chain.js).
  // وكان السطر يمرّره إلى `String()` مباشرةً، فيُخزَّن في أودو النصُّ الحرفيّ
  // «[object Object]». ظهر حيًّا على سجلّ TRN في لقطة المالك 2026-08-13، ونجا
  // من تشديد العرض لأنّ المخزَّن **نصٌّ فاسد** لا كائنٌ يُفكَّك.
  // الرقم أولى من المعرّف: هو ما يقرؤه الإنسان في أودو.
  const linkedRef = Object.values(links).map(refText).find(Boolean);
  const headerRef = Object.entries(h).find(([k, v]) => /Ref$/.test(k) && v);
  const origin = String(linkedRef || refText(headerRef?.[1]) || '').trim();

  const qtyOf = (l) => Number(l.qty ?? l.qtyReceived ?? l.qtyOrdered ?? l.qtyPicked ?? l.qtyDelivered ?? 0) || 0;

  return {
    x_source_type: String(docObj.type ?? '').trim(),
    x_source_number: String(docObj.number ?? '').trim(),
    origin,
    x_supplier: String(h.supplier ?? '').trim(),
    x_customer: String(h.customer ?? h.beneficiary ?? '').trim(),
    x_warehouse: String(h.warehouse ?? '').trim(),
    date: String(h.issueDate ?? h.receivedAt ?? h.date ?? '').trim(),
    state: 'draft',
    line_ids: lines
      .filter((l) => qtyOf(l) > 0 || l.sku || l.description)
      // بلا `price_unit` — حدّ المال (م١-ب): الكمّيّات والمراجع وحدها تُدفع.
      .map((l) => ({
        product_code: String(l.sku ?? '').trim().toUpperCase(),
        name: String(l.description ?? l.sku ?? '').trim(),
        quantity: qtyOf(l),
      })),
  };
}
