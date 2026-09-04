/**
 * جلسة الاستلام — رأسٌ من أمر شراءٍ مفتوح ورصيدُه المفتوح. منطق خالص.
 *
 * المشكلة التي يحلّها: الاستلام اليوم مكتبيّ — يفتح موظّفٌ نموذج GRN ويكتب
 * الكمّيّات من الورقة. فلا أحد يعرف **وهو واقفٌ عند الشاحنة** كم بقي مفتوحًا
 * من كلّ صنف، ولا يمنعه شيءٌ من استلام صنفٍ ليس في الأمر أصلًا.
 *
 * الجلسة تقلب الترتيب: تبدأ من **أمرٍ معتمدٍ له رصيدٌ مفتوح**، وتحمل ذلك
 * الرصيد إلى الميدان ليتناقص مع كلّ قراءة.
 *
 * ═══ القاعدة الحاكمة (ح-٢ · خطة ٧ ثالثًا) ═══
 * **الرصيد المفتوح يُحسب من تقدّم البنود القائم — لا عمودٌ موازٍ يفترق عنه.**
 * `documentLineProgress` هو الذي يعرف كم استُلم من كلّ سطرٍ عبر سلسلة
 * المستندات كلّها؛ فالجلسة **تستدعيه ولا تعيد حسابه**، وإلّا صار للمستودع
 * رقمان لرصيدٍ واحد يفترقان أوّلَ استلامٍ جزئيّ.
 *
 * ولا تُنشئ الجلسةُ مستندًا ولا تقيّد حركة: هي **حاويةُ عملٍ ميدانيّ** تثمر
 * طبالي معتمدةً، والمستند يأتي بعدها من الحوكمة (LPN-213).
 */

import { canDeriveFrom } from '../documents/states.js';
import { documentLineProgress } from '../documents/documentLineProgress.js';

/** حالات الجلسة — أبسط من دورة الطبلية: الجلسة وعاءٌ لا حمولة. */
export const SESSION_STATES = Object.freeze({
  OPEN: 'مفتوحة',
  CLOSED: 'مغلقة',
  ABANDONED: 'متروكة',
});

const up = (v) => String(v ?? '').trim().toUpperCase();

/**
 * ★★★ قراءةُ حقلٍ من **رأس** المستند — والرأسُ تحت `header` لا في الجذر.
 *
 * كاتبا مجموعة المستندات (`documentsService.createDraft` و`createNextInChain`)
 * يكتبان الشكلَ نفسَه: الجذرُ يحمل `type` و`number` و`state` و`lines`
 * و`links` وأختامَ المُنشئ، **وكلَّ ما عدا ذلك تحت `header`**. فمن قرأ
 * المورّدَ أو المستودعَ أو التواريخَ من الجذر قرأ `undefined` من كلّ مستندٍ
 * حقيقيّ — وبطاقةُ الأمر تُبنى فارغةً بلا أن يسقط اختبارٌ واحد.
 *
 * ⚠️ **والاحتياطُ إلى الجذر تسامحٌ لا افتراض**: مستنداتٌ قديمةٌ مسطّحةٌ
 * وعيّناتُ اختبارٍ تصل بالشكلين، فالقارئُ يقبلهما ولا يفرض واحدًا.
 *
 * ⚠️ ومزلقُ `??` هنا بعينه: `emptyHeader` يكتب المفتاحَ موجودًا وقيمتُه نصٌّ
 * فارغ، فـ`header?.warehouse ?? doc.warehouse` يقف عند `''` ولا يحتاط أبدًا.
 * ولهذا **الفارغُ يُتخطّى** لا يُقبل.
 *
 * ★ والمفاتيحُ تُمرَّر **نصوصًا** لا وصولًا نقطيًّا: بهذا يقدر الحارسُ
 * البنيويُّ في الاختبار أن يقول «لا اسمَ حقلِ رأسٍ يُقرأ في هذا الملفّ إلّا
 * من هنا» — فيمسك النظيرَ الذي يُكتب غدًا.
 */
