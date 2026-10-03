/**
 * تخزينُ الموجات — `waves/{waveCode}`. ‹WMS-701›
 *
 * ⚠️ تلمس Firestore فلا تُختبَر في Node. كلُّ الحكم في `waveModel.js` الخالص
 * المُختبَر — وهذه كتابةٌ وقراءةٌ وحدَهما.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ★★★ وأهمُّ ما في هذا الملفّ: **المنعُ يُعلَن ولا يُبتلع**
 * ═══════════════════════════════════════════════════════════════════════
 *
 * قاعدةُ `waves` مضافةٌ في `firestore.rules` **ولم تُنشَر بعد** — والناشرُ
 * المالكُ من Firebase Console. فحتّى تُنشَر، كلُّ كتابةٍ هنا ترتدّ
 * `permission-denied`.
 *
 * ودَرسٌ مكتوبٌ بثمنه في هذا المستودع: **ارتدادٌ يُبتلع صامتًا أسوأ من عطلٍ
 * ظاهر.** مجموعةُ `portal_visits` بقيت فارغةً أسبوعًا لأنّ كلّ كتابةٍ كانت
 * تُبتلَع، فظُنّ السجلُّ معطوبًا وهو لم يُنشَر. فهذه الخدمةُ **تُترجم
 * `permission-denied` إلى رسالةٍ تقول السبب والعلاج** — فيعرف المشرفُ أنّ
 * العطبَ في النشر لا في البوّابة.
 *
 * ★★ ومعرّفُ الوثيقة **كودُ الموجة** لا معرّفًا مولَّدًا: فموجةٌ واحدةٌ لا
 * تُكتب مرّتين من جهازين، والكتابةُ الثانيةُ تدهس الأولى بدل أن تُضاعفها.
 */
import { collection, doc, getDocs, onSnapshot, query, setDoc, limit } from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { formWave, releaseWave, closeWave, cancelWave, addMember, removeMember } from './waveModel.js';

const WAVES = 'waves';

/** سقفُ القراءة — لوحةُ موجاتٍ لا تحتاج أكثر، والحصّةُ محدودة. */
export const WAVES_CAP = 100;

/**
 * يُترجم عطبَ Firestore إلى عربيّةٍ تقول العلاج (انظر رأس الملفّ).
 */
export function waveError(err) {
  const code = String(err?.code || '');
  if (code.includes('permission-denied')) {
    return 'قواعدُ الأمان لمجموعة «waves» لم تُنشَر بعد — انشرها من Firebase Console، والموجاتُ تعمل بعدها بلا تغييرٍ في البوّابة.';
  }
  if (code.includes('unavailable') || code.includes('failed-precondition')) {
    return 'تعذّر الوصول إلى القاعدة — راجع الاتّصال ثمّ أعِد المحاولة.';
  }
  return err?.message || 'تعذّرت العمليّة.';
}

/** اشتراكٌ حيٌّ بالموجات — والفشلُ يُبلَّغ ولا يُسكَت. */
export function listenWaves(callback, onError) {
  return onSnapshot(
    query(collection(db, WAVES), limit(WAVES_CAP)),
    (snap) => callback(snap.docs.map((d) => ({ ...d.data(), code: d.data()?.code || d.id }))),
    (err) => {
      callback([]);
      onError?.(waveError(err));
    }
  );
}

/** قراءةٌ لمرّةٍ واحدة. */
export async function fetchWaves() {
  try {
    const snap = await getDocs(query(collection(db, WAVES), limit(WAVES_CAP)));
    return snap.docs.map((d) => ({ ...d.data(), code: d.data()?.code || d.id }));
  } catch {
    return [];
  }
}

/** كتابةُ موجةٍ بكودها معرّفًا — دهسٌ لا تضاعف (انظر رأس الملفّ). */
async function write(wave) {
  await setDoc(doc(db, WAVES, wave.code), wave, { merge: false });
  return wave;
}

/**
 * يُكوّن موجةً ويكتبها — **والحكمُ في `formWave` الخالص**.
 *
 * ★ والتسلسلُ يُحتسب من الموجات المُمرَّرة: المستدعي يعرف ما عنده، والمنطقُ
 * الخالصُ لا يقرأ قاعدةً (عقدُ `waveCode`).
 */
export async function createWave({ criterion, value, members, warehouse, waves = [] }, profile) {
  const today = new Date();
  const dayPrefix = `WV-${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, '0')}${String(today.getUTCDate()).padStart(2, '0')}`;
  const seq = waves.filter((w) => String(w?.code || '').startsWith(dayPrefix)).length + 1;

  const verdict = formWave({
    criterion,
    value,
    members,
    warehouse,
    seq,
    at: Date.now(),
    actor: profile?.uid || '',
    actorName: profile?.displayName || profile?.email || '',
  });
  if (!verdict.ok) return { ok: false, problem: verdict.problem, wave: null };
  try {
    return { ok: true, problem: '', wave: await write(verdict.wave) };
  } catch (err) {
    return { ok: false, problem: waveError(err), wave: null };
  }
}

/** يُطبّق حكمًا خالصًا ثمّ يكتب — ولا يُكتب شيءٌ إن رُدّ الحكم. */
async function applyAndWrite(verdict) {
  if (!verdict.ok) return { ok: false, problem: verdict.problem, needsReason: verdict.needsReason === true, wave: null };
  try {
    return { ok: true, problem: '', needsReason: false, wave: await write(verdict.wave) };
  } catch (err) {
    return { ok: false, problem: waveError(err), needsReason: false, wave: null };
  }
}

export function release(wave, profile) {
  return applyAndWrite(
    releaseWave(wave, { actor: profile?.uid || '', actorName: profile?.displayName || profile?.email || '', at: Date.now() })
  );
}

export function close(wave, progressByDoc, { reason } = {}, profile) {
  return applyAndWrite(
    closeWave(wave, progressByDoc, {
      actor: profile?.uid || '',
      actorName: profile?.displayName || profile?.email || '',
      reason,
      at: Date.now(),
    })
  );
}

export function cancel(wave, { reason } = {}, profile) {
  return applyAndWrite(cancelWave(wave, { actor: profile?.uid || '', reason, at: Date.now() }));
}

export function attach(wave, document, waves) {
  return applyAndWrite(addMember(wave, document, { waves }));
}

export function detach(wave, docId) {
  return applyAndWrite(removeMember(wave, docId));
}
