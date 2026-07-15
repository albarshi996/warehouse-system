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
 * صيغة الرقم نفسها في `numberFormat.js` (منطق خالص قابل للاختبار وحده).
 */
import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { counterId, formatNumber } from './numberFormat.js';

const COUNTERS = 'counters';

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
  const year = now.getFullYear();
  const ref = doc(db, COUNTERS, counterId(type, year));

  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const next = (snap.exists() ? Number(snap.data().seq) || 0 : 0) + 1;
    tx.set(ref, { type, year, seq: next }, { merge: true });
    return next;
  });

  return { number: formatNumber(type, year, seq), year, seq };
}