function headerField(doc, ...keys) {
  for (const key of keys) {
    const value = doc?.header?.[key];
    if (String(value ?? '').trim() !== '') return value;
  }
  for (const key of keys) {
    const value = doc?.[key];
    if (String(value ?? '').trim() !== '') return value;
  }
  return '';
}

/**
 * مستودعُ الاستلام في الأمر.
 *
 * ★★ وأمرُ النقل (TR) لا حقلَ `warehouse` فيه أصلًا — مستودعاه `fromWarehouse`
 * و`toWarehouse`، **والمستلِمُ هو الوجهة**. فمن قرأ `warehouse` وحدَه ردّ
 * فراغًا على كلّ أمر نقلٍ وهو نصفُ ما تفتح عليه الجلسةُ (`sessionOpenProblem`).
 */
function orderWarehouse(order) {
  return headerField(order, 'warehouse', 'toWarehouse');
}

/** من جاءت منه الحمولة: مورّدُ الشراء، أو مستودعُ المصدر في النقل. */
function orderSource(order) {
  return headerField(order, 'supplier', 'supplierName', 'fromWarehouse');
}

/**
 * سبب رفض فتح جلسةٍ على هذا الأمر — أو '' إن جاز.
 *
 * الترتيب هو الحارس: نوعُ المستند قبل حالته، وحالته قبل رصيده — فأوّلُ ما
 * يُقال للموظّف أوّلُ ما يُصلحه.
 */
export function sessionOpenProblem(order, progress) {
  if (!order?.id) return 'لا مستند — اختر أمر شراءٍ من القائمة أو امسح باركود المستند.';
  // ★★★ `TRN` لا `TR`: طلبُ النقل طلبٌ **لم يُشحن**، فلا بضاعةَ تُستلَم عليه
  // ولا مستندَ يُغلق جلستَه. والسلسلةُ `TR ⟶ TRN ⟶ TRC`، و`TRC` يشترط
  // `transferNoteRef` من نوع `TRN`. ومن فتح على `TR` بنى طبالي بلا مخرج.
  if (order.type !== 'PO' && order.type !== 'TRN') {
    if (String(order.type ?? '').trim().toUpperCase() === 'TR') {
      return `«${order.number ?? order.id}» طلبُ نقلٍ لم يُشحن بعد — الاستلامُ يقع على مستند النقل «TRN» الذي يرافق الحمولة.`;
    }
    return `الاستلام من أمر شراءٍ «PO» أو مستند نقلٍ «TRN» فقط — والممسوح «${order.type ?? '؟'}». (القاعدة ١: لا استلام دون مستندٍ معتمد.)`;
  }
  // «لا يُشتقّ إلّا من معتمَد» — عرف محرّك المستندات نفسه: طبليةٌ تشهد
  // لالتزامٍ لم يُعتمد أو بطل شهادةُ زور.
  if (!canDeriveFrom(order.state)) {
    return `الأمر «${order.number ?? order.id}» حالته «${order.state ?? '؟'}» — لا يُستلم عليه حتى يُعتمد.`;
  }
  const open = Number(progress?.totals?.open) || 0;
  if (open <= 0) {
    return `الأمر «${order.number ?? order.id}» استُلم كاملًا — لا رصيد مفتوح. الزائد يحتاج قرارًا لا جلسةً جديدة.`;
  }
  return '';
}

/**
 * بنود الجلسة: سطرُ الأمر مع **رصيده المفتوح** — لا أكثر.
 *
 * `open` من تقدّم البنود القائم حرفيًّا؛ و`received` يبدأ صفرًا ويتراكم من
 * قراءات هذه الجلسة وحدها (المستلَم سابقًا داخلٌ في `open` أصلًا فلا يُحسب
 * مرّتين).
 */
export function sessionLines(order, progress) {
  const byLineId = new Map((progress?.lines ?? []).map((l) => [l.lineId, l]));
  return (progress?.lines ?? []).map((l) => {
    const source = byLineId.get(l.lineId);
    return {
      lineId: l.lineId,
      lineNumber: l.lineNumber,
      sku: up(l.sku),
      barcode: String(l.barcode ?? '').trim(),
      description: l.description ?? '',
      uom: up(l.uom),
      ordered: Number(source?.requested) || 0,
      open: Number(source?.open) || 0,
      received: 0,
      rejected: 0,
    };
  });
}

