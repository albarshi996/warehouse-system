/**
 * صندوق الاستيراد — منطق خالص بلا Firebase وبلا DOM.
 *
 * يأخذ صفوفًا خرجت من `importSheet` (مسطّحة: صفٌّ لكلّ بند) ويُخرج **معاينةً**
 * جاهزة للعرض: مستنداتٌ مجمّعة ببنودها، وما هو جديد وما هو مكرّر وما تغيّر.
 * **لا يكتب شيئًا** — القرار للمستخدم بعد أن يرى.
 *
 * ═══ العقود الثلاثة التي يفرضها هذا الملفّ ═══
 *
 * ① **الشيت مسطّح والمستند مركّب.** إكسيل لا يحمل رأسًا وبنودًا في ورقة، فبيانات
 *    الرأس تتكرّر في كلّ صفّ. التجميع هنا يُعيدها مستندًا — واختلافُ قيمة رأسٍ
 *    بين صفَّين لمستندٍ واحد **يُعلَن تعارضًا** ولا يُبتلع بأخذ آخر قيمة.
 *
 * ② **منع التكرار.** البصمة تأتي محسوبةً من `importFingerprint`. الصفّ الذي
 *    بصمته موجودة سلفًا **لا يُستورد ثانيةً** — وإلّا ضاعف كلُّ رفعٍ المخزون.
 *
 * ③ **حدّ التحرير.** كلّ حقلٍ يُحرَّر إلّا هويّة السطر (قرار المالك 2026-08-16)،
 *    لأنّ تحريرها يكسر ① و②. وتعديل الكمّيّة **يُوسَم بقيمته الأصليّة** فيظهر
 *    في تقرير الانحراف — تعديلٌ صامتٌ للكمّيّة يجعل الفرق مع النظام كذبةً.
 */

/** الحقول التي لا تُحرَّر — بصمة منع التكرار. */
export const IDENTITY_FIELDS = Object.freeze(['docRef', 'docId', 'lineId', 'sourceUpdatedAt', 'fingerprint']);

/** حقول الرأس لكلّ نوع — تتكرّر في صفوف المستند الواحد. */
const HEADER_FIELDS = {
  receipt: ['docRef', 'docId', 'sourceUpdatedAt', 'sourceSystem', 'docStatus', 'receiptDate', 'warehouse', 'sourceLocation', 'destinationLocation', 'supplierCode', 'supplier'],
  delivery: ['docRef', 'docId', 'sourceUpdatedAt', 'sourceSystem', 'docStatus', 'deliveryDate', 'warehouse', 'customerCode', 'customer', 'orderRef'],
};

/** حقول البند — ما يبقى بعد الرأس. */
const LINE_FIELDS = {
  receipt: ['lineId', 'fingerprint', 'sku', 'barcode', 'description', 'uom', 'qty', 'batch', 'expiry', 'unitWeight', 'unitVolume', 'notes'],
  delivery: ['lineId', 'fingerprint', 'sku', 'barcode', 'description', 'uom', 'qty', 'batch', 'expiry', 'notes'],
};

const str = (v) => String(v ?? '').trim();

/** أيُحرَّر هذا الحقل؟ */
export function isEditable(field) {
  return !IDENTITY_FIELDS.includes(field);
}

/**
 * يُطبّق تعديلًا على بند. يرفض تحرير الهويّة بسببٍ مكتوب، ويَسِم الكمّيّة
 * بقيمتها الأصليّة **مرّةً واحدة** — فتعديلان متتاليان لا يُضيعان الأصل.
 *
 * @returns {{ok:boolean, problem:string, line:object}}
 */
export function applyEdit(line, field, value) {
  if (!isEditable(field)) {
    return {
      ok: false,
      problem: `«${field}» جزءٌ من هويّة السطر ولا يُحرَّر — تحريره يكسر منع التكرار فيصير الاستيراد الثاني مخزونًا ثانيًا.`,
      line,
    };
  }
  const next = { ...line, [field]: value };
  if (field === 'qty' && !Object.hasOwn(line, '_originalQty')) next._originalQty = line.qty;
  next._edited = [...new Set([...(line._edited || []), field])];
  return { ok: true, problem: '', line: next };
}

/** انحراف الكمّيّة عن المصدر — `null` إن لم تُحرَّر. */
export function qtyDeviation(line) {
  if (!Object.hasOwn(line || {}, '_originalQty')) return null;
  const original = Number(line._originalQty) || 0;
  const current = Number(line.qty) || 0;
  if (original === current) return null;
  return { original, current, diff: current - original };
}

/** كلّ البنود المحرَّرة عبر المستندات — تقرير الانحراف عن المصدر. */
export function deviationReport(documents) {
  const out = [];
  for (const doc of documents || []) {
    for (const line of doc.lines || []) {
      const dev = qtyDeviation(line);
      if (dev) out.push({ docRef: doc.docRef, sku: line.sku, batch: line.batch, ...dev });
    }
  }
  return out;
}

/**
 * يجمع الصفوف المسطّحة في مستندات.
 *
 * @returns {{documents:Array, conflicts:Array}} والتعارض = حقلُ رأسٍ اختلفت
 *          قيمته بين صفَّين لمستندٍ واحد. يُعلَن ولا يُحسم بأخذ آخر قيمة.
 */
