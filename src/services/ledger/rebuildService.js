/**
 * تشغيل إعادة بناء الأرصدة على البيانات الحيّة — الغلاف السحابيّ لـ`rebuild.js`.
 *
 * الفصل مقصود: كلّ المنطق في `rebuild.js` خالصٌ ومُختبَر، وهنا القراءة والكتابة
 * وحدهما. فالحكم على صحّة مستودعٍ كامل لا يجوز أن يكون في ملفٍّ لا يُختبر.
 *
 * ⚠️ **عمليّة إداريّة لا يوميّة:** تقرأ `stock_moves` كلَّه. تُشغَّل عند
 * الشكّ في رصيد، وقبل ترحيل مفتاح الرصيد وبعده — لا في حلقة.
 */
import { collection, doc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { migrationVerdict, reconcileBalances, rebuiltRowsForWrite } from './rebuild.js';

const MOVES = 'stock_moves';
const BALANCES = 'balances';
const BATCH_LIMIT = 500;

/**
 * إعادة البناء عمليّةٌ إداريّة — المديران وحدهما.
 *
 * ⚠️ حدٌّ مُعلَن: `firestore.rules` تسمح بالكتابة على `balances` لـ12 دورًا
 * (`isStockActor() || isVanSalesWriter()`) لأنّ القيد الذرّيّ يحتاجها. فهذا
 * الحصر **حصرُ شاشةٍ لا حصرُ قاعدة**؛ ومن أراد الإلزام الحقيقيّ فموضعه القواعد.
 */
export const REBUILD_ROLES = ['admin', 'warehouse_manager'];

export function canRebuildBalances(role) {
  return REBUILD_ROLES.includes(role);
}

function whoami(profile) {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
  };
}

/** يقرأ الدفتر كلَّه مرّةً واحدة. */
export async function fetchAllMoves() {
  const s = await getDocs(collection(db, MOVES));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** يقرأ الأرصدة كلَّها مرّةً واحدة. */
export async function fetchAllBalances() {
  const s = await getDocs(collection(db, BALANCES));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * الفحص: يقارن الدفتر بالأرصدة **ولا يكتب شيئًا**.
 * هذه هي الدالّة التي تُشغَّل بحرّية — الكتابة قرارٌ منفصل.
 */
export async function fetchReconciliation() {
  const [moves, balances] = await Promise.all([fetchAllMoves(), fetchAllBalances()]);
  const report = reconcileBalances(moves, balances);
  return { ...report, verdict: migrationVerdict(report), scannedMoves: moves.length };
}

/**
 * إعادة كتابة الأرصدة من الدفتر — **فعلٌ صريح** لا يقع إلّا بطلب.
 *
 * ═══ ما لا تفعله هذه الدالّة عمدًا ═══
 * **لا تمسّ الرصيد اليتيم** (رصيدٌ لا تسنده حركة). قد يكون استيرادًا افتتاحيًّا
 * مشروعًا دخل من إكسل بلا حركات — وتصفيرُه يمحو بضاعةً موجودة على الرفّ.
 * فتُعاد كتابة ما يسنده الدفتر، ويُترك اليتيم **ظاهرًا في التقرير** ليحسمه
 * إنسان. و`migrationVerdict` يمنع ترحيل المفتاح ما دام يتيمٌ قائمًا، فلا يمرّ
 * صامتًا ولا يُمحى صامتًا.
 *
 * @returns {{written:number, untouchedOrphans:number}}
 */
export async function applyRebuild(report, profile) {
  const rows = rebuiltRowsForWrite(report);
  if (!rows.length) return { written: 0, untouchedOrphans: report?.orphan?.length || 0 };

  const stamp = { rebuiltAt: serverTimestamp(), updatedAt: serverTimestamp(), ...whoami(profile) };
  for (let i = 0; i < rows.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const row of rows.slice(i, i + BATCH_LIMIT)) {
      const { id, ...data } = row;
      // كتابةٌ مطلقة لا `increment` — إعادةُ البناء تُثبّت الحقيقة لا تُراكم عليها.
      batch.set(doc(db, BALANCES, id), { ...data, ...stamp }, { merge: true });
    }
    await batch.commit();
  }
  return { written: rows.length, untouchedOrphans: report?.orphan?.length || 0 };
}
