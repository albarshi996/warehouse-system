/**
 * سجلّ زيارات البوّابة في السحابة ‹VIS-201› — طبقةٌ رقيقةٌ تنفّذ ولا تقرّر.
 *
 * ═══ ★★★ ض-٢: هذه الخدمةُ لا تُسقط البوّابة أبدًا ═══
 * السجلُّ خدمةٌ **ثانويّة**. ومن يجعلها شرطًا لعمل البوّابة يُسقط البوّابةَ يومَ
 * تسقط هي — شبكةٌ انقطعت أو قاعدةٌ لم تُنشر أو حصّةٌ نفدت.
 *
 * فقاعدتان لا ثالثة لهما:
 *   ① **لا `await` يحبس الرسم** — `recordVisit` تُطلَق ولا تُنتظَر.
 *   ② **كلُّ خطأٍ يُبتلع هنا** ولا يصعد إلى الشاشة. والابتلاعُ مقصودٌ ومعلَنٌ
 *      في موضعٍ واحد — لا `catch` فارغٌ مبعثرٌ في المكوّنات.
 *
 * ═══ والكتابةُ ملحقةٌ-فقط ═══
 * `portal_visits` لا تُعدَّل ولا تُحذف (كـ`scans` و`stock_moves`). وقراءتُها
 * **للأدمن وحده**: سجلُّ تتبّعٍ للموظّفين، وأضيقُ قراءةٍ ممكنة أسلم.
 *
 * ═══ والمعرّفُ حتميّ ═══
 * `setDoc` بمعرّفٍ من (جهاز × جلسة × نوع × مسار × دقيقة). وإعادةُ التركيب في
 * الدقيقة نفسها **تُرفض من القاعدة** (لا `update` على `portal_visits`) —
 * فلا تُضاعَف ولا يُعاد تحريرُ سطرٍ مضى. والرفضُ يُبتلع هنا صامتًا (ض-٢/ض-٤).
 */
import { collection, doc, setDoc, onSnapshot, query, orderBy, limit as fsLimit, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { shapeVisit, visitProblems, visitDocId } from './visitModel.js';
import { browserDeviceId, browserSessionId } from './deviceId.js';

const VISITS = 'portal_visits';

/** ما يُقرأ في شاشة السجلّ — الأحدثُ أوّلًا. */
export const VISITS_CAP = 500;

/**
 * ★★ يسجّل زيارةً — **ولا يُنتظَر ولا يرمي**.
 *
 * تُستدعى من `AuthGate` بلا `await`. وترجع `Promise<boolean>` لمن أراد
 * الانتظار في اختبارٍ أو أداة، ولا يفعل ذلك مكوّنٌ في الشاشة.
 *
 * @returns {Promise<boolean>} أكُتبت؟ — و`false` تعني «لم تُكتب والبوّابة بخير».
 */
export async function recordVisit({ kind, path, profile } = {}) {
  try {
    const user = auth?.currentUser;
    if (!user) return false;

    const device = browserDeviceId();
    const visit = shapeVisit({
      kind,
      path,
      uid: user.uid,
      userName: profile?.name || user.email || '',
      role: profile?.role || '',
      deviceId: device.id,
      sessionId: browserSessionId(),
    });

    if (visitProblems(visit).length) return false;

    const id = visitDocId(visit, Date.now());
    // `at` بختم الخادم — والمنطقُ الخالص يقرأ ولا يقرّر.
    const { at: _at, ...rest } = visit;
    await setDoc(doc(db, VISITS, id), {
      ...rest,
      at: serverTimestamp(),
      // يُعلَن ولا يُخفى: من يقرأ السجلّ يعرف لماذا تغيّر رقمُ جهازٍ فجأةً.
      devicePersisted: device.persisted,
    });
    return true;
  } catch {
    // ★★★ ض-٢: السجلُّ سقط والبوّابةُ تعمل. ولا رسالةَ للموظّف — لا شأن له به.
    return false;
  }
}

/** اشتراكٌ حيٌّ على السجلّ (الأحدث أوّلًا) — للأدمن، وترتدّ لغيره. */
export function listenVisits(callback, onError, max = VISITS_CAP) {
  return onSnapshot(
    query(collection(db, VISITS), orderBy('at', 'desc'), fsLimit(max)),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data(), at: d.data()?.at?.toMillis?.() ?? null }))),
    (e) => onError?.(e)
  );
}
