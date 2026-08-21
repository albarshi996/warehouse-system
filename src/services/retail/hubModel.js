/**
 * منطق «مركز التجزئة — بنغازي» الخالص.
 *
 * كان هذا كلّه داخل وسم `script` في `/dashboard/retail-hub`، أي **خارج نطاق
 * `npm test` بالبناء**: لا اختبارَ يبلغه مهما أردنا، لأنّ المِمسحة تمسح
 * `*.test.js` تحت `src` ولا تدخل الوسوم. فنزل هنا ومعه حرّاسه.
 *
 * وأخطرُه الهندسة: السداسيّ يُرسم على خريطةٍ حقيقيّة، وخطؤه **لا يُعلن نفسه**
 * — يظهر شكلًا معقولًا في غير موضعه. ولذلك يُختبر هنا بالعدد لا بالعين.
 *
 * القاعدة الحاكمة: هذا الملفّ لا يعرف DOM ولا Firebase ولا Leaflet — يأخذ
 * صفوفًا ويُعيد أرقامًا ونصوصًا. والكتابة السحابيّة في `hubService.js`.
 */

/**
 * تصحيحُ خطّ الطول عند خطّ عرض بنغازي (≈32.1°).
 *
 * درجةُ طولٍ واحدة أقصرُ من درجة عرضٍ واحدة كلّما ابتعدنا عن خطّ الاستواء،
 * بنسبة جيب تمام خطّ العرض. وإهمالُه يجعل «الدائرة» بيضةً مسطّحة والسداسيَّ
 * مائلًا — وهو خطأٌ يُرى معقولًا فلا يُشتبه فيه.
 */
export const LAT_CORR = Math.cos((32.1 * Math.PI) / 180);

/** ألوان مطابقة السوق — الأحمر للتحذير وحده، عملًا بمعيار اللوحات. */
export function matchColor(match) {
  if (match === 'غير مطابق') return '#f85149';
  if (match === 'جزئي') return '#d29922';
  return '#3fb950';
}

const INCOME_LABELS = {
  مرتفع: '💰 مرتفع',
  'متوسط-جيد': '💵 متوسط-جيد',
  متوسط: '💴 متوسط',
  متباين: '💱 متباين',
};

const INFRA_LABELS = {
  ممتاز: '🟢 ممتازة',
  جيد: '🔵 جيدة',
  متوسط: '🟡 متوسطة',
  قديمة: '🔴 قديمة',
  'قيد التطور': '🟠 قيد التطور',
};

const SECTOR_LABELS = {
  1: 'وسط البلد',
  2: 'مناطق راقية',
  3: 'كثافة FMCG',
  4: 'لوجستي',
  5: 'ضواحي توسع',
};

/** وسمُ الدخل — والمجهول يمرّ كما هو بدل أن يصير فراغًا. */
export const incomeLabel = (income) => INCOME_LABELS[income] ?? income;

/** وسمُ البنية التحتيّة. */
export const infraLabel = (infra) => INFRA_LABELS[infra] ?? infra;

/** اسمُ القطاع من رقمه. */
export const sectorLabel = (sector) => SECTOR_LABELS[sector] ?? sector;

/** صنفُ شارة الشريحة (A·B·C·D) — وما سواها يقع على C. */
export const segmentBadgeClass = (seg) =>
  seg === 'A' ? 'badge-A' : seg === 'B' ? 'badge-B' : seg === 'D' ? 'badge-D' : 'badge-C';

/**
 * يدمج تعديلات المندوبين فوق البذرة.
 *
 * البذرة لا تُمسّ، والتعديل يُعرَف بمعرّف الحيّ. وتعديلٌ لمعرّفٍ لا وجود له
 * **يُهمَل ولا يُضاف**: التعديل تصحيحُ حيٍّ قائم لا بابٌ لاختراع أحياء، وإلّا
 * لصار كلُّ سطرٍ فاسدٍ في السحابة حيًّا جديدًا على الخريطة.
 *
 * @param {object[]} seed البذرة الثابتة
 * @param {object[]} overrides التعديلات
 * @returns {object[]} نسخةٌ جديدة — لا يُعدَّل المدخل
 */
export function mergeOverrides(seed, overrides) {
  const byId = new Map((overrides ?? []).filter((o) => o && o.id != null).map((o) => [o.id, o]));
  return (seed ?? []).map((row) => (byId.has(row.id) ? { ...row, ...byId.get(row.id) } : { ...row }));
}

/**
 * أرقام الشريط العلويّ.
 * السكّان بالمليون بمنزلتين — كما تُعرض في الشاشة، فلا يُحسب التقريب مرّتين.
 */
