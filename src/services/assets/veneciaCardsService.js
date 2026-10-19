/**
 * بطاقاتُ حركة مخزن فينسيا في السحابة — `warehouse_cards/{cardId}`.
 *
 * ═══ ★★★ والتثبيتُ معاملةٌ ذرّيّةٌ واحدة ═══
 * تثبيتُ البطاقة ليس كتابةً واحدة: حالةُ البطاقة، وكمّيّةُ كلّ أصلٍ فيها،
 * وسطرٌ في سجلّ كلٍّ منها. ولو كُتبت تباعًا لَوقع ما هو أسوأُ من الفشل:
 * **نجاحٌ نصفيّ** — بطاقةٌ «مصروفة» ونصفُ أصولها لم يُنقص، أو كمّيّةٌ نقصت
 * مرّتين لأنّ الموظّف ضغط الزرَّ ضغطتين. فكلُّه في `runTransaction`:
 * تُقرأ الكمّيّاتُ **من الخادم في اللحظة نفسِها**، ويُعاد الحكمُ عليها،
 * ثمّ تُكتب كلُّها أو لا يُكتب شيء.
 *
 * ★★ **والحكمُ يُعاد داخل المعاملة ولا يُكتفى بحكم الشاشة**: بين فتحِ
 * الشاشة وضغطِ الزرّ قد تمرّ دقائق تصرف فيها بطاقةٌ أخرى آخرَ ثلاجة. فحكمُ
 * الشاشة راحةٌ للموظّف، وحكمُ المعاملة هو الحقّ.
 *
 * ★★ **والرقمُ يُحجز قبل المعاملة** لأنّ `reserveNumber` معاملةٌ بذاتها ولا
 * تتداخل المعاملات. ولذلك يُفحص الحكمُ **قبل** الحجز أيضًا: فبطاقةٌ ناقصةٌ
 * تُردّ بلا أن تحرق رقمًا رسميًّا.
 *
 * ⚠️ **ولا يعمل التثبيتُ بلا إنترنت** — كالترقيم تمامًا: المعاملاتُ تحتاج
 * الخادم. والمسودّاتُ والجردُ وبقيّةُ اللوحة تعمل بلا شبكة كعادتها.
 */
import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { reserveNumber } from '../documents/numberingService.js';
import { VENECIA_WAREHOUSE, assetDocId, populationAssetType, rawQty } from './veneciaModel.js';
import {
  cardKind,
  cardNoteLine,
  cardTotals,
  cardVerdict,
  canTransitionCard,
  lineAssetKey,
  normalizeCardLine,
  qtyAfterCard,
} from './veneciaCards.js';
import { todayLocal } from './veneciaService.js';

const CARDS = 'warehouse_cards';
const ASSETS = 'warehouse_assets';
const NOTES = 'notes';

function whoami(profile) {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
  };
}

/** يستمع لبطاقات فينسيا كلِّها (التصفيةُ في الشاشة — شرطٌ واحدٌ بلا فهرس). */
export function listenVeneciaCards(callback, onError) {
  const q = query(collection(db, CARDS), where('warehouse', '==', VENECIA_WAREHOUSE));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ docId: d.id, ...d.data() })), snap.metadata.hasPendingWrites),
    (e) => onError?.(e)
  );
}

/** الحقولُ التي يملكها المستخدم — وما سواها يُحسب أو يُختم هنا. */
function cardPayload(card) {
  return {
    kind: String(card.kind || '').trim(),
    cardDate: String(card.cardDate || '').trim(),
    party: String(card.party || '').trim(),
    destination: String(card.destination || '').trim(),
    purpose: String(card.purpose || '').trim(),
    lines: (card.lines ?? []).map(normalizeCardLine),
    warehouse: VENECIA_WAREHOUSE,
  };
}

/**
 * يحفظ مسودّةً — إنشاءً أو تعديلًا. **ولا يلمس كمّيّةً**.
 * والمثبَّتةُ لا تُعدَّل: تُصحَّح ببطاقةٍ مضادّة.
 */
export async function saveCardDraft(card, assetsByKey, profile, { docId = '' } = {}) {
  const verdict = cardVerdict(card, assetsByKey);
  if (!verdict.ok) {
    const err = new Error('البطاقة ناقصة:\n• ' + verdict.problems.join('\n• '));
    err.problems = verdict.problems;
    throw err;
  }
  const who = whoami(profile);
  const payload = cardPayload(card);

  if (!docId) {
    const ref = await addDoc(collection(db, CARDS), {
      ...payload,
      number: '',
      state: 'draft',
      createdAt: serverTimestamp(),
      createdBy: who.byName,
      createdByUid: who.byUid,
      updatedAt: serverTimestamp(),
      updatedBy: who.byName,
      updatedByUid: who.byUid,
    });
    return { docId: ref.id };
  }

  const snap = await getDoc(doc(db, CARDS, docId));
  if (!snap.exists()) throw new Error('البطاقة غير موجودة.');
  if (snap.data().state !== 'draft') {
    throw new Error('لا تُعدَّل بطاقةٌ خرجت من المسودّة — صحِّحها ببطاقةٍ مضادّة.');
  }
  await setDoc(
    doc(db, CARDS, docId),
    { ...payload, updatedAt: serverTimestamp(), updatedBy: who.byName, updatedByUid: who.byUid },
    { merge: true }
  );
  return { docId };
}

