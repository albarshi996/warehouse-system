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

/* ═══════════════ الإدخال اليدويّ والمسح ‹2026-08-17› ═══════════════
 *
 * طلب المالك: «حتى لو كان الملفّ فارغًا يجب أن تتفعّل الصفحة — يُكتب يدويًّا
 * أو يُقرأ بالباركود».
 *
 * ولماذا هذا صحيحٌ لا تسهيل: الشيت مصدرٌ **خارجيّ** قد يتأخّر أو يصل ناقصًا،
 * والبضاعة تصل الرصيف في موعدها. فشاشةٌ لا تعمل إلّا بملفٍّ سليم توقف
 * الاستلام لعطبٍ في ملفّ — وهو فشلٌ أسوأ من الفجوة التي يسدّها التحقّق.
 *
 * والمسار **واحد** لا مساران: اليدويّ يبني **نفس شكل المعاينة** فيمرّ بنفس
 * التحقّق ونفس الاعتماد ونفس منع التكرار. ولو بُني له مسارٌ ثانٍ لَافترق
 * الحكمان أوّل تعديل.
 */

/** بصمة محتوى السطر — هويّته حين لا يأتي من شيتٍ يحمل `lineId`. */
export function contentFingerprint(docRef, line) {
  return [
    'MANUAL',
    str(docRef).toUpperCase(),
    str(line?.sku).toUpperCase() || str(line?.barcode),
    str(line?.batch).toUpperCase(),
    str(line?.qty),
  ].join('|');
}

/** سطرٌ فارغ بحقول نوعه — لا حقلَ يُخترع ولا حقلَ يسقط. */
export function emptyLine(type, seed = {}) {
  const fields = LINE_FIELDS[type];
  if (!fields) throw new Error(`نوع استيراد غير معروف: ${type}`);
  const line = {};
  for (const f of fields) line[f] = seed[f] ?? '';
  line.manual = true;
  return line;
}

/** مستندٌ فارغ بحقول رأسه. */
export function emptyDocument(type, seed = {}) {
  const fields = HEADER_FIELDS[type];
  if (!fields) throw new Error(`نوع استيراد غير معروف: ${type}`);
  const doc = { type, lines: [] };
  for (const f of fields) doc[f] = seed[f] ?? '';
  doc.docRef = str(seed.docRef);
  doc.manual = true;
  return doc;
}

/**
 * يُعيد حساب ما تحته حسابٌ في المعاينة بعد أيّ تعديلٍ يدويّ.
 *
 * الأخطاء المولَّدة هنا **تخصّ الإدخال اليدويّ وحده** وتُدمج مع أخطاء الشيت
 * إن وُجدت: مستندٌ بلا مرجع، أو بلا مستودع، أو سطرٌ بلا صنف، أو كمّيّةٌ صفر.
 * وهي الشروط نفسها التي يفرضها الشيت — فلا يصير اليدويّ بابًا خلفيًّا.
 */
