/**
 * إكسل المستندات — تصديرُ التقرير واستيرادُ البنود (طلب المالك ٤ · 2026-10-02).
 *
 * ═══ ★★★ القاعدةُ الأولى: مخطّطُ النوع هو المخطّط ═══
 * ثمانيةٌ وثلاثون نوعَ مستندٍ، لكلٍّ أعمدةُ بنودٍ تخصُّه: الاستلامُ له «الكمية
 * المستلمة» و«الدفعة» و«تاريخ الصلاحية»، وأمرُ الشراء له «سعر الوحدة»،
 * والجردُ له «المعدود». فمستورِدٌ يحمل قائمةَ أعمدةٍ مكتوبةً يصلح لنوعٍ
 * واحدٍ ويكذب على سبعةٍ وثلاثين.
 *
 * فالأعمدةُ تُقرأ من `tableSection(schema).columns` — وهو **نفسُ المصدر**
 * الذي يرسم به الجدولُ على الشاشة ويطبع به `DocumentPrint`. فما يُرى هو ما
 * يُصدَّر هو ما يُستورَد، ونوعٌ يُضاف غدًا يعمل بلا حرفٍ هنا.
 *
 * ═══ ★★★ والثانية: الاستيرادُ يُشكِّل ولا يكتب ═══
 * لا Firestore في هذا الملفّ. يُعيد صفوفًا ونواقصَ، والشاشةُ تعرضها على
 * المستخدم **قبل** الحفظ. ولمَ؟ لأنّ ملفَّ إكسلٍ من الخارج يحمل أخطاءً
 * حتمًا (عمودٌ ناقص · كمّيّةٌ نصّيّة · صنفٌ مجهول)، ومستورِدٌ يكتب ثمّ يُبلّغ
 * قد كتب نصفَ بياناتٍ فاسدة. والصنفُ المسجَّلُ مرّتين درسٌ محفوظ: ٢٦
 * اختبارًا خضراءَ ثمّ سقوطٌ في أوّل دقيقةٍ حيّة، لأنّ بياناتِ الاختبار
 * اخترعتُها نظيفةً والحقيقيّةُ لم تكن.
 *
 * ═══ والثالثة: البنودُ تُستورَد في المسودّة وحدها ═══
 * ⚠️ هذا الملفُّ يُشكّل، والحفظُ يمرّ بـ`saveDocument` — وهو لا يقبل إلّا
 * `draft`/`rejected` (و`firestore.rules` تفرضه على الخادم). فاستيرادُ بنودٍ
 * إلى مستندٍ معتمَدٍ **مستحيلٌ بالبناء** لا بالأدب. وهذا مقصود: بنودُ
 * المعتمَد هي ما بتّ فيه المعتمِد.
 *
 * منطق خالص: بلا Firestore وبلا DOM وبلا XLSX — يأخذ مصفوفةَ صفوفٍ
 * (AoA) ويُعيد مصفوفة. قراءةُ الملفّ وكتابتُه في الشاشة عبر `xlsx`
 * المستضافة ذاتيًّا (لا CDN).
 */

import { tableSection } from './schemaUtils.js';
import { toNumber } from '../excel/excelSchema.js';
import { REPORT_COLUMNS, reportRows, criteriaSummary, rangeStamp } from './docReport.js';

const text = (v) => String(v ?? '').trim();

/* ═══════════════ تطبيعُ العناوين ═══════════════ */

/**
 * تطبيعُ عنوانِ عمودٍ للمطابقة.
 *
 * ما يُسقَط ولماذا:
 *   · التشكيلُ والتطويل — «الكمّيّة» و«الكمية» عنوانٌ واحد.
 *   · الهمزاتُ والتاءُ المربوطة — «إجمالي»/«اجمالي» و«الدفعة»/«الدفعه».
 *   · ما بين الأقواس — «الدفعة (Batch)» يُطابق «الدفعة» وحدها، فالمستخدم
 *     يكتب العربيَّ ويترك اللاتينيّ.
 *   · المسافاتُ والنقطُ والنجومُ — إكسل الواقعُ فيه «الكمية *» و«الكمية:».
 */
