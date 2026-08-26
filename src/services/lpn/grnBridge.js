/**
 * جسرُ الجلسة إلى GRN — حيث تصير الحمولة **رصيدًا**. منطق خالص.
 *
 * المشكلة التي يحلّه: بعد الاعتماد تصير للحمولة هويّةٌ وموقعٌ وسجلّ… **ولا
 * يتحرّك الرصيد**. فالطبلية تقول «أنا هنا» والدفتر يقول «لم يدخل شيء» —
 * رقمان يتناقضان، وهو عين ما بُنيت الطبقة لتمنعه.
 *
 * والوصل ليس اختراعًا: محرّك المستندات يعرف كيف يشتقّ GRN من PO بأقفال
 * تخصيصه ومطابقته الثلاثيّة، ويعرف كيف يقيّد عند «منجَز». فالجسر **يُجهّز
 * مدخلاته ولا يبني محرّكًا ثانيًا**.
 *
 * ═══ القاعدة الحاكمة (ح-٢) ═══
 * **الطبلية لا تقيّد حركة — المستند يقيّدها.** فالجسر يحسب «كم استُلم لكلّ
 * سطرٍ من الأمر» من الطبالي المعتمدة، ويسلّمه لـ`createNextInChain` بصيغة
 * `requestedByLine` التي يفهمها المحرّك أصلًا. ثمّ تمضي السلسلة المالية
 * (GRN←QC←المطابقة الثلاثيّة) كما كانت **بلا أن تعرف الطبالي**.
 *
 * ولماذا بالكمّيّة الأساس؟ لأنّ سطر الأمر بوحدته، والقراءة قد تكون كرتونةً.
 * فما يُسلَّم للمحرّك هو الأساس المحسوب يوم القراءة — لا عددُ المسحات.
 */

/**
 * الطبالي التي تُحتسب في GRN: **المعتمَدة وحدها**.
 *
 * المرجوضةُ لم تدخل، والمرجَعةُ للتصحيح لم تُعتمد بعد، والموسومةُ بالفحص
 * أو الحجز **دخلت فعلًا** فتُحتسب — الوسم يمنع صرفها لا وجودها.
 */
export function countableDrafts(drafts) {
  return (drafts ?? []).filter((d) => d?.lpn && ['APPROVED', 'LABEL_PRINTED', 'PENDING_PUTAWAY', 'STORED'].includes(d?.state));
}

/**
 * ما استُلم فعلًا لكلّ سطرٍ من الأمر — بالكمّيّة الأساس.
 *
 * @returns {{byLine:Object<string,number>, unknownBase:Array, total:number}}
 *   و`unknownBase` بنودٌ بمعاملٍ مجهول: **لا تُحتسب ولا تُصفَّر** — تُعلَن
 *   ليحسمها إنسان، فرقمٌ مخمَّنٌ في مستندٍ ماليّ أسوأ من رقمٍ ناقصٍ معلوم.
 */
export function receivedByLine(session) {
  const byLine = {};
  const unknownBase = [];
  let total = 0;

  for (const draft of countableDrafts(session?.drafts)) {
    for (const line of draft.lines ?? []) {
      if (!line?.lineId) continue;
      const base = line?.baseQty == null ? NaN : Number(line.baseQty);
      if (!Number.isFinite(base) || base <= 0) {
        unknownBase.push({ lpn: draft.lpn, sku: line?.sku ?? '', uom: line?.uom ?? '', qty: Number(line?.qty) || 0 });
        continue;
      }
      byLine[line.lineId] = (byLine[line.lineId] ?? 0) + base;
      total += base;
    }
  }
  // تقريبٌ يمنع ذيول الفاصلة العائمة من إيقاف قفل التخصيص بفرقٍ لا يُرى.
  for (const k of Object.keys(byLine)) byLine[k] = Math.round((byLine[k] + Number.EPSILON) * 1e9) / 1e9;
  return { byLine, unknownBase, total: Math.round((total + Number.EPSILON) * 1e9) / 1e9 };
}

