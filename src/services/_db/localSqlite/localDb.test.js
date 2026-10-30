/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  عقدُ Firestore فوق مخزنٍ في الذاكرة — يُبرهَن السلوكُ بلا قاعدةٍ ولا جهاز
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * المخزنُ المزيّفُ يطبّق القيودَ في JavaScript بدلالاتِ `sqlQuery` نفسِها
 * (نفسُ `encodeParam` ونفسُ خدعة `__ts__`)، فيُختبَر المصنعُ على كلّ إصدار Node.
 * وبيّنةُ SQL الحيّة في `localSqlite.test.js` عبر `node:sqlite`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createLocalDb } from './localDb.js';
import { encodeParam } from './sqlQuery.js';

/* ═══════════════════ مخزنٌ في الذاكرة بدلالات الترجمة ═══════════════════ */

function getVal(r, field) {
  if (field === '__id__') return r.id;
  let cur = r.enc;
  for (const s of field.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = cur[s];
  }
  if (cur && typeof cur === 'object' && typeof cur.__ts__ === 'string') return cur.__ts__;
  return cur;
}
function cmp(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}
function matchWhere(r, c) {
  const raw = getVal(r, c.field);
  const v = c.value;
  if ((c.op === '==' || c.op === '!=') && (v === null || v === undefined)) {
    // صريحٌ فقط (raw===null)؛ المفقودُ (undefined) لا يطابق ==null — يحاكي json_type.
    return c.op === '==' ? raw === null : raw !== null && raw !== undefined;
  }
  const lhs = raw === undefined ? null : typeof raw === 'boolean' ? (raw ? 1 : 0) : raw;
  const p = encodeParam(v);
  switch (c.op) {
    case '==': return lhs === p;
    case '!=': return lhs !== p;
    case '<': return cmp(lhs, p) < 0;
    case '<=': return cmp(lhs, p) <= 0;
    case '>': return cmp(lhs, p) > 0;
    case '>=': return cmp(lhs, p) >= 0;
    case 'in': return (v || []).map(encodeParam).includes(lhs);
    case 'not-in': return !(v || []).map(encodeParam).includes(lhs);
    case 'array-contains': return (Array.isArray(raw) ? raw : []).map(encodeParam).includes(p);
    default: return false;
  }
}
function runQuery(list, constraints) {
  const wheres = constraints.filter((c) => c && c.__c === 'where');
  const orders = constraints.filter((c) => c && c.__c === 'orderBy');
  const limitC = constraints.find((c) => c && c.__c === 'limit');
  const saC = constraints.find((c) => c && c.__c === 'startAfter');
  let out = list
    .map((r) => ({ id: r.id, data: r.data, enc: JSON.parse(r.data) }))
    .filter((r) => wheres.every((c) => matchWhere(r, c)));
  // الترتيبُ دائمًا، ومعرّفُ الوثيقة فاصلُ تعادلٍ أخيرٌ (يطابق ORDER BY … , id في buildSelect
  // وسلوكَ __name__ في Firestore) باتّجاه آخر orderBy — وبلا orderBy يصير الترتيبُ بالمعرّف ASC.
  const lastDir = orders.length ? orders[orders.length - 1].dir : 'asc';
  out.sort((a, b) => {
    for (const o of orders) {
      const d = cmp(getVal(a, o.field), getVal(b, o.field));
      if (d) return o.dir === 'desc' ? -d : d;
    }
    const di = cmp(a.id, b.id);
    return lastDir === 'desc' ? -di : di;
  });
  if (saC && orders.length) {
    const o = orders[0];
    const raw = saC.vals[0];
    const isSnap = raw && typeof raw.get === 'function';
    const op = o.dir === 'desc' ? -1 : 1; // اتّجاهُ «بعد»
    if (o.field === '__id__') {
      const cid = encodeParam(isSnap ? raw.id : raw);
      out = out.filter((r) => cmp(r.id, cid) * op > 0);
    } else if (isSnap) {
      const val = encodeParam(raw.get(o.field));
      const cid = raw.id;
      out = out.filter((r) => {
        const df = cmp(getVal(r, o.field), val) * op;
        if (df > 0) return true;
        if (df < 0) return false;
        return cmp(r.id, cid) * op > 0; // تعادلٌ في الحقل ⟵ قارن المعرّف (مؤشّرٌ مركّب)
      });
    } else {
      const cur = encodeParam(raw);
      out = out.filter((r) => cmp(getVal(r, o.field), cur) * op > 0);
    }
  }
  if (limitC && limitC.n != null) out = out.slice(0, Math.max(0, limitC.n | 0));
  return out.map((r) => ({ id: r.id, data: r.data }));
}
function memStore() {
  const map = new Map();
  const key = (c, i) => `${c}\u0000${i}`;
  const rowsOf = (col) => {
    const out = [];
    for (const [k, data] of map) {
      const idx = k.indexOf('\u0000');
      if (k.slice(0, idx) === col) out.push({ id: k.slice(idx + 1), data });
    }
    return out;
  };
  return {
    async get(col, id) {
      const d = map.get(key(col, id));
      return d === undefined ? null : { id, data: d };
    },
    async query(col, constraints) {
      return runQuery(rowsOf(col), constraints);
    },
    async count(col, constraints) {
      return runQuery(rowsOf(col), constraints.filter((c) => c && (c.__c === 'where' || c.__c === 'limit'))).length;
    },
    async write(ops) {
      for (const o of ops) {
        if (o.op === 'delete') map.delete(key(o.col, o.id));
        else map.set(key(o.col, o.id), o.data);
      }
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
function build(clock) {
  return createLocalDb({ store: memStore(), now: clock || (() => 1_700_000_000_000) });
}

/* ═══════════════════ القراءة والكتابة ═══════════════════ */

test('setDoc ثمّ getDoc — دورةٌ كاملةٌ مع طابعٍ خادميّ', async () => {
  const d = build();
  const ref = d.doc(d.db, 'documents', 'D1');
  await d.setDoc(ref, { kind: 'SRI', at: d.serverTimestamp(), n: 3 });

  const snap = await d.getDoc(ref);
  assert.equal(snap.exists(), true);
  assert.equal(snap.id, 'D1');
  assert.equal(snap.get('kind'), 'SRI');
  assert.equal(snap.data().n, 3);
  assert.equal(snap.get('at').toMillis(), 1_700_000_000_000, 'serverTimestamp صار طابعًا');
});

test('getDoc على غير موجودٍ: exists=false وdata=undefined', async () => {
  const d = build();
  const snap = await d.getDoc(d.doc(d.db, 'c', 'ghost'));
  assert.equal(snap.exists(), false);
  assert.equal(snap.data(), undefined);
});

test('setDoc يستبدل، وsetDoc{merge} يدمج', async () => {
  const d = build();
  const ref = d.doc(d.db, 'c', '1');
  await d.setDoc(ref, { a: 1, b: 2 });
  await d.setDoc(ref, { a: 9 });
  assert.deepEqual((await d.getDoc(ref)).data(), { a: 9 }, 'بلا دمجٍ يستبدل');

  await d.setDoc(ref, { b: 5 }, { merge: true });
  assert.deepEqual((await d.getDoc(ref)).data(), { a: 9, b: 5 }, 'بالدمج يبقى a');
});

test('★★ updateDoc يرمي على وثيقةٍ غير موجودة — لا يخترع صامتًا', async () => {
  const d = build();
  await assert.rejects(() => d.updateDoc(d.doc(d.db, 'c', 'none'), { x: 1 }), /لا وثيقةَ لتحديثها/);
});

test('increment يتراكم عبر الكتابات، وarrayUnion/arrayRemove', async () => {
  const d = build();
  const ref = d.doc(d.db, 'c', '1');
  await d.setDoc(ref, { n: 0, tags: ['a'] });
  await d.updateDoc(ref, { n: d.increment(5) });
  await d.updateDoc(ref, { n: d.increment(2), tags: d.arrayUnion('b', 'a') });
  let data = (await d.getDoc(ref)).data();
  assert.equal(data.n, 7);
  assert.deepEqual(data.tags, ['a', 'b']);

  await d.updateDoc(ref, { tags: d.arrayRemove('a') });
  data = (await d.getDoc(ref)).data();
  assert.deepEqual(data.tags, ['b']);
});

test('addDoc يولّد معرّفًا ويُعيد مرجعًا قابلًا للقراءة', async () => {
  const d = build();
  const col = d.collection(d.db, 'c');
  const ref = await d.addDoc(col, { v: 1 });
  assert.match(ref.id, /^[A-Za-z0-9]{20}$/);
  assert.equal((await d.getDoc(ref)).data().v, 1);
});

test('deleteDoc يُزيل', async () => {
  const d = build();
  const ref = d.doc(d.db, 'c', '1');
  await d.setDoc(ref, { v: 1 });
  await d.deleteDoc(ref);
  assert.equal((await d.getDoc(ref)).exists(), false);
});

/* ═══════════════════ الاستعلام ═══════════════════ */

test('getDocs بشرطٍ وترتيبٍ وحدّ', async () => {
  const d = build();
  const c = d.collection(d.db, 'documents');
  await d.setDoc(d.doc(c, 'a'), { kind: 'SRI', n: 2 });
  await d.setDoc(d.doc(c, 'b'), { kind: 'SRI', n: 1 });
  await d.setDoc(d.doc(c, 'x'), { kind: 'SRO', n: 9 });

  const q = d.query(c, d.where('kind', '==', 'SRI'), d.orderBy('n', 'asc'), d.limit(5));
  const snap = await d.getDocs(q);
  assert.equal(snap.size, 2);
  assert.deepEqual(snap.docs.map((s) => s.id), ['b', 'a'], 'رُتّب بـn تصاعديًّا');
  assert.equal(snap.empty, false);
});

test('★ ترشيحٌ على حقلٍ زمنيّ — خدعةُ __ts__ تعمل', async () => {
  const d = build();
  const c = d.collection(d.db, 'documents');
  await d.setDoc(d.doc(c, 'old'), { at: d.Timestamp.fromMillis(1000) });
  await d.setDoc(d.doc(c, 'new'), { at: d.Timestamp.fromMillis(5000) });

  const q = d.query(c, d.where('at', '>=', d.Timestamp.fromMillis(3000)));
  const snap = await d.getDocs(q);
  assert.deepEqual(snap.docs.map((s) => s.id), ['new']);
});

test('getCountFromServer يعدّ المطابق', async () => {
  const d = build();
  const c = d.collection(d.db, 'documents');
  await d.setDoc(d.doc(c, 'a'), { kind: 'SRI' });
  await d.setDoc(d.doc(c, 'b'), { kind: 'SRI' });
  await d.setDoc(d.doc(c, 'x'), { kind: 'SRO' });
  const res = await d.getCountFromServer(d.query(c, d.where('kind', '==', 'SRI')));
  assert.equal(res.data().count, 2);
});

test('documentId في in يقارن بالمعرّف', async () => {
  const d = build();
  const c = d.collection(d.db, 'c');
  await d.setDoc(d.doc(c, 'a'), { v: 1 });
  await d.setDoc(d.doc(c, 'b'), { v: 2 });
  await d.setDoc(d.doc(c, 'z'), { v: 3 });
  const snap = await d.getDocs(d.query(c, d.where(d.documentId(), 'in', ['a', 'z'])));
  assert.deepEqual(snap.docs.map((s) => s.id).sort(), ['a', 'z']);
});

/* ═══════════════════ المستمعون ═══════════════════ */

test('★★ onSnapshot على مجموعة: بثٌّ أوّلٌ ثمّ إعادةٌ بعد الكتابة', async () => {
  const d = build();
  const c = d.collection(d.db, 'documents');
  await d.setDoc(d.doc(c, 'a'), { v: 1 });

  const seen = [];
  const unsub = d.onSnapshot(c, (snap) => seen.push(snap.size));
  await tick();
  assert.deepEqual(seen, [1], 'بثٌّ أوّلٌ بالحالة الراهنة');

  await d.setDoc(d.doc(c, 'b'), { v: 2 });
  assert.deepEqual(seen, [1, 2], 'كتابةٌ ⟵ إعادةُ بثّ');

  unsub();
  await d.setDoc(d.doc(c, 'x'), { v: 3 });
  assert.deepEqual(seen, [1, 2], 'بعد الإلغاء لا بثّ');
});

test('★★ onSnapshot على وثيقةٍ لا يُوقظه تغيّرُ أختها', async () => {
  const d = build();
  const c = d.collection(d.db, 'documents');
  const refA = d.doc(c, 'a');
  await d.setDoc(refA, { v: 1 });

  const seen = [];
  d.onSnapshot(refA, (snap) => seen.push(snap.data() ? snap.data().v : null));
  await tick();
  assert.deepEqual(seen, [1]);

  await d.setDoc(d.doc(c, 'b'), { v: 99 }); // أختٌ أخرى
  assert.deepEqual(seen, [1], '★ لا يُوقَظ لتغيّر وثيقةٍ أخرى في المجموعة');

  await d.setDoc(refA, { v: 2 });
  assert.deepEqual(seen, [1, 2], 'ويُوقَظ لتغيّره هو');
});

/* ═══════════════════ الدفعة والمعاملة ═══════════════════ */

test('★ writeBatch ذرّيّةٌ وتحترم ترتيبَ عمليّاتها', async () => {
  const d = build();
  const c = d.collection(d.db, 'c');
  await d.setDoc(d.doc(c, 'base'), { n: 10 });

  const batch = d.writeBatch();
  batch.set(d.doc(c, '1'), { v: 1 });
  batch.update(d.doc(c, 'base'), { n: d.increment(5) });
  batch.delete(d.doc(c, '1')); // أُنشئ ثمّ حُذف في نفس الدفعة
  await batch.commit();

  assert.equal((await d.getDoc(d.doc(c, '1'))).exists(), false);
  assert.equal((await d.getDoc(d.doc(c, 'base'))).data().n, 15);
});

test('★★★ runTransaction بتوقيع Firestore (db, fn): قراءةٌ ثمّ كتابةٌ ثمّ إثبات (#1)', async () => {
  const d = build();
  const ref = d.doc(d.db, 'c', '1');
  await d.setDoc(ref, { n: 1 });

  const out = await d.runTransaction(d.db, async (tx) => {
    const cur = await tx.get(ref);
    const next = cur.data().n + 4;
    tx.update(ref, { n: next });
    return next;
  });

  assert.equal(out, 5);
  assert.equal((await d.getDoc(ref)).data().n, 5);
});

test('★★ runTransaction: set-merge بلا قراءةٍ مسبقةٍ يحفظ الحقولَ القائمة (#2)', async () => {
  const d = build();
  const ref = d.doc(d.db, 'c', '1');
  await d.setDoc(ref, { a: 1, b: 2 });
  await d.runTransaction(d.db, async (tx) => {
    tx.set(ref, { c: 3 }, { merge: true }); // بلا tx.get(ref) مسبق
  });
  assert.deepEqual((await d.getDoc(ref)).data(), { a: 1, b: 2, c: 3 }, 'a,b لم تضِعْ');
});

test('★★ runTransaction: update بلا قراءةٍ مسبقةٍ على موجودٍ ينجح (#5)', async () => {
  const d = build();
  const ref = d.doc(d.db, 'c', '1');
  await d.setDoc(ref, { n: 1 });
  await d.runTransaction(d.db, async (tx) => {
    tx.update(ref, { n: d.increment(5) }); // بلا tx.get(ref) مسبق
  });
  assert.equal((await d.getDoc(ref)).data().n, 6);
});

test('runTransaction: update على مفقودٍ يرمي عند الإتمام', async () => {
  const d = build();
  await assert.rejects(
    () =>
      d.runTransaction(d.db, async (tx) => {
        tx.update(d.doc(d.db, 'c', 'none'), { x: 1 });
      }),
    /لا وثيقةَ لتحديثها/
  );
});

/* ═══════════════════ انحرافاتٌ عالجتها المراجعةُ العدائيّة ═══════════════════ */

test('★★ updateDoc بخريطةٍ متداخلةٍ يستبدلها كاملةً لا يدمجها (#3)', async () => {
  const d = build();
  const ref = d.doc(d.db, 'c', '1');
  await d.setDoc(ref, { settings: { theme: 'dark', lang: 'ar', size: 12 } });
  await d.updateDoc(ref, { settings: { theme: 'light' } });
  assert.deepEqual((await d.getDoc(ref)).data().settings, { theme: 'light' }, 'الخريطةُ استُبدلت');

  await d.setDoc(ref, { settings: { theme: 'dark', lang: 'ar' } });
  await d.updateDoc(ref, { 'settings.theme': 'light' });
  assert.deepEqual((await d.getDoc(ref)).data().settings, { theme: 'light', lang: 'ar' }, 'المسارُ بالنقاط دمجٌ جزئيّ');
});

test('★★ where ==null يطابق الصريحَ لا المفقود (#6)', async () => {
  const d = build();
  const c = d.collection(d.db, 'documents');
  await d.setDoc(d.doc(c, 'explicit'), { x: null, y: 1 });
  await d.setDoc(d.doc(c, 'missing'), { y: 2 });
  assert.deepEqual((await d.getDocs(d.query(c, d.where('x', '==', null)))).docs.map((s) => s.id), ['explicit']);
  assert.deepEqual((await d.getDocs(d.query(c, d.where('x', '!=', null)))).docs.map((s) => s.id), [], 'لا x غيرَ null');
});

test('★ arrayRemove لكائنٍ لا يتأثّر بترتيب المفاتيح (#7)', async () => {
  const d = build();
  const ref = d.doc(d.db, 'c', '1');
  await d.setDoc(ref, { items: [{ a: 1, b: 2 }] });
  await d.updateDoc(ref, { items: d.arrayRemove({ b: 2, a: 1 }) });
  assert.deepEqual((await d.getDoc(ref)).data().items, [], 'حُذف رغم اختلاف ترتيب المفاتيح');
});

test('★★ startAfter بلقطةِ وثيقةٍ — الترحيلُ القياسيّ (#4)', async () => {
  const d = build();
  const c = d.collection(d.db, 'c');
  for (const [id, n] of [['a', 1], ['b', 2], ['e', 3], ['f', 4]]) await d.setDoc(d.doc(c, id), { n });
  const page1 = await d.getDocs(d.query(c, d.orderBy('n', 'asc'), d.limit(2)));
  assert.deepEqual(page1.docs.map((s) => s.id), ['a', 'b']);
  const last = page1.docs[page1.docs.length - 1];
  const page2 = await d.getDocs(d.query(c, d.orderBy('n', 'asc'), d.startAfter(last), d.limit(2)));
  assert.deepEqual(page2.docs.map((s) => s.id), ['e', 'f']);
});

test('getCountFromServer يحترم الحدَّ (#10)', async () => {
  const d = build();
  const c = d.collection(d.db, 'c');
  for (const id of ['a', 'b', 'c', 'e', 'f']) await d.setDoc(d.doc(c, id), { k: 1 });
  assert.equal((await d.getCountFromServer(d.query(c, d.where('k', '==', 1), d.limit(3)))).data().count, 3);
});

/* ═══════════════════ تصليبُ العقد (تدقيقُ جاهزيّة القطع) ═══════════════════ */

test('★★★ عزلُ runTransaction: تنادٍ متزامنٌ على حجز رقمٍ لا يُكرّره ولا يدهس', async () => {
  const d = build();
  const ref = d.doc(d.db, 'counters', 'PO');
  await d.setDoc(ref, { n: 0 });
  // كلُّ معاملةٍ تقرأ ثمّ تحجز التالي — بلا عزلٍ تقرأ الثلاثُ صفرًا فتحجز «1» ثلاثًا.
  const reserve = () =>
    d.runTransaction(d.db, async (tx) => {
      const cur = (await tx.get(ref)).data().n;
      const next = cur + 1;
      tx.update(ref, { n: next });
      return next;
    });
  const got = await Promise.all([reserve(), reserve(), reserve()]);
  assert.deepEqual(got.slice().sort((x, y) => x - y), [1, 2, 3], 'أرقامٌ فريدةٌ متتاليةٌ لا مكرَّرة');
  assert.equal((await d.getDoc(ref)).data().n, 3, 'العدّادُ بلغ 3 لا 1 — لا دهس');
});

test('★★ عزلُ setDoc{merge} المتزامن: لا يضيع حقلٌ من كتابتين متداخلتين', async () => {
  const d = build();
  const ref = d.doc(d.db, 'c', '1');
  await d.setDoc(ref, { base: 1 });
  await Promise.all([d.setDoc(ref, { a: 1 }, { merge: true }), d.setDoc(ref, { b: 2 }, { merge: true })]);
  assert.deepEqual((await d.getDoc(ref)).data(), { base: 1, a: 1, b: 2 }, 'الدمجان تسلسلا فبقي كلاهما');
});

test('★★★ onSnapshot يدعم صيغةَ (q, options, cb) — فلا تُبتلَع لقطاتُ المسح صامتةً', async () => {
  const d = build();
  const c = d.collection(d.db, 'scans');
  await d.setDoc(d.doc(c, 's1'), { n: 1 });
  const seen = [];
  const unsub = d.onSnapshot(d.query(c), { includeMetadataChanges: true }, (snap) => seen.push(snap.size));
  await tick();
  assert.ok(seen.length >= 1, 'وصلت لقطةٌ أولى رغم وسيط الخيارات');
  assert.equal(seen[seen.length - 1], 1);
  await d.setDoc(d.doc(c, 's2'), { n: 2 });
  await tick();
  assert.equal(seen[seen.length - 1], 2, 'تحديثٌ حيٌّ بعد الكتابة');
  unsub();
});

test('★ onSnapshot يبقى يدعم (q, cb) و(q, observer)', async () => {
  const d = build();
  const ref = d.doc(d.db, 'c', '1');
  await d.setDoc(ref, { n: 1 });
  const a = [];
  const b = [];
  const u1 = d.onSnapshot(ref, (snap) => a.push(snap.data() && snap.data().n));
  const u2 = d.onSnapshot(ref, { next: (snap) => b.push(snap.data() && snap.data().n) });
  await tick();
  assert.equal(a[a.length - 1], 1);
  assert.equal(b[b.length - 1], 1);
  u1();
  u2();
});

test('★★ الترتيبُ الافتراضيُّ (بلا orderBy) بمعرّف الوثيقة لا بترتيب الإدخال', async () => {
  const d = build();
  const c = d.collection(d.db, 'c');
  for (const id of ['charlie', 'alpha', 'bravo']) await d.setDoc(d.doc(c, id), { k: 1 });
  assert.deepEqual((await d.getDocs(c)).docs.map((s) => s.id), ['alpha', 'bravo', 'charlie'], 'مرتَّبٌ بالمعرّف');
});

test('★★★ ترحيلٌ بلقطةٍ على حقلٍ منخفض التمايز لا يُسقط المتعادلين (نقضُ فقد البيانات)', async () => {
  const d = build();
  const c = d.collection(d.db, 'c');
  for (const [id, n] of [['d1', 5], ['d2', 5], ['d3', 5], ['d4', 9]]) await d.setDoc(d.doc(c, id), { n });
  const p1 = await d.getDocs(d.query(c, d.orderBy('n', 'asc'), d.limit(2)));
  assert.deepEqual(p1.docs.map((s) => s.id), ['d1', 'd2'], 'الصفحةُ الأولى بترتيب (n, id)');
  const last = p1.docs[p1.docs.length - 1];
  const p2 = await d.getDocs(d.query(c, d.orderBy('n', 'asc'), d.startAfter(last), d.limit(2)));
  assert.deepEqual(p2.docs.map((s) => s.id), ['d3', 'd4'], 'd3 المتعادلُ في n لم يُسقَط — المؤشّرُ مركّب');
});

test('★★ فاصلُ تعادل المعرّف يتبع اتّجاهَ orderBy التنازليّ (كـ__name__)', async () => {
  const d = build();
  const c = d.collection(d.db, 'c');
  for (const id of ['a', 'b', 'c']) await d.setDoc(d.doc(c, id), { n: 5 });
  const ids = (await d.getDocs(d.query(c, d.orderBy('n', 'desc')))).docs.map((s) => s.id);
  assert.deepEqual(ids, ['c', 'b', 'a'], 'المتعادلون في n ⟵ معرّفٌ تنازليّ');
});
