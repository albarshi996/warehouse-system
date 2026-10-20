/**
 * منطقُ جرد أصول الإدارات الخالص — الهويّةُ والحكمُ وخطّةُ الاستيراد.
 *
 * ═══ ولماذا مجموعةٌ جديدةٌ لا `warehouse_assets`؟ ═══
 * `warehouse_assets` مجموعةُ **مستودعٍ بعينه**: قاعدتُها تُلزم حقلَ `warehouse`
 * نصًّا غيرَ فارغ، وتعليقُها في `firestore.rules` يُحذّر صريحًا من الإقحام
 * («مجموعةٌ ثانيةٌ عن قصد… وإقحامُها هناك يُفسد أوامرَ الشغل كما كان إقحامُ
 * الطبالي يُفسد `stock_moves`»). وهذه الشاشةُ أصولُ **الإدارات كلِّها** —
 * حاسوبُ الموارد البشريّة لا مستودعَ له، فالوصلُ بها يكتب قيمةً مخترَعة.
 * فمجموعةٌ ثالثةٌ `department_assets` بحقل `department`، وهو حقلٌ إلزاميٌّ في
 * الشاشة أصلًا.
 *
 * ═══ ★★★ والاستيرادُ لا يدهس — وهذا كلُّ الفرق ═══
 * الشاشةُ القديمة كانت تكتب فوقَ أيِّ رقمٍ قائم (`assets[idx]=rec`)، وهو مقبولٌ
 * في ذاكرةٍ تزول ومُهلِكٌ في قاعدةٍ تبقى: استيرادٌ يُعاد يمحو عملَ يومٍ كامل.
 * فـ`planAssetImport` تُقرّر **قبل** أيّ كتابة: الغائبُ يُكتب، والقائمُ يُتخطّى
 * **ويُسمَّى رقمُه** — فصفٌّ يُهمَل بلا اسمٍ فقدٌ صامت.
 *
 * ═══ والرقمُ المشوَّهُ يُرقَّم لا يُهمَل ═══
 * صفٌّ بلا رقمٍ أو برقمٍ ليس على الصيغة يأخذ **الرقمَ التاليَ الحرّ**، كما كانت
 * الشاشة تفعل. فالبياناتُ تدخل، والرقمُ وحدَه يُخترع — ولا يُخترع فوق محجوز.
 */

/** صيغةُ رقم الأصل المعتمدة — بادئةُ `assetsModel.ASSET_ID_PREFIX` وأربعةُ أرقام. */
export const ASSET_NO_RE = /^BRZ-\d{4}$/;

/** هل هذا رقمُ أصلٍ على الصيغة؟ */
export const isAssetNo = (v) => ASSET_NO_RE.test(String(v ?? '').trim());

/**
 * معرّفُ المستند — رقمُ الأصل نفسُه.
 *
 * ★ والرقمُ **هويّةٌ عامّةٌ هنا** بخلاف فينسيا: تلك مجموعتان لكلٍّ تسلسلُها
 * فتصادمت ثلاثون رقمًا، وهذه سجلٌّ واحدٌ للشركة و`nextAssetId` تُوزّع أرقامَه
 * من تسلسلٍ واحد. فالتصادمُ هنا **عطبُ بياناتٍ يُقال** لا هويّةٌ تُركَّب.
 */
export function assetDocKey(assetNo) {
  const no = String(assetNo ?? '').trim();
  if (!isAssetNo(no)) throw new Error(`رقمُ أصلٍ مشوّه: «${no}» — الصيغة BRZ-0001`);
  return no;
}

const text = (v) => (v == null ? '' : String(v).trim());

/**
 * حكمٌ على سجلٍّ قبل أن يلمس السحابة — بنفس إلزامات الشاشة حرفيًّا
 * (النوعُ والاسمُ والإدارةُ والكمّيّة)، ولكن **في منطقٍ مختبَر** لا في
 * معالجِ زرٍّ وحدَه. فالتحقّقُ الذي يعيش في الشاشة يسقط مع أوّل مسارٍ ثانٍ
 * يكتب (الاستيراد مثلًا).
 */
