/**
 * ═══════════════════════════════════════════════════════════════════
 *  سجلُّ المتابعة — «مَن قرأ · ماذا قرأ · وكم كتب» (طلب المالك 2026-08-31)
 * ═══════════════════════════════════════════════════════════════════
 *
 * ═══ الغرضُ الذي نصّه المالك ═══
 * «لكي يكون هناك **مرجعٌ احتياطيٌّ** عند الجرد» — فهذا الجدول ليس زينةً على
 * شاشة المدير، بل الورقةُ التي يُرجَع إليها حين يُختلَف على رقم. وذلك يفرض
 * ثلاثة قيود:
 *
 *   ★★ **لا كمّيّةَ بلا وحدة (CAP-103):** كان الجدول يعرض `int(s.qty)` مجرَّدًا،
 *     فيقرأ المديرُ «محمد — ٥» ولا يعلم أخمسةَ كراتينَ أم خمسَ قطع. ورقةٌ
 *     مرجعيّةٌ تقول رقمًا بلا وحدةٍ **لا تصلح مرجعًا**.
 *   ★ **الوقتُ مطلقٌ لا نسبيّ:** «قبل ٥ د» تصلح للمتابعة الحيّة ولا تصلح
 *     للاحتجاج بعد أسبوع. فيُحمل الاثنان: النسبيُّ للعين، والمطلقُ للورقة.
 *   ★ **الاتّجاهُ يُقال بصراحة:** قيدُ التصحيح كمّيّةٌ سالبة في الدفتر نفسِه.
 *     ولو خُلط بالقراءات لَبدا الجدولُ متناقضًا.
 *
 * ═══ وحدٌّ لا أدّعي تجاوزه ═══
 * الدفترُ **لا يميّز** قراءةً جديدةً من تصحيحٍ بالزيادة: كلاهما قيدٌ موجب،
 * ولا حقلَ يفصلهما (`correctionEntry` تكتب فرقًا لا وسمًا). فالاتّجاه يُقال
 * بالإشارة وحدَها — «إضافة» و«خصم» — ولا يُخترع وسمٌ لا يحمله البيان.
 *
 * منطق خالص: بلا Firestore وبلا DOM. والوقتُ يُحقن محوِّلًا، فالطابعُ
 * السحابيّ نوعٌ لا يُستورد هنا.
 */
import { scanBaseQty } from './scanFlow.js';

const str = (v) => String(v ?? '').trim();

/**
 * صفوفُ السجلّ من قيود الدفتر — الأحدثُ أوّلًا (وهو ترتيبُ المتابعة).
 *
 * والقيدُ المعلَّق (لم يُقرّه الخادم) **يبقى ظاهرًا** موسومًا: إخفاؤه يُنقص
 * الجدولَ عن الواقع، وعرضُه بلا وسمٍ يدّعي وصولًا لم يقع.
 *
 * @param {object[]} scans قيود `operations/{id}/scans`
 * @param {{toMillis?:(scan:object)=>number|null}} [opts]
 * @returns {object[]}
 */
export function buildLogRows(scans, { toMillis } = {}) {
  const at = typeof toMillis === 'function' ? toMillis : () => null;
  const rows = (Array.isArray(scans) ? scans : []).map((s, i) => {
    const qty = Number(s?.qty) || 0;
    // ★ `== null` عمدًا قبل `Number` — و`Number(null)` **صفرٌ محدود**: لو فُحص
    //   بـ`isFinite` وحده لصار القيدُ الذي لا طابعَ له مؤرَّخًا بمبدأ الحقبة
    //   (١٩٧٠) بدل أن يُقرأ «لم يصل بعد». وهو المزلق نفسُه الذي تحذّر منه
    //   `scanBaseQty` في هذه الطبقة حرفيًّا.
    const raw = at(s);
    const ms = raw == null ? null : Number(raw);
    return {
      id: s?.id || `row-${i}`,
      seq: i,
      atMs: ms != null && Number.isFinite(ms) ? ms : null,
      pending: Boolean(s?._pending),
      byName: str(s?.byName) || 'غير معروف',
      byUid: str(s?.byUid),
      barcode: str(s?.barcode),
      sku: str(s?.sku),
      name: str(s?.name) || str(s?.barcode),
      qty,
      uom: str(s?.uom),
      baseQty: s?.baseQty == null ? null : Number(s.baseQty),
      base: scanBaseQty(s),
      // ★ وحدةٌ أُعلنت ولم يُعرف معاملها: مجموعُه بالأساس **غير مضمون**،
      //   فيُوسم ولا يُخفى (ق-٢) — والحسم في المراجعة لا في العرض.
      uncertain: Boolean(s?.uom) && s?.baseQty == null,
      uomMissing: Boolean(s?.uomMissing),
      collision: Boolean(s?.collision),
      direction: qty < 0 ? 'out' : 'in',
    };
  });
  // الأحدثُ أوّلًا؛ وما لا طابعَ له (معلَّقٌ لم يُقرّ) يُقدَّم لأنّه آخرُ ما وقع.
  return rows.sort((a, b) => {
    if (a.atMs == null && b.atMs == null) return b.seq - a.seq;
    if (a.atMs == null) return -1;
    if (b.atMs == null) return 1;
    return b.atMs - a.atMs || b.seq - a.seq;
  });
}

