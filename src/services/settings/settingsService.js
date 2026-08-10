/**
 * تخزين سياسات التشغيل — `settings/current`.
 *
 * ⚠️ تلمس Firestore فلا تُختبَر في Node. كلّ القرار في `settingsModel.js` الخالص.
 *
 * ═══ الاستماع لا القراءة ═══
 * السياسة تُقرأ في كلّ حارسٍ وكلّ شاشة، فالقراءة عند كلّ استدعاء تعني عشرات
 * الطلبات في الدقيقة. `listenSettings` يشترك مرّةً ويُحدّث لحظيًّا — وتغييرُ
 * المالك يسري على كلّ جهازٍ مفتوح **بلا إعادة تحميل**. وهذا شرطٌ لا ترف:
 * سياسةٌ تسري على بعض الأجهزة دون بعض تعني حارسًا يمنع موظّفًا ويمرّر آخر.
 *
 * ═══ الأثر ═══
 * كلّ حفظٍ يكتب `updatedAt` و`byUid` و`byName` — فتغيير السياسة **واقعةٌ
 * منسوبة** لا تعديلًا مجهولًا. ومن غيّر سقف الائتمان يجب أن يُعرف.
 */
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import {
  SETTINGS_COLLECTION,
  SETTINGS_DOC,
  DEFAULT_SETTINGS,
  normalizeSettings,
} from './settingsModel.js';

const ref = () => doc(db, SETTINGS_COLLECTION, SETTINGS_DOC);

/**
 * اشتراكٌ حيّ بالسياسة المطبَّعة.
 * الفشل لا يُسكت النظام: يُنادى `callback` بالافتراضات ثمّ يُبلَّغ الخطأ —
 * فشبكةٌ منقطعة يجب ألّا تعني حارسًا معطَّلًا.
 *
 * @param {(settings:object, meta:{exists:boolean, raw:object|null})=>void} callback
 * @param {(err:Error)=>void} [onError]
 * @returns {()=>void} إلغاء الاشتراك
 */
export function listenSettings(callback, onError) {
  return onSnapshot(
    ref(),
    (snap) => {
      const raw = snap.exists() ? snap.data() : null;
      callback(normalizeSettings(raw), { exists: snap.exists(), raw });
    },
    (err) => {
      callback(DEFAULT_SETTINGS, { exists: false, raw: null });
      onError?.(err);
    }
  );
}

/** قراءةٌ لمرّةٍ واحدة (للحرّاس خارج React). تعود بالافتراضات عند أيّ تعذّر. */
export async function getSettings() {
  try {
    const snap = await getDoc(ref());
    return normalizeSettings(snap.exists() ? snap.data() : null);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * يحفظ السياسة **بعد تطبيعها** — فلا يصل إلى القاعدة خيارٌ غير معروف ولا دورٌ
 * محذوف. التطبيع قبل الكتابة لا بعد القراءة وحدها: مستندٌ فاسد في القاعدة
 * يفسد كلّ من يقرؤه بغير هذه الخدمة.
 *
 * @param {object} settings السياسة كما جُمعت من الشاشة
 * @param {object} profile ملفّ المستخدم { uid, displayName, email }
 */
export async function saveSettings(settings, profile) {
  const clean = normalizeSettings(settings);
  await setDoc(
    ref(),
    {
      ...clean,
      updatedAt: serverTimestamp(),
      byUid: profile?.uid || null,
      byName: profile?.displayName || profile?.email || 'مستخدم',
    },
    { merge: true }
  );
  return clean;
}