export function assetVerdict(record) {
  const r = record ?? {};
  const problems = [];
  if (!text(r.assetType)) problems.push('نوعُ الأصل مطلوب.');
  if (!text(r.assetName)) problems.push('اسمُ الأصل مطلوب.');
  if (!text(r.department)) problems.push('الإدارةُ مطلوبة.');
  const qty = Number.parseInt(r.qty, 10);
  if (!Number.isFinite(qty) || qty < 1) problems.push('الكمّيّةُ رقمٌ صحيحٌ لا يقلّ عن واحد.');
  if (text(r.id) && !isAssetNo(r.id)) problems.push(`رقمُ الأصل «${text(r.id)}» ليس على الصيغة BRZ-0001.`);
  return { ok: problems.length === 0, problems };
}

/** التكهينُ يحتاج سببًا مكتوبًا — وإلّا فهو حذفٌ بلا أثر. */
export function archiveVerdict(reason) {
  const why = text(reason);
  return why ? { ok: true, problems: [], reason: why } : { ok: false, problems: ['التكهين يحتاج سببًا مكتوبًا.'], reason: '' };
}

/** يفصل المكهَّنَ عن الحيّ — فأرقامُ اللقطة تتبع الحيَّ وحدَه. */
export function splitArchived(assets) {
  const live = [];
  const archived = [];
  for (const a of assets ?? []) (a?.archived ? archived : live).push(a);
  return { live, archived };
}

