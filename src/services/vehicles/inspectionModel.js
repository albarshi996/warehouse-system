/**
 * نموذج فحص المركبات — المنطق الخالص (بلا DOM ولا Firestore).
 *
 * المصدر الوحيد لبنود الفحص وحقول النموذج: الصفحة والتصدير والاستيراد
 * والبذرة كلّها تقرأ من هنا، فلا ينحرف اسم بند بين شاشة وملف.
 *
 * أصلُه أداة `vehicle-inspection-brandzo.html` المستقلة، مع إصلاح أخطائها
 * المنطقية أثناء النقل:
 *   1. نسبة الاكتمال كانت تَعُدّ «الفحص الداخلي» مرّتين وتَعُدّ بنود النقل
 *      حتى للسيارة الإدارية التي لا تراها ⇒ النسبة لا تبلغ 100% أبدًا.
 *   2. تصدير الإكسل كان يُسقط قسم «الملحقات والوثائق» كاملًا (8 حقول تضيع
 *      من النسخة الاحتياطية بصمت) — صار التصدير شاملًا هنا.
 *   3. رقم النموذج كان عشوائيًّا (تصادم محتمل) — الترقيم صار تسلسليًّا من
 *      عدّاد السحابة (vehiclesService).
 */

export const VEHICLE_CATEGORIES = ['سيارة إدارية', 'مركبة نقل', 'معدة ثقيلة', 'حافلة'];

/** الأنواع التي يظهر لها قسم «بنود النقل والمعدات». */
export const TRANSPORT_CATEGORIES = ['مركبة نقل', 'معدة ثقيلة', 'حافلة'];

export const STATUS_VALUES = ['سليم', 'يحتاج متابعة', 'معطل', 'لا ينطبق'];

export const OVERALL_STATUSES = [
  'مقبولة - جاهزة للتشغيل',
  'مقبولة بشروط - تحتاج إصلاحات',
  'مرفوضة - غير صالحة للتشغيل',
];

export const EXT_ITEMS = [
  { id: 'ext1', label: 'الهيكل العام - وجود صدمات أو تشويه' },
  { id: 'ext2', label: 'لون الطلاء - تجانس اللون وعدم وجود طلاء مجدد' },
  { id: 'ext3', label: 'الباب الأمامي الأيمن' },
  { id: 'ext4', label: 'الباب الأمامي الأيسر' },
  { id: 'ext5', label: 'الباب الخلفي الأيمن' },
  { id: 'ext6', label: 'الباب الخلفي الأيسر' },
  { id: 'ext7', label: 'غطاء المحرك - سلامة الإقفال' },
  { id: 'ext8', label: 'الصندوق الخلفي / الكبوت' },
  { id: 'ext9', label: 'الجناح الأمامي الأيمن' },
  { id: 'ext10', label: 'الجناح الأمامي الأيسر' },
  { id: 'ext11', label: 'الجناح الخلفي الأيمن' },
  { id: 'ext12', label: 'الجناح الخلفي الأيسر' },
  { id: 'ext13', label: 'المصد الأمامي - سلامة وتثبيت' },
  { id: 'ext14', label: 'المصد الخلفي - سلامة وتثبيت' },
  { id: 'ext15', label: 'الزجاج الأمامي - شقوق أو كسر' },
  { id: 'ext16', label: 'الزجاج الخلفي' },
  { id: 'ext17', label: 'زجاج الجانب الأيمن (كامل)' },
  { id: 'ext18', label: 'زجاج الجانب الأيسر (كامل)' },
  { id: 'ext19', label: 'المرايا الجانبية - اتجاه وسلامة' },
  { id: 'ext20', label: 'المصابيح الأمامية (هيدلايت)' },
  { id: 'ext21', label: 'الإشارات والأضواء الجانبية' },
  { id: 'ext22', label: 'المصابيح الخلفية والفرامل' },
  { id: 'ext23', label: 'السقف ووجود صدأ أو تلف' },
  { id: 'ext24', label: 'الأرضية أسفل المركبة - صدأ أو تسريب' },
];

