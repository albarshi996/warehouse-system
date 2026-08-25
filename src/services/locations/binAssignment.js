/**
 * إسنادُ الأصناف إلى مواقعها — قراءةُ ورقة الأرصدة بعينِ الموقع.
 *
 * ═══ الفجوة التي يسدّها ═══
 * ورقة الأرصدة تحمل عمود الموقع (`bin`) منذ ‹LOC-106›، ويُطبَّع كودُه عند
 * الحفظ — **ولا يُتحقَّق أنّه موقعٌ معرَّف**. فمن كتب `RHB-PIK-A99` ولا وجود
 * له يُقبل صفُّه ويُكتب رصيده، ثمّ يذهب العامل إلى رفٍّ لا يجده. والرصيد
 * يصير في مكانٍ لا يعرفه أحد: لا خطّةُ سحبٍ تدلّ عليه، ولا مسارٌ يمرّ به.
 *
 * وصفٌّ **بلا موقعٍ أصلًا** ليس خطأً — رصيدُ مستودعٍ بلا رفٍّ حالةٌ مشروعة —
 * لكنّه **غيرُ قابلٍ للتوجيه**: لا يدخل مسارَ السحب ولا يقترحه محرّك التخزين.
 * فيُعدّ ويُعلَن، ولا يُمنع.
 *
 * ═══ ثلاث حالاتٍ لا حالتان ═══
 *   · **مُسنَدٌ ومعروف** — موقعٌ معرَّفٌ في البانية. هذا وحده قابلٌ للتوجيه.
 *   · **بلا موقع** — رصيدُ مستودعٍ مجمَل. مشروعٌ، وغيرُ موجَّه.
 *   · **موقعٌ مجهول** — كُتب رفٌّ لا وجود له. **هذا وحده عطب.**
 *
 * منطقٌ خالصٌ بلا Firestore — تقرأه الشاشة ويحرسه الاختبار.
 */

import { normalizeLocationCode, parseLocationCode } from './locationCode.js';

const up = (v) => String(v ?? '').trim().toUpperCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** كودُ موقعِ الصفّ — يقبل `bin` أو `location` كما يقبلهما الحفظ. */
export function rowBin(row) {
  return normalizeLocationCode(row?.bin ?? row?.location);
}

/**
 * تقرير الإسناد.
 *
 * @param {object[]} rows صفوف ورقة الأرصدة (بعد القراءة، قبل الاعتماد)
 * @param {Iterable<string>} knownCodes أكواد المواقع المعرَّفة في البوابة
 * @returns {{total, assigned, unassigned, unknown, unknownRows, byWarehouse, ok}}
 */
export function assignmentReport(rows, knownCodes = []) {
  const known = new Set([...(knownCodes || [])].map(up).filter(Boolean));
  const byWarehouse = new Map();
  const unknownRows = [];
  let assigned = 0;
  let unassigned = 0;

  for (const row of rows || []) {
    const bin = rowBin(row);
    const wh = up(row?.warehouse) || (bin ? parseLocationCode(bin).warehouse : '') || '—';
    const bucket = byWarehouse.get(wh) || { warehouse: wh, assigned: 0, unassigned: 0, unknown: 0, qty: 0 };
    bucket.qty += num(row?.qty);

    if (!bin) {
      unassigned += 1;
      bucket.unassigned += 1;
    } else if (known.size && !known.has(bin)) {
      // الشرط `known.size`: بلا مواقعَ معرَّفةٍ بعد لا يُحكم على أحد — البانية
      // لم تُشغَّل، فكلُّ كودٍ «مجهول» حكمٌ على الأداة لا على البيانات.
      bucket.unknown += 1;
      unknownRows.push({ sku: up(row?.sku) || up(row?.barcode), bin, warehouse: wh, qty: num(row?.qty) });
    } else {
      assigned += 1;
      bucket.assigned += 1;
    }
    byWarehouse.set(wh, bucket);
  }

  const list = [...byWarehouse.values()].sort((a, b) => b.qty - a.qty);
  return {
    total: (rows || []).length,
    assigned,
    unassigned,
    unknown: unknownRows.length,
    unknownRows,
    byWarehouse: list,
    /** لا عطبَ يمنع: المجهولُ وحده عطب. */
    ok: unknownRows.length === 0,
  };
}

/**
 * نسبةُ ما هو **قابلٌ للتوجيه** — الرصيد المسنَد إلى موقعٍ معروف.
 *
 * يُعرض قبل الاعتماد: ورقةٌ تسند صنفًا واحدًا من ألفٍ لا تُشغّل التوجيه،
 * والرقمُ يقول ذلك قبل أن يكتشفه العامل في الممرّ.
 */
export function directablePct(report) {
  const t = num(report?.total);
  if (!t) return 0;
  return Math.round((num(report?.assigned) / t) * 100);
}

/**
 * أعطابٌ تُعرض قبل الاعتماد — جملٌ تقول الصواب لا أرقامًا عارية.
 */
export function assignmentNotes(report) {
  const notes = [];
  if (!report?.total) return ['لا صفوفَ في الورقة.'];

  if (report.unknown > 0) {
    const head = report.unknownRows.slice(0, 3).map((r) => `«${r.bin}»`).join(' · ');
    notes.push(
      `${report.unknown} صفًّا يشير إلى رفٍّ غير معرَّف (${head}${report.unknown > 3 ? ' وغيرها' : ''}) — ` +
        'عرِّفه في بانية المواقع أوّلًا، وإلّا صار الرصيد في مكانٍ لا يعرفه أحد.'
    );
  }
  if (report.unassigned > 0) {
    notes.push(
      `${report.unassigned} صفًّا بلا موقع — رصيدُ مستودعٍ مجمَل. مشروعٌ، لكنّه ` +
        '**لا يدخل مسار السحب** ولا يقترحه محرّك التخزين.'
    );
  }
  const pct = directablePct(report);
  if (report.total && pct < 50) {
    notes.push(`${pct}٪ فقط من الصفوف قابلٌ للتوجيه — التخزين الموجّه لا يعمل على ما دونه.`);
  }
  return notes;
}
