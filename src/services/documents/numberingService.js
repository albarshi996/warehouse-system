/**
 * حجز الرقم التسلسلي الرسمي من السحابة.
 *
 * المشكلة التي يحلّها: النماذج الورقية كانت تحمل رقمًا مكتوبًا في الكود
 * (`BFP-GRN-002`)، فكل استلام مطبوع يحمل **نفس الرقم** ⇒ لا تتبّع ولا تدقيق.
 *
 * الضمانة: العدّاد يُزاد داخل **معاملة Firestore** (`runTransaction`)، فلو ضغط
 * موظّفان «إرسال» في نفس اللحظة أخذ كلٌّ رقمًا مختلفًا — لا تصادم ولا تكرار.
 * وقواعد الأمان تسمح للعدّاد بالزيادة واحدًا فقط وإلى الأمام، فلا تصفير.
 *
 * البنية:  counters/{TYPE}-{YEAR}  ←  { type, year, seq }
 *
 * ═══ الحدّ بين هذا الملفّ ومنطقه (EXE-002) ═══
 * **القاعدة في الكود، والقاعدة مخزنٌ لا حاكم.** فصيغةُ الرقم وقاعدةُ الزيادة
 * كلتاهما في `numberFormat.js` الخالص (تُختبران بلا سحابة)، ولا يبقى هنا إلّا
 * ما لا يُنجَز إلّا على الخادم: **الذرّيّة**. وهذا الملفّ يُنفّذ ولا يقرّر —
 * ولذلك سُمّي `Service` (كان `numbering.js` فكان منطقًا مختبئًا في التخزين).
 */
import { doc, runTransaction, db } from '../_db/index.js';
import { counterId, formatNumber, nextSeq, numberingVerdict } from './numberFormat.js';

const COUNTERS = 'counters';

/**
 * حالةُ الاتّصال كما يراها المتصفّح — و**النفيُ وحدَه قاطع**.
 * وخارج المتصفّح (اختباراتُ Node) تُعدّ متّصلةً فلا يتغيّر سلوكُ أحد.
 */
function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export { counterId, formatNumber };

/**
 * يحجز الرقم التالي لهذا النوع في السنة الحالية ويُعيده.
 * التسلسل يُصفَّر مع كل سنة جديدة (عدّاد مستقلّ لكل `{type}-{year}`).
 *
 * ⚠️ لا يعمل بلا إنترنت: المعاملات تتطلّب اتصالًا بالخادم لأن الرقم الفريد لا
 * يمكن الجزم به محليًّا. هذا مقصود — رقم مستند مؤقّت أسوأ من انتظار الشبكة.
 * (بقيّة النظام يعمل بلا شبكة؛ لحظة الترقيم وحدها تحتاجها.)
 */
export async function reserveNumber(type, now = new Date()) {
  // ★★★ ‹NUM-601› الحارسُ قبل المعاملة لا بعدها: `runTransaction` بلا اتّصالٍ
  // **تتعلّق أبدًا ولا ترمي**، فالانتظارُ بلا حدٍّ هو العطبُ لا الفشل. وهذا
  // يُحوّله إلى رسالةٍ تُقرأ في اللحظة نفسِها. (والحكمُ في `numberFormat`
  // الخالصة، وهنا قراءةُ حالة المتصفّح وحدَها.)
  const verdict = numberingVerdict({ online: isOnline() });
  if (!verdict.ok) {
    const err = new Error(verdict.message);
    err.code = verdict.code;
    throw err;
  }

  const year = now.getFullYear();
  const ref = doc(db, COUNTERS, counterId(type, year));

  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const next = nextSeq(snap.exists() ? snap.data().seq : 0);
    tx.set(ref, { type, year, seq: next }, { merge: true });
    return next;
  });

  return { number: formatNumber(type, year, seq), year, seq };
}
