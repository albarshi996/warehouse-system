/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  محوَّلُ المحلّيّ — عقدُ Firestore فوق مخزنٍ محقون، منطقٌ خالصٌ يُختبَر
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★★ الفكرةُ كلُّها: الشاشاتُ تنادي `doc/collection/query/getDocs/setDoc…` كما
 *     تنادي Firestore، وهذا المصنعُ يترجمها إلى عمليّات المخزن البسيطة
 *     (`get/query/count/write`). المخزنُ محقونٌ: الحقيقيُّ SQLite عبر Tauri،
 *     والمزيّفُ في الاختبار ذاكرةٌ — فيُبرهَن العقدُ بلا جهازٍ ولا قاعدة.
 *
 * ★★ كاتبٌ واحد: البرنامجُ عمليّةٌ واحدةٌ على الجهاز، فالقراءةُ-ثمّ-الكتابة
 *    (لحلّ `increment`/`arrayUnion` والدمج) آمنةٌ بلا تسابق. وبعد كلّ كتابةٍ
 *    يُنبَّه المستمعون محلّيًّا — فـ`onSnapshot` حيٌّ داخل العمليّة بلا بثٍّ سحابيّ.
 *
 * ⚠️ حدودُ م١ (مكتوبةٌ لا مخفيّة): المؤشّرُ (`startAfter`) بقيمةٍ أوّليّةٍ لترتيبٍ
 *    واحد؛ والجداولُ العلائقيّةُ تُرحَّل في م٢. والترتيبُ الافتراضيُّ (بلا orderBy)
 *    بمعرّف الوثيقة كـ`__name__` في Firestore، وهو فاصلُ تعادلٍ ثابتٌ دائمًا.
 *    والعمليّاتُ المغيّرةُ **مُسلسَلةٌ** (عزلٌ لا ذرّيّةٌ فقط). المحوَّلُ **خاملٌ**
 *    حتّى يُختار `local-sqlite` — فلا يُمسّ سلوكُ الحيّ.
 */
import {
  joinPath,
  splitDocPath,
  genId,
  makeTimestamp,
  makeTimestampApi,
  serverTimestampSentinel,
  incrementSentinel,
  arrayUnionSentinel,
  arrayRemoveSentinel,
  encodeValue,
  decodeValue,
  applyData,
} from './localValues.js';
import { DOC_ID } from './sqlQuery.js';

export const BACKEND_NAME = 'local-sqlite';

