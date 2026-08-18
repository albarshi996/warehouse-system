/**
 * الإغلاق اليوميّ للفرع ‹FNB-803› — منطق خالص.
 *
 * ═══ العناصر العشرة (أسطر 583–594) ═══
 * المبيعات · التحصيل · طرق الدفع · المرتجعات · الهدر · طلبات المخزون ·
 * التحويلات · الجرد المختصر · ساعات العمالة · الملاحظات والاستثناءات.
 *
 * ═══ وحدُّها المعلَن (ق‑ت٢) ═══
 * «لا حاجة إلى نسخ دفتر الأستاذ والبنوك والرواتب داخل البوابة» (سطر 663).
 * فالتحصيل وطرق الدفع **إشارةٌ تُقرأ من أودو** لا دفترٌ ثانٍ، وساعاتُ
 * العمالة تُقرأ من `labor_tasks` بأختام الخادم — لا إدخالَ ساعاتٍ يدويّ.
 *
 * ═══ والقاعدة الحاكمة ═══
 * **لا يُغلق يومٌ وله فرقٌ بلا سبب.** والإغلاق **ملحق-فقط**: المغلَق لا
 * يُعدَّل، والتصحيح قيدٌ جديد يشير إلى الأوّل (نفس عقد سجلّ الاستثناءات).
 * ويومٌ بلا إغلاقٍ يظهر استثناءً بعد مهلته — فالسجلّ الذي يُنسى لا يُقرأ.
 */
import { normalizeItemCode } from '../items/itemIdentity.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const day = (v) => str(v).slice(0, 10);

/**
 * العناصر العشرة ومصدرُ كلٍّ منها — و`owner` يقول **من يملك الرقم**:
 * `portal` تحسبه البوابة، و`odoo` إشارةٌ تُقرأ مرآةً (حدّ ق‑ت٢).
 */
export const CLOSE_ELEMENTS = Object.freeze([
  { key: 'sales', labelAr: 'المبيعات', owner: 'odoo', source: 'نقطة البيع عبر المرآة' },
  { key: 'collection', labelAr: 'التحصيل', owner: 'odoo', source: 'إشارةٌ من أودو — لا دفترَ نقدٍ هنا' },
  { key: 'paymentMethods', labelAr: 'طرق الدفع', owner: 'odoo', source: 'إشارةٌ من أودو' },
  { key: 'returns', labelAr: 'المرتجعات', owner: 'portal', source: 'مستندات الإرجاع' },
  { key: 'waste', labelAr: 'الهدر', owner: 'portal', source: 'سندات التالف بسبب الهدر' },
  { key: 'stockRequests', labelAr: 'طلبات المخزون', owner: 'portal', source: 'طلبات النقل' },
  { key: 'transfers', labelAr: 'التحويلات', owner: 'portal', source: 'مستندات النقل والاستلام' },
  { key: 'shortCount', labelAr: 'الجرد المختصر', owner: 'portal', source: 'محضر الجرد الدوريّ' },
  { key: 'laborHours', labelAr: 'ساعات العمالة', owner: 'portal', source: 'labor_tasks بأختام الخادم' },
  { key: 'notes', labelAr: 'الملاحظات والاستثناءات', owner: 'portal', source: 'سجلّ الاستثناءات' },
]);

/** ما تحسبه البوابة من العشرة — وما تقرؤه إشارةً. */
export function elementsBy(owner) {
  return CLOSE_ELEMENTS.filter((e) => e.owner === owner).map((e) => e.key);
}

/**
 * يبني سجلّ إغلاقٍ ليومٍ في فرع ‹FNB-803›.
 *
 * @param {{branch, date}} key
 * @param {object} ctx مصادر العناصر — كلٌّ اختياريّ، والغائب يُعلَن ولا يُخمَّن
 * @returns {object} السجلّ بعناصره العشرة و`missing` و`problems`
 */
