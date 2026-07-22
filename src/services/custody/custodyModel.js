/**
 * منطق العُهد العينية الخالص — المرجع التشغيلي ٥-١.
 *
 * المشكلة الفعلية التي يحلها: فقدان أجهزة المسح والطابعات والعدد اليدوية
 * خسارة شهرية متكررة غير موثقة. القاعدة: لا يُسلَّم جهاز إلا بسند استلام
 * عهدة رسمي مُرقَّم، وعند الفقد/الإتلاف تُوثَّق قيمة الخصم.
 */

/** حالات سند العهدة. */
export const CUSTODY_STATES = {
  active: { id: 'active', label: 'عهدة نشطة', emoji: '🤝', color: '#0ea5e9' },
  returned: { id: 'returned', label: 'أُرجعت', emoji: '✅', color: '#10b981' },
  lost: { id: 'lost', label: 'مفقودة', emoji: '🚨', color: '#ef4444' },
  damaged: { id: 'damaged', label: 'أُتلفت', emoji: '⚠️', color: '#f59e0b' },
};

/** الانتقالات: النشطة تُغلق بإرجاع أو فقد أو إتلاف — والمغلق لا يُفتح. */
export const CUSTODY_TRANSITIONS = {
  active: ['returned', 'lost', 'damaged'],
  returned: [],
  lost: [],
  damaged: [],
};

export function canTransitionCustody(from, to) {
  return (CUSTODY_TRANSITIONS[from] || []).includes(to);
}

/** أصناف العُهد الشائعة (تسهيل إدخال — النص حرّ في النهاية). */
export const CUSTODY_ITEM_KINDS = [
  'جهاز مسح باركود (PDA)',
  'طابعة ملصقات بلوتوث',
  'جهاز لوحي',
  'هاتف عمل',
  'عدد يدوية',
  'مفاتيح مخزن',
  'أخرى',
];

/** حالة الجهاز عند التسليم/الإرجاع. */
export const CONDITIONS = ['جديد', 'جيد', 'مستعمل بحالة مقبولة', 'به ملاحظات'];

/**
 * التحقق قبل إصدار السند: { ok, problems[] }.
 */
export function custodyVerdict(record) {
  const r = record || {};
  const problems = [];
  if (!String(r.employeeName || '').trim()) problems.push('اسم الموظف مطلوب');
  if (!String(r.itemDesc || '').trim()) problems.push('وصف العهدة مطلوب');
  if (!String(r.condition || '').trim()) problems.push('حالة العهدة عند التسليم مطلوبة');
  if (r.value !== '' && r.value != null && !(Number(r.value) >= 0)) {
    problems.push('قيمة العهدة يجب أن تكون رقمًا موجبًا (د.ل)');
  }
  return { ok: problems.length === 0, problems };
}

/**
 * ملخص السجل: نشطة/مرجعة/مفقودة/متلفة + القيمة تحت المخاطرة (النشطة)
 * + قيمة الخصومات المقترحة (المفقودة والمتلفة).
 */
export function custodySummary(records) {
  const sum = { total: 0, active: 0, returned: 0, lost: 0, damaged: 0, valueAtRisk: 0, lossValue: 0 };
  for (const r of records || []) {
    if (!CUSTODY_STATES[r.state]) continue;
    sum.total += 1;
    sum[r.state] += 1;
    const v = Number(r.value) || 0;
    if (r.state === 'active') sum.valueAtRisk += v;
    if (r.state === 'lost' || r.state === 'damaged') sum.lossValue += Number(r.deduction ?? v) || 0;
  }
  return sum;
}

/** تجميع لكل موظف: كم عهدة نشطة وبأي قيمة (لكشف من تكدّست عنده الأجهزة). */
export function byEmployee(records) {
  const map = new Map();
  for (const r of records || []) {
    if (r.state !== 'active') continue;
    const key = String(r.employeeName || '').trim() || 'غير معروف';
    const cur = map.get(key) || { employeeName: key, count: 0, value: 0 };
    cur.count += 1;
    cur.value += Number(r.value) || 0;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}