export function hubStats(rows) {
  const list = rows ?? [];
  const countMatch = (v) => list.filter((d) => d.market_match === v).length;
  const population = list.reduce((sum, d) => sum + (Number(d.population) || 0), 0);
  return {
    total: list.length,
    full: countMatch('مطابق'),
    partial: countMatch('جزئي'),
    none: countMatch('غير مطابق'),
    population,
    populationLabel: `${(population / 1000000).toFixed(2)}م`,
  };
}

/**
 * رؤوس سداسيٍّ منتظم حول مركزٍ جغرافيّ، بترتيب `[lng, lat]`.
 *
 * الرأس الأوّل عند −30° فيقف السداسيّ على ضلعٍ لا على رأس (flat-top)، وهو
 * الشكل الذي تُرصف به الخلايا بلا فجوات. والرأس الأخير يُكرّر الأوّل ليُغلق
 * المضلّع — فمضلّعٌ غير مغلقٍ يرسمه Leaflet مفتوحًا بلا شكوى.
 *
 * @param {number} cLat خط العرض المركزيّ
 * @param {number} cLng خط الطول المركزيّ
 * @param {number} r نصف القطر بالدرجات (على محور العرض)
 * @returns {Array<[number, number]>} سبع نقاط، آخرها كأوّلها
 */
export function hexPolygon(cLat, cLng, r) {
  const pts = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push([cLng + (r / LAT_CORR) * Math.cos(a), cLat + r * Math.sin(a)]);
  }
  pts.push(pts[0]);
  return pts;
}

/** حدّا نصف القطر — أصغرُه يبقى مرئيًّا، وأكبرُه لا يبتلع جاره. */
export const HEX_MIN_RADIUS = 0.006;
export const HEX_MAX_RADIUS = 0.012;

/**
 * نصف قطرٍ يتبع ازدحام الجوار: نصفُ المسافة إلى أقرب حيٍّ، محصورًا بين الحدّين.
 *
 * فحيٌّ معزولٌ لا يتضخّم بلا حدّ، وحيٌّ في زحام وسط البلد لا يطمس جيرانه.
 * والمسافة تُقاس بعد تصحيح خطّ الطول، وإلّا لبدا المتجاوران في الشرق والغرب
 * أبعدَ ممّا هما.
 *
 * @param {{id:*, lat:number, lng:number}} hood الحيّ المعنيّ
 * @param {object[]} rows كلّ الأحياء — بما فيها هو، ويُستثنى بمعرّفه
 */
export function adaptiveRadius(hood, rows) {
  let nearest = Infinity;
  for (const other of rows ?? []) {
    if (other.id === hood.id) continue;
    const dLat = hood.lat - other.lat;
    const dLng = (hood.lng - other.lng) * LAT_CORR;
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    if (dist < nearest) nearest = dist;
  }
  if (!Number.isFinite(nearest)) return HEX_MAX_RADIUS;
  return Math.max(HEX_MIN_RADIUS, Math.min(HEX_MAX_RADIUS, nearest * 0.5));
}

/** الحقول التي يملك المندوب تعديلها — وما سواها لا يُكتب مهما أُرسل. */
export const EDITABLE_FIELDS = [
  'neighborhood',
  'class',
  'population',
  'income',
  'flow',
  'infra',
  'market_type',
  'market_match',
  'segments_present',
  'gap',
  'notes',
];

/**
 * يُنقّي تعديلًا قادمًا قبل حفظه: المعرّف والحقول المسموحة لا غير.
 *
 * الحاجة ليست نظريّة — ما يُحفظ يُدمج فوق البذرة ثمّ يُرسم على الخريطة. فلو
 * مرّ `lat` أو `lng` في التعديل لَنقل مندوبٌ حيًّا إلى البحر بتحريرِ حقلٍ في
 * نموذج. والإحداثيّات بذرةٌ لا تُحرَّر — بخلاف الاسم، فهو وسمٌ لا موضع،
 * والنموذج القائم يسمح بتصحيحه منذ اليوم الأوّل.
 *
 * @returns {object|null} تعديلٌ نظيف، أو `null` إن لم يكن فيه معرّفٌ صالح
 */
export function sanitizeOverride(patch) {
  const id = patch?.id;
  if (!Number.isInteger(id) || id <= 0) return null;
  const clean = { id };
  for (const field of EDITABLE_FIELDS) {
    if (patch[field] !== undefined) clean[field] = patch[field];
  }
  return clean;
}
