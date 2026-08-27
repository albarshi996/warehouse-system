/**
 * البحث الموحَّد والتتبّع الكامل — من أيّ طرفٍ إلى الرحلة كلّها. منطق خالص.
 *
 * المشكلة التي يحلّها: خطة ٧ تَعِد بالبحث بأحد عشر مدخلًا — LPN وباركود
 * ورقم صنف وLot وأمر شراء وطلب صرف وموقع ومورد وفرع وموظّف. وأحدَ عشرَ
 * حقلَ بحثٍ منفصلًا يعني أحدَ عشرَ موضعًا يفترق أحدها عن الآخر.
 *
 * ═══ القاعدة الحاكمة ═══
 * **مدخلٌ واحد يعرف ماذا أُعطي.** المستخدم يكتب أو يمسح، والنظام يستنتج
 * نوع المدخل من شكله — فلا يُسأل «ابحث بماذا؟» وهو يعرف الجواب.
 *
 * وقراءةٌ محضة: لا تُخزَّن فهارس، ولا تُبنى مجموعةُ بحثٍ موازية تفترق عن
 * الطبالي أوّلَ تغيير.
 */

import { normalizeLocationCode, isValidLocationCode } from '../locations/locationCode.js';
import { isValidLpnCode, normalizeLpnCode } from './lpnCode.js';
import { stateLabel, activeFlags, LPN_FLAGS } from './lpnLifecycle.js';
import { distinctItems } from './lpnContents.js';

const up = (v) => String(v ?? '').trim().toUpperCase();

/** أنواعُ المدخل التي يعرفها البحث. */
export const QUERY_KINDS = Object.freeze({
  LPN: 'رقم طبلية',
  BIN: 'موقع تخزين',
  DOCUMENT: 'رقم مستند',
  ITEM: 'صنف أو باركود',
  BATCH: 'رقم دفعة',
  TEXT: 'نصّ حرّ',
});

/**
 * ★ استنتاجُ نوع المدخل من شكله — فلا يُسأل المستخدم عمّا يعرفه النظام.
 *
 * الترتيب هو الحكم: الأخصُّ أوّلًا. فـ`LPN-MAIN-…` هويّةٌ قبل أن تكون نصًّا،
 * و`MAIN-A01-R01` موقعٌ قبل أن يكون نصًّا، و`GRN-2026-0032` مستند.
 */
export function classifyQuery(raw) {
  const q = String(raw ?? '').trim();
  if (!q) return { kind: 'TEXT', value: '' };

  if (isValidLpnCode(q)) return { kind: 'LPN', value: normalizeLpnCode(q) };
  // رقمُ المستند: ثلاثةُ مقاطعَ بحروفٍ ثمّ سنةٍ ثمّ تسلسل (TYPE-YYYY-####).
  if (/^[A-Z]{2,8}-\d{4}-\d{3,6}$/i.test(q)) return { kind: 'DOCUMENT', value: up(q) };
  if (isValidLocationCode(q)) return { kind: 'BIN', value: normalizeLocationCode(q) };
  // الباركود: أرقامٌ محضة بطولٍ معقول.
  if (/^\d{6,14}$/.test(q)) return { kind: 'ITEM', value: q };
  return { kind: 'TEXT', value: up(q) };
}

/**
 * البحث في الطبالي — يعيد المطابقات مع **سبب المطابقة**.
 *
 * ★ ولماذا السبب؟ لأنّ نتيجةً بلا سببٍ تُربك: يبحث الموظّف عن دفعةٍ فتظهر
 * طبليةٌ لا يفهم لماذا. فكلُّ نتيجةٍ تقول: «طابقت لأنّها تحمل هذه الدفعة».
 */
export function searchPallets(units, raw) {
  const { kind, value } = classifyQuery(raw);
  if (!value) return { kind, value, results: [] };

  const results = [];
  for (const u of units ?? []) {
    const why = matchReason(u, kind, value);
    if (why) results.push({ unit: u, why, card: resultCard(u) });
  }
  return { kind, kindLabel: QUERY_KINDS[kind], value, results };
}

