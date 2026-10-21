/**
 * مخزن الأرصدة — الكميات لكل (صنف × مخزن × تشغيلة)، منفصلةً عن تعريفات الأصناف.
 *
 * لماذا مستقلّ عن `Items_Master`؟ لأن التعريف يتغيّر نادرًا والرصيد يوميًّا
 * (قرار المالك 2026-07-15). فرفع ورقة التعريفات لا يمسّ الأرصدة، والعكس.
 *
 * البنية:  balances/{item__warehouse__batch}
 *   sku · barcode · nameAr · warehouse · location · batch · expiry
 *   qty · unitCost · countDate · updatedAt
 *
 * ═══ الصلاحية — ولماذا لا تُطابق القواعد عمدًا (ل‑١٨) ═══
 *
 * كان مكتوبًا هنا «تُطابق firestore.rules» وهو **غير دقيق**: القاعدة تسمح
 * بالكتابة على `balances` لاثني عشر دورًا (`isStockActor() || isVanSalesWriter()`)
 * لأنّ **قيد المستند** يزيد الرصيد وينقصه ذرّيًّا، ومن يُنجز قائمة سحبٍ قد
 * يكون أمين مخزنٍ لا مديرًا.
 *
 * و`BALANCES_ROLES` أضيق منها عمدًا: هي صلاحية **الاستيراد اليدويّ** من إكسل
 * — فعلٌ يدهس أرصدةً بملفٍّ محفوظ، ولا يجوز إلا للمديرَين. فالفرق ليس تناقضًا
 * بل فعلان مختلفان: القاعدة تحرس **القيد**، وهذه تحرس **الدهس**.
 *
 * والقراءة لأيّ مصادَق (الجرد والمستندات تحتاج معرفة الرصيد).
 */
import { collection, doc, getCountFromServer, getDocs, onSnapshot, query, Timestamp, where, writeBatch, serverTimestamp, db } from '../_db/index.js';
import { importSheet } from '../excel/excelImport.js';
import { balanceId } from './balanceKey.js';
import { normalizeSku, normalizeBarcode } from '../items/itemService.js';
import { normalizeLocationCode } from '../locations/locationCode.js';
import { binPrefixRange } from '../locations/scopedQuery.js';
import { BALANCES_CACHE_KEY, BALANCE_ROWS, applyDelta, cursorOf, needsResync, packRows, unpackRows } from '../items/catalogDelta.js';
import { isFresh } from '../items/itemCache.js';

const COL = 'balances';
const BATCH_LIMIT = 500;

export const BALANCES_ROLES = ['admin', 'warehouse_manager'];
export function canEditBalances(role) {
  return BALANCES_ROLES.includes(role);
}

/** يستمع لكل الأرصدة لحظيًّا. */
export function listenBalances(callback, onError) {
  return onSnapshot(
    collection(db, COL),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onError?.(err)
  );
}

/**
 * ‹DS-READS› أرصدةُ خاناتِ مستودعاتٍ بعينها — بمدى البادئة لا بالمجموعة كلّها.
 *
 * ★★ ولماذا بالخانة لا بـ`warehouse`؟ لأنّ ما يحتاجه اقتراحُ الرفّ هو **ما في الرفّ**
 * (السعةُ والخلطُ والحِمل تُحسب من `bin`)، و`warehouse` على الرصيد كودُ البوّابة
 * (`WH001`) لا بادئةُ الملصق (`RH`). والأرصدةُ بلا خانةٍ — وهي جُلُّ الافتتاحيّ —
 * لا تُقرأ، فلا أثرَ لها في الاقتراح أصلًا.
 *
 * والحقلان كلاهما: `bin` هو الموحَّد (‹LOC-106›)، و`location` القديم يقرؤه
 * `balanceLocationCode` توافقًا رجعيًّا — فيُقرأ هنا مثله. ومدى حقلٍ واحدٍ لا يطلب
 * فهرسًا مركّبًا.
 *
 * @param {string[]} prefixes بادئاتُ الخانات (= `warehouse` على `bin_locations`)
 */