export const MECH_ITEMS = [
  { id: 'm1', label: 'مستوى زيت المحرك' },
  { id: 'm2', label: 'حالة زيت المحرك (اللون والرائحة)' },
  { id: 'm3', label: 'مستوى ماء الرادياتير / سائل التبريد' },
  { id: 'm4', label: 'حالة الرادياتير - تسريب أو تآكل' },
  { id: 'm5', label: 'سائل ناقل الحركة (جير)' },
  { id: 'm6', label: 'سائل الدريكسيون الهيدروليكي' },
  { id: 'm7', label: 'سائل الفرامل' },
  { id: 'm8', label: 'سائل محور الزجاج' },
  { id: 'm9', label: 'البطارية - الشحن والتثبيت' },
  { id: 'm10', label: 'حزام الميناتور / الداينمو' },
  { id: 'm11', label: 'حزام التوقيت أو السلسلة (إن أمكن)' },
  { id: 'm12', label: 'نظام العادم والشكمان - تسريب أو صوت' },
  { id: 'm13', label: 'الفرامل الأمامية (تآكل وسماكة)' },
  { id: 'm14', label: 'الفرامل الخلفية (تآكل وسماكة)' },
  { id: 'm15', label: 'الفرامل اليدوية' },
  { id: 'm16', label: 'نظام التوجيه والدريكسيون' },
  { id: 'm17', label: 'المشكات والروافد' },
  { id: 'm18', label: 'الصلبة والقضبان' },
  { id: 'm19', label: 'جهاز التعليق الأمامي (مطاط ومساعد)' },
  { id: 'm20', label: 'جهاز التعليق الخلفي' },
  { id: 'm21', label: 'ناقل الحركة / التروس - سلاسة التحويل' },
  { id: 'm22', label: 'الوصلات المرنة والأكسل' },
  { id: 'm23', label: 'مضخة الوقود وخط الوقود' },
  { id: 'm24', label: 'فلتر الهواء - نظافة' },
  { id: 'm25', label: 'فلتر الوقود - حالة' },
  { id: 'm26', label: 'نظام التكييف - ضغط الغاز' },
  { id: 'm27', label: 'ضاغط التكييف (كمبريسور)' },
];

export const ELEC_ITEMS = [
  { id: 'e1', label: 'تشغيل المحرك - سلاسة الإقلاع' },
  { id: 'e2', label: 'مؤشرات لوحة القيادة' },
  { id: 'e3', label: 'مؤشر الوقود' },
  { id: 'e4', label: 'مؤشر درجة حرارة المحرك' },
  { id: 'e5', label: 'الضوء الأمامي القصير والبعيد' },
  { id: 'e6', label: 'أضواء الضباب (إن وجدت)' },
  { id: 'e7', label: 'إشارات الانعطاف (4 زوايا)' },
  { id: 'e8', label: 'أضواء التحذير الطارئة (فلاشر)' },
  { id: 'e9', label: 'أضواء الرجوع (النزول)' },
  { id: 'e10', label: 'بوق التنبيه' },
  { id: 'e11', label: 'شاشة ووسائط الترفيه' },
  { id: 'e12', label: 'نظام مسح الزجاج (شبان الشاشة)' },
  { id: 'e13', label: 'رافعات النوافذ الكهربائية' },
  { id: 'e14', label: 'مرايا كهربائية' },
  { id: 'e15', label: 'نظام الإنذار من السرقة' },
  { id: 'e16', label: 'أجهزة الاستشعار (Park Sensors)' },
  { id: 'e17', label: 'الشاحن والمقابس الداخلية' },
];

export const INT_ITEMS = [
  { id: 'i1', label: 'حالة المقاعد الأمامية - شقوق أو تمزق' },
  { id: 'i2', label: 'حالة المقاعد الخلفية' },
  { id: 'i3', label: 'حزام الأمان (جميع المقاعد)' },
  { id: 'i4', label: 'السقف الداخلي والتنجيد' },
  { id: 'i5', label: 'الأرضية وإسفنج الأرضية' },
  { id: 'i6', label: 'الكونسول والداشبورد - شقوق' },
  { id: 'i7', label: 'مقود القيادة' },
  { id: 'i8', label: 'البداليات والكبة' },
  { id: 'i9', label: 'عمل التكييف من الداخل' },
  { id: 'i10', label: 'فتحة السقف (إن وجدت)' },
  { id: 'i11', label: 'نظافة الداخل العام' },
];

