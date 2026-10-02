/**
 * تنفيذُ التعديل المحكوم والمحو — الطبقةُ التي تكتب.
 *
 * ═══ ★★★ ترتيبُ الكتابتين، وهو كلُّ شيء ═══
 * التعديلُ كتابتان: المستندُ، وقيدُ التدقيق. وترتيبُهما ليس تفصيلًا:
 *
 *   · لو كُتب **المستندُ أوّلًا** ثمّ سقطت الشبكةُ قبل القيد ⇒ تعديلٌ وقع
 *     **بلا أثر**. وهذا بعينه ما تمنعه قاعدةُ `contentUnchanged` في الخادم،
 *     فنكون قد أعدنا الثغرةَ من بابٍ آخر.
 *   · فيُكتب **القيدُ أوّلًا**. وإن سقطت الشبكةُ بعده بقي قيدٌ يقول «عُدّل
 *     كذا» وبيانُه لم يتغيّر — وهو **تعارضٌ مرئيٌّ يُسأل عنه**، لا تلاعبٌ
 *     صامت. وبين الاثنين: أثرٌ زائدٌ خيرٌ من أثرٍ ناقص.
 *
 * ولا معاملةَ ذرّيّةٌ تضمّهما؟ لا: القيدُ في مجموعةٍ فرعيّةٍ **ملحق-فقط**
 * وقواعدُها تشترط `byUid == request.auth.uid` و`at == request.time`، ولا
 * تقبل كتابةً داخل معاملةٍ تمسّ الأبَ في الوقت نفسه بالصيغة الحاليّة. فالترتيبُ
 * هو الضمانة المتاحة، وهو المُعلَن.
 *
 * ═══ وما لا يفعله هذا الملفّ ═══
 * لا يُغيّر الحالةَ ولا الرقمَ ولا الهويّة — ولا حتّى يقدر: الحقولُ المكتوبةُ
 * معدودةٌ هنا، و`immutableKept()` و`numberWriteOnce()` في الخادم تحرسانها
 * ولو أخطأ هذا الملفّ. طبقتان لا طبقة.
 */

