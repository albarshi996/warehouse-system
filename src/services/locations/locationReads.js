/**
 * ‹LOC-READS› قراءةُ سيّد المواقع بقدر ما يُعرض — منطقٌ خالص، بلا Firebase ولا متصفّح.
 *
 * ═══ العطبُ الذي وُجد لأجله (كونسول Firebase 2026-10-20) ═══
 * `bin_locations` كانت صفرًا ثمّ صارت **8,402 خانة** في ليلةٍ واحدة (توليدُ الخانات).
 * وكانت ثلاثَ عشرةَ شاشةً تستمع لها **كاملةً عند الفتح** — منها محرّكُ المستندات
 * نفسُه في **كلّ مستندٍ يُفتح**، وتبويبُ المستودعات الأوّل، وشاشةُ الجرد على الهاتف.
 * فتجاوزت قراءاتُ يومٍ واحدٍ 57 ألفًا على خطّة Spark (50 ألفًا)، منها 25 ألفًا في
 * ساعةٍ ونصفٍ بلا استيرادٍ واحد. وكانت المجموعةُ صفرًا يوم كُتبت الشاشات فلم يُرَ شيء.
 *
 * ═══ والعلاجُ بقاعدةٍ واحدة: الشاشةُ تقرأ ما تعرضه ═══
 *  · خانةٌ واحدةٌ تُعرض ⇒ تُقرأ هي (بمعرّفها: الكودُ هو المعرّف).
 *  · مستودعٌ يُعرض ⇒ خاناتُه (`warehouse ==`) — **بعد** أن يُختار، لا قبله.
 *  · أكوادٌ مكتوبةٌ في مستندٍ أو ورقة ⇒ تلك الأكواد (`documentId() in`) ثلاثين ثلاثين.
 *  · عدٌّ يُعرض ⇒ عدٌّ من الخادم (ألفُ مدخلٍ بقراءة) لا قراءةُ المعدود.
 *
 * ═══ ★★★ والحكمُ لا يتغيّر — وهذا أصعبُ ما فيه ═══
 * أحكامٌ كثيرةٌ في الشجرة تقول «بلا مواقعَ معرَّفةٍ لا يُحكم على أحد»: `binCellVerdict`
 * و`binProblem` و`assignmentReport` و`suggestLocations` و`replenishPlan`. فلو قُرئت
 * الأكوادُ المطلوبةُ وحدَها ولم يوجد منها شيء، لَظنّ الحكمُ أنّ السيّدَ فارغٌ فسكت —
 * ورفٌّ لا وجودَ له يمرّ بلا تنبيه. فيُقرأ معها **شاهدٌ**: خانةٌ حقيقيّةٌ واحدة
 * (`limit(1)`) تُثبت أنّ السيّدَ غيرُ فارغ. والقائمةُ المقصورةُ = المطلوبُ ∪ الشاهد،
 * فيُعطي كلُّ حكمٍ لكلّ كودٍ مطلوبٍ ما كان يعطيه للقائمة كلِّها حرفًا. ويحرس ذلك
 * `locationReads.test.js` بعالمٍ يُحسب فيه الاثنان ويُقارَنان، مُثبَتًا بالنقض.
 *
 * ═══ مفتاحُ الإطفاء وطريقُ الرجوع ═══
 *  · `localStorage['bz.locations.fullReads'] = '1'` يُعيد السلوكَ القديمَ حرفًا
 *    (المستمعَ الكاملَ عند الفتح) في **كلّ** الشاشات في ذلك المتصفّح — بلا نشر.
 *  · أو قائمةُ شاشاتٍ مفصولةٌ بفواصل (`'bin-console,pick-plan'`) تُعيده فيها وحدَها.
 *  · و`SCOPED_LOCATION_READS = false` هنا يُعيده للجميع بكوميتٍ من سطرٍ واحد.
 */
import { locationCodeProblem, normalizeLocationCode } from './locationCode.js';
import { binCellVerdict } from './locationsModel.js';
import { allocateFefo } from '../ledger/reservations.js';