/**
 * فتح جلسة استلام على أمرٍ مفتوح.
 *
 * @returns {{session:object}|{problem:string}}
 */
export function openSession(order, progress, { actor, at, warehouse = '', device = '' } = {}) {
  const problem = sessionOpenProblem(order, progress);
  if (problem) return { problem };
  if (!String(actor ?? '').trim()) return { problem: 'جلسةٌ بلا فاعلٍ لا تُفتح — من يستلم؟' };
  if (!String(at ?? '').trim()) return { problem: 'جلسةٌ بلا وقتٍ لا تُرتَّب — مرّر الوقت من المستدعي.' };

  return {
    session: {
      state: 'OPEN',
      order: { type: order.type, id: order.id, number: order.number ?? '' },
      // ★★★ من رأس المستند لا من جذره — وإلّا وُلدت الجلسةُ بلا مورّدٍ من كلّ
      // مستندٍ حقيقيّ، ووُرّث الفراغُ إلى كلّ طبليةٍ تولد منها.
      supplier: orderSource(order),
      // مستودع الجلسة: ما اختاره الموظّف، وإلّا مستودع الأمر — والطبالي
      // المتولّدة ترثه، فلا تولد حمولةٌ بلا مستودعٍ تُنسب إليه.
      warehouse: up(warehouse) || up(orderWarehouse(order)),
      lines: sessionLines(order, progress),
      pallets: [],
      openedBy: String(actor).trim(),
      openedAt: String(at).trim(),
      device: String(device ?? '').trim(),
    },
  };
}

/** سطرُ الجلسة الموافق لصنفٍ — بالكود أوّلًا ثمّ بالباركود توافقًا. */
export function findSessionLine(session, { sku, barcode }) {
  const code = up(sku);
  const bar = String(barcode ?? '').trim();
  const lines = session?.lines ?? [];
  return (
    (code && lines.find((l) => l.sku === code)) ||
    (bar && lines.find((l) => l.barcode === bar)) ||
    null
  );
}

/**
 * المتبقّي المفتوح لسطرٍ **في هذه اللحظة**: المفتوح ناقص ما قُرئ في الجلسة.
 * يُشتقّ ولا يُخزَّن — رقمٌ محفوظٌ بجانب مصدره يفترق عنه أوّل قراءة.
 */
export function remainingOf(line) {
  return Math.max(0, (Number(line?.open) || 0) - (Number(line?.received) || 0));
}

/** خلاصة الجلسة للشاشة: المطلوب والمقروء والمتبقّي — لحظيًّا. */
export function sessionTotals(session) {
  const lines = session?.lines ?? [];
  const sum = (pick) => lines.reduce((s, l) => s + (Number(pick(l)) || 0), 0);
  return {
    ordered: sum((l) => l.ordered),
    open: sum((l) => l.open),
    received: sum((l) => l.received),
    rejected: sum((l) => l.rejected),
    remaining: lines.reduce((s, l) => s + remainingOf(l), 0),
    lineCount: lines.length,
    palletCount: (session?.pallets ?? []).length,
  };
}

/**
 * تسجيل أثر قراءةٍ مقبولة على بند الجلسة — يعيد جلسةً **جديدة**.
 *
 * الحكم على القراءة نفسها في `receivingScan.js`؛ هذه تُحدّث العدّاد بعد
 * أن يُقبل، فلا يُعدّ حكمان في موضعين.
 */
export function applyAccepted(session, { lineId, qty = 0, rejectedQty = 0 }) {
  const lines = (session?.lines ?? []).map((l) =>
    l.lineId === lineId
      ? { ...l, received: (Number(l.received) || 0) + (Number(qty) || 0), rejected: (Number(l.rejected) || 0) + (Number(rejectedQty) || 0) }
      : l
  );
  return { ...session, lines };
}

/** ربطُ طبليةٍ بالجلسة — الجلسة الواحدة تكوّن طبليةً أو أكثر (خطة ٧). */
export function attachPallet(session, palletRef) {
  const pallets = session?.pallets ?? [];
  if (!palletRef || pallets.includes(palletRef)) return session;
  return { ...session, pallets: [...pallets, palletRef] };
}