export function normalizeHeaderText(raw) {
  return String(raw ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase();
}

/**
 * فهرسُ عناوينِ أعمدةِ بنودِ نوعٍ ما: عنوانٌ مطبَّعٌ ← العمود.
 * يقبل العنوانَ العربيَّ **ومفتاحَ الحقل** (`qtyReceived`) — فمن صدّر ملفًّا
 * من هنا يُعيد استيرادَه كما هو (رحلةٌ ذهابًا وإيابًا بلا فقد).
 */
export function lineHeaderIndex(schema) {
  const cols = tableSection(schema)?.columns || [];
  const index = new Map();
  for (const col of cols) {
    const keys = [col.key, col.label, ...(col.aliases || [])];
    for (const k of keys) {
      const norm = normalizeHeaderText(k);
      if (norm && !index.has(norm)) index.set(norm, col);
    }
  }
  return index;
}

/* ═══════════════ قالبُ البنود ═══════════════ */

/**
 * صفُّ عناوينِ قالبِ البنود لنوعٍ ما — بالعربيّ كما يراه المستخدم.
 * يُعيد `[]` لنوعٍ بلا جدولِ بنود (مستندُ إقرارٍ مثلًا) — ولا يُخترع عمود.
 */
export function lineTemplateHeaders(schema) {
  return (tableSection(schema)?.columns || []).map((c) => c.label || c.key);
}

/**
 * قالبُ بنودٍ فارغٌ بصفوفِ عناوينَ وحدها — AoA جاهزةٌ لورقة.
 * والصفُّ الثاني **مثالٌ موصوف** لا بيانٌ حقيقيّ: يُكتب في ورقةِ التعليمات
 * لا في ورقة التعبئة (درسُ `buildTemplateWorkbook`: مثالٌ في ورقة التعبئة
 * يُستورَد بيانًا إن نُسي حذفُه).
 */
export function lineTemplateMatrix(schema) {
  const headers = lineTemplateHeaders(schema);
  return headers.length ? [headers] : [];
}

/** هل لهذا النوع جدولُ بنودٍ يُستورَد إليه أصلًا؟ */
export function supportsLineImport(schema) {
  return (tableSection(schema)?.columns || []).length > 0;
}

/* ═══════════════ الاستيراد ═══════════════ */

/**
 * يُرجّح صفَّ العناوين في مصفوفةٍ خامّة.
 *
 * ⚠️ شيتاتُ المستودع الحقيقيّة نادرًا ما تبدأ بالعناوين في الصفّ الأوّل:
 * فوقها شعارٌ أو عنوانُ تقريرٍ أو أسطرٌ فارغة. وافتراضُ الصفّ الأوّل يفشل
 * **صامتًا** — يقرأ الشعارَ عنوانًا فلا يتعرّف على عمودٍ واحد، ويُعيد «صفر
 * صفوف» بلا سببٍ مفهوم. (نفسُ منطقِ `detectHeaderRow` القائم، ومخطّطُنا
 * مخطّطُ النوع لا `DATASETS`.)
 *
 * @returns {{index:number, hits:number}}
 */
export function detectLineHeaderRow(matrix, schema, maxScan = 10) {
  const index = lineHeaderIndex(schema);
  let best = { index: 0, hits: -1 };
  const limit = Math.min(maxScan, (matrix || []).length);
  for (let i = 0; i < limit; i += 1) {
    const fields = new Set();
    for (const cell of matrix[i] || []) {
      const col = index.get(normalizeHeaderText(cell));
      if (col) fields.add(col.key);
    }
    if (fields.size > best.hits) best = { index: i, hits: fields.size };
  }
  return best;
}

/** هل الصفُّ فارغٌ تمامًا؟ (إكسل يُخرج صفوفًا فارغةً في الذيل دائمًا) */
function isBlankRow(row) {
  return !(row || []).some((c) => text(c) !== '');
}

/**
 * يقرأ بنودًا من مصفوفةٍ خامّة بحسب مخطّط النوع.
 *
 * ★★ لا يُرفض الصفُّ لأجلِ عمودٍ لم يُفهم: الأعمدةُ المجهولةُ تُسمّى في
 * `unknownColumns` ويمضي الباقي. ومن صدّر من نظامٍ آخر يجد ملفَّه يعمل
 * جزئيًّا ويرى ما سقط — بدل رفضٍ شاملٍ بلا سبيلٍ إلى الإصلاح.
 *
 * ★★★ والرقمُ غيرُ الرقميّ **خطأٌ لا صفر**: «١٢ كرتون» في خانة الكمّيّة لو
 * صارت صفرًا لمرّت صامتةً ونقصت البضاعةُ في الدفتر. فتُسمّى بصفّها وعمودها.
 *
 * @param {any[][]} matrix
 * @param {object} schema
 * @param {{maxRows?:number}} [opts]
 * @returns {{
 *   ok: boolean,
 *   rows: object[],
 *   errors: {row:number, column:string, message:string}[],
 *   headerRow: number,
 *   matchedColumns: string[],
 *   unknownColumns: string[],
 *   missingColumns: string[],
 *   summary: {total:number, valid:number, invalid:number},
 * }}
 */
export function parseLinesMatrix(matrix, schema, opts = {}) {
  const cols = tableSection(schema)?.columns || [];
  const errors = [];
  const rows = [];

  if (!cols.length) {
    return {
      ok: false,
      rows: [],
      errors: [{ row: 0, column: '', message: 'هذا النوع لا يحمل جدولَ بنودٍ — لا شيء يُستورَد إليه.' }],
      headerRow: 0,
      matchedColumns: [],
      unknownColumns: [],
      missingColumns: [],
      summary: { total: 0, valid: 0, invalid: 0 },
    };
  }

  const index = lineHeaderIndex(schema);
  const { index: headerRow, hits } = detectLineHeaderRow(matrix, schema);

  if (hits <= 0) {
    return {
      ok: false,
      rows: [],
      errors: [
        {
          row: headerRow + 1,
          column: '',
          message: `لم يُتعرَّف على أيّ عمود. العناوينُ المتوقَّعة: ${cols.map((c) => c.label || c.key).join(' · ')}`,
        },
      ],
      headerRow,
      matchedColumns: [],
      unknownColumns: [],
      missingColumns: cols.map((c) => c.key),
      summary: { total: 0, valid: 0, invalid: 0 },
    };
  }

  // خريطةُ موضعِ العمود في الورقة ← عمودُ المخطّط.
  const headerCells = matrix[headerRow] || [];
  const byPosition = new Map();
  const unknownColumns = [];
  headerCells.forEach((cell, pos) => {
    const label = text(cell);
    if (!label) return;
    const col = index.get(normalizeHeaderText(cell));
    if (col) {
      // أوّلُ موضعٍ يفوز: عمودٌ مكرّرٌ في الورقة لا يُلغي الأوّل.
      if (![...byPosition.values()].some((c) => c.key === col.key)) byPosition.set(pos, col);
    } else {
      unknownColumns.push(label);
    }
  });

  const matchedColumns = [...byPosition.values()].map((c) => c.key);
  const missingColumns = cols.filter((c) => !matchedColumns.includes(c.key)).map((c) => c.key);

  const maxRows = Number.isFinite(opts.maxRows) ? opts.maxRows : 2000;
  const body = (matrix || []).slice(headerRow + 1);
  let scanned = 0;

  for (let i = 0; i < body.length; i += 1) {
    const raw = body[i];
    // رقمُ الصفّ **كما يراه المستخدم في إكسل** (1-based) — لا فهرسٌ داخليّ.
    // ومن قرأ «الصفّ 7» وجده في الملفّ؛ ومن قرأ «الصفّ 4» بحث عبثًا.
    const sheetRow = headerRow + 2 + i;
    if (isBlankRow(raw)) continue;
    if (scanned >= maxRows) {
      errors.push({
        row: sheetRow,
        column: '',
        message: `تجاوز الملفُّ ${maxRows} صفًّا — قُسّمه دفعاتٍ. ولم يُقرأ ما بعد هذا الصفّ.`,
      });
      break;
    }
    scanned += 1;

    const line = {};
    let rowOk = true;
    for (const [pos, col] of byPosition.entries()) {
      const cell = raw?.[pos];
      const value = text(cell);
      if (value === '') continue;

      if (col.kind === 'number') {
        const n = toNumber(cell);
        if (Number.isNaN(n)) {
          rowOk = false;
          errors.push({
            row: sheetRow,
            column: col.label || col.key,
            message: `«${value}» ليس رقمًا.`,
          });
          continue;
        }
        if (n < 0) {
          rowOk = false;
          errors.push({
            row: sheetRow,
            column: col.label || col.key,
            message: `«${value}» سالبٌ — والكمّيّاتُ لا تكون سالبة. الإرجاعُ مستندٌ عكسيٌّ لا رقمٌ سالب.`,
          });
          continue;
        }
        line[col.key] = n;
      } else if (col.kind === 'date') {
        line[col.key] = normalizeDateCell(cell);
      } else {
        line[col.key] = value;
      }
    }

    if (Object.keys(line).length === 0) continue;
    if (rowOk) rows.push(line);
  }

  return {
    ok: errors.length === 0 && rows.length > 0,
    rows,
    errors,
    headerRow,
    matchedColumns,
    unknownColumns,
    missingColumns,
    summary: { total: scanned, valid: rows.length, invalid: scanned - rows.length },
  };
}

/**
 * يُطبّع خليّةَ تاريخٍ إلى `YYYY-MM-DD`.
 *
 * ⚠️ ثلاثُ صيغٍ تصل من إكسل ولا بدّ من الثلاث:
 *   ١. نصٌّ `2026-09-08` — يمرّ كما هو.
 *   ٢. `Date` حقيقيّ (حين يُقرأ الملفُّ بـ`cellDates:true`) — يُحوَّل
 *      **بأجزائه المحلّيّة** لا بـ`toISOString`، وإلّا انزاح يومًا (نفسُ
 *      علّةِ `localDay` في تقرير المستندات).
 *   ٣. رقمٌ تسلسليٌّ (إكسل يخزّن التواريخ أرقامًا: 1 = 1900-01-01) — يُحوَّل
 *      بمرجع إكسل. وبلا هذا تصل الصلاحيّةُ «46000» فتُحفظ نصًّا لا معنى له.
 */
export function normalizeDateCell(cell) {
  if (cell == null || cell === '') return '';
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) return fromDate(cell);

  const s = text(cell);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // رقمٌ تسلسليّ. مرجعُ إكسل 1899-12-30 (يستوعب عطبَ سنة 1900 الكبيسة
  // المتوارَث في إكسل — وهو السبب في 30 لا 31 ديسمبر).
  const serial = Number(s);
  if (Number.isFinite(serial) && serial > 0 && serial < 100000) {
    const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  // صيغةٌ أخرى يفهمها المحرّك (`08/09/2026`) — وما لا يُفهم يبقى نصًّا كما
  // كتبه المستخدم، فلا نُفسد ما لا نفهم ولا نخترع تاريخًا.
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? s : fromDate(parsed);
}

function fromDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * يدمج البنودَ المستوردةَ في بنودٍ قائمة.
 *
 * `mode`:
 *   · `append` — تُضاف بعد المملوء (الافتراض: الاستيرادُ يزيد ولا يمحو).
 *   · `replace` — تُستبدل كلُّها. ولا تكون افتراضًا أبدًا: من استورد ملفًّا
 *     خطأً وجد عملَ ساعةٍ مُمحًى، ولا تراجعَ في مسودّةٍ لم تُحفظ بعد.
 *
 * والصفوفُ الفارغةُ تُملأ أوّلًا قبل أن يُزاد صفٌّ جديد: المستندُ يُولد بعشرة
 * صفوفٍ فارغة، فإلحاقٌ أعمى يُخرج جدولًا نصفُه فراغٌ ثمّ بنود.
 */
export function mergeImportedLines(existing, imported, mode = 'append') {
  const incoming = (imported || []).filter((l) => l && Object.keys(l).length > 0);
  if (mode === 'replace') return [...incoming];

  const current = [...(existing || [])];
  const filled = current.filter((l) => l && Object.values(l).some((v) => text(v) !== ''));
  const out = [...filled, ...incoming];
  // تُبقى الصفوفُ الفارغةُ الزائدةُ كما كانت عددًا — فلا يفقد الجدولُ مساحةَ
  // الكتابة اليدويّة بعد الاستيراد.
  const blanks = Math.max(0, current.length - filled.length);
  for (let i = 0; i < blanks; i += 1) out.push({});
  return out;
}

/** سطرُ نتيجةِ الاستيراد — عربيٌّ وبأرقامٍ لاتينيّة (R2). */
export function importSummaryLine(result) {
  if (!result) return 'لم يُقرأ شيء.';
  const { summary, errors, unknownColumns } = result;
  const parts = [`قُرئ ${summary.total} صفًّا · صالحٌ ${summary.valid}`];
  if (summary.invalid > 0) parts.push(`مرفوضٌ ${summary.invalid}`);
  if (unknownColumns?.length) parts.push(`أعمدةٌ لم تُفهم: ${unknownColumns.join(' · ')}`);
  if (errors?.length && summary.total === 0) parts.push(errors[0].message);
  return parts.join(' · ');
}

/* ═══════════════ التصدير ═══════════════ */

/**
 * ورقةُ تقريرِ المستندات — AoA كاملةً: شرطُ التصفية ثمّ العناوين ثمّ الصفوف.
 *
 * ★★ وسطرُ الشرط في الصفّ الأوّل مقصود: الملفُّ يُرسَل ويُقرأ بعد أسبوع،
 * فإن لم يحمل شرطَه قُرئ خطأً. والعناوينُ في الصفّ الثالث لا الأوّل —
 * و`detectLineHeaderRow` يجدها، فالرحلةُ ذهابًا وإيابًا سليمة.
 */
export function reportSheetMatrix(docs, criteria, nowMs) {
  const rows = reportRows(docs, nowMs);
  // ⚠️ ساعةٌ غائبةٌ لا تُسقط التصدير: `new Date(undefined)` يُنتج تاريخًا
  // فاسدًا و`toISOString` عليه **يرمي** — فيضيع الملفُّ كلُّه لأجل سطرِ ترويسة.
  // فيُكتب السطرُ بلا تاريخٍ بدل أن يُفقد التقرير.
  const stampedAt = Number.isFinite(nowMs) ? new Date(nowMs).toLocaleString('ar-LY-u-nu-latn') : '—';
  return [
    [`تقرير المستندات — ${criteriaSummary(criteria)}`],
    [`صُدِّر: ${stampedAt} · عددُ الصفوف: ${rows.length}`],
    REPORT_COLUMNS.map((c) => c.label),
    ...rows.map((r) => REPORT_COLUMNS.map((c) => r[c.key] ?? '')),
  ];
}

/** عرضُ الأعمدة لورقة التقرير — فلا يُقرأ الطرفُ في خانةٍ ضيّقة. */
export function reportSheetWidths() {
  return REPORT_COLUMNS.map((c) => ({ wch: c.key === 'party' ? 30 : c.key === 'typeLabel' ? 26 : 16 }));
}

/** اسمُ ملفِّ تقريرِ المستندات — بالشرط والتاريخ فلا تتراكم ملفاتٌ متشابهة. */
export function reportFileName(criteria, nowMs) {
  // بلا نطاقٍ وبلا ساعةٍ يبقى الاسمُ صالحًا (`export`) — ولا يُرمى استثناءٌ
  // من `new Date(undefined).toISOString()` فيُفقد الملفّ.
  const fallback = Number.isFinite(nowMs) ? new Date(nowMs).toISOString().slice(0, 10) : 'export';
  const stamp = rangeStamp(criteria) || fallback;
  return `Brandzo-تقرير-المستندات-${stamp}.xlsx`;
}

/**
 * ورقةُ بنودِ مستندٍ واحد — لتصدير بنوده ثمّ تعديلها في إكسل وإعادتها.
 * العناوينُ هي عناوينُ المخطّط نفسُها، فالعودةُ تُقرأ بلا خسارة.
 */
export function linesSheetMatrix(schema, lines) {
  const cols = tableSection(schema)?.columns || [];
  if (!cols.length) return [];
  const filled = (lines || []).filter((l) => l && Object.values(l).some((v) => text(v) !== ''));
  return [cols.map((c) => c.label || c.key), ...filled.map((l) => cols.map((c) => l?.[c.key] ?? ''))];
}
