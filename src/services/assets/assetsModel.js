/**
 * منطق جرد الأصول الخالص — قراءةُ الإكسل والتصفية والإحصاء.
 *
 * كان هذا داخل وسم `script` في `/dashboard/assets-inventory`، أي **خارج نطاق
 * `npm test` بالبناء**. وأخطرُه قراءةُ الإكسل: خريطةُ عمودٍ خاطئة لا تُسقط
 * شيئًا ولا تشتكي — تُدخل «الماركة» في خانة «السيريال» وتمضي، فيُقرأ الجرد
 * كلّه خطأً وهو يبدو سليمًا. ولذلك يُختبر هنا بصفوفٍ حقيقيّة.
 *
 * وهذا الملفّ لا يعرف DOM ولا XLSX: يأخذ **مصفوفة صفوفٍ خام** (ما يُخرجه
 * `sheet_to_json` بـ`header:1`) ويُعيد سجلّات. فتُختبر القراءة بلا ملفّ.
 */

/** حالات الأصل المعتمدة — وما سواها يقع على «جيد». */
export const ASSET_CONDITIONS = ['ممتاز', 'جيد', 'متوسط', 'يحتاج صيانة', 'معطل'];

/** حالاتٌ تُعدّ سليمة في الإحصاء. */
export const GOOD_CONDITIONS = ['ممتاز', 'جيد'];

/** حالاتٌ تستدعي تدخّلًا. */
export const BAD_CONDITIONS = ['يحتاج صيانة', 'معطل'];

const BADGE_BY_CONDITION = {
  ممتاز: 'badge-excellent',
  جيد: 'badge-good',
  متوسط: 'badge-medium',
  'يحتاج صيانة': 'badge-needs',
  معطل: 'badge-broken',
};

/** صنفُ شارة الحالة — والمجهول يقع على «جيد» كما كانت الشاشة تفعل. */
export const conditionBadgeClass = (condition) => BADGE_BY_CONDITION[condition] || 'badge-good';

/**
 * خريطتا عناوين الورقتين.
 *
 * ورقة «جرد الأصول» الرئيسة فيها عمود «الإدارة»، وأوراق الإدارات لا؛ فيزيح
 * ذلك كلَّ ما بعده عمودًا واحدًا. ولذلك خريطتان لا خريطةٌ بإزاحة: الإزاحة
 * تُخطئ صامتةً حين يُضاف عمود، والخريطة بالاسم تتوقّف عمّا لا تعرفه.
 *
 * والمرادفات مقصودة: «الموديل/السيريال» و«السيريال» و«الموديل» كلّها تقع على
 * الحقل نفسه، لأنّ الملفّات الواردة من الإدارات تسمّيه بأسماءٍ ثلاثة.
 */
export const MAIN_HEADERS = {
  'رقم الأصل': 0,
  'نوع الأصل': 1,
  'اسم الأصل': 2,
  الماركة: 3,
  'الموديل/السيريال': 4,
  السيريال: 4,
  الموديل: 4,
  الكمية: 5,
  الحالة: 6,
  المسؤول: 7,
  الإدارة: 8,
  القسم: 9,
  الموقع: 10,
  'تاريخ الاستلام': 11,
  ملاحظات: 12,
};

export const DEPT_HEADERS = {
  'رقم الأصل': 0,
  'نوع الأصل': 1,
  'اسم الأصل': 2,
  الماركة: 3,
  السيريال: 4,
  الموديل: 4,
  الكمية: 5,
  الحالة: 6,
  المسؤول: 7,
  القسم: 8,
  الموقع: 9,
  'تاريخ الاستلام': 10,
  ملاحظات: 11,
};

/** ورقةٌ فيها عمود «الإدارة» هي الورقة الرئيسة. */
export const isMainSheet = (header) => (header ?? []).some((h) => String(h ?? '').trim() === 'الإدارة');

/**
 * يربط رقم الحقل المنطقيّ بموضع العمود الفعليّ في الورقة.
 * وما لا يُذكر في العناوين يبقى بلا ربط، فيُقرأ بموضعه الافتراضيّ.
 */
export function resolveColumns(header) {
  const clean = (header ?? []).map((h) => String(h ?? '').trim());
  const main = isMainSheet(clean);
  const map = main ? MAIN_HEADERS : DEPT_HEADERS;
  const cols = {};
  clean.forEach((h, i) => {
    if (Object.prototype.hasOwnProperty.call(map, h)) cols[map[h]] = i;
  });
  return { cols, isMain: main };
}

const text = (v) => (v == null ? '' : String(v).trim());

/** كمّيّةٌ موجبة، وما سواها يقع على الافتراضيّ — لا على صفرٍ يُخفي أصلًا. */
export function assetQuantity(value, fallback = 1) {
  const n = parseInt(value, 10);
  return !Number.isNaN(n) && n > 0 ? n : fallback;
}