/** أكبرُ رقمٍ مستعملٍ في مجموعةِ مفاتيح، صفرٌ إن لم يكن فيها رقمٌ على الصيغة. */
function maxUsedNo(keys) {
  let max = 0;
  for (const k of keys) {
    const m = String(k ?? '').match(/^BRZ-(\d{4})$/);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return max;
}

const noToKey = (n) => `BRZ-${String(n).padStart(4, '0')}`;

const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * بصمةُ أصلٍ من مضمونه — **لصفٍّ بلا رقمٍ وحدَه**.
 *
 * ★★★ ولمَ؟ لأنّ صفًّا بلا رقمٍ يأخذ رقمًا جديدًا في كلّ استيراد، فإعادةُ
 * الاستيراد **تُضيف نسخةً ثانيةً من الأصل نفسه** — لا تدهس شيئًا ولكنّها
 * تضخّم الجرد، ولا شيء يشتكي. (أمسكه التشغيلُ الحيّ لا اختبار: أُعيد الملفّ
 * فصار «راوتر الطابق الثاني» أصلَين.)
 *
 * والحقولُ الخمسةُ هي ما يُعرَّف به الأصلُ في ملفّات الإدارات: اسمُه ونوعُه
 * وإدارتُه وماركتُه وسيريالُه. وتُطبَّع فمسافةٌ زائدةٌ أو حرفٌ كبيرٌ لا
 * يصنع أصلًا ثانيًا.
 */
export function assetFingerprint(record) {
  const r = record ?? {};
  return [r.assetName, r.assetType, r.department, r.brand, r.serial].map(norm).join('|');
}

/**
 * خطّةُ استيراد: **ما يُكتب وما يُتخطّى ولماذا** — بلا لمسِ السحابة.
 *
 * @param {object[]} existing سجلّاتُ القاعدة كما هي (تُقرأ أوّلًا)، ولكلٍّ `id`
 * @param {object[]} incoming السجلّاتُ كما قرأها `parseAssetRows`
 * @returns {{toWrite: object[], skipped: object[], assigned: number, nextNo: number}}
 *   `toWrite` كلُّ سجلٍّ ومعه `key` نهائيّ · `skipped` ومعه `reason` و`key`
 *
 * ★ وثلاثةُ أسبابٍ للتخطّي، كلٌّ منها يُسمَّى:
 *   `exists` قائمٌ في القاعدة — برقمه، أو **ببصمته** إن كان بلا رقم.
 *   `duplicate` رقمٌ تكرّر داخل الاستيراد نفسِه — فالثاني لا يُكتب فوق الأوّل.
 *   `invalid` سجلٌّ لا يجوز بحكم `assetVerdict` (بلا اسمٍ أو إدارةٍ مثلًا).
 *
 * ★★ والسجلُّ بلا رقمٍ صالحٍ **يُرقَّم** لا يُتخطّى، ويقفز الترقيمُ فوق كلِّ
 * محجوزٍ — في القاعدة أو في الدفعة نفسِها.
 *
 * ★★★ **والبصمةُ تُعدّ عدًّا لا تُطابَق مطابقةً واحدة**: ملفٌّ فيه ثلاثةُ
 * كراسٍ متماثلةٍ بلا أرقامٍ يقول إنّ ثلاثةً موجودة، فتُكتب ثلاثًا أوّلَ مرّة.
 * وإعادتُه تجد ثلاثًا فتكتب صفرًا. ولو كانت مطابقةً واحدةً لَكتبت اثنتين في
 * كلّ مرّة — فالعدُّ هو ما يجعل الإعادةَ آمنةً **والأوّلَ صحيحًا** معًا.
 */
export function planAssetImport(existing, incoming) {
  const rows = [...(existing ?? [])];
  const present = new Set(rows.map((r) => String(typeof r === 'string' ? r : r?.id ?? '')));
  const taken = new Set(present);
  let nextNo = Math.max(maxUsedNo(present), 0) + 1;

  // رصيدُ البصمات القائم — يُستهلك سجلًّا سجلًّا فلا يُطابق واحدٌ مرّتين.
  const budget = new Map();
  for (const r of rows) {
    if (typeof r === 'string') continue;
    const fp = assetFingerprint(r);
    budget.set(fp, (budget.get(fp) ?? 0) + 1);
  }

  const toWrite = [];
  const skipped = [];
  let assigned = 0;

  for (const rec of incoming ?? []) {
    const raw = text(rec?.id);
    const hasKey = isAssetNo(raw);

    // الحكمُ على السجلّ بلا رقمه: رقمٌ مشوَّهٌ يُستبدل، فلا يُسقط السجلَّ.
    const verdict = assetVerdict({ ...rec, id: hasKey ? raw : '' });
    if (!verdict.ok) {
      skipped.push({ key: raw, record: rec, reason: 'invalid', problems: verdict.problems });
      continue;
    }

    if (hasKey) {
      if (present.has(raw)) {
        skipped.push({ key: raw, record: rec, reason: 'exists', by: 'key', problems: [] });
        continue;
      }
      if (taken.has(raw)) {
        skipped.push({ key: raw, record: rec, reason: 'duplicate', problems: [] });
        continue;
      }
      taken.add(raw);
      toWrite.push({ ...rec, id: raw, key: raw });
      continue;
    }

    // بلا رقم: إن كان مثلُه في القاعدة فهو هو — ولا يُضاف نسخةً ثانية.
    const fp = assetFingerprint(rec);
    const left = budget.get(fp) ?? 0;
    if (left > 0) {
      budget.set(fp, left - 1);
      skipped.push({ key: '', record: rec, reason: 'exists', by: 'fingerprint', problems: [] });
      continue;
    }

    while (taken.has(noToKey(nextNo))) nextNo += 1;
    const key = noToKey(nextNo);
    taken.add(key);
    nextNo += 1;
    assigned += 1;
    toWrite.push({ ...rec, id: key, key });
  }

  return { toWrite, skipped, assigned, nextNo };
}

/**
 * جملةٌ عربيّةٌ تحكي الخطّة — **وتسمّي المتخطَّى بأرقامه**.
 *
 * فـ«٣ مُتخطًّى» لا يدلّ على شيء: الموظّفُ لا يعرف أيَّ صفوفٍ لم تدخل فيبحث
 * عنها واحدًا واحدًا، أو — وهو الأسوأ — يحسب أنّها دخلت. والسقفُ عشرةٌ كي لا
 * تصير الرسالةُ صفحةً.
 */
export function describeImportPlan(plan, { limit = 10 } = {}) {
  const p = plan ?? { toWrite: [], skipped: [], assigned: 0 };
  const parts = [`كُتب ${p.toWrite.length}`];
  if (p.assigned) parts.push(`منها ${p.assigned} رُقّم تلقائيًّا`);
  if (p.skipped.length) parts.push(`تُخطّي ${p.skipped.length}`);

  const byKey = [];
  const byFingerprint = [];
  const duplicate = [];
  let invalid = 0;
  for (const s of p.skipped) {
    if (s.reason === 'duplicate') duplicate.push(s.key || '—');
    else if (s.reason === 'exists') (s.by === 'fingerprint' ? byFingerprint : byKey).push(s.key || '—');
    else invalid += 1;
  }

  const tail = [];
  const say = (list, label) => {
    if (!list.length) return;
    const shown = list.slice(0, limit).join(' · ');
    tail.push(`${label}: ${shown}${list.length > limit ? ` و${list.length - limit} غيرها` : ''}`);
  };
  say(byKey, 'أرقامٌ قائمةٌ لم تُدهَس');
  // ★ وصفٌّ بلا رقمٍ وُجد مثلُه في القاعدة يُقال **عددًا** لا رقمًا: لا رقمَ له
  // ليُسمَّى، وذِكرُه «—» يُربك أكثرَ ممّا يُفيد.
  if (byFingerprint.length) tail.push(`صفوفٌ بلا رقمٍ موجودةٌ أصلًا: ${byFingerprint.length}`);
  say(duplicate, 'أرقامٌ تكرّرت في الملفّ');
  if (invalid) tail.push(`صفوفٌ ناقصة: ${invalid}`);

  return parts.join(' · ') + (tail.length ? ` — ${tail.join(' · ')}` : '');
}

/** أوراقٌ ليست جردًا — ملخّصُ التصدير يُعاد استيرادُه فيُقرأ أصولًا. */
export const SKIP_SHEETS = ['ملخص إحصائي'];

/** الورقةُ الجامعةُ باسمها المعتمد — إن وُجدت فهي المصدرُ ولا تُقرأ غيرُها. */
export const MAIN_SHEET = 'جرد الأصول';

/**
 * يستخرج صفوفَ الأصول من مصنَّفٍ واحد — **وXLSX مُحقَنةٌ لا مستوردة**.
 *
 * فالخدمةُ تبقى بلا مكتبةٍ ولا DOM فتُختبر بمصنَّفٍ مزيَّف، وهو نمطُ
 * `inspectionExcel.workbookToSheets` نفسُه في هذا المستودع.
 *
 * ★ وورقةُ «جرد الأصول» إن وُجدت **هي المصدرُ وحدَها**: فيها عمودُ «الإدارة»
 * فلا تحتاج إلى اسم الورقة. وإلّا فكلُّ ورقةٍ إدارةٌ باسمها — وذاك ما يجعل
 * `deptOverride` اسمَ الورقة.
 *
 * @param {{Sheets?: object, SheetNames?: string[]}} workbook المصنَّف
 * @param {(sheet:object, deptOverride:string|null)=>object[]} parseSheet قارئُ ورقةٍ واحدة
 */
export function workbookToAssetRows(workbook, parseSheet) {
  const wb = workbook ?? {};
  const sheets = wb.Sheets ?? {};
  if (sheets[MAIN_SHEET]) return parseSheet(sheets[MAIN_SHEET], null) ?? [];
  const out = [];
  for (const name of wb.SheetNames ?? []) {
    if (SKIP_SHEETS.includes(name) || !sheets[name]) continue;
    out.push(...(parseSheet(sheets[name], name) ?? []));
  }
  return out;
}

/**
 * يقرأ ملفّاتٍ على دفعاتٍ بمُعينات مُحقَنة — فيُختبر بلا `FileReader`.
 *
 * ★ والدفعاتُ ليست زينة: ألفُ ملفٍّ تُقرأ جملةً تُجمّد الصفحة، فيُسلَّم
 * الخيطُ بين الدفعات (`yieldFn`). وملفٌّ تعذّرت قراءتُه **يُعدّ ويُقال** ولا
 * يُسقط الباقيَ: ملفٌّ تالفٌ في عشرين لا يُهدر التسعةَ عشر.
 *
 * @param {File[]} files الملفّات
 * @param {{readRows:(f:File)=>Promise<object[]>, batch?:number, yieldFn?:()=>Promise<void>}} io
 * @returns {Promise<{rows: object[], unreadable: number}>}
 */
export async function readAssetFiles(files, { readRows, batch = 50, yieldFn } = {}) {
  const list = files ?? [];
  const rows = [];
  let unreadable = 0;
  for (let i = 0; i < list.length; i += batch) {
    const slice = list.slice(i, i + batch);
    const results = await Promise.all(
      slice.map((f) => Promise.resolve().then(() => readRows(f)).catch(() => null))
    );
    for (const got of results) {
      if (Array.isArray(got)) rows.push(...got);
      else unreadable += 1;
    }
    if (yieldFn) await yieldFn();
  }
  return { rows, unreadable };
}

/** الملفّاتُ المقبولة — وما سواها يُقال ولا يُقرأ. */
export const IMPORT_EXTENSIONS = ['xlsx', 'xls'];

/** يفصل المقبولَ عن المرفوض بامتداده (بلا حسٍّ للحالة). */
export function splitImportFiles(files) {
  const ok = [];
  const bad = [];
  for (const f of files ?? []) {
    const ext = String(f?.name ?? '').split('.').pop().toLowerCase();
    (IMPORT_EXTENSIONS.includes(ext) ? ok : bad).push(f);
  }
  return { ok, bad };
}

/**
 * ترجمةُ رفضِ الكتابة إلى عربيّةٍ تُفهم.
 *
 * ★ `permission-denied` نصُّ مكتبةٍ لا يفهمه الموظّف، فيقرؤه «تعطّل النظام»
 * ويكرّر المحاولة — والسببُ الحقيقيُّ صلاحيّةٌ لا عطب.
 */
export function writeErrorMessage(e) {
  const code = e?.code || '';
  if (code === 'permission-denied') {
    return 'قاعدةُ البيانات رفضت الكتابة — حسابُك يقرأ هذه الشاشة ولا يكتب فيها.';
  }
  if (code === 'unavailable') return 'لا اتّصال — تُحفظ محلّيًّا وتُرفع حين تعود الشبكة.';
  return e?.message || 'تعذّرت الكتابة.';
}

/** ترجمةُ رفضِ القراءة — وهي أخطر: شاشةٌ فارغةٌ تُقرأ «لا أصولَ عندنا». */
export function readErrorMessage(e) {
  return e?.code === 'permission-denied'
    ? 'قاعدةُ البيانات رفضت القراءة — راجع المدير العامّ.'
    : 'تعذّر الاتّصال بقاعدة البيانات — ما يُكتب الآن قد لا يُحفظ.';
}

/** نصُّ شارة السحابة بحسب الصلاحيّة وحالةِ الطابور. */
export function cloudChipState({ canWrite, hasPending }) {
  if (!canWrite) return { state: 'denied', text: 'قراءةٌ فقط — الكتابةُ لمن يملكها' };
  return hasPending
    ? { state: 'pending', text: 'بانتظار مزامنة كتابات…' }
    : { state: 'online', text: 'متصل — متزامن' };
}

/**
 * نصوصُ نافذة التكهين/الإرجاع — **في مكانٍ واحدٍ مختبَر**.
 *
 * فنافذةٌ تقول «تُحذف» وقاعدةٌ تمنع الحذف تُفقد الثقةَ بكلّ ما سواها؛
 * والنصُّ هو ما يفهمه الموظّف عن أثر ضغطته.
 */
export function reasonModalCopy(mode, label) {
  const who = String(label ?? '');
  return mode === 'archive'
    ? {
        title: 'تكهين الأصل',
        lead: `تُكهَّن ${who} فتخرج من الجرد — ولا تُحذف.`,
        note: 'ورقمُها يبقى محجوزًا، ويُرى الأصلُ بتأشير «أظهر المكهَّن» — ويمكن إرجاعُه بسببٍ مكتوب.',
        placeholder: 'مثال: تلفٌ نهائيّ · سُلّم للصيانة · نُقل لشركةٍ أخرى',
        confirm: 'كهّن',
        danger: true,
      }
    : {
        title: 'إرجاع الأصل إلى الجرد',
        lead: `يعود ${who} إلى الجرد ويُحسب في أرقامه.`,
        note: 'والسببان — التكهينُ والإرجاعُ — يُقيَّدان في سجلّ الأصل الملحقِ-فقط باسمك وتاريخهما.',
        placeholder: 'مثال: عاد من الصيانة · كُهِّن خطأً',
        confirm: 'أرجِع',
        danger: false,
      };
}

