/**
 * المطابقة ‹GATE-401/402› — البوّابةُ نقطةُ تحقّقٍ لا سجلُّ مرور. منطق خالص.
 *
 * ═══ العطب (ج‑١٠) ═══
 * الحارسُ يرى الشاحنة ويعدّ ما عليها، والمخزنُ يستلم ويكوّن طبالي — **ولا
 * أحدَ يقابل الرقمين**. فشاحنةٌ تدخل بعشرين طبليّةً ويُسجَّل استلامُ ثمانيَ
 * عشرة، ويمضي الأمرُ كأنّ شيئًا لم يكن. وهذه هي القيمةُ التي أرادها المالك:
 * «فتصبح بوابة الأمن نقطة تحقّق مستقلّة وليست مجرّد تسجيل دخول».
 *
 * ═══ ★ ولماذا الطبالي لا الطرود؟ ═══
 * قِيس لا خُمِّن: الحارسُ يعدّ **طرودًا وطبليات**، والاستلامُ الميدانيّ يسجّل
 * **طبالي معتمدةً وكمّيّاتٍ بالوحدة الأساس** (`receivedByLine`). فالطبليّةُ
 * وحدَها لها نظيرٌ على الطرفين. وعددُ الطرود يُعلَن **بلا نظير** ولا يُقابَل
 * بكمّيّةٍ أساس — فمقارنةُ طردٍ بحبّةٍ فرقٌ مخترَعٌ يُعلَّم الناسُ تجاهلَه.
 *
 * ═══ ★★★ والفرقُ لا يُغلق بزرّ ═══
 * نمطُ `transferPallets.decideDiscrepancy` مُحتذًى لا مُعادٌ اختراعُه: قرارٌ
 * منصوصٌ · **وطرفٌ يتحمّله** · وفاعلٌ باسمه. فالفرقُ بلا صاحبٍ يُغلق «ليمشي
 * الحال» ثمّ يتكرّر إلى أن يُفقد الوثوقُ بالسجلّ كلّه.
 */

const s = (v) => String(v ?? '').trim();
const up = (v) => s(v).toUpperCase();

/** مَن يتحمّل الفرق — قائمةٌ معلَنةٌ لا نصٌّ حرّ: النصُّ الحرّ لا يُجمَّع تقريرًا. */
export const LIABLE_PARTIES = Object.freeze([
  { id: 'gate', label: 'البوابة — عدَّ الحارسُ خطأً' },
  { id: 'carrier', label: 'الناقل — نقصت في الطريق' },
  { id: 'receiving', label: 'الاستلام — لم يُكوَّن لها طبليّة' },
  { id: 'supplier', label: 'المورّد — شحن أقلّ ممّا في المستند' },
  { id: 'undetermined', label: 'لم يُحسم — تحت التحقيق' },
]);

const LIABLE_IDS = new Set(LIABLE_PARTIES.map((p) => p.id));

export function liableLabel(id) {
  return LIABLE_PARTIES.find((p) => p.id === s(id))?.label || '';
}

/** حالاتُ المطابقة — ولكلٍّ معناها في الشاشة. */
export const RECONCILE_STATUS = Object.freeze({
  noDeclaration: 'لم يُعلَن عددٌ عند البوابة',
  noReceipt: 'لم يُسجَّل استلامٌ بعد',
  match: 'مطابق',
  variance: 'فرقٌ يحتاج قرارًا',
  decided: 'فرقٌ محسوم',
});

/**
 * ما أعلنه الحارسُ على البوّابة — يُقرأ من الزيارة ولا يُعاد إدخالُه.
 *
 * @returns {{key:string, plate:string, party:string, pallets:number, packages:number, declared:boolean}}
 */
export function gateDeclared(visit) {
  const load = visit?.load?.in ?? {};
  const pallets = (Array.isArray(load.pallets) ? load.pallets : []).reduce(
    (sum, l) => sum + (Number(l?.count) > 0 ? Math.round(Number(l.count)) : 0),
    0
  );
  const packages = Number(load.packages) > 0 ? Math.round(Number(load.packages)) : 0;
  return {
    key: up(load.poRef),
    plate: up(visit?.plate),
    party: s(load.party),
    pallets,
    packages,
    declared: pallets > 0 || packages > 0,
  };
}

/**
 * ما سجّله المخزن — **الطبالي المعتمدةُ وحدها**.
 *
 * المرفوضةُ لم تدخل، والمرجَعةُ للتصحيح لم تُعتمد بعد. وهو تعريفُ
 * `grnBridge.countableDrafts` نفسُه — يُكتب هنا صراحةً بدل استيراد طبقةٍ
 * كاملةٍ لأجل مصفوفةِ حالات، ويحرسه اختبارُ تطابقٍ مع تلك القائمة.
 */
export const COUNTABLE_STATES = Object.freeze(['APPROVED', 'LABEL_PRINTED', 'PENDING_PUTAWAY', 'STORED']);

/**
 * @returns {{key:string, pallets:number, recorded:boolean}}
 */
export function receivedDeclared(session) {
  const drafts = Array.isArray(session?.drafts) ? session.drafts : [];
  const pallets = drafts.filter((d) => d?.lpn && COUNTABLE_STATES.includes(d?.state)).length;
  return {
    key: up(session?.order?.number),
    pallets,
    recorded: Boolean(session?.order?.id),
  };
}