export function createLocalDb({ store, now = Date.now } = {}) {
  if (!store) throw new Error('createLocalDb يحتاج مخزنًا (store)');

  const db = { __bzLocalDb: true };
  const Timestamp = makeTimestampApi(now);
  const nowIso = () => new Date(now()).toISOString();

  /* ═══════════════════ المراجع ═══════════════════ */

  const docRef = (col, id) => ({ __kind: 'doc', col, id, path: joinPath([col, id]) });

  function doc(ref, ...segs) {
    let base = '';
    if (ref && ref.__kind === 'collection') base = ref.col;
    else if (ref && ref.__kind === 'doc') base = ref.path;
    if (ref && ref.__kind === 'collection' && segs.length === 0) {
      return docRef(ref.col, genId());
    }
    const { col, id } = splitDocPath(joinPath([base, ...segs]));
    return docRef(col, id);
  }

  function collection(ref, ...segs) {
    let base = '';
    if (ref && ref.__kind === 'doc') base = ref.path;
    else if (ref && ref.__kind === 'collection') base = ref.col;
    const path = joinPath([base, ...segs]);
    return { __kind: 'collection', col: path, path };
  }

  /* ═══════════════════ القيود ═══════════════════ */

  const documentId = () => ({ __docId: true });
  const fieldKey = (f) => (f && f.__docId ? DOC_ID : f);

  const where = (field, op, value) => ({ __c: 'where', field: fieldKey(field), op, value });
  const orderBy = (field, dir) => ({ __c: 'orderBy', field: fieldKey(field), dir: dir === 'desc' ? 'desc' : 'asc' });
  const limit = (n) => ({ __c: 'limit', n });
  const startAfter = (...vals) => ({ __c: 'startAfter', vals });

  function query(ref, ...constraints) {
    const col = ref.col;
    const inherited = ref.__kind === 'query' ? ref.constraints : [];
    return { __kind: 'query', col, constraints: [...inherited, ...constraints] };
  }

  function targetOf(t) {
    if (t && t.__kind === 'query') return { col: t.col, constraints: t.constraints };
    if (t && t.__kind === 'collection') return { col: t.col, constraints: [] };
    throw new Error('هدفٌ غيرُ صالحٍ للقراءة الجماعيّة');
  }

  /* ═══════════════════ اللقطات ═══════════════════ */

  function getField(data, field) {
    if (data === undefined || data === null) return undefined;
    let cur = data;
    for (const s of String(field).split('.')) {
      if (cur === null || typeof cur !== 'object') return undefined;
      cur = cur[s];
    }
    return cur;
  }

  function docSnap(id, data, ref) {
    const exists = data !== undefined && data !== null;
    return {
      id,
      ref,
      exists: () => exists,
      data: () => (exists ? data : undefined),
      get: (field) => getField(data, field),
      metadata: { hasPendingWrites: false, fromCache: false },
    };
  }

  function querySnap(docs) {
    return {
      docs,
      size: docs.length,
      empty: docs.length === 0,
      forEach: (cb, thisArg) => docs.forEach((d, i) => cb.call(thisArg, d, i)),
      docChanges: () => docs.map((d, i) => ({ type: 'added', doc: d, newIndex: i, oldIndex: -1 })),
      metadata: { hasPendingWrites: false, fromCache: false },
    };
  }

  const decode = (text) => decodeValue(JSON.parse(text), makeTimestamp);

  async function readPlain(ref) {
    const row = await store.get(ref.col, ref.id);
    return row ? decode(row.data) : null;
  }

  /* ═══════════════════ القراءة ═══════════════════ */

  async function getDoc(ref) {
    const row = await store.get(ref.col, ref.id);
    return docSnap(ref.id, row ? decode(row.data) : undefined, ref);
  }

  async function getDocs(target) {
    const { col, constraints } = targetOf(target);
    const rows = await store.query(col, constraints);
    return querySnap(rows.map((r) => docSnap(r.id, decode(r.data), docRef(col, r.id))));
  }

  // المخزنُ المحلّيُّ هو مصدرُ الحقيقة، فلا فرقَ بين «من الخادم» وسواه.
  const getDocFromServer = (ref) => getDoc(ref);

  async function getCountFromServer(target) {
    const { col, constraints } = targetOf(target);
    const count = await store.count(col, constraints);
    return { data: () => ({ count }) };
  }

  /* ═══════════════════ المستمعون — حيٌّ داخل العمليّة ═══════════════════ */

  const listeners = new Set();

  async function notifyChange(col, id) {
    for (const l of [...listeners]) {
      if (l.col !== col) continue;
      if (l.id !== undefined && l.id !== id) continue;
      try {
        await l.refresh();
      } catch (e) {
        if (l.onError) l.onError(e);
      }
    }
  }

  function onSnapshot(target, a, b, c) {
    // توقيعُ Firestore الكامل: (target, observer) · (target, next, error) ·
    // (target, options, observer) · (target, options, next, error). كائنُ الخيارات
    // (مثل {includeMetadataChanges}) ليس مراقبًا (لا next/error دالّةً) — فنُزيحه،
    // وإلّا صار next=undefined فترمي refresh وتُبتلَع صامتةً (كسرُ شاشات المسح).
    const isObserver = (x) => x && typeof x === 'object' && (typeof x.next === 'function' || typeof x.error === 'function');
    const hasOptions = a && typeof a === 'object' && !isObserver(a);
    const p1 = hasOptions ? b : a;
    const p2 = hasOptions ? c : b;
    const next = typeof p1 === 'function' ? p1 : p1 && p1.next;
    const onError = typeof p1 === 'function' ? p2 : p1 && p1.error;
    const entry = { onError };

    if (target && target.__kind === 'doc') {
      entry.col = target.col;
      entry.id = target.id;
      entry.refresh = async () => next(await getDoc(target));
    } else {
      const { col } = targetOf(target);
      entry.col = col;
      entry.refresh = async () => next(await getDocs(target));
    }

    listeners.add(entry);
    Promise.resolve().then(() => entry.refresh().catch((e) => onError && onError(e)));
    return () => listeners.delete(entry);
  }

  /* ═══════════════════ الكتابة ═══════════════════ */

  function updateArgsToData(args) {
    if (args.length === 1 && args[0] && typeof args[0] === 'object') return args[0];
    const data = {};
    for (let i = 0; i < args.length - 1; i += 2) data[args[i]] = args[i + 1];
    return data;
  }

  const upsertOp = (ref, next) => ({
    op: 'upsert',
    col: ref.col,
    id: ref.id,
    data: JSON.stringify(encodeValue(next)),
    updatedAt: nowIso(),
  });

  // ★★★ طابورُ إقصاءٍ للعمليّات المغيّرة: البرنامجُ عمليّةٌ واحدة، لكنّ القراءةَ-ثمّ-
  //     الكتابةَ غيرَ المحميّة تتسابق (معاملتان متداخلتان — `await` على المخزن يُسلّم
  //     الخيط — تقرآن القيمةَ نفسَها ثمّ تكتبان فوقَ بعض)، فيتكرّر رقمُ المستند ويُحجز
  //     المخزونُ مرّتين. التسلسلُ هنا يعطي **عزلًا** لا ذرّيّةً فقط، فكلُّ عمليّةٍ ترى
  //     أثرَ سابقتها (نظيرُ معاملة Firestore). والإخطارُ يجري **بعد تحرير القفل** كي
  //     لا يُعاد الدخولُ إلى الطابور من ردِّ مستمعٍ يكتب فيتعلّق.
  let writeTail = Promise.resolve();
  function runExclusive(work) {
    const run = writeTail.then(work, work);
    writeTail = run.then(() => undefined, () => undefined);
    return run;
  }

  async function notifyAll(affected) {
    for (const [c, i] of affected) await notifyChange(c, i);
  }

  async function setDoc(ref, data, opts) {
    const affected = await runExclusive(async () => {
      const merge = !!(opts && opts.merge);
      const base = merge ? (await readPlain(ref)) || {} : {};
      const next = applyData(base, data, { now, deep: true });
      await store.write([upsertOp(ref, next)]);
      return [[ref.col, ref.id]];
    });
    await notifyAll(affected);
  }

  async function updateDoc(ref, ...rest) {
    const affected = await runExclusive(async () => {
      const current = await readPlain(ref);
      if (current === null) throw new Error(`لا وثيقةَ لتحديثها: ${ref.path}`);
      // ★ `deep: false` — التحديثُ يستبدل الخرائطَ المتداخلةَ كاملةً (نمطُ Firestore)؛
      //   الدمجُ الجزئيُّ بمفاتيح المسار بالنقاط (`'a.b'`).
      const next = applyData(current, updateArgsToData(rest), { now, deep: false });
      await store.write([upsertOp(ref, next)]);
      return [[ref.col, ref.id]];
    });
    await notifyAll(affected);
  }

  async function addDoc(colRef, data) {
    const ref = docRef(colRef.col, genId());
    const affected = await runExclusive(async () => {
      const next = applyData({}, data, { now, deep: true });
      await store.write([upsertOp(ref, next)]);
      return [[ref.col, ref.id]];
    });
    await notifyAll(affected);
    return ref;
  }

  async function deleteDoc(ref) {
    await runExclusive(() => store.write([{ op: 'delete', col: ref.col, id: ref.id }]));
    await notifyAll([[ref.col, ref.id]]);
  }

  /* ═══════════════════ الدفعة والمعاملة ═══════════════════ */

  // القلبُ المشترك: يطبّق العمليّاتِ قراءةً-ثمّ-كتابةً ويُعيد المتأثّرين — **بلا
  // إخطارٍ وبلا قفل**؛ يُنادى داخلَ runExclusive وحدَه (writeBatch/runTransaction).
  async function applyOpsInner(ops) {
    const cache = new Map();
    const writeOps = [];
    const affected = [];
    const keyOf = (ref) => `${ref.col}\u0000${ref.id}`;

    const currentOf = async (ref) => {
      const k = keyOf(ref);
      if (!cache.has(k)) cache.set(k, await readPlain(ref));
      return cache.get(k);
    };

    for (const o of ops) {
      if (o.mode === 'delete') {
        cache.set(keyOf(o.ref), null);
        writeOps.push({ op: 'delete', col: o.ref.col, id: o.ref.id });
      } else {
        const curr = await currentOf(o.ref);
        let next;
        if (o.mode === 'set') next = applyData({}, o.data, { now, deep: true });
        else if (o.mode === 'merge') next = applyData(curr || {}, o.data, { now, deep: true });
        else {
          if (curr === null) throw new Error(`لا وثيقةَ لتحديثها: ${o.ref.path}`);
          next = applyData(curr, o.data, { now, deep: false });
        }
        cache.set(keyOf(o.ref), next);
        writeOps.push(upsertOp(o.ref, next));
      }
      affected.push([o.ref.col, o.ref.id]);
    }

    await store.write(writeOps);
    return affected;
  }

  async function applyOps(ops) {
    const affected = await runExclusive(() => applyOpsInner(ops));
    await notifyAll(affected);
  }

  function writeBatch() {
    const ops = [];
    const api = {
      set(ref, data, opts) {
        ops.push({ mode: opts && opts.merge ? 'merge' : 'set', ref, data });
        return api;
      },
      update(ref, ...rest) {
        ops.push({ mode: 'update', ref, data: updateArgsToData(rest) });
        return api;
      },
      delete(ref) {
        ops.push({ mode: 'delete', ref });
        return api;
      },
      commit: () => applyOps(ops),
    };
    return api;
  }

  async function runTransaction(dbArg, updateFn) {
    // ★★★ توقيعُ Firestore: `runTransaction(db, fn)` — db أوّلًا (نظيرُ المحوَّلات
    //     الأخرى، وكلُّ المستدعين الاثنين والعشرين على هذا الشكل). ونتسامح مع
    //     `(fn)` وحدَها كي لا ينكسر مستدعٍ شاذّ.
    const fn = typeof dbArg === 'function' ? dbArg : updateFn;
    if (typeof fn !== 'function') throw new Error('runTransaction يحتاج دالّةَ تحديث');

    const keyOf = (ref) => `${ref.col}\u0000${ref.id}`;
    let affected = [];
    // ★★★ المعاملةُ كلُّها (قراءةُ fn ثمّ تثبيتُ الكتابة) داخلَ القفل الواحد — فلا
    //     تتداخل معاملتان فتقرآن المُثبَتَ نفسَه ثمّ تدهس إحداهما الأخرى؛ هذا هو
    //     العزلُ الذي يمنع تكرارَ الأرقام والحجزَ المزدوج. وإنْ رمت fn، لم تُثبَّت
    //     كتابةٌ ولم يُخطَر أحد (كإحباط معاملة Firestore).
    const result = await runExclusive(async () => {
      const readCache = new Map();
      const ops = [];
      const tx = {
        // القراءةُ من الحالة المُثبَتة (لا من كتابات المعاملة نفسِها، كـFirestore)،
        // وتُخبَّأ كي تبقى القراءةُ المكرّرةُ متّسقة.
        async get(ref) {
          const k = keyOf(ref);
          if (!readCache.has(k)) readCache.set(k, await readPlain(ref));
          const v = readCache.get(k);
          return docSnap(ref.id, v === null ? undefined : v, ref);
        },
        set(ref, data, opts) {
          ops.push({ mode: opts && opts.merge ? 'merge' : 'set', ref, data });
          return tx;
        },
        update(ref, ...rest) {
          ops.push({ mode: 'update', ref, data: updateArgsToData(rest) });
          return tx;
        },
        delete(ref) {
          ops.push({ mode: 'delete', ref });
          return tx;
        },
      };

      const r = await fn(tx);
      // تُثبَّت الكتاباتُ عند الإتمام بقراءةٍ-ثمّ-كتابةٍ على المخزن (كـ`writeBatch`):
      // فالدمجُ يقرأ المُثبَت ولو لم يُقرأ المرجعُ قبلًا، والتحديثُ على مفقودٍ يرمي.
      affected = await applyOpsInner(ops);
      return r;
    });
    await notifyAll(affected);
    return result;
  }

  /* ═══════════════════ القيمُ الخادميّة ═══════════════════ */

  const serverTimestamp = () => serverTimestampSentinel();
  const increment = (n) => incrementSentinel(n);
  const arrayUnion = (...vals) => arrayUnionSentinel(vals);
  const arrayRemove = (...vals) => arrayRemoveSentinel(vals);

  return {
    // المراجع
    doc,
    collection,
    // الاستعلام
    query,
    where,
    orderBy,
    limit,
    startAfter,
    documentId,
    // القراءة
    getDoc,
    getDocs,
    getDocFromServer,
    getCountFromServer,
    onSnapshot,
    // الكتابة
    setDoc,
    updateDoc,
    addDoc,
    deleteDoc,
    writeBatch,
    runTransaction,
    // القيمُ الخادميّة
    serverTimestamp,
    increment,
    arrayUnion,
    arrayRemove,
    // الأنواع والمثيل
    Timestamp,
    db,
    BACKEND_NAME,
  };
}