/** يُلغي مسودّةً بسببٍ مكتوب — ولا حذفَ في قاعدة الأمن. */
export async function cancelCard(docId, reason, profile) {
  const why = String(reason || '').trim();
  if (!why) throw new Error('الإلغاء يحتاج سببًا مكتوبًا.');
  const snap = await getDoc(doc(db, CARDS, docId));
  if (!snap.exists()) throw new Error('البطاقة غير موجودة.');
  if (!canTransitionCard(snap.data().state, 'cancelled')) {
    throw new Error('لا تُلغى بطاقةٌ مثبَّتة — صحِّحها ببطاقةٍ مضادّة.');
  }
  const who = whoami(profile);
  await setDoc(
    doc(db, CARDS, docId),
    {
      state: 'cancelled',
      cancelReason: why,
      cancelledAt: serverTimestamp(),
      cancelledBy: who.byName,
      updatedAt: serverTimestamp(),
      updatedBy: who.byName,
      updatedByUid: who.byUid,
    },
    { merge: true }
  );
}

/**
 * **يُثبّت البطاقة**: يحجز رقمَها، ثمّ في معاملةٍ واحدةٍ يُحرّك كمّيّاتِ كلّ
 * أصولها ويُقفلها ويُلحِق سطرًا في سجلّ كلّ أصل.
 *
 * @returns {{ number: string, moved: number, created: number }}
 */
