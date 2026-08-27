/**
 * تصنيف الحقول الزمنيّة في المستندات الـ٣٥ (م٢-أ · يمهّد لسدّ ف‑٨).
 *
 * ═══ العطب ═══
 * `createdAt` محميّ، لكنّ تواريخ الرأس مفتوحة، والمؤشّرات تقرأ منها. فمن يؤخّر
 * «تاريخ الاستلام الفعليّ» يومين يستطيع التأثير في تقييم المورّد بلا أثرٍ ظاهر.
 *
 * ═══ لماذا سجلٌّ صريح لا قاعدةٌ ذكيّة ═══
 * كان يمكن أن نقول «كلّ حقلٍ ينتهي بـDate ختمُ واقعة». ولانكسر النظام في أوّل
 * يوم: `expiryDate` صلاحيّة دفعةٍ **في المستقبل بطبيعتها**، و`dueDate` موعد
 * سدادٍ متّفقٌ عليه، و`neededBy` رغبة. حارسٌ يمنع «الواقعة في المستقبل» ويطبَّق
 * عليها يرفض كلّ استلامٍ لبضاعةٍ صالحة. فالتصنيف **قرارٌ لكلّ حقل**، والحارس
 * أدناه يمنع مرور حقلٍ جديدٍ بلا قرار.
 *
 * ═══ الأصناف ═══
 * الخطة (م‑٢) ذكرت ثلاثة، وأضاف المسح رابعًا اقتضاه الواقع — انظر `EXTRA` أدناه.
 *
 * منطق خالص: بلا Firestore وبلا شبكة.
 */

/**
 * سلوك كلّ صنف. الحارس في م٢-ب يقرأ من هنا ولا يعرف أسماء الحقول أصلًا.
 */
export const TIME_CLASSES = Object.freeze({
  /** ختم واقعة: حدثٌ وقع فعلًا. من الخادم، غير قابل للتحرير، ولا يكون في المستقبل. */
  event: {
    id: 'event',
    label: 'ختم واقعة',
    serverStamped: true,
    editable: false,
    futureAllowed: false,
    backdatable: true, // ضمن المدى، وما وراءه باعتمادٍ وسببٍ ووسم
  },
  /** تاريخ مخطّط: نيّةٌ أو اتّفاق. حرٌّ تمامًا، والمستقبل أصله. */
  planned: {
    id: 'planned',
    label: 'تاريخ مخطّط',
    serverStamped: false,
    editable: true,
    futureAllowed: true,
    backdatable: true,
  },
  /**
   * ⚠️ **EXTRA — سمة بيانات:** ليس زمنًا للبوابة بل **صفةً للبضاعة** (صلاحيّة
   * الدفعة). أضفتُه لأنّ ٢٦ من الحقول الـ٦٢ من هذا النوع، ولو صُنّفت «ختم واقعة»
   * لرفض الحارسُ كلَّ استلامٍ لبضاعةٍ صالحة — أي لتوقّف المستودع في أوّل يوم.
   */
  attribute: {
    id: 'attribute',
    label: 'سمة بيانات',
    serverStamped: false,
    editable: true,
    futureAllowed: true,
    backdatable: true,
  },
  /**
   * ⚠️ **EXTRA — تاريخ منقول:** يخصّ مستندًا آخر ويُعرض هنا. لا يُختم بزمن هذا
   * المستند وإلّا عرض رقمًا كاذبًا تحت تسميةٍ صادقة.
   */
  reference: {
    id: 'reference',
    label: 'تاريخ منقول',
    serverStamped: false,
    editable: true,
    futureAllowed: true,
    backdatable: true,
  },
});

const E = 'event';
const P = 'planned';
const A = 'attribute';
const R = 'reference';

/**
 * الجدول: المستند × الحقل × الصنف.
 * **كلّ سطرٍ هنا قرارٌ اتُّخذ بالنظر إلى تسمية الحقل في مخطّطه**، لا اشتقاقًا
 * من اسمه. والحارس يفشل إن ظهر في المخطّطات حقلٌ زمنيّ ليس هنا، أو بقي هنا
 * حقلٌ حُذف من المخطّطات.
 */