/** يوم التقويم المحلّيّ لتاريخٍ ما، `YYYY-MM-DD`. */
function localDay(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * يُطبّع تاريخ الاستلام إلى `YYYY-MM-DD`.
 *
 * ونصٌّ ليس تاريخًا **يُترك كما ورد** — فمحوُه يفقد ما كتبه صاحب الملفّ،
 * وتحويلُه قسرًا يخترع تاريخًا لم يقله أحد.
 *
 * ★ **وعطبُ اليوم الواحد:** كانت الشاشة تكتب `new Date(x).toISOString()`، وهو
 * يحوّل إلى UTC. وليبيا على +2، فمنتصفُ ليل ١٥ يناير محلّيًّا هو **١٤ يناير**
 * بتوقيت UTC — فكلّ تاريخٍ يُستورد يتأخّر يومًا. وSheetJS يبني تواريخ الخلايا
 * بالتوقيت المحلّيّ كذلك، فالعطب يشملها. فيُقرأ اليوم من مكوّناته المحلّيّة
 * لا من سلسلة UTC (أمسكه اختبارٌ لا عين).
 */
export function normalizeReceivedDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return localDay(value);
  const raw = text(value);
  if (!raw || /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : localDay(d);
}

/**
 * يقرأ صفوف ورقةٍ خامّة إلى سجلّات أصول.
 *
 * @param {Array<Array<*>>} rows الصفوف كما يُخرجها `sheet_to_json` بـ`header:1`
 * @param {{deptOverride?: string|null}} [opts] اسمُ الإدارة حين تكون ورقةً لإدارة
 * @returns {object[]} السجلّات — وصفٌّ بلا «اسم الأصل» يُهمَل، فهو صفٌّ فارغ
 */
export function parseAssetRows(rows, { deptOverride = null } = {}) {
  const table = rows ?? [];
  if (table.length < 2) return [];
  const { cols, isMain } = resolveColumns(table[0]);
  const cell = (row, field) => (cols[field] !== undefined ? row[cols[field]] : row[field]);

  return table
    .slice(1)
    .filter((r) => Array.isArray(r) && r.some((c) => c !== '' && c !== null && c !== undefined))
    .map((r) => {
      const assetName = text(cell(r, 2));
      if (!assetName) return null;
      const condition = text(cell(r, 6));
      return {
        id: text(cell(r, 0)),
        assetType: text(cell(r, 1)),
        assetName,
        brand: text(cell(r, 3)),
        serial: text(cell(r, 4)),
        qty: assetQuantity(cell(r, 5)),
        condition: ASSET_CONDITIONS.includes(condition) ? condition : 'جيد',
        responsible: text(cell(r, 7)),
        department: deptOverride || text(cell(r, 8)),
        section: isMain ? text(cell(r, 9)) : text(cell(r, 8)),
        location: isMain ? text(cell(r, 10)) : text(cell(r, 9)),
        // ★ التاريخ يتبع الإزاحة كبقيّة الحقول. وكانت الشاشة تقرؤه من الحقل
        // الحادي عشر دائمًا — وهو في ورقة الإدارة عمودُ **الملاحظات**. فكان
        // كلّ استيرادٍ من إدارةٍ يفقد تاريخ الاستلام ويكتب مكانه نصّ الملاحظة،
        // ولا شيء يشتكي لأنّ الحقل نصٌّ يقبل أيّ نصّ.
        receivedDate: normalizeReceivedDate(cell(r, isMain ? 11 : 10)),
        notes: isMain ? text(cell(r, 12)) : text(cell(r, 11)),
      };
    })
    .filter(Boolean);
}

/** أرقام الشريط العلويّ وتوزيع الإدارات، مرتّبًا بالأكثر. */
export function assetStats(assets) {
  const list = assets ?? [];
  const byDepartment = new Map();
  for (const a of list) {
    if (a.department) byDepartment.set(a.department, (byDepartment.get(a.department) ?? 0) + 1);
  }
  return {
    total: list.length,
    quantity: list.reduce((sum, a) => sum + assetQuantity(a.qty), 0),
    good: list.filter((a) => GOOD_CONDITIONS.includes(a.condition)).length,
    bad: list.filter((a) => BAD_CONDITIONS.includes(a.condition)).length,
    departments: [...byDepartment.entries()].sort((x, y) => y[1] - x[1]),
  };
}

/** الحقول التي يشملها البحث الحرّ — ومنها اسم الموظّف المسؤول. */
export const SEARCHABLE_FIELDS = [
  'assetName',
  'brand',
  'serial',
  'responsible',
  'id',
  'assetType',
  'department',
  'section',
  'location',
  'notes',
];

/** تصفيةٌ بالبحث الحرّ والإدارة والحالة — والفارغ لا يُصفّي. */
export function filterAssets(assets, { q = '', department = '', condition = '' } = {}) {
  const term = String(q ?? '').trim().toLowerCase();
  return (assets ?? []).filter((a) => {
    const matchesTerm =
      !term || SEARCHABLE_FIELDS.some((f) => String(a[f] ?? '').toLowerCase().includes(term));
    return (
      matchesTerm &&
      (!department || a.department === department) &&
      (!condition || a.condition === condition)
    );
  });
}

/** بادئة ترقيم الأصول. */
export const ASSET_ID_PREFIX = 'BRZ';

/**
 * الرقم التالي في التسلسل — أكبرُ رقمٍ قائمٍ زائدَ واحد.
 * يُقرأ من السجلّات نفسها لا من عدّادٍ في الذاكرة، فلا يتصادم رقمان بعد
 * استيرادٍ يحمل أرقامًا أعلى ممّا وصل إليه العدّاد.
 */
export function nextAssetId(assets, counter = 1) {
  const used = (assets ?? [])
    .map((a) => {
      const m = String(a?.id ?? '').match(new RegExp(`^${ASSET_ID_PREFIX}-(\\d+)$`));
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => n > 0);
  const max = used.length ? Math.max(...used) : 0;
  const next = Math.max(counter, max + 1);
  return { id: `${ASSET_ID_PREFIX}-${String(next).padStart(4, '0')}`, next: next + 1 };
}
