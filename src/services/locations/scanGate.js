/**
 * بوّابة المسح — منطق خالص يحكم ما يمسحه العامل قبل أن يتحرّك رصيد.
 *
 * المسح رباعيّ: **الموقع + الصنف + الدفعة + الكمّيّة**. وكلّ رفضٍ هنا يجب أن
 * يقول **الصواب** لا كلمة «خطأ»: عاملٌ يقف أمام رفٍّ ومعه طرد، ورسالةٌ تقول
 * «خطأ» تتركه واقفًا؛ ورسالةٌ تقول «هذا الصنف WNW-002 والمطلوب WNW-001»
 * تُنهي الموقف في ثانية.
 *
 * ═══ الفصل الحاكم ═══
 * الاعتماد يسمح بالحركة، و**الرصيد لا يتحرّك إلّا عند إتمام المسح**. فهذا
 * الملفّ لا يكتب شيئًا — يحكم فقط، والقيد يقع في محرّك المستندات كما هو.
 */

import { normalizeBarcode } from '../excel/excelSchema.js';
import { normalizeLocationCode, shortLabelOf } from './locationCode.js';
import { chooseVerdict } from './putawaySuggest.js';
import { lineProgress } from '../labor/laborModel.js';

const up = (v) => String(v ?? '').trim().toUpperCase();

/**
 * أيطابق ما مُسح صنفَ البند؟ يقبل الكود أو الباركود — الملصق قد يحمل أيًّا منهما.
 */
export function matchesItem(line, scanned) {
  const raw = String(scanned ?? '').trim();
  if (!raw) return false;
  if (up(raw) === up(line?.sku)) return true;
  const code = normalizeBarcode(raw);
  return Boolean(code) && code === normalizeBarcode(line?.barcode);
}

/**
 * حكم مسح الصنف.
 * @returns {{ok:boolean, message:string}}
 */
export function itemScanVerdict(line, scanned) {
  if (!String(scanned ?? '').trim()) return { ok: false, message: 'امسح باركود الصنف أو اكتب كوده.' };
  if (matchesItem(line, scanned)) return { ok: true, message: '' };
  return {
    ok: false,
    message: `هذا ليس صنف البند. المطلوب «${line?.sku || line?.barcode}»${line?.description ? ` — ${line.description}` : ''}.`,
  };
}

/**
 * حكم مسح الدفعة.
 *
 * ★★ بندٌ **بلا دفعة** يقبل أيّ مسح: مستنداتُ اليوم كثيرٌ منها بلا دفعات،
 * وحارسٌ يشترطها يوقف عملًا صحيحًا. والبند الذي **له** دفعة يرفض غيرها،
 * لأنّ خلط الدفعات يُفسد تتبّع الصلاحية وFEFO معًا.
 */
export function batchScanVerdict(line, scanned) {
  const required = up(line?.batch);
  const got = up(scanned);
  if (!required) return { ok: true, message: '' };
  if (!got) return { ok: false, message: `امسح دفعة الصنف — المطلوب «${line.batch}».` };
  if (got === required) return { ok: true, message: '' };
  return { ok: false, message: `دفعةٌ غير مخصَّصة لهذا البند. المطلوب «${line.batch}» والممسوح «${scanned}».` };
}

/**
 * حكم الكمّيّة.
 * التجاوز **يُعلَن ولا يُبتلع**: من خزّن أكثر ممّا في المستند يجب أن يعرف.
 */
export function qtyVerdict(line, qty) {
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, over: false, message: 'الكمّيّة يجب أن تكون أكبر من صفر.' };
  const p = lineProgress(line);
  if (n > p.remaining) {
    return {
      ok: false,
      over: true,
      message: `الكمّيّة ${n} تتجاوز المتبقّي ${p.remaining} من أصل ${p.required}.`,
    };
  }
  return { ok: true, over: false, message: '' };
}

/**
 * الحكم الكامل على عمليّة مسحٍ واحدة.
 *
 * @returns {{ok:boolean, problems:string[], needsOverrideReason:boolean,
 *            locationVerdict:object, entry:object|null}}
 */
export function scanVerdict({ line, scannedItem, scannedBatch, scannedBin, qty, locations, balances, item, overrideNote } = {}) {
  const problems = [];

  const itemV = itemScanVerdict(line, scannedItem);
  if (!itemV.ok) problems.push(itemV.message);

  const batchV = batchScanVerdict(line, scannedBatch);
  if (!batchV.ok) problems.push(batchV.message);

  const qtyV = qtyVerdict(line, qty);
  if (!qtyV.ok) problems.push(qtyV.message);

  const code = normalizeLocationCode(scannedBin);
  if (!code) problems.push('امسح باركود الموقع — لا تخزين بلا رفّ معلوم.');

  // حكم الموقع: مرفوضٌ **لا يعني ممنوعًا** — يمرّ بسببٍ إلزاميّ يُقيَّد (قرار المالك).
  const locationVerdict = code
    ? chooseVerdict(code, { line: { ...line, qty: Number(qty) || 0 }, locations, balances, item })
    : { ok: false, override: false, reason: '', needsReason: false };

  const needsOverrideReason = Boolean(locationVerdict.needsReason);
  if (needsOverrideReason && !String(overrideNote ?? '').trim()) {
    problems.push(`${locationVerdict.reason} — اكتب سبب التخزين هنا رغم ذلك (إلزاميّ).`);
  }

  const ok = problems.length === 0;
  return {
    ok,
    problems,
    needsOverrideReason,
    locationVerdict,
    entry: ok
      ? {
          locationCode: code,
          shortLabel: shortLabelOf(code),
          sku: String(line?.sku ?? ''),
          barcode: String(line?.barcode ?? ''),
          batch: String(line?.batch ?? ''),
          expiry: String(line?.expiry ?? ''),
          qty: Number(qty) || 0,
          override: Boolean(locationVerdict.override),
          overrideReason: locationVerdict.override ? String(locationVerdict.reason ?? '') : '',
          overrideNote: locationVerdict.override ? String(overrideNote ?? '').trim() : '',
        }
      : null,
  };
}

/**
 * يُطبّق مسحًا مقبولًا على البند — يزيد المنجَز ويُسجّل الموقع.
 * دالّةٌ خالصة: تُعيد بندًا جديدًا ولا تُعدّل الأصل.
 */
export function applyScan(line, entry) {
  const scans = [...(line?.scans || []), entry];
  return {
    ...line,
    qtyDone: (Number(line?.qtyDone) || 0) + (Number(entry?.qty) || 0),
    // آخر موقعٍ خُزّن فيه — وسجلّ المسح كامل تحته، فالبند قد يتوزّع رفّين.
    bin: entry?.locationCode || line?.bin || '',
    scans,
  };
}

/**
 * مواقع البند بعد التنفيذ — بندٌ واحد قد يتوزّع على أكثر من رفّ.
 * تُستعمل عند إنجاز المستند: لكلّ موقعٍ سطرُ قيدٍ مستقلّ.
 */
export function splitByLocation(line) {
  const byCode = new Map();
  for (const s of line?.scans || []) {
    const code = normalizeLocationCode(s?.locationCode);
    if (!code) continue;
    byCode.set(code, (byCode.get(code) || 0) + (Number(s.qty) || 0));
  }
  return [...byCode.entries()].map(([bin, qty]) => ({ ...line, bin, qty, scans: undefined }));
}
