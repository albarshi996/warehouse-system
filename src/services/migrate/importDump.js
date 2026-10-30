/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  المُرحِّل — يملأ قاعدةَ الجهاز (kv_docs) من تصدير Firebase (م٣ · الفصل)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * الهدف: **الاستقلالُ عن قوقل** — تُصدَّر بياناتُ Firebase مرّةً (`firestore-export.mjs`
 * إلى `db/dump/*.ndjson`)، ثمّ يصبُّها هذا المُرحِّلُ في قاعدة الجهاز المحلّيّة عبر
 * الباب، فيصير الجهازُ مصدرَ الحقيقة ويُقطع الاعتمادُ على Firebase.
 *
 * ★★★ **نسخٌ لا نقل، باتّجاهٍ واحد**: يقرأ التصديرَ ويكتب محلّيًّا؛ لا يمسّ Firebase.
 *     والكتابةُ عبر الباب (`writeBatch`) فتُعاد استعمالُ ترميزِ القيم المُختبَر —
 *     فالطوابعُ تصير `{__ts__}` التي يفهمها المحوّلُ، لا يُخترع ترميزٌ ثانٍ.
 *
 * ★★ **محايدُ الخلفيّة ومُختبَر**: يأخذ بابًا يحقّق عقدَ Firestore (في الإنتاج
 *    `local-sqlite`، في الاختبار `createLocalDb`)، فيُبرهَن على بياناتٍ وهميّةٍ بلا
 *    جهازٍ ولا تصديرٍ حيّ — ثمّ على SQLite حقيقيّة.
 *
 * ★ **خاملٌ حتّى القطع**: لا مستدعيَ حيٌّ بعد؛ يُشغَّل مرّةً عند T0 بأمر المالك،
 *   ثمّ تُطابَق الأعدادُ (`reconcileCounts`) بصفر فرقٍ شرطَ العبور قبل قلب الراية.
 */

/**
 * يحوّل قيمةَ التصدير (serialize في `firestore-serialize.mjs`) إلى قيمةٍ يفهمها
 * الباب المحلّيّ: الطابعُ الموسومُ `{__type:'timestamp',iso}` يصير طابعَ الباب (فيُرمَّز
 * `{__ts__}`)، وبقيّةُ الأنواع الخاصّة تُبسَّط (geopoint/bytes/ref). غيرُها يُمرَّر.
 */
export function fromExportValue(v, Timestamp) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => fromExportValue(x, Timestamp));
  switch (v.__type) {
    case 'timestamp':
      return Timestamp.fromMillis(new Date(v.iso).getTime());
    case 'geopoint':
      return { lat: v.lat, lng: v.lng };
    case 'bytes':
      return { b64: v.b64 };
    case 'ref':
      return v.path; // المرجعُ مسارًا نصّيًّا
    default:
      break;
  }
  const out = {};
  for (const [k, val] of Object.entries(v)) out[k] = fromExportValue(val, Timestamp);
  return out;
}

/**
 * يحلّل سطرَ NDJSON من ملفِّ تصديرٍ إلى مدخلِ إدخالٍ `{collectionPath, id, data}`.
 * اسمُ الملفّ (بلا `.ndjson`) هو المسارُ بـ`__` بدل `/`: `operations__scans` ⟵ فرعيّةٌ
 * تُعادُ `operations/<__parent>/scans`. الأعمقُ من مستوًى واحدٍ غيرُ مدعومٍ في م٣.
 */
export function parseDumpEntry(fileBase, line) {
  const { __id, __parent, ...data } = JSON.parse(line);
  const segs = String(fileBase).split('__');
  let collectionPath;
  if (segs.length === 1) {
    collectionPath = segs[0];
  } else if (segs.length === 2) {
    if (!__parent) throw new Error(`صفٌّ فرعيٌّ بلا __parent في «${fileBase}»`);
    collectionPath = `${segs[0]}/${__parent}/${segs[1]}`;
  } else {
    throw new Error(`مسارٌ فرعيٌّ أعمقُ من مستوًى لا يُدعم في م٣: «${fileBase}»`);
  }
  return { collectionPath, id: String(__id), data };
}

/** يقسّم مصفوفةً إلى دفعاتٍ بحجمٍ ثابت. */
function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * يُدخل مدخلاتِ الإدخال إلى المخزن عبر الباب، دفعةً دفعةً (ذرّيّةٌ لكلّ دفعة).
 * يُعيد عددَ ما أُدخل. لا يحذف شيئًا (نسخٌ لا نقل).
 */
export async function importDocuments(door, entries, { chunkSize = 400, onProgress } = {}) {
  const T = door.Timestamp;
  let imported = 0;
  for (const slice of chunks(Array.isArray(entries) ? entries : [], chunkSize)) {
    const batch = door.writeBatch();
    for (const e of slice) {
      batch.set(door.doc(door.db, e.collectionPath, e.id), fromExportValue(e.data, T));
    }
    await batch.commit();
    imported += slice.length;
    if (onProgress) onProgress({ imported, total: entries.length });
  }
  return { imported };
}

/**
 * مطابقةٌ من جرد التصدير مقابل أعداد kv_docs الفعليّة (`{collection: count}`):
 * المسارُ العلويُّ (`items`) يُطابَق مباشرةً، والفرعيُّ (`operations/scans` كما في
 * الجرد) يُجمَع من كلّ مجموعاته المُعادةِ البناءِ `operations/<id>/scans`. فيُقارَن
 * المجموعُ بما صدّره الجردُ — **صفرُ فرقٍ شرطَ العبور**. دالّةٌ خالصةٌ تُختبَر نصًّا.
 *
 * @param {Record<string, number>} expected مسارُ الجرد ⟵ عدده
 * @param {Record<string, number>} actual   مجموعةُ kv_docs ⟵ عددها (من GROUP BY)
 */
export function expandCounts(expected, actual) {
  const rows = [];
  let allMatch = true;
  for (const [path, want] of Object.entries(expected || {})) {
    const segs = String(path).split('/');
    let got;
    if (segs.length === 1) {
      got = Number(actual[path]) || 0;
    } else if (segs.length === 2) {
      // يجمع `parent/<أيّ معرّفٍ بلا شرطة>/child`.
      const re = new RegExp(`^${esc(segs[0])}/[^/]+/${esc(segs[1])}$`);
      got = 0;
      for (const [col, n] of Object.entries(actual)) if (re.test(col)) got += Number(n) || 0;
    } else {
      got = -1; // أعمقُ من مستوًى: غيرُ مدعومٍ في م٣ (يُعلَن لا يُبتلع)
    }
    if (got !== want) allMatch = false;
    rows.push({ path, want, got, diff: got - want });
  }
  return { allMatch, rows };
}

function esc(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * مطابقةُ الأعداد: لكلّ مسارِ مجموعةٍ متوقَّعٍ (`{collectionPath: count}`) يقارن ما في
 * المخزن بما يُنتظَر — **صفرُ فرقٍ شرطَ العبور** قبل قلب الراية (درسُ أودو: الرقمُ
 * المُطابَقُ وحدَه بيّنة). يُعيد الصفوفَ وراية `allMatch`.
 */
export async function reconcileCounts(door, expected) {
  const rows = [];
  let allMatch = true;
  for (const [collectionPath, want] of Object.entries(expected || {})) {
    const snap = await door.getDocs(door.collection(door.db, collectionPath));
    const got = snap.size;
    if (got !== want) allMatch = false;
    rows.push({ collectionPath, want, got, diff: got - want });
  }
  return { allMatch, rows };
}