import { doc, updateDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { appendAudit, getDocument } from './documentsService.js';
import { getSchema } from './schemas/index.js';
import {
  amendVerdict,
  headerDiff,
  linesDiff,
  amendAuditNote,
  hasChanges,
  eligibleForHardDelete,
} from './amendGuard.js';

const DOCS = 'documents';

/**
 * يُعدّل مستندًا خرج من يد صاحبه — بسببٍ مكتوبٍ وقيدِ تدقيقٍ مفصَّل.
 *
 * @param {string} docId
 * @param {{header?:object, lines?:object[], reason:string, profile:object}} payload
 * @returns {Promise<{changed:boolean, headerChanges:object[], lineChanges:object[], note:string}>}
 */
export async function amendDocument(docId, { header, lines, reason = '', profile } = {}) {
  const snap = await getDoc(doc(db, DOCS, docId));
  if (!snap.exists()) throw new Error('المستند غير موجود.');
  const data = snap.data();

  const user = { role: profile?.role || '', uid: profile?.uid || null };
  const verdict = amendVerdict(data, user, { reason });
  if (!verdict.allowed) throw new Error(verdict.problem);

  // التحريرُ الحرُّ ليس من شأن هذه الدالّة: له `saveDocument` بحرّاسِ التأريخ
  // كلِّها. ولو مرّ من هنا لفقد حارسَ التأريخ للماضي — فيُرفض صريحًا.
  if (verdict.cls.id !== 'governed') {
    throw new Error('المسودّةُ تُحفظ بالحفظ العاديّ — وهذه الدالّةُ لما خرج من يد صاحبه.');
  }

  const schema = getSchema(data.type);
  const nextHeader = header === undefined ? data.header : header;
  const nextLines = lines === undefined ? data.lines : lines;
  const headerChanges = headerDiff(data.header, nextHeader, schema);
  const lineChanges = linesDiff(data.lines, nextLines, schema);

  if (!hasChanges(headerChanges, lineChanges)) {
    // لا قيدَ على ضغطةِ حفظٍ بلا تغيير — سجلُّ التدقيق يُقرأ، والضجيجُ يُخفي.
    return { changed: false, headerChanges: [], lineChanges: [], note: '' };
  }

  const note = amendAuditNote({ reason, headerChanges, lineChanges });

  // ① القيدُ أوّلًا — انظر رأس الملفّ.
  await appendAudit(docId, {
    action: 'amend',
    note,
    from: data.state,
    to: data.state,
    profile,
  });

  // ② ثمّ المستند — وبحقولٍ معدودةٍ لا بكائنٍ كامل: `type` و`createdByUid`
  //    و`createdAt` و`number` و`state` لا تُذكر هنا أصلًا، فلا تُمسّ سهوًا.
  const patch = { updatedAt: serverTimestamp() };
  if (header !== undefined) patch.header = nextHeader;
  if (lines !== undefined) patch.lines = nextLines;
  // وسمُ التعديل: يُقرأ في الشاشة والطباعة فيُعرف أنّ المستندَ عُدِّل بعد
  // إرساله — ولا يكتفي بقيدٍ في سجلٍّ لا يفتحه أحد.
  patch.amended = {
    at: serverTimestamp(),
    byUid: profile?.uid || null,
    byName: profile?.name || '',
    byRole: profile?.role || '',
    reason: String(reason || ''),
    count: headerChanges.length + lineChanges.length,
  };

  await updateDoc(doc(db, DOCS, docId), patch);
  return { changed: true, headerChanges, lineChanges, note };
}

/**
 * محوٌ نهائيٌّ لمسوّدةٍ لم تُرقَّم قطّ.
 *
 * ⚠️ **يرتدّ من الخادم حتى ينشر المالكُ رقعةَ القواعد** — القاعدةُ القائمة
 * `allow delete: if false` لكلّ مستند. والواجهةُ لا تعرض الزرّ قبل النشر
 * (`removalOptions`)، وهذه الدالّةُ موجودةٌ ليكون المسارُ تامًّا يومَ يُنشَر
 * — لا لتُستدعى على أمل.
 *
 * ★★ والقيدُ يُكتب **قبل** المحو، وفي مجموعةٍ فرعيّةٍ تُمحى مع أبيها؟ نعم —
 * ولذلك يُكتب قيدٌ ثانٍ في سجلّ نشاطٍ مستقلٍّ إن وُجد. ومع ذلك تبقى مسودّةٌ
 * بلا رقمٍ ولا قيدٍ ولا سلسلةٍ **أقلَّ شيءٍ يستحقّ أثرًا** في هذا النظام،
 * وهو سببُ قصرِ المحو عليها.
 */
export async function hardDeleteDraft(docId, { reason = '', profile } = {}) {
  if (!String(reason).trim()) {
    throw new Error('اكتب سببَ المحو — ولا محوَ بلا سبب.');
  }
  const data = await getDocument(docId);
  if (!data) throw new Error('المستند غير موجود.');
  if (!eligibleForHardDelete(data)) {
    throw new Error(
      'المحوُ لمسوّدةٍ لم تُرقَّم ولم تُقيَّد وحدَها. والمرقَّمُ يُلغى ويبقى أثرُه — فلا تُثقَب أرقامُ التسلسل.'
    );
  }
  const mine = data.createdByUid === profile?.uid;
  if (!mine && profile?.role !== 'admin') {
    throw new Error('المسودّةُ لصاحبها — ولا يمحوها غيره.');
  }

  await appendAudit(docId, {
    action: 'delete',
    note: `محوٌ نهائيٌّ لمسوّدةٍ بلا رقم: ${reason}`,
    from: data.state,
    to: 'deleted',
    profile,
  });
  await deleteDoc(doc(db, DOCS, docId));
  return { deleted: true };
}
