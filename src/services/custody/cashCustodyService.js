/**
 * خدمة «العهد النقديّة» — مجموعةُ Firestore خاصّةٌ `cash_custody`.
 *
 * المبادئ (نمط `siteNeedsService`):
 *   - كلُّ وصولٍ إلى القاعدة من البابِ الواحد `_db/index.js` لا من Firestore.
 *   - القيودُ **ملحق-فقط**: لا تعديلَ ولا حذف — الخطأُ يُصحَّح بقيدٍ مضادّ
 *     (استلامٌ/مصروفٌ معاكس). الإلزامُ في `firestore.rules`.
 *   - الاستعلامُ بلا `where`+`orderBy` معًا (يفرض فهرسًا مركّبًا): نقرأ المجموعة
 *     كاملةً ونرتّب في المتصفّح — نفس حلّ «احتياجات الموقع».
 *   - المبالغُ تُخزَّن بالوحدة الصغرى الصحيحة (درهم) عبر `money.toMinor` — فلا
 *     كسرَ عائمٍ في سجلٍّ نقديّ.
 */
import { collection, addDoc, onSnapshot, query, serverTimestamp, db } from '../_db/index.js';
import { auth } from '../../config/firebase.js';
import { toMinor } from '../accounting/money.js';
import { CUSTODY_CATEGORIES, CUSTODY_KINDS, canManageCustody } from './cashCustody.js';

const COL = 'cash_custody';

/** الموقعُ الافتراضيّ — موقع ١٥٥ (أبوهادي)؛ والرحبةُ الخيارُ الآخر. */
export const DEFAULT_SITE = '155';

/** المواقعُ المشمولةُ بالعهد النقديّة (طلب المالك: موقع ١٥٥ ومخزن الرحبة). */
export const CUSTODY_SITES = ['155', 'الرحبة'];

function whoami(profile) {
  return {
    createdByUid: auth?.currentUser?.uid || null,
    createdByName: profile?.name || auth?.currentUser?.email || 'غير معروف',
    createdByRole: profile?.role || '',
  };
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * يستمع لكلّ قيود العهد النقديّة (لوحةٌ تشغيليّةٌ مشتركة) — مرتّبةً محليًّا
 * بالأحدث أوّلًا (بالتاريخ ثمّ بختم الإنشاء).
 */
export function subscribeCashCustody(callback, onError) {
  const q = query(collection(db, COL));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort(
          (a, b) =>
            String(b.date || '').localeCompare(String(a.date || '')) ||
            (Number(b.createdAtMs) || 0) - (Number(a.createdAtMs) || 0)
        );
      callback(rows, snap.metadata?.hasPendingWrites || false);
    },
    (err) => onError?.(err)
  );
}

/** يتحقّق من المصادقة والصلاحيّة ويُعيد هويّةَ الكاتب. */
function authorize(profile) {
  const who = whoami(profile);
  if (!who.createdByUid) throw new Error('يجب تسجيل الدخول.');
  if (!canManageCustody(who.createdByRole)) throw new Error('ليست لك صلاحيّة إدارة العهد النقديّة.');
  return who;
}

/** يحوّل المبلغَ المُدخَل (دينار) إلى وحدةٍ صغرى صحيحةٍ موجبة. */
function shapeAmount(amount) {
  const minor = toMinor(amount);
  if (!(minor > 0)) throw new Error('المبلغ يجب أن يكون أكبر من صفر.');
  return minor;
}

/**
 * يسجّل **استلامَ عهدة**: نقدٌ يُسلَّم لحامل عهدة (يزيد رصيده).
 * @param {{custodian:string, amount:number, date?:string, site?:string, note?:string}} input
 * @param {object} profile ملفُّ المستخدم (role · name)
 */
export async function addReceipt(input, profile) {
  const who = authorize(profile);
  const custodian = String(input?.custodian || '').trim();
  if (!custodian) throw new Error('اسم حامل العهدة إلزاميّ.');
  const amount = shapeAmount(input?.amount);

  const ref = await addDoc(collection(db, COL), {
    kind: CUSTODY_KINDS.RECEIPT,
    custodian,
    amount,
    date: String(input?.date || '').slice(0, 10) || todayIso(),
    site: String(input?.site || DEFAULT_SITE).trim(),
    note: String(input?.note || '').trim(),
    ...who,
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
  return ref.id;
}

/**
 * يسجّل **مصروفًا** من عهدة حاملٍ (ينقص رصيده)، بفئةٍ ورقمِ فاتورةٍ وموقع.
 * @param {{custodian:string, amount:number, category?:string, invoiceNo:string,
 *          date?:string, site?:string, note?:string}} input
 * @param {object} profile
 */
export async function addExpense(input, profile) {
  const who = authorize(profile);
  const custodian = String(input?.custodian || '').trim();
  if (!custodian) throw new Error('اسم حامل العهدة إلزاميّ.');
  const amount = shapeAmount(input?.amount);
  const invoiceNo = String(input?.invoiceNo || '').trim();
  if (!invoiceNo) throw new Error('رقم الفاتورة إلزاميٌّ للمصروف.');
  const category = CUSTODY_CATEGORIES.includes(input?.category) ? input.category : 'أخرى';

  const ref = await addDoc(collection(db, COL), {
    kind: CUSTODY_KINDS.EXPENSE,
    custodian,
    amount,
    category,
    invoiceNo,
    date: String(input?.date || '').slice(0, 10) || todayIso(),
    site: String(input?.site || DEFAULT_SITE).trim(),
    note: String(input?.note || '').trim(),
    ...who,
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
  return ref.id;
}