/**
 * سبب رفض إغلاق الجلسة — أو '' إن جاز.
 *
 * الجلسة تُغلق ولو بقي رصيدٌ مفتوح: **الاستلام الجزئيّ واقعُ مستودعٍ لا
 * خطأ** — الشاحنة تأتي على دفعات. لكن جلسةً بلا طبليةٍ واحدة لم تُنتج شيئًا،
 * وإغلاقُها إغلاقُ فراغ: تُترك بسببها لا تُغلق.
 */
export function sessionCloseProblem(session) {
  if (session?.state !== 'OPEN') return `الجلسة «${SESSION_STATES[session?.state] ?? '؟'}» — لا تُغلق مرّتين.`;
  if ((session?.pallets ?? []).length === 0) {
    return 'جلسةٌ بلا طبليةٍ واحدة لم تُنتج شيئًا — اتركها بسببٍ مكتوب بدل إغلاقها إغلاقَ فراغ.';
  }
  return '';
}

/** إغلاق الجلسة — والمتبقّي المفتوح يبقى مفتوحًا على الأمر لجلسةٍ لاحقة. */
export function closeSession(session, { actor, at } = {}) {
  const problem = sessionCloseProblem(session);
  if (problem) return { problem };
  if (!String(actor ?? '').trim()) return { problem: 'إغلاق الجلسة بلا فاعلٍ لا يُسجَّل.' };
  return { session: { ...session, state: 'CLOSED', closedBy: String(actor).trim(), closedAt: at ?? null } };
}

/** تركُ جلسةٍ لم تُنتج شيئًا — بسببٍ إلزاميّ يبقى في السجلّ. */
export function abandonSession(session, { reason, actor, at } = {}) {
  if (session?.state !== 'OPEN') return { problem: 'لا تُترك إلّا جلسةٌ مفتوحة.' };
  if (!String(reason ?? '').trim()) return { problem: 'تركُ الجلسة يحتاج سببًا مكتوبًا — لماذا لم تُنتج شيئًا؟' };
  if (!String(actor ?? '').trim()) return { problem: 'تركُ الجلسة بلا فاعلٍ لا يُسجَّل.' };
  return { session: { ...session, state: 'ABANDONED', abandonReason: String(reason).trim(), closedBy: String(actor).trim(), closedAt: at ?? null } };
}

/**
 * بطاقةُ أمرٍ مفتوحٍ لقائمة الهاتف (LPN-202) — حقول خطة ٧ التسعة.
 *
 * تُشتقّ من المستند وتقدّمه معًا: فما يعرضه الهاتف هو ما ستقيس عليه الجلسة
 * حرفيًّا — لا قائمةٌ تَعِد برصيدٍ ثمّ تكذّبها الجلسة عند الفتح.
 */
export function openOrderCard(order, relations = [], relatedDocuments = []) {
  const progress = documentLineProgress(order, relations, relatedDocuments);
  const totals = progress.totals ?? {};
  return {
    id: order?.id,
    type: order?.type,
    number: order?.number ?? '',
    // ★★★ الرأسُ من `header` — والنوعُ والرقمُ والحالةُ من الجذر. وخلطُ
    // الموضعين هو الذي كان يُفرغ البطاقةَ من كلّ أمرٍ حقيقيّ.
    supplier: orderSource(order),
    warehouse: up(orderWarehouse(order)),
    // وأسماءُ التواريخ تختلف بالنموذج: PO يقول `issueDate`/`requiredDelivery`
    // وTR يقول `requestDate`/`requiredDate` — والبطاقةُ واحدةٌ للاثنين.
    issueDate: headerField(order, 'issueDate', 'requestDate', 'date'),
    requiredDelivery: headerField(order, 'requiredDelivery', 'requiredDate'),
    state: order?.state ?? '',
    lineCount: (progress.lines ?? []).length,
    ordered: Number(totals.requested) || 0,
    received: Number(totals.executed) || 0,
    open: Number(totals.open) || 0,
    canReceive: sessionOpenProblem(order, progress) === '',
    blockedBecause: sessionOpenProblem(order, progress),
  };
}
