/**
 * مطابقة المخزون — منطق خالص بلا Firebase.
 *
 * ثلاثة أرقام منفصلة، لا رقمٌ واحد اسمه «الرصيد»:
 *   · **رصيد النظام** — آخر لقطةٍ مستوردة من الشيت.
 *   · **الرصيد الفعليّ** — ما أثبتته حركات البوابة ومسحُها.
 *   · **الفرق** — الفعليّ ناقص النظام.
 *
 * ═══ المستوى الذي تُقارَن عنده — أهمّ قرارٍ في هذا الملفّ ═══
 *
 * رفوفنا (`MAIN-A01-R01`) **تُعرَّف داخل البوابة ولا يعرفها النظام المصدر**.
 * فالمقارنة على مستوى الرفّ **مستحيلة** ما لم يُقسّم النظام مخزونه بمواقع.
 * ولذلك يُختار المستوى **من الشيت نفسه** لا بافتراضٍ منّا:
 *
 *   الشيت فيه موقع نظام ⇒ المقارنة (صنف × مستودع × موقع النظام [× دفعة])
 *   الشيت بلا موقع      ⇒ المقارنة (صنف × مستودع [× دفعة])
 *
 * والفعليّ يُجمَّع إلى **نفس** المستوى قبل الطرح. ومقارنةُ رقمٍ مفصّلٍ برقمٍ
 * مجمَّل تُنتج فروقًا كاذبة بعدد الرفوف.
 *
 * ═══ والفرق لا يُصلَح هنا ═══
 * البوابة **لا تكتب في أيّ نظامٍ خارجيّ**. فالفرق يتحوّل إلى محضر جرد `CC`
 * ثمّ تسوية `ADJ` خاضعة للاعتماد — لا إلى تعديلٍ صامت لأيّ طرف.
 */

import { balanceLocationCode } from './locationsModel.js';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const up = (v) => String(v ?? '').trim().toUpperCase();

/** فرقٌ أصغر من هذا يُعدّ صفرًا — الكسور لا تُنتج انحرافًا وهميًّا. */
export const EPSILON = 0.0001;

/**
 * يقرّر مستوى المقارنة من الشيت نفسه.
 * @returns {{byLocation:boolean, byBatch:boolean}}
 */
export function detectLevel(snapshotRows) {
  const rows = snapshotRows || [];
  return {
    byLocation: rows.some((r) => up(r?.systemLocation)),
    byBatch: rows.some((r) => up(r?.batch)),
  };
}

/** مفتاح المقارنة عند المستوى المختار. */
export function matchKey(row, level, { physical = false } = {}) {
  const item = up(row?.sku) || up(row?.barcode);
  const wh = up(row?.warehouse);
  const parts = [item, wh];
  if (level.byLocation) {
    // الفعليّ يُنسب إلى موقع **البوابة**، والنظام إلى موقعه هو. وحين يختلف
    // المرجعان لا يُقارَن بالموقع أصلًا — يحرسه `locationMismatch` أدناه.
    parts.push(physical ? balanceLocationCode(row) : up(row?.systemLocation));
  }
  if (level.byBatch) parts.push(up(row?.batch) || 'NOBATCH');
  return parts.join('__');
}

function sumBy(rows, level, opts) {
  const out = new Map();
  for (const r of rows || []) {
    const key = matchKey(r, level, opts);
    const qty = opts?.physical ? num(r?.qty) : num(r?.systemQty);
    const prev = out.get(key);
    if (prev) prev.qty += qty;
    else {
      out.set(key, {
        key,
        sku: String(r?.sku ?? ''),
        barcode: String(r?.barcode ?? ''),
        description: String(r?.description ?? r?.nameAr ?? ''),
        warehouse: up(r?.warehouse),
        location: opts?.physical ? balanceLocationCode(r) : up(r?.systemLocation),
        batch: String(r?.batch ?? ''),
        expiry: String(r?.expiry ?? ''),
        qty,
      });
    }
  }
  return out;
}

/**
 * المطابقة الكاملة.
 *
 * @param {Array} snapshotRows صفوف ورقة StockSnapshot المستوردة
 * @param {Array} balances     الأرصدة الفعليّة من البوابة
 * @returns {{level, rows, summary, snapshotDate}}
 */