export async function fetchBalancesInBinsOf(prefixes) {
  const list = [...new Set((prefixes || []).map((p) => String(p ?? '').trim().toUpperCase()).filter(Boolean))];
  const ranges = list.flatMap((p) => {
    const { start, end } = binPrefixRange(p);
    return ['bin', 'location'].map((field) =>
      getDocs(query(collection(db, COL), where(field, '>=', start), where(field, '<', end)))
    );
  });
  const seen = new Map();
  for (const snap of await Promise.all(ranges)) {
    for (const d of snap.docs) if (!seen.has(d.id)) seen.set(d.id, { id: d.id, ...d.data() });
  }
  return [...seen.values()];
}

function balancesStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** الأرصدةُ كلُّها قراءةً واحدة — وتُحفظ أساسًا للمستمع على ما تغيّر. */
async function loadBalancesBase({ force = false } = {}) {
  const s = balancesStorage();
  if (!force && s) {
    try {
      const stored = unpackRows(s.getItem(BALANCES_CACHE_KEY));
      if (stored && isFresh(stored, Date.now())) return stored.rows;
    } catch {
      /* ذاكرةٌ فاسدة — تُقرأ من الخادم */
    }
  }
  const snap = await getDocs(collection(db, COL));
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (s) {
    try {
      s.setItem(BALANCES_CACHE_KEY, packRows(rows, Date.now()));
    } catch {
      /* ممتلئٌ أو محظور — الصفحةُ تعمل بلا ذاكرة */
    }
  }
  return rows;
}

/**
 * ‹LOC-READS› الأرصدةُ كلُّها حيّةً **بلا قراءتها كلِّها في كلّ فتحة** — لشاشة الأصناف.
 *
 * الأساسُ من ذاكرة المتصفّح (نصفَ يوم) أو قراءةٌ واحدةٌ تُحفظ، ومستمعٌ على `updatedAt >=`
 * أحدثِ ختمٍ فيه — وكلُّ كاتبٍ للأرصدة يختم (القيدُ · الحجز · الاستيراد · إعادةُ البناء)،
 * ولا حذفَ في القاعدة («الرصيدُ الصفريّ يُكتب لا يُمحى»). وعدٌّ من الخادم يُثبت التمام،
 * فإن اختلف قُرئ الأساسُ من جديد. والمنطقُ وحدُّه المعلَن في `items/catalogDelta.js`.
 */
export function listenBalancesDelta(callback, onError) {
  let cancelled = false;
  let offDelta = null;
  let base = [];
  let changed = [];
  let verified = false;
  const merged = () => applyDelta(base, changed, BALANCE_ROWS);

  const verify = async () => {
    try {
      const snap = await getCountFromServer(collection(db, COL));
      if (cancelled || !needsResync(merged().length, snap.data().count)) return;
      start(await loadBalancesBase({ force: true }));
    } catch {
      /* بلا شبكةٍ لا عدّ — يبقى ما في اليد */
    }
  };

  function start(rows) {
    if (cancelled) return;
    base = Array.isArray(rows) ? rows : [];
    changed = [];
    offDelta?.();
    offDelta = onSnapshot(
      query(collection(db, COL), where('updatedAt', '>=', Timestamp.fromMillis(cursorOf(base)))),
      (snap) => {
        changed = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (!cancelled) callback(merged());
        if (!verified) {
          verified = true;
          verify();
        }
      },
      (err) => {
        if (!cancelled) onError?.(err);
      }
    );
  }

  loadBalancesBase()
    .then(start)
    .catch((err) => {
      if (!cancelled) onError?.(err);
    });

  return () => {
    cancelled = true;
    offDelta?.();
  };
}