/**
 * ★ يقابل زيارةً بجلسةِ استلام.
 *
 * والربطُ بمفتاحٍ مشترك: **رقمُ أمر الشراء**، واللوحةُ سندًا احتياطيًّا حين
 * تُمرَّر جلسةٌ اختِيرت بها يدويًّا.
 *
 * @returns {{status:string, label:string, gate:object, received:object,
 *            variance:number, text:string, packagesNote:string}}
 */
export function reconcileVisit(visit, session) {
  const gate = gateDeclared(visit);
  const received = receivedDeclared(session);

  const packagesNote = gate.packages
    ? `${gate.packages} طردًا أُعلنت عند البوابة — ولا نظيرَ لها في الاستلام (يسجّل كمّيّاتٍ بالوحدة الأساس لا طرودًا).`
    : '';

  if (!gate.declared) {
    return { status: 'noDeclaration', label: RECONCILE_STATUS.noDeclaration, gate, received, variance: 0, text: 'لم يُعلَن عددُ طبلياتٍ ولا طرودٍ عند البوابة — لا شيءَ يُقابَل.', packagesNote };
  }
  if (!received.recorded) {
    return { status: 'noReceipt', label: RECONCILE_STATUS.noReceipt, gate, received, variance: 0, text: `أُعلنت ${gate.pallets} طبليّةً عند البوابة — ولم يُسجَّل استلامٌ بعد.`, packagesNote };
  }

  const variance = gate.pallets - received.pallets;
  if (variance === 0) {
    return { status: 'match', label: RECONCILE_STATUS.match, gate, received, variance, text: `مطابق: بوابة ${gate.pallets} / استلام ${received.pallets}.`, packagesNote };
  }
  return {
    status: 'variance',
    label: RECONCILE_STATUS.variance,
    gate,
    received,
    variance,
    text: `اختلافٌ في عدد الطبليات: بوابة ${gate.pallets} / استلام ${received.pallets} — فرقٌ ${Math.abs(variance)}${variance > 0 ? ' ناقصةٌ عن المُعلَن' : ' زائدةٌ على المُعلَن'}.`,
    packagesNote,
  };
}

/**
 * ★★★ حسمُ الفرق — **لا إغلاقَ بلا ثلاثة**.
 *
 * (نمطُ `transferPallets.decideDiscrepancy` — لا محرّكَ ثانٍ للحسم.)
 *
 * @returns {{problem:string}|{decision:object}}
 */
export function decideVariance(result, { decision, liability, correction = '', actor, at } = {}) {
  if (!s(decision)) return { problem: 'قرارُ الفرق يحتاج نصًّا — ماذا تقرّر ولماذا؟' };
  if (!s(liability)) {
    return { problem: 'الفرق يحتاج تحديد الطرف الذي يتحمّله — البوابة أم الناقل أم الاستلام؟ وبلا ذلك يبقى الفرق بلا صاحب.' };
  }
  if (!LIABLE_IDS.has(s(liability))) {
    return { problem: `طرفٌ غير معروف «${s(liability)}» — اختر من القائمة المعلَنة كي يُجمَّع التقرير.` };
  }
  if (!s(actor)) return { problem: 'قرارُ الفرق بلا فاعلٍ لا يُسجَّل.' };

  return {
    decision: {
      visitId: s(result?.visitId),
      key: up(result?.gate?.key),
      gatePallets: Number(result?.gate?.pallets) || 0,
      receivedPallets: Number(result?.received?.pallets) || 0,
      variance: Number(result?.variance) || 0,
      decision: s(decision),
      liability: s(liability),
      correction: s(correction),
      decidedBy: s(actor),
      decidedAt: at ?? null,
    },
  };
}

/**
 * ★★ سببُ رفض إغلاق زيارةٍ عليها فرقٌ مفتوح — أو '' إن جاز.
 *
 * ولا يُقفل هذا **الخروجَ** (المركبة تمضي وبضاعتُها نزلت)، بل يُبقي الزيارةَ
 * في قائمة «فروقٌ مفتوحة» حتّى تُحسم. فحبسُ شاحنةٍ على فرقِ عدٍّ يعطّل
 * الساحة، وتجاهلُه يقتل الثقة — والوسطُ أن يبقى الفرقُ ظاهرًا بلا صاحبٍ حتّى
 * يُسمّى صاحبُه.
 */
export function openVarianceProblem(result, existingDecision) {
  if (result?.status !== 'variance') return '';
  if (existingDecision?.decidedBy) return '';
  return `فرقٌ بلا قرار: ${result.text} — يُحسم بقرارٍ وطرفٍ يتحمّله.`;
}

/** يجمع نتائجَ زياراتٍ مع جلساتها — للوحة السجلّ. */
export function reconcileAll(pairs) {
  return (Array.isArray(pairs) ? pairs : []).map(({ visit, session, decision }) => {
    const result = reconcileVisit(visit, session);
    return {
      ...result,
      visitId: s(visit?.id),
      plate: up(visit?.plate),
      decision: decision ?? null,
      status: result.status === 'variance' && decision?.decidedBy ? 'decided' : result.status,
      label: result.status === 'variance' && decision?.decidedBy ? RECONCILE_STATUS.decided : result.label,
    };
  });
}
