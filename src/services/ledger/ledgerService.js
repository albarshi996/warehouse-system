/**
 * دفتر حركات المخزون — الطبقة التي تجعل المستند يُحرّك الرصيد فعلًا.
 *
 * ما كان قبل هذا الملف: المستندات تُعتمد وتُنجَز ولا يتغيّر رصيد؛ والأرصدة
 * تأتي من رفع ملف إكسل. أي أن «الاعتماد» كان توقيعًا على ورقة، لا واقعة.
 * وقد كان `inventoryService.js` — الملف الوحيد الذي يعرف كيف يُحدّث رصيدًا —
 * **بلا مستدعٍ واحد** في المشروع كلّه. الحقيقة تُقال كما هي.
 *
 * البنية:
 *   stock_moves/{docId__lineIndex}   ← ملحق-فقط: من أين، إلى أين، كم، بأيّ مستند
 *   balances/{sku__wh__lot}          ← الإجمالي الجاري (يُزاد ذرّيًّا مع كل حركة)
 *
 * لماذا الاثنان معًا؟ الدفتر هو **الحقيقة** — يُعاد منه بناء أي رصيد في أي
 * لحظة، ولا يُعدَّل ولا يُحذف أبدًا. والأرصدة **ذاكرةٌ مُسرَّعة** للقراءة، لأن
 * جمع مليون حركة عند كل فتح شاشة عبثٌ. المهمّ أن يتحرّكا في معاملة واحدة، فلا
 * يفترقان أبدًا — وهذا ما يضمنه `runTransaction` أدناه.
 *
 * والاستيراد من إكسل يبقى كما هو: **رصيدٌ افتتاحي**، لا مصدرًا للحقيقة الجارية.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  increment,
  serverTimestamp,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { buildMoves, balanceDeltas, canPost, findNegativeBalance } from './movements.js';
import { reservationDeltas } from './reservations.js';

const MOVES = 'stock_moves';
const BALANCES = 'balances';
const DOCS = 'documents';

/** أقصى عدد بنود في مستندٍ واحد — حدّ Firestore 500 كتابة لكل معاملة. */
const MAX_LINES = 150;

function currentUid() {
  return auth?.currentUser?.uid || null;
}

function currentName(profile) {
  return profile?.name || auth?.currentUser?.email || 'غير معروف';
}

/* ═══════════════════ القيد ═══════════════════ */

/**
 * يقيّد أثر مستندٍ منجَز: يكتب حركاته ويُحدّث أرصدته ويختمه — كلّها أو لا شيء.
 *
 * الحماية من الازدواج ثلاثية:
 *   1. معرّف الحركة حتميّ (`docId__000`) — إعادة الكتابة تحلّ محلّ نفسها.
 *   2. ختم `posted` على المستند يُفحص **داخل** المعاملة لا قبلها.
 *   3. قواعد الأمان تمنع تعديل حركةٍ قُيّدت (انظر firestore.rules).
 * فلو ضغط موظّفان «إنهاء» في اللحظة نفسها، فازت معاملةٌ واحدة وأُعيدت الأخرى.
 *
 * @returns {Promise<{moves:number, deltas:number, totalQty:number}>}
 */