export function groupIntoDocuments(rows, type) {
  const headerFields = HEADER_FIELDS[type];
  const lineFields = LINE_FIELDS[type];
  if (!headerFields) throw new Error(`نوع استيراد غير معروف: ${type}`);

  const byRef = new Map();
  const conflicts = [];

  for (const row of rows || []) {
    const ref = str(row.docRef);
    if (!ref) continue;

    if (!byRef.has(ref)) {
      const header = {};
      for (const f of headerFields) header[f] = row[f] ?? '';
      byRef.set(ref, { docRef: ref, type, ...header, lines: [] });
    }
    const doc = byRef.get(ref);

    // ① اختلاف الرأس بين صفَّين يُعلَن — مستودعان لمستندٍ واحد خطأٌ حقيقيّ.
    for (const f of headerFields) {
      const incoming = str(row[f]);
      const settled = str(doc[f]);
      if (incoming && settled && incoming !== settled) {
        conflicts.push({ docRef: ref, field: f, values: [settled, incoming] });
      }
      if (!settled && incoming) doc[f] = row[f];
    }

    const line = {};
    for (const f of lineFields) line[f] = row[f] ?? '';
    doc.lines.push(line);
  }

  return { documents: [...byRef.values()], conflicts };
}

/**
 * يصنّف الصفوف مقابل ما استُورد سابقًا.
 *
 * @param {Set<string>|Array<string>} knownFingerprints بصمات مستوردة سلفًا
 * @returns {{fresh:Array, duplicate:Array}}
 */
export function classifyRows(rows, knownFingerprints) {
  const known = knownFingerprints instanceof Set ? knownFingerprints : new Set(knownFingerprints || []);
  const fresh = [];
  const duplicate = [];
  const seenNow = new Set();

  for (const row of rows || []) {
    const fp = str(row.fingerprint);
    // ② بصمةٌ معروفة، أو مكرّرة **داخل الملفّ نفسه** — كلاهما لا يُستورد ثانيةً.
    if (fp && (known.has(fp) || seenNow.has(fp))) duplicate.push(row);
    else {
      if (fp) seenNow.add(fp);
      fresh.push(row);
    }
  }
  return { fresh, duplicate };
}

/**
 * المعاينة الكاملة — ما يُعرض قبل أيّ كتابة.
 *
 * @param {object} importResult ناتج `importSheet`
 * @param {Set<string>} knownFingerprints
 * @param {string} type 'receipt' | 'delivery'
 */
export function buildPreview(importResult, knownFingerprints, type) {
  const rows = importResult?.rows || [];
  const { fresh, duplicate } = classifyRows(rows, knownFingerprints);
  const { documents, conflicts } = groupIntoDocuments(fresh, type);

  const errors = (importResult?.errors || []).filter((e) => e.severity !== 'warning');
  const warnings = (importResult?.errors || []).filter((e) => e.severity === 'warning');

  return {
    type,
    documents,
    conflicts,
    duplicate,
    errors,
    warnings,
    // الاستيراد يُقبل حين لا خطأ **ولا تعارض رأس** — والمكرّر وحده لا يمنع:
    // ملفٌّ نصفه مستوردٌ سلفًا يُستورد نصفه الجديد ويُعلَن الباقي.
    ok: errors.length === 0 && conflicts.length === 0 && documents.length > 0,
    summary: {
      rows: rows.length,
      fresh: fresh.length,
      duplicate: duplicate.length,
      documents: documents.length,
      lines: documents.reduce((s, d) => s + d.lines.length, 0),
      qty: documents.reduce((s, d) => s + d.lines.reduce((n, l) => n + (Number(l.qty) || 0), 0), 0),
    },
  };
}

/**
 * يحوّل مستندًا من المعاينة إلى مسودّة `PUTAWAY` أو `PICK` بشكل محرّك المستندات.
 *
 * لا يُنشئ شيئًا — يُشكّل فقط. الإنشاء فعلٌ سحابيّ منفصل.
 */
export function toDocumentDraft(doc, { type }) {
  const isReceipt = type === 'receipt';
  const header = isReceipt
    ? {
        putawayDate: str(doc.receiptDate),
        warehouse: str(doc.warehouse),
        supplier: str(doc.supplier),
        stagingZone: str(doc.destinationLocation),
        // مرجع المصدر يُحفظ على الرأس فيبقى الخيط إلى النظام الذي جاء منه.
        sourceRef: str(doc.docRef),
        sourceSystem: str(doc.sourceSystem),
      }
    : {
        orderDate: str(doc.deliveryDate),
        warehouse: str(doc.warehouse),
        destination: str(doc.customer),
        branchOrderRef: str(doc.orderRef),
        sourceRef: str(doc.docRef),
        sourceSystem: str(doc.sourceSystem),
      };

  const lines = (doc.lines || []).map((l) => ({
    sku: str(l.sku),
    barcode: str(l.barcode),
    description: str(l.description),
    uom: str(l.uom),
    ...(isReceipt ? { qty: Number(l.qty) || 0 } : { qtyRequested: Number(l.qty) || 0 }),
    batch: str(l.batch),
    expiry: str(l.expiry),
    // الموقع يُترك فارغًا عمدًا: **العامل يختاره** لحظة التنفيذ (قرار المالك).
    bin: '',
    notes: str(l.notes),
  }));

  return { type: isReceipt ? 'PUTAWAY' : 'PICK', header, lines };
}
