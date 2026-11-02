/**
 * النقلُ بين الأجهزة (المرحلة ن) — تصديرُ حزمةٍ من قاعدة جهازٍ واستيرادُها في
 * آخَر **بمعاينةٍ وكشفِ تعارضٍ ومنعِ تكرار**، لا دهسًا أعمى.
 *
 * ═══ العطبُ القائم ═══
 * النقلُ اليوم اتّجاهٌ واحدٌ (سحابة←جهاز، `importDump.js`): `batch.set` يدهس بلا
 * معاينةٍ ولا كشفِ تعارض — فنسخةُ جهازٍ تمحو نسخةَ آخرَ بصمت.
 *
 * ═══ العلاج ═══
 * تصنيفٌ قبل أيّ كتابة: **جديد · بلا تغيير (دمجٌ/منعُ تكرار) · محدَّث (الواردُ
 * أحدث) · تعارض (نسختان مختلفتان والمحلّيُّ ليس أقدم)**. والتعارضُ **لا يُدهَس**
 * بل يُعرَض ويُحَلّ (إبقاءٌ/أخذٌ) — والافتراضُ إبقاءُ المحلّيّ، فلا يضيع شيءٌ بصمت.
 * والروابطُ (المحلّ/القطاع/العلاقات) محفوظةٌ لأنّ المستندَ يُنقَل كاملًا.
 *
 * منطق خالص: القراءةُ من المخزن وكتابتُه عند المُنادي؛ هنا التصنيفُ والخطّة.
 */

const str = (v) => String(v ?? '');

/** طوابعُ التغيير/المزامنة تُسقَط من مقارنة المحتوى — تغيُّرُها وحدَه ليس تغيُّرَ مضمون. */
const VOLATILE = new Set(['updatedAt', 'updated_at', 'postedAt', 'closedPostedAt', 'syncedAt']);

/** المجموعاتُ الملحقة-فقط (مقدّسة): سجلاتُها ثابتةٌ، فاختلافُ محتوى معرّفٍ تعارضٌ لا تحديث. */
export const APPEND_ONLY = new Set(['audit', 'scans', 'events', 'stock_moves', 'assignments', 'control', 'attachments']);

/** المجموعاتُ المرشَّحةُ للنقل افتراضًا — بياناتُ المحلّ التشغيليّة (للواجهة لا للمنطق). */
export const TRANSFER_COLLECTIONS = Object.freeze([
  'documents', 'Items_Master', 'shops', 'partners', 'bin_locations',
  'balances', 'journal_entries', 'cash_sessions', 'cash_movements', 'partner_ledger',
]);

export const BUNDLE_VERSION = 1;

function isAppendOnlyPath(path) {
  return APPEND_ONLY.has(str(path).split('/').pop());
}

/**
 * ★ مِلّي ثانيةِ قيمةٍ إن كانت طابعًا زمنيًّا بأيّ شكل، وإلّا `null`.
 * يوحّد كلَّ أشكال الطابع عبر حدود المخزن/الـJSON: طابعُ Firestore الحيّ، وكائنُ
 * `makeTimestamp` المحلّيّ، و`{seconds,nanoseconds}` بعد دورة JSON، و`{__ts__}`
 * شكلُ الباب، و`{__type:'timestamp',iso}` الشكلُ المحمول. **بلا هذا التوحيد**
 * تختلف بصمةُ المستند الحيّ عن المنقول فيُصنَّف تعارضًا زائفًا (مراجعةٌ عدائيّة 2026-11-02).
 */
function tsMillis(v) {
  if (v == null || typeof v !== 'object') return null;
  if (typeof v.toMillis === 'function') { try { return v.toMillis(); } catch { /* تجاهل */ } }
  if (typeof v.toDate === 'function') { try { return v.toDate().getTime(); } catch { /* تجاهل */ } }
  if (v.__type === 'timestamp' && v.iso) { const t = Date.parse(v.iso); return Number.isFinite(t) ? t : null; }
  if (v.__ts__ != null) {
    if (typeof v.__ts__ === 'number') return v.__ts__;
    const t = Date.parse(String(v.__ts__));
    return Number.isFinite(t) ? t : null;
  }
  if (typeof v.seconds === 'number' && typeof v.nanoseconds === 'number') {
    const keys = Object.keys(v).filter((k) => k !== 'type');
    if (keys.length === 2) return v.seconds * 1000 + Math.floor(v.nanoseconds / 1e6);
  }
  return null;
}

