/**
 * شبكة الخريطة البصريّة للمواقع — منطق خالص بلا Firebase وبلا DOM.
 *
 * الخريطة ليست زينة: العامل يقف أمام ممرٍّ ويحتاج جوابًا في لحظة — **أيّ رفٍّ
 * يقبل؟** والشجرة تُجيب بعد فتح ثلاث عقد، والشبكة تُجيب بنظرة. فما تعرضه هذه
 * الوحدة هو حالة كلّ خانة مشتقّةً من سيّد المواقع والأرصدة الحيّة، لا من رسمٍ
 * ثابت في JSX يفترق عن الواقع أوّل حركة.
 *
 * ثلاث قواعد تحكم ما هنا:
 *
 * ١. **الحالة الإدارية تسبق الإشغال.** رفٌّ متوقّفٌ فارغ ليس «فارغًا» — هو
 *    ممنوع. ولو غلّبنا الإشغال لأخرج للعامل خانةً خضراء على رفٍّ مُقفَل. فكلّ
 *    حالةٍ لا تقبل (`accepts:false`) تُعرض بذاتها، و`active` وحدها تُشتقّ من
 *    الرصيد — وهو الحكم نفسه الذي يُصدره `canReceive`، لا حكمٌ ثانٍ بجانبه.
 *
 * ٢. **اللون لا يحمل معنًى وحده.** لكلّ حالة رمزٌ ونمطٌ ونصّ إلى جانب اللون:
 *    من لا يميّز الأحمر من الأخضر يقرأ الخريطة كاملةً، والطابعة بالأبيض
 *    والأسود كذلك. والأحمر محجوزٌ للتحذير وحده (`warn`) لا للتمييز.
 *
 * ٣. **الرصيد في موقعٍ لا يقبل تحذيرٌ لا لونُ خلفية.** بضاعةٌ في رفٍّ متوقّف
 *    أو مؤرشَف لا تظهر في أيّ تقرير آخر — لا المطابقة تراها فرقًا (الرصيد
 *    مقيَّد) ولا الاقتراح يمسّها (الموقع لا يُقترح). فتبقى صامتةً حتى يُهدَم
 *    الرفّ. هنا تُعلَن.
 */

import { normalizeLocationCode, parseLocationCode, shortLabelOf } from './locationCode.js';
import { isReservedCode } from '../ledger/locations.js';
import { LOCATION_STATUSES, DEFAULT_STATUS, STORAGE_TYPES, balanceLocationCode, occupancyOf } from './locationsModel.js';

/**
 * حالات الخانة على الخريطة.
 *
 * `symbol` محارف هندسيّة لا إيموجي — الإيموجي ممنوع في الواجهة، ورسمُه يختلف
 * بين الأجهزة فيفقد الرمز ثباته. و`pattern` اسمٌ تجريديّ تترجمه الشاشة إلى
 * تظليل، فيبقى المنطق بلا CSS.
 */
export const CELL_STATES = {
  empty: {
    id: 'empty',
    labelAr: 'فارغ',
    symbol: '○',
    pattern: 'none',
    tone: 'neutral',
    warn: false,
    accepts: true,
    hint: 'لا رصيد فيه — يقبل بضاعة.',
  },
  occupied: {
    id: 'occupied',
    labelAr: 'مشغول',
    symbol: '◐',
    pattern: 'dots',
    tone: 'info',
    warn: false,
    accepts: true,
    hint: 'فيه رصيد ولم يبلغ سعته.',
  },
  full: {
    id: 'full',
    labelAr: 'ممتلئ',
    symbol: '●',
    pattern: 'solid',
    tone: 'info',
    warn: false,
    accepts: false,
    hint: 'بلغ سعته — لا يُقترح حتى يفرغ.',
  },
  reserved: {
    id: 'reserved',
    labelAr: 'محجوز',
    symbol: '◇',
    pattern: 'diagonal',
    tone: 'accent',
    warn: false,
    accepts: false,
    hint: 'محجوزٌ لغرضٍ قائم — لا يُقترح لبضاعةٍ جديدة.',
  },
  stopped: {
    id: 'stopped',
    labelAr: 'متوقّف',
    symbol: '×',
    pattern: 'cross',
    tone: 'warn',
    warn: true,
    accepts: false,
    hint: 'أُوقف إداريًّا — لا تخزين ولا اقتراح.',
  },
  maintenance: {
    id: 'maintenance',
    labelAr: 'تحت الصيانة',
    symbol: '△',
    pattern: 'grid',
    tone: 'warn',
    warn: true,
    accepts: false,
    hint: 'رفٌّ يُصلَح — لا يستقبل بضاعة.',
  },
  archived: {
    id: 'archived',
    labelAr: 'مؤرشَف',
    symbol: '□',
    pattern: 'faded',
    tone: 'muted',
    warn: false,
    accepts: false,
    hint: 'خرج من الخدمة؛ يبقى لأثره التاريخيّ ولا يُحذف.',
  },
};

