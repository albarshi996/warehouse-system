/**
 * تحويل فحص المركبة من/إلى صفوف إكسل — منطق خالص (المصفوفات فقط، بلا XLSX).
 *
 * الاتجاهان:
 *   - `inspectionToSheets(insp)`  → أوراق التصدير (النسخة الاحتياطية الكاملة).
 *   - `sheetsToInspection(sheets)` → كائن فحص من ملف مُصدَّر — يقبل ملفات
 *     الأداة القديمة `vehicle-inspection-brandzo.html` (24 ملفًا مؤرشفًا)
 *     وملفات هذا النظام الجديد على السواء.
 *
 * التسامح مع القديم:
 *   - أسماء أوراق بديلة («الملخص» بدل «الملخص التنفيذي»).
 *   - مطابقة البنود بتطبيع التسمية (بعض النسخ كتبت «آلية العادم» بدل
 *     «نظام العادم») — التطبيع يسقط الكلمتين والمسافات الزائدة.
 *   - ورقة الإطارات القديمة تُلحق رموزًا باسم الموضع («الأمامي الأيمن 🔵»).
 *   - قسم الملحقات غائب من الملفات القديمة (خلل التصدير القديم) — يُترك فارغًا.
 */
import {
  ALL_ITEMS,
  TIRE_POSITIONS,
  SAFETY_FIELDS,
  ACCESSORY_FIELDS,
  INFO_FIELDS,
  VEHICLE_CATEGORIES,
  OVERALL_STATUSES,
  STATUS_VALUES,
  SECTIONS,
  emptyInspection,
  summarize,
} from './inspectionModel.js';

export const SHEET_NAMES = {
  info: 'البيانات الأساسية',
  results: 'نتائج الفحص',
  tires: 'الإطارات',
  summary: 'الملخص التنفيذي',
};

/** أسماء بديلة وردت في ملفات النسخ الأقدم. */
export const SHEET_ALIASES = {
  info: ['البيانات الأساسية'],
  results: ['نتائج الفحص'],
  tires: ['الإطارات'],
  summary: ['الملخص التنفيذي', 'الملخص'],
};

const cell = (v) => String(v ?? '').trim();