export function reconcile(snapshotRows, balances, { epsilon = EPSILON } = {}) {
  const level = detectLevel(snapshotRows);
  const system = sumBy(snapshotRows, level, { physical: false });
  const physical = sumBy(balances, level, { physical: true });

  const rows = [];
  for (const key of new Set([...system.keys(), ...physical.keys()])) {
    const s = system.get(key);
    const p = physical.get(key);
    const systemQty = s ? s.qty : 0;
    const physicalQty = p ? p.qty : 0;
    const variance = physicalQty - systemQty;
    const base = p || s;

    rows.push({
      key,
      sku: base.sku,
      barcode: base.barcode,
      description: base.description,
      warehouse: base.warehouse,
      location: base.location,
      // الموقعان **منفصلان** عمدًا: موقعُ النظام مرجعٌ وموقعُ البوابة مرجعٌ
      // آخر، ودمجُهما في حقلٍ واحد يجعل فحص التطابق يقرأ نفسه ويرضى.
      systemLocation: s ? s.location : '',
      portalLocation: p ? p.location : '',
      batch: base.batch,
      expiry: base.expiry,
      systemQty,
      physicalQty,
      variance,
      // التصنيف يقول **ماذا يعني** الفرق لا مقداره فقط.
      status:
        Math.abs(variance) <= epsilon
          ? 'match'
          : !s
            ? 'missing-in-system' // عندنا ولا يعرفه النظام
            : !p
              ? 'missing-in-portal' // يعرفه النظام ولا وجود له عندنا
              : variance > 0
                ? 'surplus'
                : 'shortage',
    });
  }

  rows.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

  const counted = (st) => rows.filter((r) => r.status === st).length;
  return {
    level,
    rows,
    snapshotDate: String((snapshotRows || [])[0]?.snapshotDate ?? ''),
    summary: {
      lines: rows.length,
      matched: counted('match'),
      surplus: counted('surplus'),
      shortage: counted('shortage'),
      missingInSystem: counted('missing-in-system'),
      missingInPortal: counted('missing-in-portal'),
      systemQty: rows.reduce((s, r) => s + r.systemQty, 0),
      physicalQty: rows.reduce((s, r) => s + r.physicalQty, 0),
      netVariance: rows.reduce((s, r) => s + r.variance, 0),
    },
  };
}

/** الصفوف التي تحتاج معالجة — ما ليس مطابقًا. */
export function variances(report) {
  return (report?.rows || []).filter((r) => r.status !== 'match');
}

/**
 * ⚠️ حدُّ المقارنة حين يختلف المرجعان.
 *
 * إن حمل الشيت مواقعَ نظامٍ لا تطابق أكواد رفوفنا، فالمقارنة بالموقع تُنتج
 * «فروقًا» بعدد الرفوف وهي وهمٌ كامل. يُعلَن الحدّ ولا يُخفى.
 */
export function locationMismatch(report, portalLocationCodes) {
  if (!report?.level?.byLocation) return '';
  const known = new Set((portalLocationCodes || []).map(up));
  if (!known.size) return '';
  // تُقرأ مواقع **النظام** وحدها — لا الحقل المدموج، وإلّا قارن الفحصُ
  // مواقعنا بمواقعنا فوجد تطابقًا وسكت عن الخلل.
  const systemLocs = new Set(report.rows.map((r) => up(r.systemLocation)).filter(Boolean));
  const overlap = [...systemLocs].filter((l) => known.has(l)).length;
  if (overlap === 0 && systemLocs.size > 0) {
    return 'مواقع الشيت لا تطابق أيًّا من رفوف البوابة — المقارنة بالموقع تُنتج فروقًا وهميّة. اترك عمود موقع النظام فارغًا ليُقارَن على مستوى الصنف والمستودع.';
  }
  return '';
}

/**
 * يحوّل الفروقات إلى مسودّة محضر جرد `CC` — لا تسويةً مباشرة.
 *
 * الترتيب مقصود: `CC` يُعتمد أوّلًا ثمّ يُشتقّ منه `ADJ`. وحارس
 * `adjustmentVerdict` القائم يشترط أصلًا محضرًا معتمَدًا وسببًا لكلّ بند —
 * فلا تمرّ تسويةٌ بلا سند.
 */
export function toCountDraft(report, { warehouse } = {}) {
  const rows = variances(report).filter((r) => !warehouse || r.warehouse === up(warehouse));
  return {
    type: 'CC',
    header: {
      warehouse: up(warehouse) || rows[0]?.warehouse || '',
      zone: '',
      countDate: report?.snapshotDate || '',
      notes: `مولَّد من مطابقة لقطة النظام${report?.snapshotDate ? ` بتاريخ ${report.snapshotDate}` : ''} — ${rows.length} فرقًا.`,
    },
    lines: rows.map((r) => ({
      sku: r.sku,
      barcode: r.barcode,
      description: r.description,
      bin: r.location,
      batch: r.batch,
      expiry: r.expiry,
      // الدفتريّ هو رصيد النظام، والمعدود هو الفعليّ عندنا.
      bookQty: r.systemQty,
      count2: r.physicalQty,
      notes: `فرق ${r.variance > 0 ? '+' : ''}${r.variance}`,
    })),
  };
}

/** تسميات الحالات للعرض. */
export const STATUS_LABELS = Object.freeze({
  match: 'مطابق',
  surplus: 'زيادة عندنا',
  shortage: 'عجز عندنا',
  'missing-in-system': 'عندنا ولا يعرفه النظام',
  'missing-in-portal': 'يعرفه النظام ولا وجود له عندنا',
});