/** مفتاحُ الإطفاء للجميع — `false` يُعيد المستمعين الكاملين في كلّ متصفّح. */
export const SCOPED_LOCATION_READS = true;

/** مفتاحُ الإطفاء لمتصفّحٍ واحد — `'1'` للكلّ، أو أسماءُ شاشاتٍ مفصولةٌ بفواصل. */
export const LOCATION_READS_KEY = 'bz.locations.fullReads';

/** أسماءُ الشاشات كما تُكتب في المفتاح — اسمٌ واحدٌ لكلّ موضعٍ يقرأ الخانات. */
export const LOCATION_SCREENS = Object.freeze({
  documents: 'documents',
  fieldRelease: 'field-release',
  warehouses: 'warehouses',
  locationTree: 'location-tree',
  locationMap: 'location-map',
  binConsole: 'bin-console',
  pickPlan: 'pick-plan',
  locationBuilder: 'location-builder',
  binAssignment: 'bin-assignment',
  lpnReceiving: 'lpn-receiving',
  workerTask: 'worker-task',
  scanFlow: 'scan',
  stockReconcile: 'stock-reconcile',
});

const up = (v) => String(v ?? '').trim().toUpperCase();

/**
 * أمُطفأةٌ القراءةُ المقصورة لهذه الشاشة؟ — ولا يرمي أبدًا: تخزينٌ محظورٌ
 * (تصفّحٌ خاصّ) يعني «لا مفتاح»، فيبقى السلوكُ الجديد.
 *
 * @param {string} screen أحدُ `LOCATION_SCREENS`
 * @param {{getItem:(k:string)=>string|null}|null} storage
 */
export function fullLocationReads(screen, storage) {
  if (!SCOPED_LOCATION_READS) return true;
  let raw = null;
  try {
    raw = storage?.getItem?.(LOCATION_READS_KEY) ?? null;
  } catch {
    return false;
  }
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return false;
  if (value === '1' || value === 'all' || value === 'true') return true;
  return value.split(/[\s,]+/).filter(Boolean).includes(String(screen ?? '').toLowerCase());
}

/** بادئةُ الخانة (= `warehouse` عليها) — أوّلُ مقطعٍ من كودها القياسيّ. */
export function prefixOfCode(code) {
  const c = normalizeLocationCode(code);
  return c ? c.split('-')[0] : '';
}

/**
 * أيصلح هذا الكودُ معرّفَ مستندٍ في Firestore؟ — `documentId() in` يرمي على
 * معرّفٍ باطل، فكودٌ فيه `/` (كتبه مستخدمٌ خطأً) يُسقط الاستعلامَ كلَّه. وكودٌ لا
 * يكون معرّفًا لا يكون خانةً أصلًا، فحكمُه «غير مسجَّل» بلا قراءة.
 */
export function isQueryableCode(code) {
  const c = String(code ?? '');
  if (!c || c.length > 700) return false;
  if (c.includes('/')) return false;
  if (c === '.' || c === '..') return false;
  if (/^__.*__$/.test(c)) return false;
  return true;
}

/** الأكوادُ المطلوبةُ مطبَّعةً بلا تكرار ولا باطل — مرتّبةً ليثبت مفتاحُ القراءة. */
export function codesToRead(codes) {
  return [...new Set((codes || []).map(normalizeLocationCode).filter(isQueryableCode))].sort();
}

const byCode = (a, b) => {
  const x = String(a?.code ?? '');
  const y = String(b?.code ?? '');
  return x < y ? -1 : x > y ? 1 : 0;
};

/** ترتيبُ المستمع القديم (`orderBy('code')`) — به يُحسم «الأوّلُ يفوز» في كلّ `find`. */
export function sortByCode(list) {
  return [...(list || [])].sort(byCode);
}

/**
 * القائمةُ المقصورة — المقروءُ ∪ الشاهد، بلا تكرارٍ وبترتيب الكود.
 *
 * ★★★ الشاهدُ خانةٌ حقيقيّة لا مستندٌ مُخترَع: إن صادف كودًا مطلوبًا فهو هو، وإن
 * لم يصادف فلا حكمَ يقرؤه إلّا ليعرف أنّ السيّدَ غيرُ فارغ — وكلُّ `find` على كودٍ
 * مطلوبٍ يجده في المقروء قبله أو بعده سواء، لأنّ الكودَ هويّةٌ لا تتكرّر.
 */