export const TRANS_ITEMS = [
  { id: 't1', label: 'هيكل الصندوق / المقطورة - سلامة' },
  { id: 't2', label: 'باب الصندوق الخلفي - إقفال وإغلاق' },
  { id: 't3', label: 'الرافعة الهيدروليكية (لوري القلاب)' },
  { id: 't4', label: 'خزان الوقود الإضافي - تسريب' },
  { id: 't5', label: 'نظام الهواء المضغوط (الفرامل الهوائية)' },
  { id: 't6', label: 'خزان الهواء وأنابيبه' },
  { id: 't7', label: 'الأرجل الدعامة (الجاك الجانبي للمقطورة)' },
  { id: 't8', label: 'سلسلة/كوبلة ربط المقطورة' },
  { id: 't9', label: 'أضواء المقطورة / الصندوق' },
  { id: 't10', label: 'الإطارات الوسطى (للشاحنات ذات المحور المزدوج)' },
  { id: 't11', label: 'صلابة الشاسيه وحمالات التعليق الخلفي' },
  { id: 't12', label: 'نظام PTO (نقل القدرة) إن وجد' },
  { id: 't13', label: 'الرافعة / الأوناش إن وجدت' },
  { id: 't14', label: 'الأقفاص والحواجز الداخلية للصندوق' },
];

export const SECTIONS = [
  { key: 'ext', num: '٢', title: 'الفحص الخارجي للهيكل', icon: '🔍', items: EXT_ITEMS },
  { key: 'mech', num: '٣', title: 'الفحص الميكانيكي', icon: '⚙️', items: MECH_ITEMS },
  { key: 'elec', num: '٤', title: 'الفحص الكهربائي', icon: '⚡', items: ELEC_ITEMS },
  { key: 'int', num: '٦', title: 'الفحص الداخلي', icon: '🪑', items: INT_ITEMS },
  { key: 'trans', num: '٧', title: 'بنود خاصة بمركبات النقل والمعدات', icon: '🚛', items: TRANS_ITEMS },
];

export const ALL_ITEMS = SECTIONS.flatMap((s) => s.items.map((it) => ({ ...it, section: s.title, sectionKey: s.key })));

export const TIRE_POSITIONS = [
  { id: 'fl', label: 'الأمامي الأيمن', icon: '↖' },
  { id: 'fr', label: 'الأمامي الأيسر', icon: '↗' },
  { id: 'rl', label: 'الخلفي الأيمن', icon: '↙' },
  { id: 'rr', label: 'الخلفي الأيسر', icon: '↘' },
];

/** ملحقات السلامة في قسم الإطارات. */
export const SAFETY_FIELDS = [
  { name: 'spareTire', label: 'الإطار الاحتياطي' },
  { name: 'triangle', label: 'المثلث العاكس' },
  { name: 'fireExt', label: 'طفاية الحريق' },
];

/** قسم ٨ — الملحقات والوثائق (كان يسقط من التصدير القديم بصمت). */
export const ACCESSORY_FIELDS = [
  { name: 'ownerManual', label: 'دليل المالك' },
  { name: 'partsCatalog', label: 'كتالوج قطع الغيار' },
  { name: 'regCard', label: 'استمارة تسجيل' },
  { name: 'insDoc', label: 'وثيقة التأمين' },
  { name: 'extraKeys', label: 'مفاتيح إضافية (العدد)' },
  { name: 'jackCard', label: 'بطاقة رفع (جاكاوية)' },
  { name: 'tireWrench', label: 'مفتاح الإطارات' },
  { name: 'gps', label: 'جهاز GPS / تتبع' },
];

/** حقول «البيانات الأساسية» — الاسم البرمجي ↔ التسمية في الشاشة والإكسل. */
export const INFO_FIELDS = [
  { name: 'formNo', label: 'رقم النموذج' },
  { name: 'inspDate', label: 'تاريخ الفحص' },
  { name: 'inspTime', label: 'وقت الفحص' },
  { name: 'department', label: 'الجهة / القسم' },
  { name: 'plateNo', label: 'رقم اللوحة' },
  { name: 'brand', label: 'الماركة' },
  { name: 'model', label: 'الموديل' },
  { name: 'year', label: 'سنة الصنع' },
  { name: 'color', label: 'اللون' },
  { name: 'vin', label: 'رقم الهيكل (VIN)' },
  { name: 'engineNo', label: 'رقم المحرك' },
  { name: 'fuelType', label: 'نوع الوقود' },
  { name: 'odometer', label: 'العداد الحالي (كم)' },
  { name: 'lastService', label: 'تاريخ آخر صيانة' },
  { name: 'lastServiceKm', label: 'آخر صيانة عند (كم)' },
  { name: 'licExpiry', label: 'انتهاء الرخصة' },
  { name: 'receivedFrom', label: 'المستلم من' },
  { name: 'insNo', label: 'رقم وثيقة التأمين' },
  { name: 'insExpiry', label: 'انتهاء التأمين' },
  { name: 'payload', label: 'الحمولة (طن)' },
];