/** تطبيعٌ للمقارنة: إسقاطُ الطوابع المتقلّبة، وتوحيدُ كلّ طابعٍ إلى مِلّي واحد. */
function normalizeForCompare(v) {
  if (v === null || typeof v !== 'object') return v;
  const ms = tsMillis(v);
  if (ms !== null) return { __ms__: ms };
  if (Array.isArray(v)) return v.map(normalizeForCompare);
  const out = {};
  for (const k of Object.keys(v)) if (!VOLATILE.has(k)) out[k] = normalizeForCompare(v[k]);
  return out;
}

/** تطبيعٌ ثابتٌ للترتيب — مقارنةُ محتوًى لا تتأثّر بترتيب المفاتيح. */
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}

/** بصمةُ محتوى مستندٍ للمقارنة — بلا طوابع التغيير، والطوابعُ موحَّدةٌ مِلّيًّا، مرتّبةً ثابتًا. */
export function contentFingerprint(data) {
  return stableStringify(normalizeForCompare(data));
}

/**
 * ★ شكلٌ محمولٌ للتصدير: كلُّ طابعٍ حيٍّ يصير `{__type:'timestamp',iso}` فيعبر
 * الـJSON بلا فقدِ نوعِه (الدوالُّ تسقط في `JSON.stringify` فتضيع هويّةُ الطابع).
 * يُعاد بناؤه عند الاستيراد عبر `fromExportValue` (نظيرُ `importDump`). منطق خالص.
 */
export function toPortable(v) {
  if (v === null || typeof v !== 'object') return v;
  const ms = tsMillis(v);
  if (ms !== null) return { __type: 'timestamp', iso: new Date(ms).toISOString() };
  if (Array.isArray(v)) return v.map(toPortable);
  const out = {};
  for (const k of Object.keys(v)) out[k] = toPortable(v[k]);
  return out;
}

/** مِلّي ثانيةِ آخرِ تحديثٍ من مستند — من `updatedAt` بأيّ شكلِ طابع، وإلّا 0. */
export function docUpdatedMillis(data) {
  const v = data?.updatedAt ?? data?.updated_at ?? null;
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const ms = tsMillis(v);
  if (ms !== null) return ms;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : 0;
}

/**
 * يبني حزمةَ تصديرٍ من مجموعاتٍ مقروءةٍ من المخزن. **يُرمِّز الطوابعَ محمولةً**
 * (`toPortable`) فلا تُفسَد عبر الـJSON — والمُنادي يُعيد بناءها عند الكتابة.
 * @param collections {path: [{id, data, updatedAt?}]}  (`updatedAt` مِلّي؛ يُشتقّ إن غاب)
 */
export function buildTransferBundle(collections = {}, { device = '', exportedAt = 0 } = {}) {
  const out = {};
  let docCount = 0;
  for (const [path, docs] of Object.entries(collections || {})) {
    out[path] = (Array.isArray(docs) ? docs : []).map((d) => ({
      id: str(d?.id),
      data: toPortable(d?.data ?? {}),
      updatedAt: Number(d?.updatedAt) || docUpdatedMillis(d?.data),
    }));
    docCount += out[path].length;
  }
  return { version: BUNDLE_VERSION, device: str(device), exportedAt: Number(exportedAt) || 0, docCount, collections: out };
}

/**
 * خطّةُ الاستيراد — معاينةٌ تُصنّف كلَّ واردٍ ولا تكتب شيئًا.
 * @param bundle حزمةُ `buildTransferBundle`
 * @param localByCollection {path: Map(id -> {data, updatedAt?})} من قاعدة الجهاز المستقبِل
 */