/**
 * سبب رفض توليد GRN من الجلسة — أو '' إن جاز.
 *
 * الترتيب هو الحارس: وجودُ مصدرٍ، ثمّ وجودُ حمولةٍ معتمدة، ثمّ ألّا يبقى
 * بندٌ مجهولُ المعامل يُخفي كمّيّةً عن مستندٍ ماليّ.
 */
export function grnProblem(session) {
  if (!session?.order?.id) return 'الجلسة بلا أمرٍ مصدر — لا يُشتقّ استلامٌ من فراغ.';
  if (session.order.type !== 'PO') {
    return `الاستلام يُشتقّ من أمر شراء — ومصدر هذه الجلسة «${session.order.type}». (النقل يُستلم بـTRC.)`;
  }
  const counted = countableDrafts(session.drafts);
  if (counted.length === 0) {
    return 'لا طبليةً معتمدةً في هذه الجلسة — اعتمد من الحوكمة أوّلًا، فما لم يُعتمد لا يصير رصيدًا.';
  }
  const { byLine, unknownBase } = receivedByLine(session);
  if (unknownBase.length > 0) {
    const names = [...new Set(unknownBase.map((u) => u.sku))].slice(0, 3).join(' · ');
    return `${unknownBase.length} بندًا بمعاملِ وحدةٍ مجهول (${names}) — عرّف المعامل في ماستر الأصناف أوّلًا. رقمٌ مخمَّنٌ في مستندٍ ماليّ أسوأ من انتظار.`;
  }
  if (Object.keys(byLine).length === 0) return 'لا كمّيّةً محتسَبة — الطبالي المعتمدة فارغة.';
  return '';
}

/**
 * خلاصةٌ للعرض قبل التوليد: ماذا سيحمل GRN، ومن أيّ طبالٍ جاء.
 *
 * تُعرض للموظّف **قبل** الضغط: مستندٌ ماليٌّ يُنشأ بلا أن يُرى محتواه هو
 * توقيعٌ على المجهول.
 */
export function grnPreview(session) {
  const { byLine, unknownBase, total } = receivedByLine(session);
  const counted = countableDrafts(session?.drafts);
  const lines = (session?.lines ?? [])
    .filter((l) => byLine[l.lineId] > 0)
    .map((l) => ({
      lineId: l.lineId,
      sku: l.sku,
      description: l.description ?? '',
      uom: l.uom,
      ordered: l.ordered,
      open: l.open,
      received: byLine[l.lineId],
      // تجاوزُ المفتوح يُعلَن هنا أيضًا: المحرّك سيرفضه بقفل التخصيص،
      // فيُقال قبل الضغط لا بعده برسالةٍ تقنيّة.
      over: Math.max(0, byLine[l.lineId] - (Number(l.open) || 0)),
    }));

  return {
    order: session?.order ?? null,
    supplier: session?.supplier ?? '',
    warehouse: session?.warehouse ?? '',
    palletCount: counted.length,
    pallets: counted.map((d) => d.lpn),
    lines,
    total,
    unknownBase,
    problem: grnProblem(session),
  };
}

/**
 * حقول رأس GRN المشتقّ من الجلسة — تُدمج على ما يبنيه المحرّك.
 *
 * لا تُعاد كتابة ما يعرفه المحرّك (المورد والأمر يأتيان من الاشتقاق) —
 * وإنّما يُضاف ما لا يعرفه: **مستودعُ الاستلام وطباليه**.
 */
export function grnHeaderFrom(session) {
  return {
    warehouse: session?.warehouse ?? '',
    receivedBy: session?.openedBy ?? '',
    // أثرُ الطبالي على المستند **نصًّا لا علاقةً**: علاقات التنفيذ
    // (BASE/TARGET) للمحرّك وحده، وإقحامُ الطبالي فيها يضخّم المنفَّذ
    // ويكذب الرصيد المفتوح. فالإشارة هنا للقارئ لا للحساب.
    palletRefs: countableDrafts(session?.drafts).map((d) => d.lpn).join(' · '),
    totalPallets: countableDrafts(session?.drafts).length,
  };
}