/**
 * تصفيةُ السجلّ — بالشخص وبنصِّ بحثٍ حرّ.
 *
 * والبحثُ يشمل **الاسمَ والباركودَ وكودَ الصنف**: المدير يبحث بما في يده،
 * وقد يكون ورقةً فيها كودٌ لا اسم.
 *
 * @param {object[]} rows
 * @param {{person?:string, term?:string, direction?:string}} [f]
 */
export function filterLogRows(rows, f = {}) {
  const person = str(f.person);
  const term = str(f.term).toLowerCase();
  const dir = str(f.direction);
  return (Array.isArray(rows) ? rows : []).filter((r) => {
    if (person && person !== 'all' && r.byName !== person) return false;
    if (dir && dir !== 'all' && r.direction !== dir) return false;
    if (!term) return true;
    return (
      r.name.toLowerCase().includes(term) ||
      r.barcode.toLowerCase().includes(term) ||
      r.sku.toLowerCase().includes(term) ||
      r.byName.toLowerCase().includes(term)
    );
  });
}

/** أسماءُ من عملوا في الجلسة — لقائمة التصفية. مرتّبةً بالأكثر قيودًا. */
export function logPeople(rows) {
  const m = new Map();
  for (const r of Array.isArray(rows) ? rows : []) m.set(r.byName, (m.get(r.byName) || 0) + 1);
  return [...m.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * مجاميعُ السجلّ — والجمعُ **بوحدة الأساس وحدها**.
 *
 * جمعُ «١ كرتون» و«٣ قطع» على أنّهما ٤ رقمٌ لا معنى له. و`scanBaseQty`
 * تُعيد الخامَّ حين يُجهل المعامل، فيُعدّ ذلك الصفُّ في `uncertain` ويُعلَن
 * — فالمجموعُ يُقرأ مع تحفّظه لا مجرَّدًا منه.
 */
export function logTotals(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const items = new Set();
  let base = 0;
  let uncertain = 0;
  let pending = 0;
  for (const r of list) {
    base += r.base;
    items.add(r.barcode || r.sku || r.name);
    if (r.uncertain) uncertain++;
    if (r.pending) pending++;
  }
  return {
    scanCount: list.length,
    itemCount: items.size,
    baseTotal: Math.round(base * 1e6) / 1e6,
    uncertain,
    pending,
    peopleCount: logPeople(list).length,
  };
}

/**
 * توزيعُ العمل على الأشخاص — بوحدة الأساس وعددِ القيود والأصناف.
 * هذا ما يُجيب «ماذا قرأ محمد بالضبط» حين يُختلَف.
 */
export function workByPerson(rows) {
  const m = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const cur = m.get(r.byName) || { name: r.byName, scans: 0, base: 0, items: new Set(), uncertain: 0 };
    cur.scans++;
    cur.base += r.base;
    cur.items.add(r.barcode || r.sku || r.name);
    if (r.uncertain) cur.uncertain++;
    m.set(r.byName, cur);
  }
  return [...m.values()]
    .map((v) => ({
      name: v.name,
      scans: v.scans,
      base: Math.round(v.base * 1e6) / 1e6,
      items: v.items.size,
      uncertain: v.uncertain,
    }))
    .sort((a, b) => b.scans - a.scans || a.name.localeCompare(b.name));
}

/**
 * صفوفُ التصدير — إكسل وPDF من **مصدرٍ واحد**، فلا يفترق ملفّان لجلسةٍ واحدة.
 *
 * ★ والوحدةُ عمودٌ مستقلٌّ عن الكمّيّة، والأساسُ عمودٌ ثالث: هذه هي الثلاثة
 * التي تجعل الورقةَ مرجعًا. والمجهولُ يُصدَّر «—» لا صفرًا.
 */
export function logExportRows(rows, { formatTime } = {}) {
  const fmt = typeof formatTime === 'function' ? formatTime : (v) => (v == null ? '—' : String(v));
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    'الوقت': fmt(r.atMs),
    'العادّ': r.byName,
    'الصنف': r.name,
    'الباركود': r.barcode,
    'كود الصنف': r.sku,
    'الكمّيّة': r.qty,
    'الوحدة': r.uom || '—',
    'بوحدة الأساس': r.baseQty == null ? '—' : r.baseQty,
    'الاتّجاه': r.direction === 'out' ? 'خصم' : 'إضافة',
    'ملاحظة': [
      r.uncertain ? 'وحدةٌ بلا معامل' : '',
      r.uomMissing ? 'صنفٌ بلا وحدة أساس' : '',
      r.collision ? 'باركودٌ تصادم' : '',
      r.pending ? 'لم يصل الخادم بعد' : '',
    ]
      .filter(Boolean)
      .join(' · '),
  }));
}