export function withWitness(found, witness) {
  const seen = new Map();
  for (const l of [...(found || []), ...(witness ? [witness] : [])]) {
    const code = normalizeLocationCode(l?.code ?? l?.id);
    if (!code || seen.has(code)) continue;
    seen.set(code, l);
  }
  return sortByCode([...seen.values()]);
}

/** دمجُ مستنداتٍ من استعلاماتٍ عدّة بمعرّفها — الأوّلُ يفوز. */
export function mergeById(...lists) {
  const seen = new Map();
  for (const list of lists) for (const d of list || []) if (d && !seen.has(d.id)) seen.set(d.id, d);
  return [...seen.values()];
}

/**
 * حالُ الأكواد المطلوبة: ما قُرئ منها وما لم يُقرأ بعد.
 *
 * ★ «لم يُقرأ بعد» غيرُ «غير موجود»: الأوّلُ يعامَل كما كانت القائمةُ الكاملةُ
 * قبل وصولها (فارغةً ⇒ لا حكم)، والثاني يُحكم عليه. وبغير هذا الفرق يرى من يكتب
 * كودًا صحيحًا «غير مسجَّل» لحظةً حتّى تعود القراءة — إنذارٌ كاذبٌ يُعلّم التجاهل.
 *
 * @param {Map<string, object|null>} resolved كودٌ ⟵ خانتُه أو `null` إن لم توجد
 */
export function isResolved(resolved, code) {
  const c = normalizeLocationCode(code);
  if (!c) return true;
  if (!isQueryableCode(c)) return true;
  return resolved instanceof Map && resolved.has(c);
}

/** الخاناتُ الموجودةُ من المقروء — لـ`withWitness`. */
export function foundOf(resolved) {
  return [...(resolved instanceof Map ? resolved.values() : [])].filter(Boolean);
}

/**
 * ‹LOC-704› ذاكرةُ أكواد البادئة — **والإثباتُ أنّها تامّة**.
 *
 * ★★★ `bin_locations` **ملحقةٌ فقط في هويّتها**: `allow delete: if false` في
 * `firestore.rules`، والكودُ هو المعرّف فلا يتغيّر. فالأكوادُ المحفوظةُ أمسِ
 * **جزءٌ** من أكواد اليوم لا محالة. فإن ساوى عددُها عددَ الخادم اليوم (ألفُ مدخلٍ
 * بقراءةٍ واحدة) فهي **هي** — مجموعةٌ جزئيّةٌ بحجم الكلّ هي الكلّ. وإلّا قُرئت.
 *
 * والعددُ الأقلّ من المحفوظ مستحيلٌ بالقاعدة — فإن وقع (حذفٌ من خارج البوّابة)
 * أُعيدت القراءةُ أيضًا ولم يُصدَّق المحفوظ.
 *
 * @param {{codes:string[]}|null} cached
 * @param {number|null} count عددُ الخادم الآن، أو `null` إن تعذّر العدّ
 * @returns {boolean} أتُستعمل الذاكرةُ بلا قراءة؟
 */
export function codeIndexIsFresh(cached, count) {
  if (!cached || !Array.isArray(cached.codes)) return false;
  if (!Number.isFinite(count) || count < 0) return false;
  return new Set(cached.codes).size === count;
}

/** مفتاحُ ذاكرة الأكواد في المتصفّح. النسخةُ في الاسم: تغييرُ الشكل يُبطل القديم بلا ترحيل. */
export const CODE_INDEX_KEY = 'bz.binCodes.v1';