export const TIME_FIELD_MAP = Object.freeze({
  /* ═══ الوارد ═══ */
  PR: { requestDate: E, neededBy: P },
  PO: { issueDate: E, requiredDelivery: P },
  // ‹FNB-405› `mfgDate` **صفةُ دفعةٍ** كالصلاحيّة لا ختمُ واقعةٍ عندنا: تاريخُ
  // إنتاجٍ وقع في مصنع المورّد قبل أن تصلنا البضاعة. فهو `attribute` — يُقبل
  // في الماضي بطبيعته، ولا يُختم بزمن الاستلام فيكذب.
  GRN: { receivedAt: E, expiryDate: A, mfgDate: A },
  QC: { inspectionDate: E, expiry: A, mfgDate: A },
  PUTAWAY: { putawayDate: E, expiry: A, mfgDate: A },

  /* ═══ الإنتاج ‹FNB-502› ═══ */
  // `productionDate` **موعدٌ مخطَّط** (متى يُنتَج) فيُقبل في المستقبل؛
  // و`orderDate` و`issueDate` و`receivedAt` ختومُ وقائع؛ و`mfgDate`/`expiry`
  // سمتا دفعةٍ كما في الوارد.
  PRO: { orderDate: E, productionDate: P },
  MIS: { issueDate: E, expiry: A },
  PRC: { receivedAt: E, mfgDate: A, expiry: A },

  /* ═══ الصادر ═══ */
  // ‹EXE-301› `mustShipBy` **قيدٌ تشغيليّ** (متى يُقفل استلام الناقل) لا وعدٌ
  // للعميل — و`requiredDate` هو الوعد. وقد يبعد بينهما ساعات، والذي يقود عمل
  // المخزن هو الأوّل. «مخطّط» لأنّه **موعدٌ متّفق عليه** لا ختمُ واقعة، فلا
  // يُرفض لكونه في المستقبل.
  SO: { orderDate: E, requiredDate: P, mustShipBy: P },
  // ⚠️ `orderDate` في أمر السحب تسميتُه «تاريخ الطلب» — أي تاريخ أمر البيع لا
  // تاريخ السحب. وجدول الاشتقاق `SO>PICK` لا ينقله، فيُكتب بيدٍ اليوم. صُنّف
  // «منقولًا» كي لا يُختم بزمن السحب فيعرض رقمًا كاذبًا. القرار الصحيح لاحقًا:
  // إمّا نقله آليًّا عند الاشتقاق أو تسميتُه باسم واقعته. (ينتظر إقرار المالك)
  PICK: { orderDate: R, expiry: A, mustShipBy: P },
  PACK: { issueDate: E },
  DN: { deliveryDate: E, expiry: A },
  POD: { deliveryDate: E, expiry: A },
  GP: { issuedAt: E },
  INV: { invoiceDate: E, dueDate: P },

  /* ═══ النقل الداخليّ ═══ */
  TR: { requestDate: E, requiredDate: P },
  TRN: { shipmentDate: E, expectedArrival: P, expiry: A },
  TRC: { receiptDate: E, expiry: A },
  // ‹LPN-405› محضر الفرق: تاريخُه ووقتُ الوصول كلاهما واقعةٌ وقعت.
  TDR: { reportDate: E, arrivedAt: E },
  CTR: { arrivalDate: E },

  /* ═══ الميدان والبيع من المركبة ═══ */
  VLD: { loadDate: E, expiry: A },
  VSI: { saleDate: E, expiry: A, dueDate: P },
  CRN: { returnDate: E, expiry: A },
  VRT: { returnDate: E, expiry: A },
  VSR: { settlementDate: E },
  VCD: { depositDate: E, expiry: A },
  VCS: { saleDate: E, expiry: A },
  VCR: { recallDate: E, expiry: A },

  /* ═══ المرتجعات والتالف ═══ */
  RET: { returnDate: E, expiry: A },
  SRN: { rejectionDate: E, expiry: A },
  DMG: { discoveryDate: E, expiry: A },

  /* ═══ الجرد والتسوية ═══ */
  CC: { countDate: E },
  ADJ: { adjustmentDate: E },
  CN: { issueDate: E },

  /* ═══ المشتريات الداخليّة ═══ */
  IPR: { requestDate: E, neededBy: P },
  RFQ: { rfqDate: E },
  IPO: { issueDate: E, requiredDelivery: P },
  PV: { voucherDate: E },
  // سند القبض (م٤-أ): تاريخ القبض ختمُ واقعة، وتاريخ الفاتورة المقاصّة منقولٌ
  // يخصّ مستندًا آخر — وختمُه بزمن القبض يعرض رقمًا كاذبًا.
  RCP: { receiptDate: E, invoiceDate: R },
  SPV: { paymentDate: E, docDate: R },
  RCV: { collectionDate: E, invoiceDate: R },
  DLV: { deliveryDate: E },
});

/**
 * ⚠️ **مستنداتٌ بلا ختم واقعةٍ ظاهر** — استثناءٌ مُعلَنٌ لا قاعدةٌ مُضعَفة.
 *
 * القاعدة: لكلّ مستندٍ ختمُ واقعةٍ واحدٌ على الأقلّ، وإلّا فزمنُه غير موثوق.
 * وكشف المسح خرقًا واحدًا حقيقيًّا — سجّلناه هنا ليُرى، ولم نخفِه بتصنيفٍ متساهل.
 *
 * الاعتماد المؤقّت على `createdAt` (المحميّ أصلًا بختم الخادم) يسدّ الحاجة
 * ولا يسدّ الفجوة: مستخدمٌ يُنشئ أمر السحب صباحًا وينفّذه مساءً لا يملك حقلًا
 * يقول متى سُحبت البضاعة فعلًا.
 */