/**
 * ‹LOC-READS› مستمعون مقصورون على خانات — المستمعُ الكامل يرتّب بالمعرّف
 * (ترتيبُ Firestore الافتراضيّ)، فيُرتَّب الدمجُ به أيضًا: FEFO يحسم التعادلَ
 * بترتيب الدخول، ودمجٌ بترتيبٍ آخر يجعل الدفعةَ المسحوبةَ تتبدّل بلا سبب.
 */
function listenMergedBalances(queries, callback, onError) {
  if (!queries.length) {
    const t = setTimeout(() => callback([]), 0);
    return () => clearTimeout(t);
  }
  const latest = new Array(queries.length).fill(null);
  const offs = queries.map((q, i) =>
    onSnapshot(
      q,
      (snap) => {
        latest[i] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (!latest.every(Boolean)) return;
        const seen = new Map();
        for (const list of latest) for (const b of list) if (!seen.has(b.id)) seen.set(b.id, b);
        callback([...seen.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
      },
      (err) => onError?.(err)
    )
  );
  return () => offs.forEach((off) => off());
}

/**
 * ‹LOC-READS› أرصدةُ خاناتِ مستودعاتٍ حيّةً — النسخةُ الحيّة من `fetchBalancesInBinsOf`
 * (مدى البادئة على `bin` و`location` كلاهما، فلا يفوت رصيدٌ بالحقل القديم).
 */
export function listenBalancesInBinsOf(prefixes, callback, onError) {
  const list = [...new Set((prefixes || []).map((p) => String(p ?? '').trim().toUpperCase()).filter(Boolean))].sort();
  const queries = list.flatMap((p) => {
    const { start, end } = binPrefixRange(p);
    return ['bin', 'location'].map((field) =>
      query(collection(db, COL), where(field, '>=', start), where(field, '<', end))
    );
  });
  return listenMergedBalances(queries, callback, onError);
}

/**
 * ‹LOC-READS› أرصدةُ خاناتٍ بعينها حيّةً — `bin in` و`location in` ثلاثين ثلاثين.
 * والمستهلكُ يُعيد مرشّحه (`b.bin ?? b.location`) على الناتج، فالزائدُ لا يضرّ.
 */
export function listenBalancesInBins(codes, callback, onError) {
  const list = [...new Set((codes || []).map(normalizeLocationCode).filter(Boolean))].sort();
  const queries = [];
  for (let i = 0; i < list.length; i += 30) {
    const chunk = list.slice(i, i + 30);
    for (const field of ['bin', 'location']) {
      queries.push(
        chunk.length === 1
          ? query(collection(db, COL), where(field, '==', chunk[0]))
          : query(collection(db, COL), where(field, 'in', chunk))
      );
    }
  }
  return listenMergedBalances(queries, callback, onError);
}

/** ‹LOC-READS› أرصدةُ خاناتٍ بعينها قراءةً واحدة — للرفّ الممسوح خارج مستودع المهمّة. */
export async function fetchBalancesInBins(codes) {
  const list = [...new Set((codes || []).map(normalizeLocationCode).filter(Boolean))].sort();
  const snaps = [];
  for (let i = 0; i < list.length; i += 30) {
    const chunk = list.slice(i, i + 30);
    for (const field of ['bin', 'location']) {
      snaps.push(getDocs(query(collection(db, COL), where(field, 'in', chunk))));
    }
  }
  const seen = new Map();
  for (const snap of await Promise.all(snaps)) {
    for (const d of snap.docs) if (!seen.has(d.id)) seen.set(d.id, { id: d.id, ...d.data() });
  }
  return [...seen.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** أرصدة صنف بعينه (بكوده) عبر كل المخازن والتشغيلات. */
export async function balancesForSku(sku) {
  const id = normalizeSku(sku);
  if (!id) return [];
  const snap = await getDocs(query(collection(db, COL), where('sku', '==', id)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** أرصدة صنف بباركوده. */
export async function balancesForBarcode(barcode) {
  const code = normalizeBarcode(barcode);
  if (!code) return [];
  const snap = await getDocs(query(collection(db, COL), where('barcode', '==', code)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * يقرأ كل الأرصدة مرّة كمصفوفة — لتخصيص أمر البيع (يحتاج كل التشغيلات المتاحة).
 * قراءةٌ واحدة بلا اشتراك؛ المجموعة ليست ضخمة والتخصيص لحظةٌ لا حلقة.
 */
export async function fetchBalancesOnce() {
  const snap = await getDocs(collection(db, COL));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** يقرأ كل الأرصدة مرّة (لبناء المعاينة). */
function fetchAllOnce() {
  return new Promise((resolve, reject) => {
    const unsub = listenBalances(
      (rows) => {
        unsub();
        resolve(new Map(rows.map((r) => [r.id, r])));
      },
      (err) => {
        unsub();
        reject(err);
      }
    );
  });
}

/**
 * يحلّل ورقة الأرصدة ويبني معاينة **بلا كتابة**.
 * يقرأ ورقة «Balances» تحديدًا إن وُجدت، وإلا أول ورقة.
 */
export async function analyzeBalancesFile(file) {
  const result = await importSheet(file, 'balances', { sheetName: pickSheet(file) });
  const existing = await fetchAllOnce();

  const created = [];
  const updated = [];
  const unchanged = [];
  const skipped = []; // صفوف بلا معرّف صالح

  for (const row of result.rows) {
    const id = balanceId(row);
    if (!id) {
      skipped.push(row);
      continue;
    }
    const shaped = { ...row, id };
    const prior = existing.get(id);
    if (!prior) created.push(shaped);
    else if (Number(prior.qty) !== Number(row.qty) || Number(prior.unitCost || 0) !== Number(row.unitCost || 0))
      updated.push({ ...shaped, _before: { qty: prior.qty, unitCost: prior.unitCost } });
    else unchanged.push(shaped);
  }

  return {
    ...result,
    plan: { created, updated, unchanged, skipped },
    existing,
  };
}

/** اسم ورقة الأرصدة — importSheet سيتولّى الاسم؛ نُمرّر Balances إن أمكن. */
function pickSheet() {
  return 'Balances';
}

/** يكتب المعاينة المعتمدة إلى مخزن الأرصدة (دفعات). */
export async function commitBalancesImport(analysis) {
  if (!analysis?.ok) throw new Error('لا تُستورد ورقة فيها أخطاء — صحّح الصفوف المعلَّمة أولًا.');
  const toWrite = [...analysis.plan.created, ...analysis.plan.updated];
  if (toWrite.length === 0) return { created: 0, updated: 0 };

  let created = analysis.plan.created.length;
  let updated = analysis.plan.updated.length;

  for (let i = 0; i < toWrite.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const row of toWrite.slice(i, i + BATCH_LIMIT)) {
      const { id, _before, ...data } = row;
      batch.set(
        doc(db, COL, id),
        {
          sku: normalizeSku(data.sku),
          barcode: normalizeBarcode(data.barcode),
          nameAr: String(data.nameAr || '').trim(),
          warehouse: String(data.warehouse || '').trim(),
          // ‹LOC-106› حقلٌ واحد للموقع: `bin` — نفس ما يكتبه القيد المخزنيّ،
          // بالصيغة القياسية نفسها. و`location` القديم **لا يُمحى** من صفوفٍ
          // كُتبت قبل التوحيد؛ يقرؤه `balanceLocationCode` توافقًا رجعيًّا.
          bin: normalizeLocationCode(data.bin ?? data.location),
          batch: String(data.batch || '').trim(),
          expiry: String(data.expiry || '').trim(),
          qty: Number(data.qty) || 0,
          unitCost: Number(data.unitCost) || 0,
          countDate: String(data.countDate || '').trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();
  }
  return { created, updated };
}