/** فحص فارغ جاهز للملء. */
export function emptyInspection() {
  return {
    info: { category: VEHICLE_CATEGORIES[0] },
    items: {}, // { ext1: { status, notes }, ... }
    tires: {}, // { fl: { size, depth, pressure, cond }, ... }
    safety: {}, // { spareTire, triangle, fireExt }
    accessories: {}, // { ownerManual, ... }
    overallStatus: '',
    generalNotes: '',
    signatures: { mechanic: '', receiver: '', supervisor: '' },
  };
}

/** البنود المعنيّة فعلًا بحسب نوع المركبة (قسم النقل لا يخصّ السيارة الإدارية). */
export function relevantItems(category) {
  const withTrans = TRANSPORT_CATEGORIES.includes(category || '');
  return withTrans ? ALL_ITEMS : ALL_ITEMS.filter((it) => it.sectionKey !== 'trans');
}

/**
 * ملخّص الفحص: العدّ على البنود المعنيّة فقط.
 * (النسخة القديمة كانت تعدّ «الداخلي» مرّتين وتحاسب سيارةً إداريةً على بنود
 * النقل المخفيّة عنها، فلا تبلغ النسبة 100% أبدًا.)
 */
export function summarize(inspection) {
  const counts = { ok: 0, warn: 0, bad: 0, na: 0 };
  const key = { سليم: 'ok', 'يحتاج متابعة': 'warn', معطل: 'bad', 'لا ينطبق': 'na' };
  const relevant = relevantItems(inspection?.info?.category);
  for (const it of relevant) {
    const status = inspection?.items?.[it.id]?.status;
    if (key[status]) counts[key[status]] += 1;
  }
  const done = counts.ok + counts.warn + counts.bad + counts.na;
  const total = relevant.length;
  const pct = total ? Math.min(Math.round((done / total) * 100), 100) : 0;
  return { ...counts, done, total, pct };
}

/**
 * معرّف مستند المركبة في Firestore — مشتقّ من اللوحة (وإلا الهيكل، وإلا
 * المستلم) بعد تنقيته من المحارف الممنوعة. حتميّ: إعادة استيراد نفس
 * المركبة تُحدّث مستندها ولا تُكرّره.
 */
export function vehicleIdFor(inspection) {
  const info = inspection?.info || {};
  const raw = String(info.plateNo || '').trim() || String(info.vin || '').trim() || String(info.receivedFrom || '').trim();
  if (!raw) return '';
  const clean = raw
    .replace(/[/\\.#$[\]]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return clean ? `veh-${clean}` : '';
}

/** حقول بطاقة المركبة في سجلّ الأسطول، مستخلصة من فحص. */
export function vehicleHeadFrom(inspection) {
  const info = inspection?.info || {};
  const s = summarize(inspection);
  return {
    plateNo: info.plateNo || '',
    brand: info.brand || '',
    model: info.model || '',
    year: info.year || '',
    color: info.color || '',
    vin: info.vin || '',
    engineNo: info.engineNo || '',
    fuelType: info.fuelType || '',
    category: info.category || '',
    department: info.department || '',
    receivedFrom: info.receivedFrom || '',
    odometer: info.odometer || '',
    licExpiry: info.licExpiry || '',
    insNo: info.insNo || '',
    insExpiry: info.insExpiry || '',
    payload: info.payload || '',
    lastInspection: {
      number: info.formNo || '',
      date: info.inspDate || '',
      overallStatus: inspection?.overallStatus || '',
      ok: s.ok,
      warn: s.warn,
      bad: s.bad,
      na: s.na,
      pct: s.pct,
    },
  };
}