/** ترتيب العرض في مفتاح الخريطة — من المتاح إلى الخارج عن الخدمة. */
export const CELL_STATE_ORDER = ['empty', 'occupied', 'full', 'reserved', 'stopped', 'maintenance', 'archived'];

/** مفتاح الخريطة جاهزًا للعرض — مصدره الحالات نفسها فلا يفترق عنها. */
export const MAP_LEGEND = CELL_STATE_ORDER.map((id) => CELL_STATES[id]);

/** تنبيهات الخانة — نصٌّ واحدٌ لكلٍّ، والأحمر لها وحدها. */
export const CELL_ALERTS = {
  stockInBlocked: {
    id: 'stockInBlocked',
    labelAr: 'رصيدٌ في موقعٍ لا يقبل',
    hint: 'فيه بضاعة والموقع لا يستقبل — تُنقل أو تُعاد حالة الموقع.',
  },
  overCapacity: {
    id: 'overCapacity',
    labelAr: 'تجاوز السعة',
    hint: 'الرصيد أكبر من السعة المسجَّلة — إمّا السعة خاطئة أو التخزين خالف الحدّ.',
  },
};

const str = (v) => String(v ?? '').trim();

/** مقارنةٌ طبيعيّة: `B9` قبل `B10` لا بعدها (المقارنة النصّيّة تعكسهما). */
function naturalCompare(a, b) {
  const ax = String(a).match(/\d+|\D+/g) || [];
  const bx = String(b).match(/\d+|\D+/g) || [];
  for (let i = 0; i < Math.max(ax.length, bx.length); i++) {
    const x = ax[i];
    const y = bx[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = Number(x);
    const ny = Number(y);
    const bothNum = Number.isFinite(nx) && Number.isFinite(ny) && /\d/.test(x) && /\d/.test(y);
    const cmp = bothNum ? nx - ny : x.localeCompare(y);
    if (cmp) return cmp;
  }
  return 0;
}

/**
 * يفهرس الأرصدة بكود موقعها **مرّةً واحدة**.
 *
 * لماذا لا نترك `occupancyOf` يمسح القائمة لكلّ موقع؟ لأنّها تمسح الأرصدة
 * كلّها في كلّ نداء، فمستودعٌ بألف موقعٍ وعشرة آلاف رصيد يعني عشرة ملايين
 * مقارنة في كلّ إعادة رسم — والخريطة تُعاد رسمها مع كلّ حركة لحظيّة.
 */
export function indexBalancesByLocation(balances) {
  const map = new Map();
  for (const b of balances || []) {
    const code = balanceLocationCode(b);
    if (!code) continue;
    const bucket = map.get(code);
    if (bucket) bucket.push(b);
    else map.set(code, [b]);
  }
  return map;
}

/**
 * حالة الموقع على الخريطة.
 *
 * الحالة الإدارية تسبق الإشغال (القاعدة ١)، و`full` الإداريّة تُعرض ممتلئةً
 * وإن كانت فارغةً فعلًا — لأنّ ما يهمّ العامل هو **أيقبل أم لا**.
 */
export function cellStateOf(location, occupancy) {
  const statusId = LOCATION_STATUSES[location?.status] ? location.status : DEFAULT_STATUS;
  if (!LOCATION_STATUSES[statusId].accepts) {
    return CELL_STATES[statusId] ? statusId : 'stopped';
  }
  if (!occupancy || occupancy.usedQty <= 0) return 'empty';
  if (occupancy.remainingQty === 0) return 'full';
  return 'occupied';
}

/**
 * خانةٌ واحدة على الخريطة — كلّ ما تحتاجه الشاشة لرسمها بلا حسابٍ إضافيّ.
 *
 * @param {object} location موقعٌ من `bin_locations`
 * @param {Array}  own      أرصدة هذا الموقع وحده (من `indexBalancesByLocation`)
 */
export function buildCell(location, own = []) {
  const code = normalizeLocationCode(location?.code);
  const parsed = parseLocationCode(code);
  const occupancy = occupancyOf(location, own);
  const state = cellStateOf(location, occupancy);
  const meta = CELL_STATES[state];

  const alerts = [];
  if (!meta.accepts && state !== 'full' && occupancy.usedQty > 0) alerts.push(CELL_ALERTS.stockInBlocked);
  if (occupancy.capacityQty !== null && occupancy.usedQty > occupancy.capacityQty) alerts.push(CELL_ALERTS.overCapacity);

  const storage = STORAGE_TYPES[location?.storageType] || STORAGE_TYPES.ambient;
  const capacityText =
    occupancy.capacityQty === null
      ? `${occupancy.usedQty} (بلا سقفٍ مسجَّل)`
      : `${occupancy.usedQty} من ${occupancy.capacityQty}`;

  return {
    code,
    shortLabel: shortLabelOf(code) || code,
    nameAr: str(location?.nameAr),
    warehouse: parsed?.warehouse || str(location?.warehouse),
    zone: parsed?.zone || str(location?.zone),
    rack: parsed?.rack || str(location?.rack),
    bay: parsed?.bay || str(location?.bay),
    level: parsed?.level || str(location?.level),
    position: parsed?.position || str(location?.position),
    state,
    stateLabel: meta.labelAr,
    symbol: meta.symbol,
    pattern: meta.pattern,
    tone: meta.tone,
    warn: meta.warn || alerts.length > 0,
    accepts: meta.accepts,
    storageType: storage.id,
    storageLabel: storage.labelAr,
    occupancy,
    capacityText,
    alerts,
    /** سطرٌ نصّيّ كامل — للـ`title` وللطباعة، فالمعنى لا يضيع بلا لون. */
    summaryText: [
      code,
      meta.labelAr,
      storage.labelAr,
      capacityText,
      ...alerts.map((a) => a.labelAr),
    ].join(' · '),
  };
}

/** إحصاء مجموعةٍ من الخانات — الأرقام التي تُكتب فوق كلّ ممرٍّ ومستودع. */
export function summarize(cells) {
  const byState = {};
  for (const id of CELL_STATE_ORDER) byState[id] = 0;

  let usedQty = 0;
  let cappedUsedQty = 0;
  let capacityQty = 0;
  let capped = 0;
  let accepting = 0;
  let alerts = 0;

  for (const c of cells || []) {
    byState[c.state] = (byState[c.state] || 0) + 1;
    usedQty += c.occupancy.usedQty;
    if (c.occupancy.capacityQty !== null) {
      capacityQty += c.occupancy.capacityQty;
      cappedUsedQty += c.occupancy.usedQty;
      capped++;
    }
    if (c.accepts) accepting++;
    alerts += c.alerts.length;
  }

  return {
    cells: (cells || []).length,
    byState,
    /** الرصيد كلّه — رقمُ المخزون لا رقمُ الامتلاء. */
    usedQty,
    /** السعة المجمَّعة **للمواقع المسقوفة وحدها** — وعددها معها. */
    capacityQty,
    cappedCells: capped,
    /**
     * نسبة الامتلاء: بسطُها ومقامُها من **المواقع المسقوفة نفسها**.
     *
     * ولو قُسم الرصيد كلّه على السعة المسقوفة وحدها لَكذبت النسبة كلّما وُجد
     * موقعٌ بلا سقف: رفٌّ مسقوفٌ نصفُه ممتلئ ومستودعٌ مفتوحٌ فيه ألف وحدة
     * يُخرجان «١٠٠٪ ممتلئ» على مستودعٍ نصفُه خالٍ.
     */
    fillPct: capacityQty > 0 ? Math.min(100, Math.round((cappedUsedQty / capacityQty) * 100)) : null,
    acceptingCells: accepting,
    alerts,
  };
}

/**
 * أرصدةٌ تشير إلى مواقع غير مسجَّلة في سيّد المواقع.
 *
 * مواقع النظام والمركبات والعملاء **ليست يتيمة**: هي مواقع بحكم التصميم ولا
 * مكان لها في `bin_locations`. والفراغ ليس يُتمًا كذلك — هو مستندٌ قديم بلا
 * موقع، وهو الحال الغالب اليوم.
 */
export function orphanBalanceCodes(locations, balances) {
  const known = new Set((locations || []).map((l) => normalizeLocationCode(l?.code)).filter(Boolean));
  const out = new Map();
  for (const b of balances || []) {
    const code = balanceLocationCode(b);
    if (!code || isReservedCode(code) || known.has(code)) continue;
    const row = out.get(code) || { code, lines: 0, qty: 0 };
    row.lines++;
    row.qty += Number(b?.qty) || 0;
    out.set(code, row);
  }
  return [...out.values()].sort((a, b) => naturalCompare(a.code, b.code));
}

/**
 * الشبكة كاملةً: مستودع ← منطقة ← رفّ ← خانات.
 *
 * الهرميّة تُقرأ من **الكود** لا من حقل أب — للسبب نفسه الذي بُنيت عليه
 * `buildLocationTree`: الكود هو الهويّة، وحقلُ أبٍ مستقلّ يفترق عنه أوّل
 * إعادة تنظيم فتصير للخريطة حقيقتان.
 *
 * والمقاطع الغائبة لا تُسقط الموقع: `MAIN-A01` منطقةٌ كاملة موقعٌ صالح، فتُوضع
 * في رفٍّ بلا اسم (`''`) وتظهر في مكانها بدل أن تختفي.
 *
 * @param {Array}  locations مواقع `bin_locations`
 * @param {Array}  balances  الأرصدة الحيّة
 * @param {object} [options]
 * @param {string} [options.warehouse]  حصرٌ بمستودع
 * @param {string} [options.storageType] حصرٌ بنوع تخزين
 * @param {boolean}[options.includeArchived=false] المؤرشَف مخفيٌّ افتراضًا ولا يُحذف
 * @param {string} [options.term] بحثٌ في الكود والاسم
 */
export function buildLocationGrid(locations, balances, options = {}) {
  const { warehouse, storageType, includeArchived = false, term } = options;
  const wanted = normalizeLocationCode(warehouse);
  const needle = str(term).toUpperCase();
  const byLocation = indexBalancesByLocation(balances);

  const cells = [];
  for (const loc of locations || []) {
    const code = normalizeLocationCode(loc?.code);
    if (!code) continue;
    if (!includeArchived && loc?.status === 'archived') continue;
    if (storageType && (loc?.storageType || 'ambient') !== storageType) continue;

    const cell = buildCell(loc, byLocation.get(code) || []);
    if (wanted && cell.warehouse !== wanted) continue;
    if (needle && !code.includes(needle) && !cell.nameAr.toUpperCase().includes(needle)) continue;
    cells.push(cell);
  }

  const warehouses = groupBy(cells, (c) => c.warehouse || '—');
  const tree = [...warehouses.entries()]
    .sort((a, b) => naturalCompare(a[0], b[0]))
    .map(([whCode, whCells]) => {
      const zones = [...groupBy(whCells, (c) => c.zone).entries()]
        .sort((a, b) => naturalCompare(a[0], b[0]))
        .map(([zoneCode, zoneCells]) => {
          const racks = [...groupBy(zoneCells, (c) => c.rack).entries()]
            .sort((a, b) => naturalCompare(a[0], b[0]))
            .map(([rackCode, rackCells]) => ({
              rack: rackCode,
              cells: rackCells.slice().sort((a, b) => naturalCompare(a.code, b.code)),
              summary: summarize(rackCells),
            }));
          return { zone: zoneCode, racks, summary: summarize(zoneCells) };
        });
      return { warehouse: whCode, zones, summary: summarize(whCells) };
    });

  return {
    warehouses: tree,
    cells,
    summary: summarize(cells),
    orphans: orphanBalanceCodes(locations, balances),
  };
}

function groupBy(items, keyOf) {
  const map = new Map();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}

/* ═════════ طبقة العمل ‹EXE-803› — يسدّ ف ت‑١٦ ═════════
 *
 * ═══ العطب ═══
 * الخريطة المبنيّة في LOC-602 تُظهر **السعة والإشغال**: أين المكان الفارغ.
 * ولا تُظهر **العمل**: ما التُقط اليوم · ما لم يبدأ · أين تعثّرت المهامّ.
 * فالمشرف الذي يسأل «أين وقف الشغل الآن؟» يقرأ جدولَ مهامٍّ ويتخيّل المكان.
 *
 * ═══ ★★ وطبقةٌ ثانية لا خريطةٌ ثانية ═══
 * الشبكة نفسها والخانات نفسها والفرز نفسه — يتبدّل **ما يُلوَّن به** فقط.
 * ومكوّن خريطةٍ ثانٍ كان سيُنتج «نتوءًا»: خريطتان تفترقان أوّل تعديلٍ في
 * إحداهما، ورابطين في القائمة لشيءٍ واحد.
 *
 * ═══ والتمييز بلا لونٍ وحده — كالطبقة الأولى ═══
 * لكلّ حالةٍ **رمزٌ ونمطٌ ونصّ**، فتُقرأ على طابعةٍ بالأبيض والأسود وعلى
 * شاشةٍ في الشمس ومن لا يميّز الألوان.
 */

/** حالات العمل على الموقع — طبقةٌ موازيةٌ لـ`CELL_STATES` بالعقد نفسه. */
export const WORK_STATES = {
  idle: {
    id: 'idle',
    labelAr: 'لا عمل',
    symbol: '·',
    pattern: 'none',
    tone: 'muted',
    warn: false,
    hint: 'لا مهمّةَ مفتوحةٌ تمسّ هذا الموقع.',
  },
  waiting: {
    id: 'waiting',
    labelAr: 'لم يبدأ',
    symbol: '◇',
    pattern: 'diagonal',
    tone: 'neutral',
    warn: false,
    hint: 'مهمّةٌ أُسندت ولم يُمسح منها بندٌ بعد.',
  },
  active: {
    id: 'active',
    labelAr: 'جارٍ',
    symbol: '◐',
    pattern: 'dots',
    tone: 'info',
    warn: false,
    hint: 'التُقط بعضُ المطلوب ولم يكتمل.',
  },
  done: {
    id: 'done',
    labelAr: 'تمّ',
    symbol: '●',
    pattern: 'solid',
    tone: 'ok',
    warn: false,
    hint: 'التُقط المطلوب كلّه من هذا الموقع.',
  },
  stalled: {
    id: 'stalled',
    labelAr: 'متعثّر',
    symbol: '×',
    pattern: 'cross',
    tone: 'warn',
    warn: true,
    hint: 'العمل عليه متوقّف — والسبب مكتوبٌ في الخانة.',
  },
};

export const WORK_STATE_ORDER = ['idle', 'waiting', 'active', 'done', 'stalled'];
/** مفتاح طبقة العمل — مصدره الحالات نفسها فلا يفترق عنها. */
export const WORK_LEGEND = WORK_STATE_ORDER.map((id) => WORK_STATES[id]);

/** مهمّةٌ خرجت من دائرة العمل — لا تُلوّن موقعًا ولا تُحتسب. */
const CLOSED_TASK_STATES = ['done', 'cancelled'];

/**
 * يجمع أسطر المهامّ على مواقعها.
 *
 * الموقع يُقرأ من `fromBin` **أو** `toBin`: السحب يُفرغ من موقعٍ والتخزين
 * يملأ موقعًا، وكلاهما «عملٌ يجري هنا» في عين المشرف.
 */
export function indexWorkByLocation(tasks) {
  const map = new Map();
  for (const task of tasks || []) {
    if (CLOSED_TASK_STATES.includes(str(task?.state)) && !(task?.lines || []).some((l) => Number(l?.qtyDone) > 0)) continue;
    for (const line of task?.lines || []) {
      for (const raw of [line?.fromBin, line?.toBin]) {
        const code = normalizeLocationCode(raw);
        if (!code) continue;
        const bucket = map.get(code) || [];
        bucket.push({ task, line });
        map.set(code, bucket);
      }
    }
  }
  return map;
}

/**
 * حال العمل على موقعٍ واحد — بكمّيّاته وسببِ تعثّره.
 *
 * ★ وسبب التعثّر **يُقال ولا يُترك للتخمين**: نقصُ رصيدٍ في السطر، أو سببُ
 * تأخيرٍ سجّله العامل، أو توقّفُ المهمّة نفسها. وموقعٌ أحمرُ بلا سببٍ يجعل
 * المشرف يفتح خمس شاشاتٍ ليعرف ما جرى.
 */
export function workOf(entries = []) {
  let required = 0;
  let done = 0;
  const reasons = [];
  const taskIds = new Set();
  let anyStarted = false;
  let anyStalled = false;

  for (const { task, line } of entries) {
    required += Math.max(0, Number(line?.qtyRequired) || 0);
    const did = Math.max(0, Number(line?.qtyDone) || 0);
    done += did;
    if (did > 0) anyStarted = true;
    if (task?.id) taskIds.add(task.id);

    if (line?.shortfall) {
      anyStalled = true;
      reasons.push(`نقص رصيد: ${Math.max(0, Number(line?.qtyRequired) || 0)} وحدة`);
    }
    if (str(task?.state) === 'paused') {
      anyStalled = true;
      reasons.push('المهمّة متوقّفة مؤقّتًا');
    }
    const delay = str(task?.delayReason?.id);
    if (delay) {
      anyStalled = true;
      reasons.push(`سبب مسجَّل: ${str(task?.delayReason?.label) || delay}`);
    }
  }

  const remaining = Math.max(0, required - done);
  let state = 'idle';
  if (entries.length) {
    if (anyStalled) state = 'stalled';
    else if (required > 0 && remaining === 0) state = 'done';
    else if (anyStarted) state = 'active';
    else state = 'waiting';
  }

  const meta = WORK_STATES[state];
  return {
    state,
    stateLabel: meta.labelAr,
    symbol: meta.symbol,
    pattern: meta.pattern,
    tone: meta.tone,
    warn: meta.warn,
    required,
    done,
    remaining,
    tasks: [...taskIds],
    /** أسبابٌ بلا تكرار — سببٌ واحدٌ يتكرّر في خمسة أسطر يُقال مرّة. */
    reasons: [...new Set(reasons)],
    summaryText: [meta.labelAr, required ? `${done} من ${required}` : '', ...new Set(reasons)]
      .filter(Boolean)
      .join(' · '),
  };
}

/**
 * يُلحق طبقة العمل بخانات شبكةٍ مبنيّة — **لا يعيد بناءها**.
 * فالفرز والتجميع والملخّصات تبقى كما هي، ويُضاف حقلُ `work` وحده.
 */
export function applyWorkLayer(grid, tasks) {
  const byLocation = indexWorkByLocation(tasks);
  for (const cell of grid?.cells || []) {
    cell.work = workOf(byLocation.get(cell.code) || []);
  }
  return grid;
}

/** إحصاء طبقة العمل — الأرقام التي تُكتب فوق الخريطة حين تُعرض بالعمل. */
export function summarizeWork(cells) {
  const byState = {};
  for (const id of WORK_STATE_ORDER) byState[id] = 0;
  let required = 0;
  let done = 0;
  const stalled = [];

  for (const c of cells || []) {
    const w = c?.work;
    if (!w) continue;
    byState[w.state] = (byState[w.state] || 0) + 1;
    required += w.required;
    done += w.done;
    if (w.state === 'stalled') stalled.push({ code: c.code, reasons: w.reasons });
  }

  return {
    byState,
    locations: (cells || []).filter((c) => c?.work && c.work.state !== 'idle').length,
    required,
    done,
    remaining: Math.max(0, required - done),
    pct: required > 0 ? Math.round((done / required) * 100) : null,
    /** المواقع المتعثّرة بأسبابها — لا عددٌ وحده. */
    stalled,
  };
}

/** أكواد المستودعات الموجودة فعلًا في سيّد المواقع — لملء قائمة الحصر. */
export function warehouseCodesOf(locations) {
  const set = new Set();
  for (const l of locations || []) {
    const code = normalizeLocationCode(l?.code);
    const parsed = parseLocationCode(code);
    const wh = parsed?.warehouse || normalizeLocationCode(l?.warehouse);
    if (wh) set.add(wh);
  }
  return [...set].sort(naturalCompare);
}