function matchReason(unit, kind, value) {
  const code = normalizeLpnCode(unit?.code);
  switch (kind) {
    case 'LPN':
      return code === value ? 'هويّة الطبلية' : '';
    case 'BIN': {
      const bin = normalizeLocationCode(unit?.bin);
      if (!bin) return '';
      if (bin === value) return 'واقفةٌ في هذا الموقع';
      // موقعٌ أعلى في الشجرة يشمل ما تحته — «MAIN-A01» يجد رفوفه.
      return bin.startsWith(`${value}-`) ? `واقفةٌ في «${bin}» تحت هذا النطاق` : '';
    }
    case 'DOCUMENT': {
      if (up(unit?.sourceDoc?.number) === value) return `مستندها المصدر ${value}`;
      if (up(unit?.orderRef) === value) return `أمرها ${value}`;
      return '';
    }
    case 'ITEM': {
      const hit = (unit?.lines ?? []).find((l) => up(l.sku) === up(value) || String(l.barcode ?? '').trim() === value);
      return hit ? `تحمل الصنف ${hit.sku || hit.barcode}` : '';
    }
    case 'BATCH': {
      const hit = (unit?.lines ?? []).find((l) => up(l.batch) === value);
      return hit ? `تحمل الدفعة ${value}` : '';
    }
    default: {
      // النصّ الحرّ يبحث في الهويّة والصنف والدفعة والمورد معًا — مدخلٌ
      // واحدٌ لا أحدَ عشر.
      if (code.includes(value)) return 'هويّتها تحتوي النصّ';
      const line = (unit?.lines ?? []).find(
        (l) => up(l.sku).includes(value) || up(l.batch).includes(value) || up(l.name).includes(value)
      );
      if (line) return `صنفٌ أو دفعةٌ عليها: ${line.sku || line.name || line.batch}`;
      if (up(unit?.supplier).includes(value)) return `مورّدها ${unit.supplier}`;
      if (up(unit?.createdBy).includes(value)) return `أنشأها ${unit.createdBy}`;
      return '';
    }
  }
}

/** بطاقةُ نتيجةٍ مختصرة — ما يكفي للتعرّف قبل فتح البطاقة الكاملة. */
export function resultCard(unit) {
  const flags = activeFlags(unit);
  return {
    code: normalizeLpnCode(unit?.code),
    state: unit?.state ?? '',
    stateLabel: stateLabel(unit?.state),
    warehouse: unit?.warehouse ?? '',
    bin: normalizeLocationCode(unit?.bin),
    itemCount: distinctItems(unit?.lines).length,
    flags: flags.map((f) => LPN_FLAGS[f]),
    sourceDoc: unit?.sourceDoc?.number ?? '',
  };
}

/**
 * ★★ التتبّع الكامل لطبلية — سلسلةُ المستندات والمواضع من الإنشاء لآخر حركة.
 *
 * تُبنى من **الأحداث** لا من حقلٍ مخزَّن: فما وقع هو ما سُجّل، ولا سطرَ
 * يُكتب في سردٍ منفصلٍ يمكن أن ينسى أحدٌ تحديثه.
 */
export function traceOf(unit, events) {
  const ordered = [...(events ?? [])].sort((a, b) => String(a?.at ?? '').localeCompare(String(b?.at ?? '')));
  const stations = [];

  for (const e of ordered) {
    const doc = e?.doc?.number ? `${e.doc.number}` : '';
    const where = e?.details?.toBin || e?.details?.bin || '';
    stations.push({
      at: e?.at ?? '',
      label: e?.label ?? e?.type ?? '',
      actor: e?.actor ?? '',
      doc,
      where: normalizeLocationCode(where),
      reason: e?.reason ?? '',
    });
  }

  return {
    code: normalizeLpnCode(unit?.code),
    born: stations[0] ?? null,
    last: stations[stations.length - 1] ?? null,
    stations,
    // سطرُ التتبّع بمثال خطة ٧: المستندات بترتيب مرورها.
    documentPath: [
      ...(unit?.sourceDoc?.number ? [unit.sourceDoc.number] : []),
      ...stations.map((s) => s.doc).filter(Boolean),
    ].filter((v, i, arr) => v && arr.indexOf(v) === i),
    binPath: stations.map((s) => s.where).filter((v, i, arr) => v && arr.indexOf(v) === i),
  };
}