export function planTransferImport(bundle, localByCollection = {}) {
  const items = [];
  for (const [path, docs] of Object.entries(bundle?.collections || {})) {
    const localMap = localByCollection?.[path] instanceof Map ? localByCollection[path] : new Map();
    const appendOnly = isAppendOnlyPath(path);
    for (const inc of Array.isArray(docs) ? docs : []) {
      const id = str(inc?.id);
      if (!id) continue;
      const local = localMap.get(id) || null;
      const incomingAt = Number(inc?.updatedAt) || docUpdatedMillis(inc?.data);
      const localAt = local ? (Number(local.updatedAt) || docUpdatedMillis(local.data)) : 0;
      let status;
      if (!local) status = 'new';
      else if (contentFingerprint(local.data) === contentFingerprint(inc?.data)) status = 'unchanged';
      else if (appendOnly) status = 'conflict'; // ملحق-فقط تغيّر محتواه = تعارضٌ لا يُدهَس
      else if (incomingAt > localAt) status = 'update'; // الواردُ أحدثُ صراحةً
      else status = 'conflict'; // محتوًى مختلفٌ والمحلّيُّ أحدثُ أو مساوٍ — قرارُ المستخدم
      items.push({
        key: `${path}/${id}`,
        path, id, status, appendOnly,
        incoming: inc?.data ?? {}, local: local?.data ?? null,
        incomingAt, localAt,
      });
    }
  }
  const by = (s) => items.filter((i) => i.status === s).length;
  const summary = { total: items.length, new: by('new'), update: by('update'), unchanged: by('unchanged'), conflict: by('conflict') };
  return {
    items,
    summary,
    device: str(bundle?.device),
    // قابلٌ للتطبيق إن وُجد ما يُطبَّق تلقائيًّا (جديدٌ أو محدَّث)؛ التعارضُ يحتاج حلًّا.
    actionable: summary.new + summary.update,
  };
}

/**
 * تطبيقُ الخطّة ⟵ عمليّاتُ كتابةٍ يكتبها المُنادي عبر الباب.
 * الجديدُ يُضاف دائمًا؛ والمحدَّثُ يُؤخَذ افتراضًا (الواردُ أحدث) ويُمكن إبقاؤه؛
 * والتعارضُ **يُبقي المحلّيَّ افتراضًا** ولا يُؤخَذ إلّا بقرارٍ صريح — فلا دهسَ صامت.
 *
 * ★ **والملحق-فقط مقدّسٌ**: سجلٌّ ملحق-فقطُ تعارضَ محتواه **لا يُدهَس أبدًا** ولو
 *   طُلب أخذُه — فتعارضُه انحرافُ بياناتٍ يُحقَّق لا يُمحى (يُحصى `appendOnlyBlocked`).
 *   أمّا الجديدُ الملحق-فقط فيُضاف (إلحاقٌ لا دهس).
 * @param resolutions {key: 'take'|'keep'}  (المفتاحُ `path/id`)
 */
export function applyTransferPlan(plan, { resolutions = {} } = {}) {
  const ops = [];
  const report = { applied: 0, added: 0, updated: 0, conflictsTaken: 0, conflictsKept: 0, appendOnlyBlocked: 0, unchanged: 0 };
  const op = (it) => ops.push({ collectionPath: it.path, id: it.id, data: it.incoming });
  for (const it of plan?.items || []) {
    const choice = resolutions[it.key];
    if (it.status === 'new') { op(it); report.added += 1; report.applied += 1; }
    else if (it.status === 'update') {
      if (choice === 'keep') { /* أبقى المحلّيَّ */ } else { op(it); report.updated += 1; report.applied += 1; }
    } else if (it.status === 'conflict') {
      if (choice === 'take' && it.appendOnly) report.appendOnlyBlocked += 1; // مقدّسٌ لا يُدهَس
      else if (choice === 'take') { op(it); report.conflictsTaken += 1; report.applied += 1; }
      else report.conflictsKept += 1;
    } else report.unchanged += 1;
  }
  return { ops, report };
}