export function buildDailyClose(key, ctx = {}) {
  const branch = up(key?.branch);
  const date = day(key?.date);
  const problems = [];
  if (!branch) problems.push('لا رمز فرع.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.push('تاريخٌ غير مقروء — الصيغة YYYY-MM-DD.');

  const docsOfType = (type) =>
    (ctx.documents || []).filter((d) => up(d?.type) === type && day(d?.header?.date ?? d?.date) === date);

  const sumLines = (docs, field) =>
    docs.reduce((s, d) => s + (d?.lines || []).reduce((x, l) => x + num(l?.[field] ?? l?.qty), 0), 0);

  const returns = docsOfType('RET');
  const waste = docsOfType('DMG');
  const requests = docsOfType('TR');
  const transfers = docsOfType('TRC');
  const counts = docsOfType('CC');

  const elements = {
    // ما يُقرأ إشارةً من أودو — لا يُحسب هنا (حدّ ق‑ت٢).
    sales: ctx.sales === undefined ? null : money(ctx.sales),
    collection: ctx.collection === undefined ? null : money(ctx.collection),
    paymentMethods: ctx.paymentMethods ?? null,
    // وما تحسبه البوابة من مستنداتها.
    returns: { count: returns.length, qty: sumLines(returns, 'qty') },
    waste: { count: waste.length, qty: sumLines(waste, 'qty') },
    stockRequests: { count: requests.length, qty: sumLines(requests, 'qty') },
    transfers: { count: transfers.length, qty: sumLines(transfers, 'qtyReceived') },
    shortCount: { count: counts.length, variance: sumLines(counts, 'variance') },
    laborHours: ctx.laborHours === undefined ? null : num(ctx.laborHours),
    notes: { open: (ctx.exceptions || []).length, text: str(ctx.notes) },
  };

  // الغائب يُسمّى — سجلٌّ ناقصٌ يُعلَن خيرٌ من سجلٍّ يبدو كاملًا وهو ليس كذلك.
  const missing = CLOSE_ELEMENTS.filter((e) => elements[e.key] === null || elements[e.key] === undefined).map((e) => e.key);

  return { branch, date, elements, missing, problems, closed: false };
}

/**
 * ★★ حكم الإغلاق ‹FNB-803›: **لا يُغلق يومٌ وله فرقٌ بلا سبب.**
 *
 * وفرقُ الجرد أخطرها: يومٌ يُغلق فوق فرقٍ غير مفسَّر يجعل رصيد الغد يبدأ
 * كاذبًا. والغائب من العناصر **يُعلَن ولا يمنع** — إلّا ما يملكه الفرع
 * نفسه (الجرد والهدر)، فغيابُه إهمالٌ لا نقصُ اتّصال.
 */
export function closeVerdict(record, { reason = '', force = false } = {}) {
  const problems = [];
  if (record?.closed) problems.push('اليوم مُغلقٌ سلفًا — والمغلَق لا يُغلق مرّتين.');
  problems.push(...(record?.problems || []));

  const variance = num(record?.elements?.shortCount?.variance);
  if (variance !== 0 && !str(reason)) {
    problems.push(
      `فرقُ جردٍ ${variance} بلا سبب — إغلاقٌ فوقه يجعل رصيد الغد يبدأ كاذبًا.`
    );
  }

  // عناصرُ الفرع نفسه: غيابُها إهمالٌ لا انقطاعُ مرآة.
  const ownMissing = (record?.missing || []).filter((k) => k === 'laborHours');
  if (ownMissing.length && !force) {
    problems.push(`ينقص السجلّ: ${ownMissing.map((k) => CLOSE_ELEMENTS.find((e) => e.key === k)?.labelAr).join(' · ')}.`);
  }

  return { ok: problems.length === 0, problems };
}

/**
 * ★ الإغلاق **ملحق-فقط**: المغلَق لا يُعدَّل، والتصحيح **سجلٌّ جديد** يشير
 * إلى الأوّل — نفس عقد سجلّ الاستثناءات («لا حذف ولا تعديلَ أثر»).
 */
export function correctionOf(closedRecord, changes = {}) {
  if (!closedRecord?.closed) {
    return { ok: false, problem: 'السجلّ لم يُغلق بعد — يُعدَّل مباشرةً ولا يحتاج تصحيحًا.', record: null };
  }
  return {
    ok: true,
    problem: '',
    record: {
      ...closedRecord,
      ...changes,
      closed: false,
      correctsRef: str(closedRecord?.id || `${closedRecord.branch}-${closedRecord.date}`),
    },
  };
}

/** مهلة الإغلاق — بعدها يُفتح استثناء «يومٌ بلا إغلاق». */
export const CLOSE_GRACE_DAYS = 1;

/**
 * استثناء يومٍ لم يُغلق — من النوع القائم `approval_stale`: تأخّرٌ عن مهلةٍ
 * لا صنفٌ جديد من الأعطاب.
 */
export function missingCloseException(branch, date, { today, graceDays = CLOSE_GRACE_DAYS } = {}) {
  const d = Date.parse(`${day(date)}T00:00:00Z`);
  const t = Date.parse(`${day(today)}T00:00:00Z`);
  if (!Number.isFinite(d) || !Number.isFinite(t)) return null;
  const elapsed = Math.round((t - d) / 86400000);
  if (elapsed <= num(graceDays)) return null;
  return {
    type: 'approval_stale',
    location: up(branch),
    reason: `لم يُغلق يوم ${day(date)} بعد ${elapsed} يومًا — سجلٌّ يُنسى لا يُقرأ.`,
  };
}

/** ملخّص إغلاقاتٍ عبر الفروع — لبرج المراقبة، مرتَّبًا بالأكثر نقصًا. */
export function closeSummary(records = []) {
  return (Array.isArray(records) ? records : [])
    .map((r) => ({
      branch: up(r?.branch),
      date: day(r?.date),
      closed: Boolean(r?.closed),
      missing: (r?.missing || []).length,
      variance: num(r?.elements?.shortCount?.variance),
      openExceptions: num(r?.elements?.notes?.open),
    }))
    .sort((a, b) => Number(a.closed) - Number(b.closed) || b.missing - a.missing);
}

/** رمزُ صنفٍ مطبَّع — للاستعمال في تقارير الإغلاق. */
export const itemKey = normalizeItemCode;