/** تطبيع تسمية بند للمطابقة: إسقاط «نظام/آلية» والمسافات الزائدة وعلامات التشكيل الشائعة. */
export function normalizeLabel(label) {
  return cell(label)
    .replace(/نظام|آلية|الآلية|النظام/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

const ITEMS_BY_NORM = new Map(ALL_ITEMS.map((it) => [normalizeLabel(it.label), it]));

/** خرائط «تسمية → حقل» لورقة البيانات الأساسية، مع مرادفات النسخ القديمة. */
const INFO_LABEL_TO_NAME = (() => {
  const map = new Map(INFO_FIELDS.map((f) => [f.label, f.name]));
  map.set('عداد المسافة (كم)', 'odometer');
  map.set('الحمولة المصرح بها (طن)', 'payload');
  return map;
})();

/**
 * يحوّل أوراق ملف مُصدَّر إلى كائن فحص.
 * `sheets` = { info?: any[][], results?: any[][], tires?: any[][], summary?: any[][] }
 */
export function sheetsToInspection(sheets) {
  const insp = emptyInspection();

  // ── البيانات الأساسية: أزواج (تسمية، قيمة) في العمودين 0/1 و2/3 ──
  for (const row of sheets.info || []) {
    for (const base of [0, 2]) {
      const label = cell(row[base]);
      const value = cell(row[base + 1]);
      if (!label || !value) continue;
      const name = INFO_LABEL_TO_NAME.get(label);
      if (name) insp.info[name] = value;
      else if (label === 'نوع المركبة' && VEHICLE_CATEGORIES.includes(value)) insp.info.category = value;
      else if (label === 'الحكم على المركبة' || label === 'الحكم العام' || label === 'نتيجة الفحص') {
        if (OVERALL_STATUSES.includes(value)) insp.overallStatus = value;
      } else if (label === 'الملاحظات العامة') insp.generalNotes = value;
      else if (label === 'الفاحص الميكانيكي') insp.signatures.mechanic = value;
      else if (label === 'المستلم') {
        // «المستلم» ترد مرتين في الورقة القديمة: بيانات الاستلام ثم التوقيع —
        // أول ورود يملأ receivedFrom والثاني توقيع المستلم.
        if (insp.info.receivedFrom) insp.signatures.receiver = value;
        else insp.info.receivedFrom = value;
      } else if (label === 'المشرف / المسؤول' || label === 'المشرف') insp.signatures.supervisor = value;
      else if (ACCESSORY_LABEL_TO_NAME.has(label)) insp.accessories[ACCESSORY_LABEL_TO_NAME.get(label)] = value;
    }
  }

  // ── نتائج الفحص: [القسم، البند، الحالة، الملاحظات] ──
  for (const row of sheets.results || []) {
    const item = ITEMS_BY_NORM.get(normalizeLabel(row?.[1]));
    if (!item) continue;
    const status = cell(row[2]);
    const notes = cell(row[3]);
    if (!STATUS_VALUES.includes(status) && !notes) continue;
    insp.items[item.id] = {
      ...(STATUS_VALUES.includes(status) ? { status } : {}),
      ...(notes ? { notes } : {}),
    };
  }

  // ── الإطارات: مواضع بالاسم (قد يلحقه رمز) + ملحقات السلامة ──
  for (const row of sheets.tires || []) {
    const label = cell(row?.[0]);
    if (!label) continue;
    const pos = TIRE_POSITIONS.find((t) => label.includes(t.label));
    if (pos) {
      const tire = {};
      if (cell(row[1])) tire.size = cell(row[1]);
      if (cell(row[2])) tire.depth = cell(row[2]);
      if (cell(row[3])) tire.pressure = cell(row[3]);
      if (cell(row[4])) tire.cond = cell(row[4]);
      if (Object.keys(tire).length) insp.tires[pos.id] = tire;
      continue;
    }
    const safety = SAFETY_FIELDS.find((f) => label === f.label);
    if (safety && cell(row[1]) && cell(row[1]) !== '—') insp.safety[safety.name] = cell(row[1]);
  }

  // ── الملخص (احتياط للملفات القديمة): الحكم العام إن لم يُقرأ ──
  if (!insp.overallStatus) {
    for (const row of sheets.summary || []) {
      const label = cell(row?.[0]);
      if (label === 'الحكم العام' || label === 'نتيجة الفحص') {
        const value = cell(row[1]);
        if (OVERALL_STATUSES.includes(value)) insp.overallStatus = value;
      }
    }
  }

  return insp;
}

const ACCESSORY_LABEL_TO_NAME = new Map(ACCESSORY_FIELDS.map((f) => [f.label, f.name]));

/**
 * يبني أوراق التصدير الكاملة من كائن فحص.
 * يُعيد { info, results, tires, summary } كمصفوفات صفوف جاهزة لـ aoa_to_sheet.
 */
export function inspectionToSheets(insp) {
  const g = (name) => cell(insp?.info?.[name]);
  const s = summarize(insp);

  const info = [
    ['Brandzo', '', 'نظام جرد المركبات — سجلّ الأسطول', ''],
    ['Vehicle Inspection Report', '', `المركبة: ${g('brand')} ${g('model')}`.trim(), ''],
    ['', '', '', ''],
    ['رقم النموذج', g('formNo'), 'نوع المركبة', cell(insp?.info?.category)],
    ['تاريخ الفحص', g('inspDate'), 'وقت الفحص', g('inspTime')],
    ['الجهة / القسم', g('department'), '', ''],
    ['', '', '', ''],
    ['── بيانات المركبة ──', '', '', ''],
    ['رقم اللوحة', g('plateNo'), 'الماركة', g('brand')],
    ['الموديل', g('model'), 'سنة الصنع', g('year')],
    ['اللون', g('color'), 'نوع الوقود', g('fuelType')],
    ['رقم الهيكل (VIN)', g('vin'), 'رقم المحرك', g('engineNo')],
    ['', '', '', ''],
    ['── بيانات التشغيل ──', '', '', ''],
    ['العداد الحالي (كم)', g('odometer'), 'آخر صيانة عند (كم)', g('lastServiceKm')],
    ['تاريخ آخر صيانة', g('lastService'), 'انتهاء الرخصة', g('licExpiry')],
    ['المستلم من', g('receivedFrom'), 'رقم وثيقة التأمين', g('insNo')],
    ['انتهاء التأمين', g('insExpiry'), 'الحمولة (طن)', g('payload')],
    ['', '', '', ''],
    ['── الملحقات والوثائق ──', '', '', ''],
    ...chunkPairs(ACCESSORY_FIELDS.map((f) => [f.label, cell(insp?.accessories?.[f.name])])),
    ['', '', '', ''],
    ['── النتيجة العامة ──', '', '', ''],
    ['الحكم على المركبة', cell(insp?.overallStatus), '', ''],
    ['الملاحظات العامة', cell(insp?.generalNotes), '', ''],
    ['', '', '', ''],
    ['الفاحص الميكانيكي', cell(insp?.signatures?.mechanic), 'المستلم', cell(insp?.signatures?.receiver)],
    ['المشرف / المسؤول', cell(insp?.signatures?.supervisor), '', ''],
  ];

  const results = [['القسم', 'بند الفحص', 'الحالة', 'الملاحظات']];
  for (const section of SECTIONS) {
    for (const item of section.items) {
      const entry = insp?.items?.[item.id] || {};
      results.push([section.title, item.label, entry.status || '—', entry.notes || '']);
    }
  }

  const tires = [['الإطار', 'المقاس', 'العمق (ملم)', 'الضغط (PSI)', 'الحالة']];
  for (const t of TIRE_POSITIONS) {
    const entry = insp?.tires?.[t.id] || {};
    tires.push([t.label, entry.size || '', entry.depth || '', entry.pressure || '', entry.cond || '']);
  }
  tires.push(['', '', '', '', '']);
  for (const f of SAFETY_FIELDS) {
    tires.push([f.label, cell(insp?.safety?.[f.name]) || '—', '', '', '']);
  }

  const total = s.ok + s.warn + s.bad + s.na;
  const pctOf = (n) => (total ? `${((n / total) * 100).toFixed(1)}%` : '0%');
  const summary = [
    ['ملخص نتائج الفحص', '', ''],
    ['', '', ''],
    ['البند', 'العدد', 'النسبة'],
    ['سليم ✅', s.ok, pctOf(s.ok)],
    ['يحتاج متابعة ⚠️', s.warn, pctOf(s.warn)],
    ['معطل ❌', s.bad, pctOf(s.bad)],
    ['لا ينطبق —', s.na, pctOf(s.na)],
    ['إجمالي البنود المفحوصة', total, ''],
    ['نسبة الاكتمال', `${s.pct}%`, ''],
    ['', '', ''],
    ['الحكم العام', cell(insp?.overallStatus) || '—', ''],
  ];

  return { info, results, tires, summary };
}

/** يوزّع أزواج (تسمية، قيمة) على صفوف من عمودين اثنين: [ت1، ق1، ت2، ق2]. */
function chunkPairs(pairs) {
  const rows = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const a = pairs[i];
    const b = pairs[i + 1] || ['', ''];
    rows.push([a[0], a[1], b[0], b[1]]);
  }
  return rows;
}

/**
 * يلتقط أوراق ملف XLSX مقروء (كائن workbook من مكتبة xlsx) إلى صفوف،
 * محتملًا الأسماء البديلة. يُبقي هذا الملف خالصًا: يستقبل دالة تحويل
 * `sheetToRows(ws)` بدل استيراد XLSX هنا.
 */
export function workbookToSheets(workbook, sheetToRows) {
  const out = {};
  for (const [key, aliases] of Object.entries(SHEET_ALIASES)) {
    for (const name of aliases) {
      if (workbook.Sheets?.[name]) {
        out[key] = sheetToRows(workbook.Sheets[name]);
        break;
      }
    }
  }
  return out;
}