export const TYPES_WITHOUT_EVENT_STAMP = Object.freeze({
  PICK: {
    reason:
      'حقله الزمنيّ الوحيد «تاريخ الطلب» يخصّ أمر البيع لا السحب، فصُنّف منقولًا. ولا حقل يسجّل لحظة السحب نفسها.',
    fallback: 'createdAt',
    fix: 'إضافة `pickedAt` ختمَ واقعةٍ للمستند — تغييرُ مخطّطٍ حيّ، فيحتاج إقرار المالك (يُنفَّذ في م٢-ب).',
  },
});

/** أنواع الحقول التي تُعدّ زمنيّة في المخطّطات. */
export const TIME_KINDS = ['date', 'datetime'];

/**
 * يمسح مخطّطًا واحدًا ويُعيد حقوله الزمنيّة.
 * يقرأ الرأس والأقسام والجداول و`extraFields` — أيّ موضعٍ يسكنه حقل.
 *
 * @param {object} schema مخطّط مستند
 * @returns {{key:string, kind:string, where:string, label:string}[]}
 */
export function timeFieldsOf(schema) {
  const out = [];
  const take = (arr, where) => {
    for (const f of Array.isArray(arr) ? arr : []) {
      if (f?.key && TIME_KINDS.includes(f.kind)) {
        out.push({ key: f.key, kind: f.kind, where, label: f.label || '' });
      }
    }
  };
  for (const sec of schema?.sections || []) {
    if (sec.kind === 'table') take(sec.columns, `${sec.key}[]`);
    else {
      take(sec.fields, sec.key);
      take(sec.extraFields, sec.key);
    }
  }
  return out;
}

/**
 * صنف حقلٍ بعينه، أو `null` إن كان غير مصنَّف.
 * الحرّاس تسأل هنا ولا تحمل قوائم أسماءٍ خاصّة بها.
 */
export function classOf(docType, fieldKey) {
  return TIME_FIELD_MAP[docType]?.[fieldKey] ?? null;
}

/** سلوك الحقل — ما يحتاجه الحارس فعلًا. `null` لغير المصنَّف. */
export function behaviorOf(docType, fieldKey) {
  const id = classOf(docType, fieldKey);
  return id ? TIME_CLASSES[id] : null;
}

/** هل هذا الحقل ختمَ واقعة؟ (الاختصار الأكثر استعمالًا في م٢-ب) */
export function isEventStamp(docType, fieldKey) {
  return classOf(docType, fieldKey) === 'event';
}

/** كلّ حقول مستندٍ من صنفٍ بعينه. */
export function fieldsByClass(docType, classId) {
  return Object.entries(TIME_FIELD_MAP[docType] || {})
    .filter(([, c]) => c === classId)
    .map(([k]) => k);
}

/**
 * الانحراف بين المخطّطات والسجلّ — قلب الحارس.
 * يُعيد ما في المخطّطات ولا تصنيف له، وما في السجلّ ولا وجود له في المخطّطات.
 *
 * @param {Record<string, object>} schemas خريطة المخطّطات
 */
export function timeFieldDrift(schemas) {
  const unclassified = [];
  const stale = [];
  for (const [type, schema] of Object.entries(schemas || {})) {
    const found = timeFieldsOf(schema);
    const mapped = TIME_FIELD_MAP[type] || {};
    for (const f of found) {
      if (!mapped[f.key]) unclassified.push({ type, key: f.key, kind: f.kind, label: f.label });
    }
    const keys = new Set(found.map((f) => f.key));
    for (const key of Object.keys(mapped)) {
      if (!keys.has(key)) stale.push({ type, key });
    }
  }
  for (const type of Object.keys(TIME_FIELD_MAP)) {
    if (!schemas?.[type]) stale.push({ type, key: '(النوع كلّه)' });
  }
  return { unclassified, stale, ok: unclassified.length === 0 && stale.length === 0 };
}

/** إحصاءٌ للعرض والتوثيق: كم حقلًا من كلّ صنف. */
export function timeFieldStats() {
  const counts = { event: 0, planned: 0, attribute: 0, reference: 0 };
  let total = 0;
  for (const fields of Object.values(TIME_FIELD_MAP)) {
    for (const c of Object.values(fields)) {
      counts[c] += 1;
      total += 1;
    }
  }
  return { counts, total, types: Object.keys(TIME_FIELD_MAP).length };
}