export async function postDocument(docData, profile) {
  const gate = canPost(docData);
  if (!gate.ok) throw new Error(gate.reason);

  const { moves, problems: buildProblems } = buildMoves(docData);
  if (buildProblems.length) throw new Error(buildProblems.join(' · '));
  if (!moves.length) throw new Error('لا بنود ذات كمية — لا شيء يُقيَّد.');
  if (moves.length > MAX_LINES) {
    throw new Error(`المستند يحوي ${moves.length} بندًا؛ الحدّ ${MAX_LINES} لكل قيد.`);
  }

  const { deltas, problems: deltaProblems } = balanceDeltas(moves);
  if (deltaProblems.length) throw new Error(deltaProblems.join(' · '));

  const uid = currentUid();
  const byName = currentName(profile);
  const byRole = profile?.role || '';

  await runTransaction(db, async (tx) => {
    // القراءة أولًا — Firestore يشترط ذلك، ونحن نشترط ألّا يُقيَّد مرّتين.
    const docRef = doc(db, DOCS, docData.id);
    const snap = await tx.get(docRef);
    if (!snap.exists()) throw new Error('المستند غير موجود.');
    const fresh = snap.data();
    if (fresh.posted) throw new Error('قُيّد هذا المستند من قبل — لا يُقيَّد مرّتين.');
    if (fresh.state !== 'done') throw new Error('حالة المستند تغيّرت — لم يعد منجَزًا.');

    // ── حارس الرصيد السالب (يُقرأ داخل المعاملة قبل أي كتابة) ──────────
    // كلّ حركةٍ تُنقص رصيدًا (delta<0) نتحقّق أنّ الناتج ≥ 0: لا يُقيَّد سحبٌ
    // أو صرفٌ يفوق الموجود على الرفّ. بدون هذا كان `increment(delta)` يمرّ
    // بلا فحص فينزل الرصيد إلى قيمة سالبة صامتة (بيعٌ زائد يُسمّم الدفتر)،
    // وأسوأ: `merge:true` على رصيدٍ غير موجود كان يخلق صفًّا وهميًّا سالبًا.
    // Firestore يشترط كلّ القراءات قبل أيّ كتابة — لذا نجمعها هنا أوّلًا،
    // ثم نحكم بالدالّة النقيّة `findNegativeBalance` (المُختبَرة وحدها).
    const currentById = {};
    for (const d of deltas) {
      if (d.delta < 0) {
        const snapB = await tx.get(doc(db, BALANCES, d.id));
        currentById[d.id] = snapB.exists() ? Number(snapB.data().qty) || 0 : 0;
      }
    }
    const violation = findNegativeBalance(deltas, currentById);
    if (violation) {
      throw new Error(
        `رصيدٌ غير كافٍ: ${violation.nameAr || violation.sku || violation.barcode || 'صنف'} في ` +
          `${violation.warehouse || 'المخزن'}` +
          (violation.batch ? ` (تشغيلة ${violation.batch})` : '') +
          ` — المتوفّر ${violation.current}، والحركة تطلب ${violation.requested}. القيد لا يُنفَّذ.`
      );
    }

    moves.forEach((move) => {
      tx.set(doc(db, MOVES, move.id), {
        ...move,
        postedByUid: uid,
        postedByName: byName,
        postedByRole: byRole,
        postedAt: serverTimestamp(),
      });
    });

    deltas.forEach((d) => {
      tx.set(
        doc(db, BALANCES, d.id),
        {
          sku: d.sku,
          barcode: d.barcode,
          nameAr: d.nameAr,
          warehouse: d.warehouse,
          batch: d.batch,
          expiry: d.expiry,
          unitCost: d.unitCost,
          qty: increment(d.delta),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });

    tx.update(docRef, {
      posted: true,
      postedAt: serverTimestamp(),
      postedByUid: uid,
      postedMoves: moves.length,
    });
  });

  return {
    moves: moves.length,
    deltas: deltas.length,
    totalQty: moves.reduce((s, m) => s + m.qty, 0),
  };
}

/* ═══════════════════ الحجز ═══════════════════ */

/**
 * يحجز كمياتٍ على الأرصدة (أو يفكّ الحجز بـ`sign = -1`).
 *
 * الحجز لا يُنقص `qty` — البضاعة ما تزال على الرفّ. يُنقص **المتاح** وحده،
 * وهو ما يراه البائع. الفرق بينهما هو تعريف الوعد.
 */
export async function applyReservation(allocations, sign = 1) {
  const deltas = reservationDeltas(allocations, sign);
  if (!deltas.length) return { changed: 0 };

  const batch = writeBatch(db);
  deltas.forEach((d) => {
    batch.set(
      doc(db, BALANCES, d.id),
      {
        sku: d.sku,
        barcode: d.barcode,
        warehouse: d.warehouse,
        batch: d.batch,
        qtyReserved: increment(d.delta),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
  await batch.commit();
  return { changed: deltas.length };
}

/** يحجز خطّة تخصيص. */
export function reserve(allocations) {
  return applyReservation(allocations, 1);
}

/** يفكّ حجزًا — عند السحب الفعلي أو سقوط أمر البيع. */
export function release(allocations) {
  return applyReservation(allocations, -1);
}

/* ═══════════════════ القراءة ═══════════════════ */

/**
 * حركات مستندٍ بعينه — «ماذا فعل هذا المستند بالمخزون؟».
 * استعلامٌ بحقل واحد فلا يلزم فهرس مركّب (درس شاشة متابعة العمليات).
 */
export async function movesForDocument(docId) {
  const snap = await getDocs(query(collection(db, MOVES), where('docId', '==', docId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.lineIndex - b.lineIndex);
}

/**
 * كشف حركة صنف — «من أين جاء هذا الرصيد؟».
 * هذا هو التتبّع الكامل الذي طُلب: من الاستلام حتى التسليم، بمستنداته.
 */
export async function movesForSku(sku, max = 200) {
  const key = String(sku || '').trim().toUpperCase();
  if (!key) return [];
  const snap = await getDocs(query(collection(db, MOVES), where('sku', '==', key), limit(max)));
  return sortNewest(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

/** كشف حركة بالباركود — للأصناف التي لا كود لها بعد. */
export async function movesForBarcode(barcode, max = 200) {
  const key = String(barcode || '').trim();
  if (!key) return [];
  const snap = await getDocs(query(collection(db, MOVES), where('barcode', '==', key), limit(max)));
  return sortNewest(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

/** حركات موقعٍ بعينه — «ماذا يقبع في مخزن النقل، وبأيّ مستند دخله؟». */
export async function movesIntoLocation(location, max = 200) {
  const code = String(location || '').trim().toUpperCase();
  if (!code) return [];
  const snap = await getDocs(query(collection(db, MOVES), where('to', '==', code), limit(max)));
  return sortNewest(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

/** آخر الحركات لحظيًّا — تغذّي لوحة التحكم التشغيلية. */
export function listenRecentMoves(callback, max = 100) {
  const q = query(collection(db, MOVES), orderBy('postedAt', 'desc'), limit(max));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

/** هل قُيّد هذا المستند؟ فحصٌ سريع بلا تحميل الحركات. */
export async function isPosted(docId) {
  const snap = await getDoc(doc(db, DOCS, docId));
  return Boolean(snap.exists() && snap.data().posted);
}

function sortNewest(rows) {
  return rows.sort((a, b) => (b.postedAt?.seconds || 0) - (a.postedAt?.seconds || 0));
}