export async function postCard(docId, profile) {
  const cardSnap = await getDoc(doc(db, CARDS, docId));
  if (!cardSnap.exists()) throw new Error('البطاقة غير موجودة.');
  const card = { docId, ...cardSnap.data() };
  if (!canTransitionCard(card.state, 'posted')) {
    throw new Error(`لا تُثبَّت بطاقةٌ حالتُها «${card.state}».`);
  }
  const kind = cardKind(card.kind);
  if (!kind) throw new Error('اتّجاهُ البطاقة غير معروف.');

  // ① حكمٌ مبدئيٌّ **قبل حجز الرقم** — فالناقصةُ لا تحرق رقمًا رسميًّا.
  const live = await getDocs(query(collection(db, ASSETS), where('warehouse', '==', VENECIA_WAREHOUSE)));
  const index = new Map(live.docs.map((d) => [d.id, { docId: d.id, ...d.data() }]));
  const pre = cardVerdict(card, index, { forPost: true });
  if (!pre.ok) {
    const err = new Error('لا تُثبَّت البطاقة:\n• ' + pre.problems.join('\n• '));
    err.problems = pre.problems;
    throw err;
  }

  // ② الرقمُ الرسميّ (معاملةٌ بذاتها — ولا تتداخل المعاملات).
  const { number } = await reserveNumber(kind.numberType);
  const who = whoami(profile);
  const day = todayLocal();

  // ③ المعاملةُ الذرّيّة: تُقرأ الكمّيّاتُ من الخادم ويُعاد الحكم.
  const lines = (card.lines ?? []).map(normalizeCardLine);
  const keys = lines.map((l) => lineAssetKey(l));
  // معرّفاتُ سجلّ الملاحظات تُولَّد خارج المعاملة — فالمعاملة لا تُولّد مراجع.
  const noteRefs = keys.map((k) => doc(collection(db, ASSETS, k, NOTES)));

  const result = await runTransaction(db, async (tx) => {
    const cardRef = doc(db, CARDS, docId);
    const fresh = await tx.get(cardRef);
    if (!fresh.exists()) throw new Error('البطاقة غير موجودة.');
    if (fresh.data().state !== 'draft') throw new Error('ثُبّتت هذه البطاقةُ من جهازٍ آخر.');

    const refs = keys.map((k) => doc(db, ASSETS, k));
    const snaps = [];
    for (const r of refs) snaps.push(await tx.get(r)); // كلُّ القراءات قبل أيّ كتابة

    const present = new Map();
    snaps.forEach((s, i) => {
      if (s.exists()) present.set(keys[i], { docId: keys[i], ...s.data() });
    });

    // ★★★ الحكمُ يُعاد على ما قرأه الخادمُ الآن — لا على ما رأته الشاشة.
    const verdict = cardVerdict({ ...card, number }, present, { forPost: true });
    if (!verdict.ok) {
      const err = new Error('تغيّر الرصيدُ قبل التثبيت:\n• ' + verdict.problems.join('\n• '));
      err.problems = verdict.problems;
      throw err;
    }

    let created = 0;
    lines.forEach((l, i) => {
      const ref = refs[i];
      const existing = present.get(keys[i]);
      if (!existing) {
        // إدخالٌ لأصلٍ جديد — يُنشأ بكمّيّة البند نفسِها.
        created += 1;
        tx.set(ref, {
          id: l.assetNo,
          population: l.population,
          assetType: populationAssetType(l.population),
          assetName: l.assetName,
          brand: l.brand,
          serial: l.category,
          qty: l.qty,
          condition: l.condition || 'جيد',
          responsible: '',
          department: 'مخزن فينسيا',
          section: '',
          location: VENECIA_WAREHOUSE,
          receivedDate: card.cardDate || '',
          notes: '',
          warehouse: VENECIA_WAREHOUSE,
          archived: false,
          archiveReason: '',
          countedQty: null,
          countedAt: '',
          countedBy: '',
          createdAt: serverTimestamp(),
          createdBy: who.byName,
          createdByUid: who.byUid,
          updatedAt: serverTimestamp(),
          updatedBy: who.byName,
          updatedByUid: who.byUid,
        });
      } else {
        // ★★★ الحسابُ بـ`qtyAfterCard` لا بيدٍ هنا — وهي تحمل حارسَها:
        // ترفض ما يُنزل الرصيدَ دون صفر. وكان السطرُ يحسب `qty + sign*n`
        // مباشرةً، فبقيت الدالّةُ المختبَرةُ **بلا مستدعٍ** حتّى هزّتها
        // شجرةُ البناء من الحِزمة المنشورة — وكُشف ذلك بتفتيش النشرة الحيّة.
        // والحمايةُ الآن طبقتان: حكمُ المعاملة، ثمّ الحسابُ نفسُه.
        tx.set(
          ref,
          {
            qty: qtyAfterCard(existing, l.qty, card.kind),
            updatedAt: serverTimestamp(),
            updatedBy: who.byName,
            updatedByUid: who.byUid,
          },
          { merge: true }
        );
      }
      tx.set(noteRefs[i], {
        text: cardNoteLine({ ...card, number }, l),
        kind: card.kind === 'issue' ? 'issue' : 'receipt',
        cardId: docId,
        cardNumber: number,
        at: serverTimestamp(),
        day,
        byUid: who.byUid,
        byName: who.byName,
      });
    });

    tx.set(
      cardRef,
      {
        number,
        state: 'posted',
        postedAt: serverTimestamp(),
        postedDay: day,
        postedBy: who.byName,
        postedByUid: who.byUid,
        updatedAt: serverTimestamp(),
        updatedBy: who.byName,
        updatedByUid: who.byUid,
      },
      { merge: true }
    );

    return { created };
  });

  return { number, moved: cardTotals(card).units, created: result.created };
}

/**
 * يُنشئ **بطاقةً مضادّةً** مسودّةً من بطاقةٍ مثبَّتة — طريقُ التصحيح الوحيد.
 * نفسُ البنود في الاتّجاه الآخر، وسببٌ يربطها بأصلها.
 */
export async function reverseCard(docId, reason, profile) {
  const why = String(reason || '').trim();
  if (!why) throw new Error('البطاقة المضادّة تحتاج سببًا مكتوبًا.');
  const snap = await getDoc(doc(db, CARDS, docId));
  if (!snap.exists()) throw new Error('البطاقة غير موجودة.');
  const src = snap.data();
  if (src.state !== 'posted') throw new Error('لا تُعكَس إلّا بطاقةٌ مثبَّتة.');
  const back = src.kind === 'issue' ? 'receipt' : 'issue';
  const who = whoami(profile);
  const ref = await addDoc(collection(db, CARDS), {
    kind: back,
    state: 'draft',
    number: '',
    cardDate: todayLocal(),
    party: src.party || '',
    destination: src.destination || '',
    purpose: `عكسُ البطاقة ${src.number || '—'} — ${why}`,
    reversalOf: docId,
    reversalOfNumber: src.number || '',
    lines: (src.lines ?? []).map(normalizeCardLine),
    warehouse: VENECIA_WAREHOUSE,
    createdAt: serverTimestamp(),
    createdBy: who.byName,
    createdByUid: who.byUid,
    updatedAt: serverTimestamp(),
    updatedBy: who.byName,
    updatedByUid: who.byUid,
  });
  return { docId: ref.id, kind: back };
}

/** هويّةُ مستند الأصل من بندٍ — يُعاد تصديرُها لتستعملها الشاشة بلا تكرار. */
export { assetDocId };
