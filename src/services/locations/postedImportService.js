/**
 * ‹SRC-POST› تنفيذ الاستيراد المُرحِّل على البيانات الحيّة — الغلاف السحابيّ لـ`postedImport.js`.
 *
 * المستندُ المستورد يمرّ **بالمسار الرسميّ نفسه** لا بطريقٍ جانبيّ: مسودّةٌ ⟵ إرسالٌ (رقمٌ
 * رسميّ) ⟵ اعتمادٌ ⟵ إنجازٌ يقيّد الأثرَ في معاملةٍ واحدة. فكلُّ حارسٍ يحرس المستندَ اليدويّ
 * يحرس هذا: الرصيدُ السالب، والقيدُ المزدوج، وتدقيقُ كلّ نقلة.
 *
 * ═══ منعُ التكرار — بنيويٌّ وقابلٌ للاستئناف ═══
 *   source_imports/{POSTED__ODOO__<المرجع>}  ← يُكتب **قبل** المستند ويحمل معرّفَه
 *
 * الترتيبُ عكسُ صندوق الأوامر عمدًا. هناك تُختم البصمةُ بعد الإنشاء لأنّ أسوأ ما يقع
 * مسودّةٌ مكرّرة يلغيها أحد؛ وهنا أسوأُ ما يقع **تسليمٌ يُرحَّل مرّتين** فيُنقص الرصيدَ
 * مرّتين. فالسجلُّ أوّلًا بمعرّفٍ محجوز، ثمّ المستندُ بذلك المعرّف. وانقطاعٌ في أيّ
 * خطوةٍ يُستأنف من حيث وقف: السجلُّ يدلّ على المستند، والمستندُ يعرف حالتَه، و`posted`
 * يمنع القيدَ الثاني داخل المعاملة.
 *
 * ═══ ميزانيةُ القراءة ═══
 * لكلّ مستند: سجلُّه (١) · إنشاؤه (١) · ثلاثُ نقلاتٍ (٣) · العدّاد (١) · المعاملة (١)
 * · رصيدُ كلّ بندٍ مُنقِص · بطاقةُ كلّ صنفٍ **مرّةً للدفعة**. والشجرةُ التنظيميّة مرّةً
 * للدفعة كلّها (`createPostingCache`) لا ~١٥٥ قراءةً لكلّ مستند.
 */
import { collection, doc, documentId, getDoc, getDocs, query, runTransaction, serverTimestamp, where, db } from '../_db/index.js';
import { auth } from '../../config/firebase.js';
import { importSheet } from '../excel/excelImport.js';
import { createDraft, newDocumentId, transitionDocument } from '../documents/documentsService.js';
import { getSchema } from '../documents/schemas/index.js';
import { createPostingCache } from '../ledger/ledgerService.js';
import { chunksOf } from './scopedQuery.js';
import { buildPostedPreview, postedMarker, toPostedDraft, POSTED_KIND } from './postedImport.js';

const COL = 'source_imports';
const DOCS = 'documents';

/**
 * ‹SRC-POST› مفتاحُ الإطفاء — بابان: الثابتُ هنا (نشرةٌ تُطفئه للجميع)، وعلَمٌ في
 * المتصفّح (`localStorage['bz.postedImport.off'] = '1'`) يُطفئه على جهازٍ بلا نشر.
 * ومُطفأً يختفي التبويبُ وترفض الخدمةُ الترحيلَ — فلا يبقى زرٌّ يكتب في الخفاء.
 */
export const POSTED_IMPORT_ENABLED = true;
export const POSTED_IMPORT_OFF_FLAG = 'bz.postedImport.off';

export function postedImportEnabled() {
  if (!POSTED_IMPORT_ENABLED) return false;
  try {
    return globalThis.localStorage?.getItem(POSTED_IMPORT_OFF_FLAG) !== '1';
  } catch {
    return true;
  }
}

/**
 * من يُرحِّل: المديرُ العامّ ومديرُ المستودع — أضيقُ من صندوق الأوامر عمدًا. فالترحيلُ
 * يعتمد ويُنجز، ومدقّقُ الجرد لا يملك الاعتماد؛ ولو أُظهر له الزرّ لتوقّف كلُّ مستندٍ
 * عند «مُرسَل» بعد أن أُنشئ ورُقّم.
 */
export const POSTED_IMPORT_ROLES = ['admin', 'warehouse_manager'];

export function canPostImport(role) {
  return POSTED_IMPORT_ROLES.includes(role);
}

export function whoami(profile) {
  return {
    importedByUid: auth?.currentUser?.uid || null,
    importedByName: profile?.name || auth?.currentUser?.email || 'غير معروف',
    importedByRole: profile?.role || '',
  };
}

/**
 * سجلّاتُ منع التكرار لمستندات الورقة — بمعرّفاتها ثلاثين ثلاثين، ومعها حالُ مستنداتها.
 * المستندُ يُقرأ لمن له سجلٌّ وحده: في الرفع الأوّل صفرُ قراءةٍ هنا.
 * ‹ODOO-ORD› و`kind` يفصل سجلّاتِ المستندات المنجَزة عن سجلّات الأوامر؛ و`sourceUpdatedAt`
 * من رأس المستند الحاليّ — به يُعرف أنّ الأمرَ تغيّر في أودو منذ آخر استيراد.
 */
