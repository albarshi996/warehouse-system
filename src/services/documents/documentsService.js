/**
 * محرّك المستندات — الطبقة التي تحوّل النماذج من ورقٍ داخل متصفّح إلى مستندات حيّة.
 *
 * المبدأ الحاكم: **محرّك واحد لا 21 تطبيقًا** (ROADMAP §11.2). كل نموذج
 * يصف نفسه في «مخطّط» (schema)، وهذا الملف يتكفّل بالباقي لكل الأنواع:
 * حفظ · ترقيم حقيقي · هوية ووقت · اعتماد حسب الدور · سجلّ تدقيق دائم.
 *
 * البنية (تمتدّ من `operations` الذي نجح):
 *   documents/{docId}            ← رأس المستند + بنوده
 *      └── audit/{entryId}       ← append-only: من فعل ماذا ومتى
 *
 * قاعدة التاريخ: سجلّ التدقيق **لا يُعدَّل ولا يُحذف** — نفس نمط `scans`.
 * والمستند نفسه لا يُحذف أبدًا؛ المستند الخاطئ يُرفض أو يُلغى، ولا يُمحى.
 */
import {
  collection,
  doc,
  addDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  serverTimestamp,
  limit,
  getDocs,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { reserveNumber } from './numbering.js';
import { INITIAL_STATE, isEditable, isLegalTransition, canDo, TRANSITIONS } from './states.js';
import { deriveDocument, parentApprovalProblem } from './chain.js';
import { getSchema } from './schemas/index.js';
import { primaryParentType } from './schemaUtils.js';
import { dateSaveVerdict, defaultValueFor, eventFieldsOf } from './datingGuard.js';
import { movesStock, POSTING_STATE } from '../ledger/postingRules.js';
import { buildMoves } from '../ledger/movements.js';
import { postDocument } from '../ledger/ledgerService.js';
import { ledgerRuleFor } from '../ledger/partnerLedger.js';
import { postToPartnerLedger } from '../ledger/partnerLedgerService.js';
import { allocateAndReserve, releaseReservation, releaseForPick } from '../ledger/salesService.js';

const DOCS = 'documents';
const AUDIT = 'audit';

/**
 * هوية الكاتب من Firebase Auth مباشرة (لا من الملف الشخصي) — لأن قواعد
 * الأمان تشترط `byUid == request.auth.uid`، وقد يسبق القيدُ تحميلَ الملف.
 */
function currentUid() {
  return auth?.currentUser?.uid || null;
}

function currentName(profile) {
  return profile?.name || auth?.currentUser?.email || 'غير معروف';
}

/**
 * «اليوم» للفحص المسبق (م٢-ب).
 *
 * ⚠️ **ساعة الجهاز، وهي ليست الحكم.** الحكم `request.time` في `firestore.rules`
 * — فمن قدّم ساعة حاسوبه ليؤرّخ في المستقبل يجتاز هذا الفحص ويرتدّ عند الخادم.
 * وجودُه هنا للرسالة المفهومة لا للحماية: الحماية عند الخادم وحده.
 */
function clientToday() {
  return new Date().toISOString().slice(0, 10);
}

/** يُضيف قيد تدقيق دائم. لا يُحدَّث ولا يُحذف أبدًا. */
export function appendAudit(docId, { action, note = '', from = '', to = '', profile }) {
  return addDoc(collection(db, DOCS, docId, AUDIT), {
    action,
    note: String(note || ''),
    from,
    to,
    byUid: currentUid(),
    byName: currentName(profile),
    byRole: profile?.role || '',
    at: serverTimestamp(),
  });
}

/**
 * ينشئ مسودّة جديدة ويُعيد معرّفها.
 * بلا رقم رسمي — الرقم يُمنح عند الإرسال (انظر numbering.js).
 */
export async function createDraft({ type, stage = null, profile, header = {}, lines = [] }) {
  // ختم الواقعة يُفتح على **اليوم** لا على فراغ: القيمة الافتراضيّة هي الصحيحة
  // في تسعةٍ من كلّ عشرة، ومن أراد غيرها مرّ بمسار السبب والاعتماد.
  const stamped = { ...header };
  for (const key of eventFieldsOf(type, getSchema(type))) {
    if (!String(stamped[key] ?? '').trim()) stamped[key] = defaultValueFor(type, key, clientToday());
  }
  const ref = await addDoc(collection(db, DOCS), {
    type,
    stage,
    number: null,
    state: INITIAL_STATE,
    header: stamped,
    lines,
    links: {},
    createdByUid: currentUid(),
    createdByName: currentName(profile),
    createdByRole: profile?.role || '', // دور المُنشئ — يغذّي «سجلّ حركة الأدوار» الحيّ
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await appendAudit(ref.id, { action: 'create', to: INITIAL_STATE, profile });
  return ref.id;
}

/**
 * يحفظ حقول المسودّة. يرفض الكتابة على مستند غير قابل للتعديل —
 * فالمستند المُرسَل أو المعتمَد لا تتغيّر بياناته من تحت من اعتمده.
 *
 * ويحرس نزاهة التاريخ (م٢-ب): لا واقعة في المستقبل، وما وراء المدى يحتاج
 * اعتمادًا وسببًا مكتوبًا ويُوسَم وسمًا دائمًا.
 *
 * @param {object} opts
 * @param {object} [opts.settings] سياسات التشغيل — غيابها يعني الافتراضات
 * @param {string} [opts.reason] سبب التأريخ للماضي
 * @param {object} [opts.profile] ملفّ الفاعل (دورُه يقرّر الاعتماد)
 */
export async function saveDocument(docId, { header, lines, links, settings, reason = '', profile } = {}) {
  const snap = await getDoc(doc(db, DOCS, docId));
  if (!snap.exists()) throw new Error('المستند غير موجود.');
  const data = snap.data();
  if (!isEditable(data.state)) {
    throw new Error('لا يمكن التعديل بعد الإرسال — المستند خرج من يدك.');
  }

  const patch = { updatedAt: serverTimestamp() };
  if (header !== undefined) {
    const verdict = dateSaveVerdict({
      docType: data.type,
      schema: getSchema(data.type),
      header,
      settings,
      today: clientToday(),
      role: profile?.role || '',
      reason,
    });
    if (!verdict.ok) throw new Error(verdict.problems.join(' · '));
    patch.header = header;
    // الوسم دائم: يُكتب حين يوجد، ولا يُمحى حين لا يوجد — مستندٌ أُرّخ للماضي
    // ثمّ صُحّح تاريخه يبقى أثرُه. والهويّة والوقت من هنا لا من المتصفّح.
    if (verdict.tag) {
      patch.dating = {
        ...verdict.tag,
        byUid: currentUid(),
        byName: currentName(profile),
        byRole: profile?.role || '',
        at: serverTimestamp(),
      };
      await appendAudit(docId, {
        action: 'backdate',
        note: `تأريخٌ للماضي ${verdict.tag.daysBack} يومًا (${verdict.tag.fields.join('، ')}): ${verdict.tag.reason || 'بلا سبب مطلوب'}`,
        profile,
      });
    }
  }
  if (lines !== undefined) patch.lines = lines;
  if (links !== undefined) patch.links = links;
  return updateDoc(doc(db, DOCS, docId), patch);
}

/**
 * ينقل المستند إلى حالة جديدة بعد التحقّق من: شرعية النقلة، وصلاحية الدور،
 * ووجود السبب حين يلزم. وعند أول إرسال — يحجز الرقم الرسمي.
 *
 * الرقم يُحجز **مرّة واحدة فقط**: المستند المرفوض الذي يُعاد إرساله يحتفظ
 * برقمه الأصلي، فلا يُهدر رقم ولا يتغيّر مرجع المستند بعد أن عُرف به.
 */
export async function transitionDocument(docId, to, { note = '', profile, schema } = {}) {
  const ref = doc(db, DOCS, docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('المستند غير موجود.');

  const data = snap.data();
  const from = data.state;

  if (!isLegalTransition(from, to)) {
    throw new Error(`نقلة غير مسموحة: من «${from}» إلى «${to}».`);
  }

  const transition = (TRANSITIONS[from] || []).find((t) => t.to === to);
  const user = { role: profile?.role, uid: currentUid() };
  if (!canDo(transition, user, schema, data)) {
    throw new Error('لا تملك صلاحية هذا الإجراء.');
  }
  if (transition.needsNote && !String(note).trim()) {
    throw new Error('اكتب السبب أولًا — الرفض بلا سبب لا يُوثَّق.');
  }

  // 🥇 حارس الأثر المخزني: لا يُنجَز مستندٌ يستحيل قيده.
  // نفحص **قبل** تغيير الحالة، لا بعده — فمستندٌ «منجَز» بلا أثر أسوأ من
  // مستندٍ عالق: الأوّل يكذب على الرصيد بصمت، والثاني يطلب التصحيح بصوت.
  if (to === POSTING_STATE && movesStock(data.type)) {
    const { moves, problems } = buildMoves({ ...data, id: docId });
    if (problems.length) {
      throw new Error(`تعذّر قيد الأثر المخزني: ${problems.join(' · ')}`);
    }
    if (!moves.length) {
      throw new Error('لا بند بكمية — مستندٌ بلا أثر مخزني لا يُنجَز.');
    }
  }

  // 🔗 حارس السلسلة: لا يُنجَز مستندٌ قبل اعتماد أبيه المرجعيّ (المربوط بحقل
  //    docref — يدويًّا بالرقم أو بالاشتقاق). الربط بأبٍ غير معتمَد مسموح (تحذير
  //    أصفر في الواجهة)، لكنّ الإنجاز يُمنع حتى يُعتمد الأب — فلا تُغلق حلقةٌ
  //    ابنٌ قبل أبيها. المستندات المشتقّة تجتازه دومًا (اشتقاقها اشترط اعتماد الأب).
  if (to === 'done') {
    const sc = schema || getSchema(data.type);
    const parentType = primaryParentType(sc);
    const parentLink = parentType ? data.links?.[parentType] : null;
    if (parentType && parentLink?.id) {
      const parentDoc = await getDocument(parentLink.id);
      const problem = parentApprovalProblem(parentType, parentDoc);
      if (problem) throw new Error(problem);
    }
  }

  const patch = { state: to, updatedAt: serverTimestamp() };

  if (to === 'submitted' && !data.number) {
    const { number } = await reserveNumber(data.type);
    patch.number = number;
    patch.numberedAt = serverTimestamp();
  }
  if (to === 'approved') {
    patch.approvedByUid = currentUid();
    patch.approvedByName = currentName(profile);
    patch.approvedByRole = profile?.role || ''; // دور المُعتمِد — يغذّي «سجلّ حركة الأدوار» الحيّ
    patch.approvedAt = serverTimestamp();
  }

  // 🥇 الذرّية (BZ-SCN-001): للمستند المخزنيّ، بلوغُ «منجَز» وقيدُ الأثر معاملةٌ
  // واحدة داخل postDocument — إمّا أن يُنجَز ويُقيَّد معًا، أو يبقى **معتمَدًا** إن
  // فشل القيد (رصيدٌ غير كافٍ مثلًا). فلا تُكتب «منجَز» ثم يفشل الأثر فيبقى المستند
  // يكذب على الرصيد بصمت. الفحص المسبق أعلاه (buildMoves) يمسك أخطاء البناء مبكّرًا؛
  // وحارس الرصيد داخل المعاملة يمسك العجز — وكلاهما يُبقي المستند معتمَدًا لا منجَزًا.
  const atomicPost = to === POSTING_STATE && movesStock(data.type);
  if (atomicPost) {
    try {
      const result = await postDocument({ ...data, id: docId }, profile, { markDone: true });
      await appendAudit(docId, { action: to, note, from, to, profile });
      await appendAudit(docId, {
        action: 'post',
        note: `قُيّد الأثر المخزني: ${result.moves} حركة، إجمالي ${result.totalQty}`,
        profile,
      });
    } catch (err) {
      await appendAudit(docId, {
        action: 'post-failed',
        note: `تعذّر القيد، والمستند باقٍ في «${from}»: ${err?.message || err}`,
        profile,
      });
      throw new Error(`لم يُنجَز المستند: تعذّر قيد أثره المخزني — ${err?.message || err}`);
    }
  } else {
    await updateDoc(ref, patch);
    await appendAudit(docId, { action: to, note, from, to, profile });
  }

  // 💰 دفتر الذمم (م٤-ج): المستند الواحد قد يُحرّك رفًّا **وذمّة** — فالفاتورة
  // تُنشئ دَينًا وسند القبض يُقفله. يُقيَّد عند الإنجاز، **أفضلَ جهدٍ لا شرطَ
  // اعتماد**: فشلُ قيد الذمّة يُثبَّت في التدقيق ولا يُبطل إنجاز المستند، لأنّ
  // البضاعة تحرّكت فعلًا ولا يصحّ إنكارها لأنّ سطرًا ماليًّا تعذّرت كتابته.
  if (to === POSTING_STATE && ledgerRuleFor(data.type)) {
    try {
      const entryId = await postToPartnerLedger({ ...data, id: docId }, profile);
      if (entryId) {
        await appendAudit(docId, { action: 'ledger', note: `قُيّد الأثر على الذمم: ${entryId}`, profile });
      }
    } catch (err) {
      await appendAudit(docId, {
        action: 'ledger-failed',
        note: `تعذّر قيد الأثر على الذمم (المستند منجَزٌ والبضاعة تحرّكت): ${err?.message || err}`,
        profile,
      });
    }
  }

  // 🛒 حجز أمر البيع: يُحجز عند الاعتماد، ويُفكّ ما تبقّى عند الإنجاز/الإغلاق.
  // أفضلُ جهدٍ لا شرطُ اعتماد — فشلُ الحجز يُثبَّت في التدقيق ولا يُبطل قرار المدير.
  if (data.type === 'SO' && (to === 'approved' || to === POSTING_STATE)) {
    try {
      if (to === 'approved') {
        const r = await allocateAndReserve({ ...data, id: docId });
        const shortNote = r.shortfall.length ? ` — عجزٌ في ${r.shortfall.length} صنفًا` : '';
        await appendAudit(docId, { action: 'reserve', note: `حُجز ${r.reserved} تشغيلة${shortNote}`, profile });
      } else {
        const r = await releaseReservation({ ...data, id: docId });
        if (!r.already) await appendAudit(docId, { action: 'release', note: `فُكّ حجز ${r.released} تشغيلة`, profile });
      }
    } catch (err) {
      await appendAudit(docId, {
        action: to === 'approved' ? 'reserve-failed' : 'release-failed',
        note: `تعذّر ${to === 'approved' ? 'حجز' : 'فكّ حجز'} الرصيد: ${err?.message || err}`,
        profile,
      });
    }
  }

  // 🛒 تحرير حجز أمر البيع عند سحب بنوده فعليًّا (PICK منجَز): البضاعة غادرت الرفّ
  // فلا تبقى محجوزةً عليه (BZ-SCN-004). أفضلُ جهدٍ — يُثبَّت فشلُه ولا يُبطل السحب.
  if (data.type === 'PICK' && to === POSTING_STATE) {
    try {
      const r = await releaseForPick({ ...data, id: docId });
      if (r.released > 0) {
        await appendAudit(docId, { action: 'release', note: `فُكّ حجز ${r.released} من أمر البيع بعد السحب`, profile });
      }
    } catch (err) {
      await appendAudit(docId, {
        action: 'release-failed',
        note: `تعذّر فكّ حجز أمر البيع بعد السحب: ${err?.message || err}`,
        profile,
      });
    }
  }

  return patch.number || data.number || null;
}

/** يقرأ مستندًا مرّة واحدة. */
export async function getDocument(docId) {
  const snap = await getDoc(doc(db, DOCS, docId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** يستمع لمستند لحظيًّا (ليرى المُنشئ الاعتماد فور وقوعه). */
export function listenDocument(docId, callback) {
  return onSnapshot(doc(db, DOCS, docId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

/** يستمع لسجلّ التدقيق (الأقدم أولًا — قصّة المستند بالترتيب). */
export function listenAudit(docId, callback) {
  const q = query(collection(db, DOCS, docId, AUDIT), orderBy('at', 'asc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

/**
 * «مستنداتي» — ما أنشأته أنا.
 * نُصفّي بحقل واحد ونرتّب في الواجهة تفاديًا للفهرس المركّب
 * (نفس الدرس المستفاد من شاشة متابعة العمليات).
 */
export function listenMyDocuments(uid, callback, max = 50) {
  const q = query(collection(db, DOCS), where('createdByUid', '==', uid), limit(max));
  return onSnapshot(q, (snap) => callback(sortByCreated(snap)));
}

/** «بانتظار اعتمادي» — كل ما أُرسل ولم يُبتّ فيه. */
export function listenPendingApproval(callback, max = 50) {
  const q = query(collection(db, DOCS), where('state', '==', 'submitted'), limit(max));
  return onSnapshot(q, (snap) => callback(sortByCreated(snap)));
}

/** كل المستندات (للمدير) — الأحدث أولًا. */
export function listenAllDocuments(callback, max = 100) {
  const q = query(collection(db, DOCS), orderBy('createdAt', 'desc'), limit(max));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

/**
 * مستندات أنواعٍ بعينها — لِلوحاتٍ متخصّصة (النقل مثلًا).
 * `in` بحقلٍ واحد فلا يلزم فهرس مركّب؛ نرتّب محليًّا (درس متابعة العمليات).
 * حدّ Firestore عشرة أنواع في `in` — يكفي لأيّ سلسلة.
 */
export function listenDocumentsByTypes(types, callback, max = 200) {
  const list = (types || []).slice(0, 10);
  if (!list.length) {
    callback([]);
    return () => {};
  }
  const q = query(collection(db, DOCS), where('type', 'in', list), limit(max));
  return onSnapshot(q, (snap) => callback(sortByCreated(snap)));
}

/* ═══════════════ سلسلة الشراء (F2) ═══════════════ */

/**
 * ينشئ المستند التالي في السلسلة مشتقًّا من مستند معتمَد.
 *
 * كل المنطق في `chain.js` الخالص (يُختبَر بلا شبكة)؛ هنا الكتابة وحدها
 * وقيد التدقيق الذي يربط المولود بأصله — فيبقى الأثر في المستندين معًا.
 */
export async function createNextInChain(sourceDoc, profile, toType = null) {
  const draft = deriveDocument(sourceDoc, toType);
  const schema = getSchema(draft.type);
  const newId = await addDoc(collection(db, DOCS), {
    type: draft.type,
    stage: schema?.stage ?? null,
    number: null,
    state: INITIAL_STATE,
    header: draft.header,
    lines: draft.lines,
    links: draft.links,
    createdByUid: currentUid(),
    createdByName: currentName(profile),
    createdByRole: profile?.role || '', // دور المُنشئ — يغذّي «سجلّ حركة الأدوار» الحيّ
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }).then((r) => r.id);

  await appendAudit(newId, {
    action: 'create',
    to: INITIAL_STATE,
    note: `مشتقّ من ${sourceDoc.type} ${sourceDoc.number || ''}`.trim(),
    profile,
  });
  // أثرٌ في الأصل أيضًا: من فتح الحلقة التالية ومتى.
  await appendAudit(sourceDoc.id, {
    action: 'derive',
    to: draft.type,
    note: `أُنشئ منه ${draft.type}`,
    profile,
  });
  return newId;
}

/**
 * يجلب مستندات السلسلة المرتبطة بمستند: أسلافه (من `links`) وأبناءه
 * (من يشير إليه). يُستهلك في شريط السلسلة وفي المطابقة الثلاثية.
 *
 * الاستعلام بحقل واحد (`links.<type>.id`) فلا يلزم فهرس مركّب — نفس درس
 * شاشة متابعة العمليات.
 */
export async function fetchChainDocuments(docData) {
  if (!docData?.id) return [];
  const found = new Map();

  // الأسلاف: معرّفاتهم مكتوبة في روابط المستند نفسه.
  const ancestors = Object.values(docData.links || {})
    .map((l) => l?.id)
    .filter(Boolean);
  await Promise.all(
    ancestors.map(async (id) => {
      const d = await getDocument(id);
      if (d) found.set(d.id, d);
    })
  );

  // الأبناء: من يحمل رابطًا إلى نوعي ومعرّفي.
  const kids = await getDocs(
    query(collection(db, DOCS), where(`links.${docData.type}.id`, '==', docData.id), limit(20))
  );
  kids.docs.forEach((d) => found.set(d.id, { id: d.id, ...d.data() }));

  // وأبناء الأسلاف (شقيقي في السلسلة: مثلًا QC أخو GRN تحت نفس PO).
  await Promise.all(
    [...found.values()].map(async (rel) => {
      const sub = await getDocs(
        query(collection(db, DOCS), where(`links.${rel.type}.id`, '==', rel.id), limit(20))
      );
      sub.docs.forEach((d) => {
        if (!found.has(d.id) && d.id !== docData.id) found.set(d.id, { id: d.id, ...d.data() });
      });
    })
  );

  return [...found.values()];
}

/**
 * يبحث عن مستندٍ برقمه الرسميّ (التعرّف التلقائيّ لحقل `docref`).
 *
 * الرقم عالميّ الفرادة (`TYPE-YEAR-SEQ` يتضمّن النوع) فيكفي استعلامٌ بحقلٍ
 * واحد (`number`) — فهرسه المفرد تلقائيّ، **لا فهرس مركّب ولا تدخّل من المالك**.
 * النوع يُتحقَّق محلّيًّا بعد الجلب. يعيد المستند أو null.
 */
export async function lookupByNumber(number) {
  const clean = String(number || '').trim();
  if (!clean) return null;
  const snap = await getDocs(query(collection(db, DOCS), where('number', '==', clean), limit(1)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

/** ترتيب محلّي بالأحدث — يُغني عن فهرس مركّب مع `where`. */
function sortByCreated(snap) {
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}