export function recomputePreview(preview) {
  const documents = preview?.documents || [];
  const manualErrors = [];

  documents.forEach((doc, di) => {
    if (!doc.manual && !doc.lines.some((l) => l.manual)) return;
    if (!str(doc.docRef)) manualErrors.push({ row: di + 1, column: 'docRef', message: 'مرجع المستند مطلوب — لا حركة بلا مستند.' });
    if (!str(doc.warehouse)) manualErrors.push({ row: di + 1, column: 'warehouse', message: 'المستودع مطلوب.' });
    doc.lines.forEach((line, li) => {
      if (!line.manual) return;
      if (!str(line.sku) && !str(line.barcode)) {
        manualErrors.push({ row: li + 1, column: 'sku', message: `${doc.docRef || 'مستند'} — سطرٌ بلا كودٍ ولا باركود.` });
      }
      if (!(Number(line.qty) > 0)) {
        manualErrors.push({ row: li + 1, column: 'qty', message: `${doc.docRef || 'مستند'} — الكمّيّة يجب أن تكون أكبر من صفر.` });
      }
    });
  });

  // مرجعان متطابقان لمستندين خطأٌ حقيقيّ — الرقم هو الهويّة.
  const refs = new Map();
  for (const doc of documents) {
    const ref = str(doc.docRef).toUpperCase();
    if (!ref) continue;
    refs.set(ref, (refs.get(ref) || 0) + 1);
  }
  for (const [ref, n] of refs) {
    if (n > 1) manualErrors.push({ row: 0, column: 'docRef', message: `المرجع «${ref}» مكرّرٌ في ${n} مستندات — الرقم هو الهويّة.` });
  }

  const sheetErrors = (preview?.sheetErrors || preview?.errors || []).filter((e) => !e.manual);
  const errors = [...sheetErrors, ...manualErrors.map((e) => ({ ...e, manual: true }))];
  const lines = documents.reduce((s, d) => s + d.lines.length, 0);

  return {
    ...preview,
    sheetErrors,
    documents,
    errors,
    ok: errors.length === 0 && (preview?.conflicts?.length || 0) === 0 && documents.length > 0 && lines > 0,
    summary: {
      ...(preview?.summary || {}),
      documents: documents.length,
      lines,
      qty: documents.reduce((s, d) => s + d.lines.reduce((n, l) => n + (Number(l.qty) || 0), 0), 0),
    },
  };
}

/** معاينةٌ يدويّة من الصفر — بمستندٍ واحدٍ وسطرٍ واحد جاهزَين للملء. */
export function manualPreview(type, seed = {}) {
  const doc = emptyDocument(type, seed);
  doc.lines.push(emptyLine(type));
  return recomputePreview({
    type,
    documents: [doc],
    conflicts: [],
    duplicate: [],
    errors: [],
    warnings: [],
    sheetErrors: [],
    ok: false,
    summary: { rows: 0, fresh: 0, duplicate: 0, documents: 1, lines: 1, qty: 0 },
  });
}

/** يضيف سطرًا إلى مستند — والبذرة تأتي من المسح أو من الفراغ. */
export function addManualLine(preview, docIndex, seed = {}) {
  const documents = (preview?.documents || []).map((doc, i) =>
    i !== docIndex ? doc : { ...doc, lines: [...doc.lines, emptyLine(preview.type, seed)] }
  );
  return recomputePreview({ ...preview, documents });
}

/** يضيف مستندًا فارغًا — شيتٌ واحد قد يحمل استلامَين. */
export function addManualDocument(preview, seed = {}) {
  const doc = emptyDocument(preview.type, seed);
  doc.lines.push(emptyLine(preview.type));
  return recomputePreview({ ...preview, documents: [...(preview.documents || []), doc] });
}

/**
 * يحذف سطرًا **يدويًّا فقط**.
 *
 * سطرُ الشيت لا يُحذف: حذفُه يجعل المعروض يخالف المصدر بلا أثر، فتُصفَّر
 * كمّيّته بدل ذلك ويبقى ظاهرًا — والفرق يُعلَن في تقرير الانحراف.
 */
export function removeManualLine(preview, docIndex, lineIndex) {
  const target = preview?.documents?.[docIndex]?.lines?.[lineIndex];
  if (!target) return preview;
  if (!target.manual) return { ...preview, problem: 'سطرُ الشيت لا يُحذف — صفِّر كمّيّته فيبقى الأثر ظاهرًا.' };

  const documents = preview.documents.map((doc, i) =>
    i !== docIndex ? doc : { ...doc, lines: doc.lines.filter((_, j) => j !== lineIndex) }
  );
  return recomputePreview({ ...preview, documents, problem: '' });
}

/** يُختم كلّ سطرٍ يدويٍّ ببصمة محتواه قبل الاعتماد — فيمنع تكراره لاحقًا. */
export function sealManualFingerprints(preview) {
  const documents = (preview?.documents || []).map((doc) => ({
    ...doc,
    lines: doc.lines.map((line) => (line.manual && !str(line.fingerprint) ? { ...line, fingerprint: contentFingerprint(doc.docRef, line) } : line)),
  }));
  return { ...preview, documents };
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