export async function fetchKnown(markerIds, kind = POSTED_KIND) {
  const ids = [...new Set(markerIds.filter(Boolean))];
  const snaps = await Promise.all(
    chunksOf(ids).map((chunk) => getDocs(query(collection(db, COL), where(documentId(), 'in', chunk))))
  );
  const markers = snaps.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).filter((m) => m.kind === kind);
  const known = new Map();
  await Promise.all(
    markers.map(async (m) => {
      const snap = m.documentId ? await getDoc(doc(db, DOCS, m.documentId)) : null;
      const data = snap?.exists() ? snap.data() : null;
      known.set(m.id, {
        documentId: m.documentId || '', exists: Boolean(data), posted: Boolean(data?.posted), state: data?.state || '',
        sourceUpdatedAt: data?.header?.sourceUpdatedAt || '',
      });
    })
  );
  return known;
}

/**
 * يقرأ الورقة ويبني المعاينة — **بلا أيّ كتابة**.
 */
export async function analyzePostedFile(file) {
  const result = await importSheet(file, 'sourcePosted', { sheetName: 'SourcePosted' });
  const rows = result?.rows || [];
  const first = buildPostedPreview(rows, { sheetErrors: result?.errors });
  const known = await fetchKnown(first.documents.map((d) => d.markerId));
  const preview = known.size ? buildPostedPreview(rows, { known, sheetErrors: result?.errors }) : first;
  return {
    ...preview,
    fileName: file?.name || '',
    sheetName: result?.summary?.sheetName || 'SourcePosted',
    missingColumns: result?.summary?.missingColumns || [],
  };
}

/**
 * السجلُّ أوّلًا ثمّ المستند (انظر رأس الملفّ). يُعيد معرّفَ المستند وحالتَه.
 * وإن سبقنا مستخدمٌ آخرُ إلى السجلّ أخذنا مستندَه لا أنشأنا ثانيًا.
 * ‹ODOO-ORD› `marker` و`draft` يُمرَّران لأوامر أودو — والافتراضيُّ مستندُ المصدر المنجَز.
 */
export async function ensureDocument(d, profile, stamp, { marker = postedMarker, draft: toDraft = toPostedDraft } = {}) {
  let id = d.documentId;
  let fresh = false;
  if (!id) {
    const reserved = newDocumentId();
    const markerRef = doc(db, COL, d.markerId);
    id = await runTransaction(db, async (tx) => {
      const snap = await tx.get(markerRef);
      if (snap.exists()) return snap.data().documentId;
      tx.set(markerRef, { ...marker(d, reserved), importedAt: serverTimestamp(), ...stamp });
      return reserved;
    });
    fresh = id === reserved;
  }

  if (!fresh) {
    const snap = await getDoc(doc(db, DOCS, id));
    if (snap.exists()) return { id, state: snap.data().state, posted: Boolean(snap.data().posted) };
  }
  const draft = toDraft(d);
  await createDraft({ type: draft.type, profile, header: draft.header, lines: draft.lines, id });
  return { id, state: 'draft', posted: false };
}

/** النقلاتُ الباقية من حالةٍ إلى «منجَز» — وما سواها يُعالَج بيدٍ لا آليًّا. */
const PATH = { draft: ['submitted', 'approved', 'done'], submitted: ['approved', 'done'], approved: ['done'] };

/**
 * يرحّل مستندات المعاينة واحدًا واحدًا. **فشلُ مستندٍ لا يوقف إخوتَه** — يُسجَّل بسببه
 * ويبقى في حالته فيُستأنف في الرفع التالي.
 *
 * @param {(p:{index:number,total:number,docRef:string,step:string}) => void} [onProgress]
 * @returns {Promise<{posted:Array, already:Array, failed:Array}>}
 */
export async function commitPostedImport(preview, profile, { onProgress } = {}) {
  if (!postedImportEnabled()) throw new Error('الاستيراد المُرحِّل مُطفأ (مفتاح الإطفاء).');
  if (!canPostImport(profile?.role)) throw new Error('الترحيل مقصورٌ على المدير العامّ ومدير المستودع.');
  if (preview?.errors?.length) throw new Error('لا يُرحَّل ملفٌّ فيه خطأ — صحّح الورقة وأعد رفعها.');
  if (!preview?.ok) throw new Error('لا شيء يُرحَّل — كلُّ مستندات الورقة مُرحَّلةٌ سلفًا أو محجوبة.');

  const stamp = whoami(profile);
  const cache = createPostingCache();
  const todo = preview.documents.filter((d) => d.status === 'new' || d.status === 'resume');
  const out = { posted: [], already: [], failed: [] };

  for (const [index, d] of todo.entries()) {
    const report = (step) => onProgress?.({ index, total: todo.length, docRef: d.docRef, step });
    let id = d.documentId || '';
    try {
      report('ينشئ');
      const cur = await ensureDocument(d, profile, stamp);
      id = cur.id;
      if (cur.posted) {
        out.already.push({ docRef: d.docRef, documentId: id });
        continue;
      }
      const steps = PATH[cur.state];
      if (!steps) throw new Error(`المستند في حالة «${cur.state}» — يُعالَج يدويًّا لا آليًّا.`);
      const schema = getSchema(d.type);
      let number = null;
      for (const to of steps) {
        report(to === 'done' ? 'يرحّل' : to === 'approved' ? 'يعتمد' : 'يرسل');
        number = (await transitionDocument(id, to, { profile, schema, postingCache: cache, note: 'استيرادٌ مُرحِّل من المصدر' })) || number;
      }
      out.posted.push({ docRef: d.docRef, documentId: id, number, type: d.type, lines: d.lines.length });
    } catch (err) {
      out.failed.push({ docRef: d.docRef, documentId: id, error: err?.message || String(err) });
    }
  }
  return out;
}