function readAllCodeIndexes(storage) {
  try {
    const raw = storage?.getItem?.(CODE_INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** أكوادُ بادئةٍ محفوظة — أو `null` عند أيّ شكّ (والرجوعُ إلى الخادم أرخصُ من الخطأ). */
export function readCodeIndex(storage, prefix) {
  const entry = readAllCodeIndexes(storage)[up(prefix)];
  if (!entry || !Array.isArray(entry.codes) || !entry.codes.every((c) => typeof c === 'string')) return null;
  return { codes: entry.codes, at: Number(entry.at) || 0 };
}

/** يحفظ أكوادَ بادئة — وامتلاءُ التخزين لا يرمي (الذاكرةُ تسريعٌ لا مصدرُ حقيقة). */
export function writeCodeIndex(storage, prefix, codes, now = Date.now()) {
  const p = up(prefix);
  if (!p) return;
  const all = readAllCodeIndexes(storage);
  all[p] = { codes: [...new Set(codes || [])].sort(), at: now };
  try {
    storage?.setItem?.(CODE_INDEX_KEY, JSON.stringify(all));
  } catch {
    /* تخزينٌ ممتلئٌ أو محظور — تُقرأ من الخادم في المرّة القادمة */
  }
}

/**
 * يضمّ أكوادًا كُتبت للتوّ إلى المحفوظ — فالعدُّ التالي يطابق ولا تُعاد قراءةُ البادئة.
 * ★ ولا يُضمّ إلى غير موجود: ذاكرةٌ بلا أصلٍ مقروءٍ لا تُصنع من كتابةٍ وحدها.
 */
export function mergeCodeIndex(storage, prefix, codes, now = Date.now()) {
  const cached = readCodeIndex(storage, prefix);
  if (!cached) return;
  writeCodeIndex(storage, prefix, [...cached.codes, ...codesInPrefix((codes || []).map((code) => ({ code })), prefix)], now);
}

/**
 * أكوادُ بادئةٍ تامّةً بأرخص طريق — العدُّ أوّلًا، والقراءةُ إن لم يصدّق المحفوظ.
 * والقرّاءُ يُحقنون فيُختبر الحكمُ بلا سحابة.
 *
 * @param {{prefix:string, storage:object, count:(p:string)=>Promise<number>, fetchRows:(p:string)=>Promise<object[]>, now?:number}} p
 * @returns {Promise<{codes:string[], source:'memory'|'server'}>}
 */
export async function prefixCodesVia({ prefix, storage, count, fetchRows, now = Date.now() }) {
  const p = up(prefix);
  if (!p) return { codes: [], source: 'memory' };
  const cached = readCodeIndex(storage, p);
  let n = null;
  if (cached) {
    try {
      n = await count(p);
    } catch {
      n = null; // بلا شبكة لا عدّ — فيُقرأ (من ذاكرة Firestore إن لم توجد شبكة) كما كان المستمع
    }
  }
  if (codeIndexIsFresh(cached, n)) return { codes: [...new Set(cached.codes)].sort(), source: 'memory' };
  const codes = codesInPrefix(await fetchRows(p), p);
  writeCodeIndex(storage, p, codes, now);
  return { codes, source: 'server' };
}

/** أكوادُ البادئة من خاناتٍ مقروءة — بقاعدة `generationPlan` نفسِها (`startsWith`). */
export function codesInPrefix(locations, prefix) {
  const p = up(prefix);
  if (!p) return [];
  return [
    ...new Set(
      (locations || [])
        .map((l) => normalizeLocationCode(l?.code))
        .filter((c) => c.startsWith(`${p}-`))
    ),
  ].sort();
}

/**
 * تقدّمُ التكويد بلا قراءة المستودع كلّه — عددُ خاناته من الخادم، ومربوطُها من
 * الخانات المربوطة وحدَها (`barcode > ''`). وهو ما يحسبه `codingProgress` حرفًا.
 */
export function codingProgressFrom({ total, boundLocations, prefix }) {
  const p = up(prefix);
  const bound = p
    ? (boundLocations || []).filter(
        (l) =>
          normalizeLocationCode(l?.code).startsWith(`${p}-`) &&
          up(l?.barcode).replace(/\s+/g, '')
      ).length
    : 0;
  const t = p ? Math.max(0, Number(total) || 0) : 0;
  return { total: t, bound, remaining: Math.max(0, t - bound) };
}

// ═══ محرّكُ المستندات — خانةُ الموقع في جدول البنود ═══════════════════════════

/** أفي جداول هذا النوع عمودُ موقع؟ — ستّةُ أنواعٍ من العشرات؛ وغيرُها لا يقرأ خانةً قطّ. */
export function schemaHasBinColumn(schema) {
  return (schema?.sections || []).some(
    (s) => s?.kind === 'table' && (s.columns || []).some((c) => c?.key === 'bin')
  );
}

/**
 * الأكوادُ التي يُسأل عنها الحكمُ فعلًا — المكتوبةُ في البنود والصالحةُ شكلًا.
 * فالمعطوبُ شكلًا حكمُه من شكله (`locationCodeProblem`) قبل أيّ قائمة، فلا يُقرأ له شيء.
 */
export function binCodesOfLines(lines) {
  return codesToRead((lines || []).map((l) => l?.bin).filter((v) => v && !locationCodeProblem(v)));
}

/**
 * حكمُ خانة الموقع بالقراءة المقصورة — `binCellVerdict` نفسُه على المقروء ∪ الشاهد.
 *
 * ★ والكودُ الذي لم يُقرأ بعدُ يُحكم عليه كما كانت القائمةُ الكاملةُ تُحكم قبل وصولها:
 *   قائمةٌ فارغة ⇒ عطبُ الشكل وحدَه أو لا شيء. فلا يرى الكاتبُ «غير مسجَّل» لحظةً
 *   ثمّ يختفي.
 *
 * @param {string} raw
 * @param {{resolved:Map<string, object|null>, witness:object|null}} ctx
 */
export function scopedBinVerdict(raw, { resolved, witness } = {}) {
  if (!isResolved(resolved, raw)) return binCellVerdict(raw, []);
  return binCellVerdict(raw, withWitness(foundOf(resolved), witness));
}

/**
 * يُكمل الأكوادَ المقروءةَ بخانات مستودعٍ قُرئ كلُّه — فكودٌ من ذلك المستودع
 * يُعرف من خاناته بلا قراءةٍ ثانية: موجودٌ إن كان فيها، وغيرُ موجودٍ إن لم يكن.
 *
 * @param {Map<string, object|null>} resolved
 * @param {{prefix:string, locations:object[], ready:boolean}} warehouse
 * @param {string[]} codes الأكوادُ المطلوبة
 */
export function resolveFromWarehouse(resolved, { prefix, locations, ready }, codes) {
  const out = new Map(resolved instanceof Map ? resolved : []);
  const p = up(prefix);
  if (!p || !ready) return out;
  const byCode = new Map((locations || []).map((l) => [normalizeLocationCode(l?.code), l]));
  for (const c of codesToRead(codes)) {
    if (prefixOfCode(c) === p) out.set(c, byCode.get(c) || null);
  }
  return out;
}

// ═══ لوحةُ الخانة — المسحةُ تُسأل عن خانتها بعينها ═══════════════════════════════

/**
 * مفتاحُ ذاكرة المسح — ما يتعلّق به جوابُ `findByBarcode` وحدَه: صيغةُ الباركود
 * وصيغةُ الكود. فمسحتان تختلفان شكلًا وتتّفقان فيهما جوابُهما واحد.
 */
export function scanLookupKey(raw, { normalizeBinBarcode }) {
  return `${normalizeBinBarcode(raw)}\u0000${normalizeLocationCode(raw)}`;
}

/**
 * `findByBarcode` بقراءتين صغيرتين بدل السيّد كلّه — بترتيبه نفسِه حرفًا:
 * المربوطُ بهذا الباركود أوّلًا (أصغرُها كودًا، كما يجده `find` في قائمةٍ مرتّبة)،
 * ثمّ الخانةُ التي كودُها هو الممسوح.
 *
 * @param {string} raw
 * @param {{normalizeBinBarcode:Function, byBarcode:(b:string)=>Promise<object[]>, byCode:(c:string)=>Promise<object[]>}} io
 */
export async function lookupBinVia(raw, { normalizeBinBarcode, byBarcode, byCode }) {
  const b = normalizeBinBarcode(raw);
  if (!b) return null;
  const bound = sortByCode((await byBarcode(b)).filter((l) => normalizeBinBarcode(l?.barcode) === b));
  if (bound.length) return bound[0];
  const code = normalizeLocationCode(raw);
  if (!isQueryableCode(code)) return null;
  const hits = (await byCode(code)).filter((l) => normalizeLocationCode(l?.code) === code);
  return sortByCode(hits)[0] || null;
}

/**
 * الأكوادُ المعروفة لحكم الخانة بالقراءة المقصورة — المقروءُ ∪ الشاهد، أو لا شيء
 * ما دام شيءٌ منه لم يصل (`undefined`): قائمةٌ فارغةٌ لا تحكم على أحد، وهو ما كانت
 * تفعله القائمةُ الكاملةُ قبل وصولها.
 *
 * @param {Array<object|null|undefined>} docs خانةُ المعروض وخانةُ المحدَّد
 * @param {{witness:object|null, ready:boolean}} witnessState
 */
export function knownCodesScoped(docs, { witness, ready }) {
  if (!ready || (docs || []).some((d) => d === undefined)) return [];
  return withWitness((docs || []).filter(Boolean), witness).map((l) => normalizeLocationCode(l.code));
}

// ═══ خطّةُ السحب — شبكةُ المشي تُبنى من مستودعات المسار وحدَها ══════════════════

/**
 * بادئاتُ كلّ خانةٍ **يمكن** أن يسحب منها المستند — مرشّحو `allocateFefo` كلُّهم لا
 * المسحوبُ وحدَه (طلبٌ بلا سقف). فهي مجموعةٌ تحوي المسارَ أيًّا كان «الآن» الذي
 * يُسقط المنتهي، ولا تتعلّق بالشبكة.
 *
 * ★ ولماذا يكفي مستودعُ المسار؟ لأنّ `buildGrid` يرتّب الممرّاتِ والمواضعَ **داخل
 *   كلّ مستودعٍ وحدَه** (`index.set(wh, …)`)، والمسافةُ بين مستودعين «نقلٌ لا مشي».
 *   فنقاطُ خانات المسار من مستودعاتها كاملةً هي نقاطُها من السيّد كلِّه حرفًا.
 */
export function pickPrefixesOf(doc, balances) {
  const warehouse = up(doc?.header?.warehouse);
  const prefixes = new Set();
  for (const line of doc?.lines || []) {
    if (!up(line?.sku) && !up(line?.barcode)) continue;
    const { allocations } = allocateFefo(
      { sku: line?.sku, barcode: line?.barcode, qty: Number.POSITIVE_INFINITY, warehouse: warehouse || line?.warehouse },
      balances || []
    );
    for (const a of allocations) {
      const p = prefixOfCode(a?.bin);
      if (p) prefixes.add(p);
    }
  }
  return [...prefixes].sort();
}

/**
 * أثبت العدُّ أنّ كلَّ خانةٍ «مُدخَلةُ الإحداثيّات» بحكم `buildGrid`؟ — لكلّ محورٍ ما قيمتُه
 * رقمٌ محدود؛ فإن ساوى الكلَّ في المحورين ثبت. و`null` «لم يُدخَل» عند `buildGrid` (هو ما
 * يكتبه `gridFields` للخانة المولَّدة) فلا يُعدّ. وإلّا لم يثبت شيء (`null` · حقلٌ غائب ·
 * رقمٌ مخزَّنٌ نصًّا) ⇒ يُقرأ الكلُّ و`buildGrid` يحكم — فالبرهانُ لا يُخطئ إلّا نحو القراءة.
 *
 * @param {{total:number, numX:number, numY:number}} c
 */
export function coordinatesProven({ total, numX, numY }) {
  if (![total, numX, numY].every(Number.isFinite)) return false;
  return numX === total && numY === total;
}

/** خطوةُ «تخطّي البادئة» — أوّلُ كودٍ بعد كلّ ما يبدأ بـ`prefix-` أو يساويه. */
export function afterSegment(prefix) {
  return `${up(prefix)}.`;
}

// ═══ «تخطّي المقطع» — القيمُ المتمايزةُ بقراءةٍ لكلّ قيمة لا لكلّ خانة ═══════════
//
// والقارئُ يُحقن: `first(from, to, {after})` يُعيد أوّلَ خانةٍ كودُها في `[from, to)`
// (أو `(from, to)` إن كان `after`) بترتيب الكود، أو `null`. وفي الخدمة هو استعلامُ
// `where('code','>=',from), where('code','<',to), orderBy('code'), limit(1)` — مدًى وترتيبٌ
// على حقلٍ واحد فلا فهرسَ مركّبًا. والأكوادُ المخزَّنة مقاطعُ `[A-Z0-9]` بفاصل `-`
// (`locationCodeProblem` يردّ غيرها قبل الحفظ)، فخاناتُ `RH` كلُّها في `[RH-, RH.)`.

/** أوّلُ خانةٍ حيّةٍ (غير مؤرشفة) في المدى — قراءةٌ لكلّ مؤرشفةٍ تتصدّره. */
async function firstLive(first, from, to) {
  let row = await first(from, to, { after: false });
  while (row && row.status === 'archived') row = await first(row.code, to, { after: true });
  return row;
}

/**
 * البادئاتُ القائمة — `warehouseCodesOf` (كلُّ خانة) أو جذورُ `scopeChoices` (`liveOnly`).
 * @returns {Promise<string[]>}
 */
export async function skipScanPrefixes(first, { liveOnly = false } = {}) {
  const out = [];
  let from = '';
  for (;;) {
    const row = await first(from, '', { after: false });
    if (!row) return out;
    const p = prefixOfCode(row.code);
    const live = liveOnly && row.status === 'archived' ? await firstLive(first, `${p}-`, afterSegment(p)) : row;
    if (live) out.push(p);
    from = afterSegment(p);
  }
}

/**
 * مناطقُ مستودعٍ حيّة (المقطعُ الثاني) — ولكلّ منطقةٍ خانتُها ذاتُ المقطعين إن كانت
 * مسجَّلةً حيّة، فمنها اسمُها كما يقرؤه `scopeChoices` من عقدة الجذر.
 * @returns {Promise<Array<{zone:string, location:object|null}>>}
 */
export async function skipScanZones(first, prefix) {
  const p = up(prefix);
  if (!p) return [];
  const end = afterSegment(p);
  const out = [];
  let from = `${p}-`;
  for (;;) {
    const row = await first(from, end, { after: false });
    if (!row) return out;
    const zone = normalizeLocationCode(row.code).split('-')[1] || '';
    const zoneCode = `${p}-${zone}`;
    const zoneEnd = afterSegment(zoneCode);
    const live = row.status === 'archived' ? await firstLive(first, row.code, zoneEnd) : row;
    if (live) out.push({ zone, location: normalizeLocationCode(live.code) === zoneCode ? live : null });
    from = zoneEnd;
  }
}

/**
 * خياراتُ نطاق الجرد من التخطّي — بشكل `scopeChoices` حرفًا.
 * @param {string[]} prefixes البادئاتُ الحيّة
 * @param {Array<{zone:string, location:object|null}>} zones مناطقُ المستودع المختار
 */
export function scopeChoicesFrom(prefixes, zones, { warehouse } = {}) {
  const str = (v) => String(v ?? '').trim();
  const sorted = (list) => [...list].sort((a, b) => a.value.localeCompare(b.value));
  const wh = up(warehouse);
  return {
    warehouses: sorted((prefixes || []).map((w) => ({ value: w, label: w }))),
    zones: wh
      ? sorted(
          (zones || [])
            .filter((z) => z.zone)
            .map((z) => {
              const name = str(z.location?.nameAr);
              return { value: z.zone, label: name ? `${z.zone} — ${name}` : z.zone };
            })
        )
      : [],
  };
}
