/**
 * الاستلام الميدانيّ — من أمر شراءٍ مفتوح إلى طبليةٍ ترفع للحوكمة.
 *
 * ═══ ولماذا شاشةٌ جديدة لا وضعٌ في شاشة المسح؟ ═══
 * قِيس الأمر لا خُمِّن: وضع «استلام» **موجودٌ أصلًا** في `SCAN_MODES`، لكنّه
 * **التقاطٌ عامّ** — يسجّل ما دخل بلا أمرٍ ولا رصيدٍ مفتوح ولا طبلية، وهو
 * صحيحٌ لما وُضع له («الالتقاط لا يُحاسِب» · CAP-101).
 *
 * وهذا الاستلام **مقودٌ بمستند**: يبدأ من أمرٍ معتمد، ويردّ الصنف الغريب،
 * ويعدّ المفتوح تنازليًّا، ويثمر حمولةً تُعتمد. فدسُّه في مكوّنٍ من ١٢١٨
 * سطرًا يعمل جراحةٌ في شاشةٍ تعمل — وتفويض المالك يمنعها. وليست «صفحةً فوق
 * صفحة» لأنّ الوظيفة غير موجودةٍ أصلًا: لا شاشةَ اليوم تستلم من أمر شراء.
 *
 * ═══ القاعدة الحاكمة ═══
 * **الشاشة عرضٌ للحكم لا حَكَم.** كلّ قراءةٍ تمرّ بـ`scanIntoDraft` التي
 * تستدعي `scanVerdict` الخالصة على البيانات الحيّة — فلا شرطَ يُكتب هنا،
 * والصوتُ والاهتزاز يتبعان نتيجة الحكم الفعليّة لا ظنّ الواجهة.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { subscribeItems } from '../../../services/items/itemService.js';
import { buildItemIndexes } from '../../../services/items/uomWiring.js';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { listenDocumentsByTypes } from '../../../services/documents/documentsService.js';
import { documentLineProgress } from '../../../services/documents/documentLineProgress.js';
import { openOrderCard, remainingOf, sessionCloseProblem, sessionTotals } from '../../../services/lpn/receivingSession.js';
import {
  addDraft,
  closeDraftToGovernance,
  createGrnFromSession,
  finishSession,
  leaveSession,
  listenSession,
  listOpenSessions,
  scanIntoDraft,
  startSession,
} from '../../../services/lpn/receivingService.js';
import { grnPreview } from '../../../services/lpn/grnBridge.js';
/*
 * ‹JR-301 · طلبُ المالك ط‑٥› اختيارُ الوحدة عند المسح.
 * الأربعةُ تُستدعى ولا يُعاد بناءُ حكمِ أيٍّ منها هنا: `resolveScan` تقول ما
 * يحسمه الباركود · `needsPackEntry` هي الحكمُ الفاصل بين المسارين ·
 * `scanUomChoices` قائمةُ المعرَّف · `packEntryVerdict` حكمُ غير المعرَّف.
 */
import { resolveScan } from '../../../services/lpn/receivingScan.js';
import { baseQtyPreview, scanUomChoices } from '../../../services/stock/scanFlow.js';
import { needsPackEntry, packEntryVerdict } from '../../../services/items/packEntry.js';
import { convert, uomLabel } from '../../../services/items/uomModel.js';
// ‹JR-105› «كلُّ مرحلةٍ مربوطةٌ بشخصٍ ما» — والخريطةُ تُقرأ من مخطّطات الأنواع.
import { nextOwnerOf, stageOwnerLine } from '../../../services/tasks/stageOwners.js';
import {
  useBarcodeCamera,
  ScanCameraButton,
  ScanCameraPanel,
} from '../scan/BarcodeCamera.jsx';
import { useWedgeScanner } from '../scan/useWedgeScanner.js';
import { normalizeScanned } from '../../../services/scan/scanEngine.js';
// ‹LPN-214› طورُ التخزين — آخرُ خطوةٍ في الاستلام الميدانيّ لا شاشةٌ رابعة.
import { executePutaway, listPutawayQueue, openTask, previewBin } from '../../../services/lpn/putawayService.js';
import { listenLocations } from '../../../services/locations/locationsService.js';
import { listenBalances } from '../../../services/balances/balancesService.js';
// ‹LPN-511› الصلاحية تُعلَم قبل الضغط لا بعد ارتداد الخادم.
import { uiGate } from '../../../services/lpn/lpnRoles.js';
import { FieldLangSwitch, useFieldLang } from './useFieldLang.jsx';

/* ── الطرقُ المكتوبة ─────────────────────────────────────────────────
 * ★★ **2026-09-03 — الشاشةُ تعرف الطريقَ فلتُعطِه.**
 * كانت تقول «اعتمده من صندوق المستندات» و«اعتمد أمرًا ثمّ عُد»: أمرٌ
 * بالذهاب بلا طريق، ومعرّفُ المستند بيدها في `r.docId` و`session.grnId`.
 * فالموظّفُ يقرأ رقمًا ثمّ يبحث عنه بيده في صندوقٍ فيه مستنداتُ المنشأة كلُّها.
 *
 * ⚠️ والروابطُ تُبنى من `getBasePath()` لا بمسارٍ حرفيّ: البوّابةُ تُنشر تحت
 * مسارِ المستودع وتُطوَّر تحت الجذر — والمسارُ الحرفيُّ يصحّ في إحدى البيئتين
 * ويكذب في الأخرى، وهو عطبٌ لا يظهر إلّا عند المستخدم.
 *
 * ★ ولا يُكتب اسمُ المستودع هنا ولو في تعليق: حارسُ الهويّة
 * (`workspace/identity.test.js`) يقرأ **النصَّ الخام** ويرفض أيَّ ذكرٍ لاسمِ
 * مستودعِنا في ملفٍّ يُزامَن إلى المستودع الشقيق — فما يصحّ عندنا يكذب هناك.
 */
const base = getBasePath();
const docHref = (type, id) => `${base}/dashboard/document?type=${type}&id=${encodeURIComponent(id)}`;
const inboxHref = `${base}/dashboard/documents`;

/* ⟦deep-link⟧ ═══ الأمرُ يُقرأ من العنوان ═══════════════════════════════
 *
 * ★★★ **العلامتان ⟦deep-link⟧ … ⟦/deep-link⟧ عقدٌ لا زينة.** حارسُ هذه
 * الكتلة (`receivingDeepLink.test.js`) يقتطع ما بينهما ويُحمّله **وحدةً حيّة**
 * فيُشغّل شيفرةَ الشاشة نفسَها لا نسخةً منها — و`node --test` لا يستورد `.jsx`
 * ولا مترجمَ في هذه الشجرة. فلا تُزل العلامتين، ولا تُدخل بينهما JSX ولا
 * استيرادًا ولا شيئًا من خارج الكتلة: ما بينهما يجب أن يقوم وحدَه.
 * (ولهذا سكن `upper` هنا: تستعمله الكتلةُ فيسكن معها، ويبقى تعريفًا واحدًا
 * للملفّ كلِّه لا اثنين يفترقان.)
 *
 * ═══ العطبُ الذي تسدّه ═══
 * زرُّ «ابدأ الاستلام الميدانيّ» في صفّ الأمر يفتح هذه الشاشة — على **قائمتها**.
 * فمن ضغطه على أمرٍ بعينه يصل إلى قائمةٍ يبحث فيها عن أمره بين المفتوحة،
 * والرحلةُ التي وُصلت من المستند إلى الميدان تنقطع في آخر متر. وهو المزلقُ
 * الأوّلُ المكتوبُ حرفًا في رأس `services/tasks/fieldRoutes.js`: «فالمسارُ
 * عارٍ حتّى تقرأه الشاشة، ثمّ يُضاف هنا وفي الشاشة معًا لا هنا وحده».
 *
 * ⚠️ **ونصفُه الأوّلُ ما زال ناقصًا**: `DocumentsInbox.jsx` و`OpenDocumentsBox.jsx`
 * يبنيان الرابطَ `${base}${route.path}` **بلا `?doc=`**. فهذه الشاشةُ صارت
 * تقرأ ما لا يكتبه أحدٌ بعد — وهو مقصودٌ لا سهو: الملفّان ليسا في يد هذه
 * الدفعة. والقارئُ يسبق الكاتبَ ولا ضررَ (لا معاملَ ⇒ لا تغيّرَ حرفًا)،
 * وحارسُ الكتلة يقيس المفتاحَ من `fieldRouteFor` نفسِها فيوم يُكتب يعمل.
 *
 * ★ والمفتاحُ `doc` **عينُ مفتاح `PickingFlow.jsx`** لا مفتاحٌ ثانٍ: ما
 * يتعلّمه الموظّفُ في شاشةٍ يعمل في أختها، والمفتاحان يفترقان صامتين.
 */

/** مقارنةُ هويّةٍ لا عرضٌ — بحروفٍ كبيرةٍ مشذّبةٍ كما تفعل الخدمةُ في قيدها. */
const upper = (v) => String(v ?? '').trim().toUpperCase();

/**
 * معرّفُ المستند المطلوب من شريط العنوان — أو نصٌّ فارغ.
 *
 * @param {string} search نصُّ `location.search` كما هو (بعلامة الاستفهام أو بدونها)
 * @returns {string}
 */
export function docParamOf(search) {
  return String(new URLSearchParams(String(search ?? '')).get('doc') ?? '').trim();
}

/**
 * ★★★ ما الذي يفعله الرابطُ الآن؟ — **حكمٌ خالصٌ يُسأل، والشاشةُ تنفّذه.**
 *
 * خمسةُ مخارجَ لا رابعَ لها صامت:
 *   · `none`      ⟶ لا معاملَ أصلًا: الشاشةُ كما كانت حرفًا بحرف.
 *   · `session`   ⟶ على الأمر جلسةٌ مفتوحة: **تُتابَع ولا تُفتح ثانيةٌ عليه**.
 *   · `order`     ⟶ أمرٌ مطابقٌ بلا جلسة: تُفتح جلستُه مباشرةً.
 *   · `highlight` ⟶ مطابقٌ والفتحُ يحتاج ضغطة: يُبرَز ويُقال لماذا.
 *   · `missing`   ⟶ لا مطابقَ: يُقال السببُ المرجَّح ولا يُترك الموظّفُ يظنّ
 *                   أمرَه ضائعًا وهو أمامه.
 *
 * ★★★ **ولماذا الجلسةُ أوّلًا؟** `startSession` تُنشئ **دائمًا**، فجلستان على
 * أمرٍ واحدٍ لا ترى إحداهما الأخرى — وهو نقيضُ ما بُني له `listenSession`.
 * والرابطُ ضغطةٌ تتكرّر بكلّ إعادةِ تحميل، فخطرُه أكبر من نقرةِ يدٍ لا أصغر.
 *
 * ★ و`allowed` **ليست حكمَ صلاحيّةٍ جديدًا**: هي عينُ ما يعطّل زرَّ الصفّ في
 * الشاشة (`uiGate`). والقيدُ أنّ العنوانَ لا يفعل ما يمنعه الضغط — وإلّا صار
 * بابًا خلفيًّا. والمنعُ **إبرازٌ لا صمت**: يرى أمرَه ويرى شريطَ الدور فوقه.
 *
 * ★ والمطابقةُ بالمعرّف **أو بالرقم**: الرابطُ يحمل المعرّف، ومن نسخ
 * «PO-2026-0015» بيده من رسالةٍ أو ورقةٍ يصل كذلك بلا شاشةٍ ثانيةٍ تُبنى له.
 *
 * @param {object} input
 * @param {string} input.wanted المعرّفُ (أو الرقم) كما قُرئ من العنوان
 * @param {Array<object>} input.orders بطاقاتُ الأوامر المعروضة — من `openOrderCard`
 * @param {Array<object>} input.openSessions الجلساتُ المفتوحة — من `listOpenSessions`
 * @param {boolean} input.sessionsKnown أقُرئت قائمةُ الجلسات فعلًا؟ (فشلُ القراءة ⇒ لا إنشاء)
 * @param {string} input.actor اسمُ الفاعل كما قُرئ من ملفّه الشخصيّ
 * @param {boolean} input.allowed أيسمح الدورُ بفتح جلسةِ استلام؟
 * @returns {{kind:string, id:string, message:string}}
 */
export function deepLinkTarget({
  wanted,
  orders = [],
  openSessions = [],
  sessionsKnown = true,
  actor = '',
  allowed = true,
} = {}) {
  const key = String(wanted ?? '').trim();
  if (!key) return { kind: 'none', id: '', message: '' };
  const k = upper(key);
  const hits = (o) => Boolean(o) && (upper(o.id) === k || upper(o.number) === k);

  const live = (openSessions ?? []).find((s) => hits(s?.order));
  if (live) {
    return {
      kind: 'session',
      id: String(live.id ?? ''),
      message: `جلسةٌ مفتوحةٌ على ${live.order?.number || key} فتحها ${live.openedBy || '—'} — تُتابَع ولا تُفتح ثانيةٌ عليه.`,
    };
  }

  const card = (orders ?? []).find(hits);
  if (!card) {
    return {
      kind: 'missing',
      id: '',
      message: `الأمرُ المطلوب «${key}» ليس في المفتوحة — لعلّه أُغلق أو استُلم كاملًا. افتحه من صندوق المستندات لتقرأ حالتَه.`,
    };
  }

  const name = card.number || key;
  // ★★★ جهلٌ بالجلسات لا يبرّر إنشاءً: `startSession` تُنشئ دائمًا، فلو تعذّرت
  // قراءةُ المفتوحة لَفتح الرابطُ جلسةً ثانيةً على أمرٍ عليه جلسةٌ لم نرَها.
  // والضغطةُ اليدويّةُ تبقى مسموحةً كما كانت — القيدُ على ما يقع بلا يد.
  if (!sessionsKnown) {
    return {
      kind: 'highlight',
      id: String(card.id ?? ''),
      message: `${name} أمامك في القائمة — تعذّرت قراءةُ الجلسات المفتوحة، فاضغطه بنفسك كي لا تُفتح عليه جلسةٌ ثانية.`,
    };
  }
  if (!allowed) {
    return {
      kind: 'highlight',
      id: String(card.id ?? ''),
      message: `${name} أمامك في القائمة — ولا تُفتح جلستُه من الرابط: دورُك لا يملك الاستلام.`,
    };
  }
  if (!String(actor ?? '').trim()) {
    // `openSession` نفسُها تردّ «جلسةٌ بلا فاعلٍ لا تُفتح» — فالإبرازُ أصدقُ من
    // نداءٍ يُردّ، والموظّفُ يضغط بنفسه متى قُرئت هويّتُه.
    return {
      kind: 'highlight',
      id: String(card.id ?? ''),
      message: `${name} أمامك في القائمة — اضغطه للبدء: لم تُقرأ هويّتك بعد.`,
    };
  }
  return { kind: 'order', id: String(card.id ?? ''), message: '' };
}
/* ⟦/deep-link⟧ */

/* ── ‹JR-301› خطّةُ الكمّيّة ────────────────────────────────────────────
 * ★★★ **ترجمةٌ لا حكم.** الحكمُ كلُّه في الخدمات (`packEntryVerdict` ·
 * `convert` · ومن بعدهما `scanVerdict`)، وهذه تختار **أيَّ رقمٍ يُسلَّم** لها
 * ثمّ تقول للموظّف ما سيُقيَّد قبل أن يضغط.
 *
 * ═══ ولماذا تُترجَم الكمّيّة أصلًا؟ ═══
 * `scanVerdict` تشتقّ الوحدةَ من الباركود وحدَه ولا تقبل وحدةً من المستدعي —
 * وذلك صوابٌ لما بُنيت له. فمن مسح باركودَ القطعة وهو يحمل كرتونًا لا يملك
 * وسيلةً ليقول «كرتون» (طلبُ المالك ط‑٥). والمخرجُ الممكن **بلا لمس تلك
 * الطبقة**: أن تُترجَم كمّيّتُه إلى **وحدة الباركود** فيصحّ الأساسُ المحسوب.
 *
 * ⚠️ **وحدُّه معلَنٌ لا مبتلَع**: البندُ يُقيَّد بوحدة الباركود («٣٦ قطعة»)
 * لا بالوحدة التي نطقها («٣ كراتين») — الأساسُ صحيحٌ والتسميةُ ناقصة. وحلُّه
 * التامّ أن تقبل `receivingScan.scanVerdict` وحدةً من المستدعي، وهي خارج
 * نطاق هذه الدفعة. ولذلك يُعرض النصُّ «تُقيَّد …» على الشاشة: ما لا نستطيع
 * إصلاحَه نقوله، ولا يُترك يُكتشف بعد شهر.
 *
 * ═══ ★★ والافتراضُ حرفيّ ═══
 * بلا اختيارٍ (أو باختيارٍ يخصّ صنفًا آخر) تُعاد **عينُ العبارة** التي كانت
 * تُمرَّر قبل هذه الدفعة: `qtyText === '' ? undefined : Number(qtyText)`.
 * فمن لا يلمس شيئًا يعمل كما كان بايتًا ببايت.
 *
 * ⚠️ ومزلقُ الفراغ: `Number('')` صفرٌ محدود، فلولا ردُّه إلى ١ هنا لَصار
 * ضربُ الفراغ صفرًا فرُدَّت القراءة. والواحدُ ليس اختراعًا — هو افتراضُ
 * `scanVerdict` نفسِه («مسحةٌ واحدة = عبوةٌ واحدة»).
 *
 * @param {object} input
 * @param {object|null} input.item صنفُ الباركود الممسوح كما حلّته `resolveScan`
 * @param {string} input.barcodeUom الوحدةُ التي حسمها الباركود — إليها تُترجَم
 * @param {string} input.qtyText نصُّ خانة الكمّيّة كما هو
 * @param {{sku:string, uom:string, label:string, per:string}} input.pick اختيارُ الموظّف
 * @returns {{changed:boolean, qty:number|undefined, note:string, problem:string}}
 */
function scanQtyPlan({ item, barcodeUom, qtyText, pick }) {
  const asIs = {
    changed: false,
    qty: qtyText === '' ? undefined : Number(qtyText),
    note: '',
    problem: '',
  };
  // ★ الاختيارُ **مقيَّدٌ بصنفه**: يبقى بين المسحات كما تبقى الدفعةُ والصلاحية
  // (كرتونةٌ تلو كرتونة من الصنف نفسه)، فإن جاء باركودُ صنفٍ آخر سقط الاختيارُ
  // ولم يُطبَّق. وبغير هذا القيد يُترجَم صنفٌ بمعامل صنفٍ غيرِه صامتًا.
  const sku = upper(item?.sku);
  if (!item || !sku || sku !== upper(pick?.sku)) return asIs;

  const n = qtyText === '' ? 1 : Number(qtyText);

  // ① صنفٌ لا وحدةَ له أصلًا: يُعلَن الوعاءُ ومحتواه، والمعاملُ يُختم على
  // القيد لا على الصنف. والحكمُ كلُّه في `packEntryVerdict` — لا ضربَ هنا.
  if (needsPackEntry(item)) {
    const label = String(pick?.label ?? '').trim();
    const per = String(pick?.per ?? '').trim();
    if (!label && !per) return asIs; // لا إعلانَ فلا ترجمة
    const verdict = packEntryVerdict({
      item,
      containerLabel: label,
      containers: n,
      perContainer: per,
    });
    // ⚠️ وإعلانٌ نصفُ مكتوبٍ **يُوقف بسببه** ولا يمرّ صامتًا: من كتب «صندوق»
    // ونسي محتواه يقصد ضربًا، وتمريرُ ٣ مكانَ ٣٦ فرقُ ألفٍ ومئةٍ بالمئة.
    if (!verdict.ok) return { ...asIs, problem: verdict.problem };
    const { qty, uom, factor, baseQty } = verdict.entry;
    // «قطعة» بنصّ المالك في `packEntry` («ويضرب في عدد القطع») — وهذا الصنفُ
    // بلا وحدةِ أساسٍ أصلًا، فلا اسمَ آخرَ صادقًا يُكتب هنا.
    return {
      changed: true,
      qty: baseQty,
      note: `${qty} ${uom} × ${factor} — تُقيَّد ${baseQty} قطعة`,
      problem: '',
    };
  }

  // ② صنفٌ معرَّفُ الوحدات: قائمتُه ومعاملُ بطاقته. و`convert` تمرّ بالأساس
  // دائمًا وتحمل حارسَ الكسر ورسالةَ «لا معامل» — فلا حسابَ يُكتب هنا.
  const chosen = String(pick?.uom ?? '').trim();
  if (!chosen || chosen === barcodeUom) return asIs; // عينُ ما حسمه الباركود
  const moved = convert(item, n, chosen, barcodeUom);
  if (!moved.ok) {
    return { ...asIs, problem: `وحدةُ الإدخال «${uomLabel(chosen)}» — ${moved.problem}` };
  }
  // `baseQtyPreview` تقول **المعنى** («= ٣٦ قطعة») وهذه تقول **ما يُقيَّد**.
  // وهما يتطابقان حين تكون وحدةُ الباركود هي وحدةَ الأساس — وتكرارُ الجملة
  // نفسِها مرّتين على شاشة هاتفٍ يُعلَّم قارئَها تخطّي السطر، فتُحذف حينها.
  const recorded = `${moved.qty} ${uomLabel(barcodeUom)}`;
  const meaning = baseQtyPreview(item, n, chosen);
  const says = meaning && meaning !== `= ${recorded}` ? ` ${meaning}` : '';
  return {
    changed: true,
    qty: moved.qty,
    note: `${n} ${uomLabel(chosen)}${says} — تُقيَّد ${recorded}`,
    problem: '',
  };
}

export default function ReceivingFlow() {
  const { lang, dir, setLang, tr } = useFieldLang();
  const [me, setMe] = useState(null);
  /*
   * ★★ «قُرئت الهويّة» غيرُ «وُجد فاعل». رابطُ العنوان ينتظر الثلاثةَ قبل أن
   * يحكم (الأوامر · الجلسات · الهويّة)، ولو انتظر `actorName` وحدَه لَانتظر
   * أبدًا من دخل بلا حساب — وشاشةٌ تصمت أمام رابطٍ ضُغط هي العطبُ نفسُه بوجهٍ آخر.
   */
  const [authRead, setAuthRead] = useState(false);
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [session, setSession] = useState(null);
  const [activeDraft, setActiveDraft] = useState('P1');
  const [code, setCode] = useState('');
  const [qty, setQty] = useState('');
  const [batch, setBatch] = useState('');
  const [expiry, setExpiry] = useState('');
  // ‹تتبّع› دفعةُ المورّد وتاريخُ الإنتاج — مطويّتان عمدًا: المسحُ السريع
  // كرتونةً تلو كرتونة لا يحتمل خمسَ خاناتٍ في الشاشة، وهذان يُكتبان مرّةً
  // للدفعة كلِّها لا لكلّ قراءة. ويبقيان بعد الحفظ كما تبقى الدفعةُ والصلاحية.
  const [trace, setTrace] = useState(false);
  const [supplierBatch, setSupplierBatch] = useState('');
  const [mfgDate, setMfgDate] = useState('');
  /*
   * ‹JR-301› اختيارُ الوحدة — يبقى بين المسحات كما تبقى الدفعةُ والصلاحية
   * (كرتونةٌ تلو كرتونة)، **ومقيَّدٌ بصنفه** فلا يتسرّب إلى صنفٍ آخر:
   *   · `uom`         ⟶ للصنف المعرَّف: معرّفُ وحدةٍ من `scanUomChoices`.
   *   · `label`+`per` ⟶ لغير المعرَّف: الوعاءُ كما نطقه الموظّف ومحتواه.
   */
  const [pick, setPick] = useState({ sku: '', uom: '', label: '', per: '' });
  /*
   * آخرُ باركودٍ مُسح — **لتبقى خانةُ الوحدة معروضةً بعد أن يُفرَّغ الحقل.**
   * ⚠️ ومزلقٌ مقيس: الكاميرا وجهازُ الباركود يسلّمان القراءةَ إلى `runScan`
   * مباشرةً ولا تمرّ بالحقل — فبغير هذا لَما رأى مستعملُهما الخانةَ قطّ.
   */
  const [lastCode, setLastCode] = useState('');
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  // ‹LPN-214› طورُ التخزين: 'receiving' | 'putaway'
  const [mode, setMode] = useState('receiving');
  const [queue, setQueue] = useState([]);
  const [queueCapped, setQueueCapped] = useState(false);
  const [task, setTask] = useState(null);
  const [taskUnit, setTaskUnit] = useState(null);
  const [binCode, setBinCode] = useState('');
  const [overrideNote, setOverrideNote] = useState('');
  const [locations, setLocations] = useState([]);
  const [balances, setBalances] = useState([]);
  const seqRef = useRef(0);
  const inputRef = useRef(null);

  const indexes = useMemo(() => buildItemIndexes(items), [items]);
  const actorName = me?.name || me?.displayName || me?.email || '';
  // ‹LPN-511› والمجهولُ يمرّ — منعٌ بُني على جهلٍ بالهويّة أسوأ من سماحٍ يردّه الخادم.
  const recvGate = uiGate(me?.role, 'RECEIVE');
  const putGate = uiGate(me?.role, 'PUTAWAY');

  useEffect(() => subscribeAuth(async (u) => {
    setMe(u ? await fetchUserProfile(u) : null);
    setAuthRead(true);
  }), []);
  useEffect(() => subscribeItems(setItems), []);

  /**
   * ★★ **تصحيح 2026-08-27 — جلسةٌ تضيع بإغلاق الهاتف.**
   *
   * `listOpenSessions` مبنيّةٌ في الخدمة وموسومةٌ بتعليقها «لقائمة *تابع
   * جلسةً* على الهاتف» — **وبلا مستدعٍ واحد**. ومعرّفُ الجلسة كان في حالة
   * المكوّن وحدها، فمن نام هاتفُه أو حدّث الصفحة **فقد جلستَه إلى الأبد**:
   * لا يتابعها ولا يغلقها ولا يتركها. وأسوأ من ذلك: نقرةٌ ثانيةٌ على الأمر
   * **تفتح جلسةً ثانية** عليه (`startSession` تُنشئ دائمًا)، فيمسح عاملان
   * على أمرٍ واحدٍ في جلستين لا ترى إحداهما الأخرى — وهو نقيضُ ما بُني له
   * `listenSession` («جهازان على الجلسة نفسها يريان بعضهما»).
   *
   * فالقائمة تُعرض هنا **قبل** أوامر الشراء: من له جلسةٌ يتابعها، ومن لا
   * فيفتح جديدة — والمفتوحُ ظاهرٌ فلا يُفتح فوقه.
   */
  const [openSessions, setOpenSessions] = useState([]);
  /*
   * ★★ رايةُ «قُرئت القائمة» — و«فارغةٌ» غيرُ «لم تصل بعد». بغيرها لا يفرّق
   * رابطُ العنوان بين الحالتين، فيفتح جلسةً ثانيةً على أمرٍ عليه جلسةٌ لم
   * تصل بعد. وتُرفع في الفشل أيضًا: من تعذّرت قراءةُ جلساته لا يُفتح له من
   * الرابط شيءٌ بل يُبرَز أمرُه ليضغطه بنفسه — الجهلُ لا يبرّر إنشاءً.
   */
  const [sessionsProbe, setSessionsProbe] = useState({ read: false, ok: false });
  const refreshOpenSessions = useCallback(() => {
    listOpenSessions()
      .then((rows) => { setOpenSessions(rows); setSessionsProbe({ read: true, ok: true }); })
      // تعذّرُ القراءة لا يمنع فتح جلسةٍ جديدة **بالضغط** — والرابطُ وحدَه يحتاط.
      .catch(() => { setOpenSessions([]); setSessionsProbe({ read: true, ok: false }); });
  }, []);
  useEffect(() => { if (!sessionId) refreshOpenSessions(); }, [sessionId, refreshOpenSessions]);

  /**
   * الأوامرُ المفتوحة — بطاقتها من `openOrderCard` فما تعرضه القائمة هو ما
   * تقيس عليه الجلسة حرفيًّا.
   *
   * ★★★ **تصحيح 2026-09-03 — منطقٌ يقبل وشاشةٌ لا تعرض.**
   * `sessionOpenProblem` تقبل `PO` **أو** `TR` منذ بنائها، و`fieldRoutes.js`
   * توجّه `TR` إلى هذه الشاشة نفسِها (`RECEIVABLE_TYPES = ['PO','TR']`،
   * وتعليقُها: «طلبُ النقل عند من يقف على صفّه اليوم واردٌ يُستلَم»). وكان
   * الاستماعُ هنا على `['PO']` وحدها — فمن ضغط «ابدأ الاستلام الميدانيّ» على
   * أمر نقلٍ معتمد وصل إلى **قائمةٍ لا أمرَه فيها**: طريقٌ مبنيٌّ ينتهي إلى
   * فراغ، وحدُّه أنّ الموظّف يظنّ أمرَه ضائعًا لا أنّ الشاشة ناقصة.
   *
   * ★ والمرشِّحُ لم يُمسّ: `canReceive` من `sessionOpenProblem` نفسِها، فالنوعُ
   * الذي تردّه الدالّةُ يسقط هنا كما كان — وُسّع البابُ ولم يُوسَّع الحكم.
   *
   * ⚠️ وحدُّ النقل **مُعلَنٌ في الشاشة لا مبتلَع**: جلسةُ `TR` تُستلَم طبالي
   * ولا تُغلق بمذكّرة استلام (`grnProblem` يردّها) — انظر بطاقة الإقفال أسفلَ
   * شاشة المسح.
   *
   * ⚠️ والسقفُ رُفع من ٥٠ إلى ١٠٠ **لأنّ عددَ الأنواع تضاعف**: النافذة تُجلَب
   * بالنوع لا بالحالة، والترشيحُ بـ`canReceive` يقع **بعدها**. فلو بقيت ٥٠
   * لَابتلعتها أوامرُ نقلٍ منتهيةٌ فاختفى أمرُ شراءٍ مفتوح من القائمة بلا
   * كلمة. ويبقى حدٌّ معلوم: بلوغُ السقف لا يُعلَن هنا (بخلاف قائمة التخزين
   * وسقفِها المُعلَن) — قائمةٌ ناقصةٌ تبدو كاملة.
   */
  const [rawOrders, setRawOrders] = useState([]);
  useEffect(() => listenDocumentsByTypes(['PO', 'TRN'], (docs) => {
    setRawOrders(docs);
    // البطاقة من `openOrderCard` — فما تعرضه القائمة هو ما تقيس عليه
    // الجلسة، والمحجوب يُسقَط بسببه المحسوب لا بظنّ الواجهة.
    setOrders(docs.map((d) => openOrderCard(d, [], [])).filter((c) => c.canReceive));
    setLoading(false);
  }, 100), []);

  useEffect(() => {
    if (!sessionId) return undefined;
    return listenSession(sessionId, setSession);
  }, [sessionId]);

  const totals = useMemo(() => (session ? sessionTotals(session) : null), [session]);
  // معاينةُ المستند قبل توليده — مستندٌ ماليٌّ يُنشأ بلا أن يُرى محتواه
  // توقيعٌ على المجهول (grnBridge).
  const grn = useMemo(() => (session ? grnPreview(session) : null), [session]);
  /**
   * أجلسةُ نقلٍ هذه؟ — **عرضٌ لا حَكَم.**
   *
   * الحكمُ كلُّه في `grnProblem` ويصل الشاشةَ عبر `grn.problem`؛ وهذه لا تقرّر
   * أيجوز التوليدُ أم لا، وإنّما تختار **أيَّ طريقٍ يُعرض** لمن وقف أمام رفضٍ
   * صحيح: أمرُ النقل مخرجُه `TRC` لا `GRN`، فلا يُترك بلا وجهة.
   */
  const isTransfer = session?.order?.type === 'TR';
  const draft = useMemo(
    () => (session?.drafts ?? []).find((d) => d.ref === activeDraft) ?? null,
    [session, activeDraft]
  );
  /**
   * ما الذي يمنع إغلاق الجلسة الآن؟ — من `sessionCloseProblem` الخالصة نفسها
   * التي تمنعه في الخدمة. فالزرّ المعروض هو الزرّ الذي سينجح، ولا يُعرض
   * للعامل زرٌّ يُردّ عنه.
   */
  const closeProblem = useMemo(() => (session ? sessionCloseProblem(session) : ''), [session]);

  /**
   * ‹JR-301› الصنفُ الذي تُبنى عليه خانةُ الوحدة: ما في الحقل الآن، وإلّا
   * آخرُ ما مُسح. و`resolveScan` هي عينُها التي يسألها الحكمُ عند القراءة —
   * فما تعرضه الخانةُ هو ما سيحسمه المسح، لا تقليدٌ له يفترق عنه يومًا.
   */
  const pickTarget = useMemo(() => {
    const c = String(code).trim() || lastCode;
    return c ? resolveScan(c, indexes) : null;
  }, [code, lastCode, indexes]);

  /** خطّةُ الكمّيّة كما ستُسلَّم — تُعرض **قبل** الضغط لا تُكتشف بعده. */
  const pickPlan = useMemo(
    () => scanQtyPlan({
      item: pickTarget?.item ?? null,
      barcodeUom: pickTarget?.uom ?? '',
      qtyText: qty,
      pick,
    }),
    [pickTarget, qty, pick]
  );

  /**
   * ‹JR-201› «البند ٣ (شامبو)» — ترقيمُ **عرضٍ** لا هويّة: `lineId` معرّفٌ
   * لا يقرؤه أحدٌ عند الشاحنة، والواقفُ يرى بندًا ثالثًا في القائمة أمامه.
   */
  const grnLineTag = useMemo(() => {
    const m = new Map();
    (grn?.lines ?? []).forEach((l, i) => m.set(l.lineId, `البند ${i + 1} (${l.description || l.sku})`));
    return m;
  }, [grn]);

  /**
   * ‹JR-105› أصحابُ مراحل مذكّرة الاستلام — «إلى من يذهب المستندُ بعدك».
   *
   * ★ وهي عن **النوع** لا عن حالة مستندٍ بعينه: مذكّرةٌ وُلدت أمس قد تكون
   * اعتُمدت اليوم، والجلسةُ لا تحمل إلّا رقمَها — فقولُ «تنتظر اعتمادها»
   * عنها خبرٌ لا نملك ما يثبته. و«يعتمدها فلان» صحيحٌ في الحالين.
   */
  const grnOwnerLines = useMemo(
    () => ['approve', 'complete'].map((s) => stageOwnerLine('GRN', s)).filter(Boolean),
    []
  );

  /**
   * ‹JR-105› ومن ينتظر كلَّ أمرٍ في القائمة الآن — من `nextOwnerOf` وحدَها.
   * وبطاقةُ `openOrderCard` تحمل `type` و`state` أصلًا، فلا يُقرأ الخام.
   */
  const orderOwnerLines = useMemo(
    () => new Map(orders.map((o) => [o.id, nextOwnerOf(o).line])),
    [orders]
  );

  /**
   * ★ **تصحيح 2026-08-27 — «قارئ الباركود لا يقرأ» في تطبيق الطبالي:**
   * هذه الشاشة لم يكن فيها كاميرا إطلاقًا، وحقلُ القراءة كان `inputMode="none"`
   * — أي أنّ لوحة مفاتيح الهاتف **لا تفتح** عليه. فمن دخل بهاتفٍ بلا جهاز
   * باركودٍ ملحق لم يكن يستطيع لا مسحًا ولا كتابةً: حقلٌ لا يُدخَل فيه شيء.
   *
   * الآن ثلاث طرقٍ تعمل: الكاميرا (المحرّك الموحّد) · جهازُ الباركود مسموعًا
   * في الشاشة كلّها · الكتابةُ بلوحة المفاتيح. والعدسة **تبقى مفتوحة** بعد
   * القراءة لأنّ العمل هنا كرتونةٌ تلو كرتونة.
   */
  /*
   * ‹LPN-214› والقراءةُ **تتبع الطور**: في التخزين الممسوحُ كودُ رفٍّ لا
   * كودُ صنف. فلو ذهبت كلُّ قراءةٍ إلى `runScan` لَبحث النظامُ عن صنفٍ اسمُه
   * «MAIN-A01-R01-B01» وردَّه غريبًا — والعاملُ يرى رفضًا بلا سبب.
   */
  const onScanned = (c) => {
    if (mode === 'putaway') { setBinCode(normalizeScanned(c)); return; }
    runScan(c);
  };

  const camera = useBarcodeCamera({ onCode: onScanned });
  // ★ والجهازُ يُسمع في طور التخزين أيضًا: العاملُ عند الرفّ يمسح ولا يكتب.
  useWedgeScanner(onScanned, {
    enabled: draft?.state === 'SCANNING' || (mode === 'putaway' && Boolean(taskUnit)),
  });

  /**
   * رسالةُ الوميض — ومعها **رابطٌ بنيويّ** اختياريّ `{href,label}`.
   *
   * ★★ ولماذا حقلٌ في الحالة لا عقدةُ React تُمرَّر ولا HTML يُحقن؟
   * — `dangerouslySetInnerHTML` مردودٌ من أصله: النصُّ يحمل رقمَ مستندٍ آتيًا
   *   من الخادم، وحقنُه وسمًا يفتح بابًا لا حاجةَ إليه أصلًا.
   * — وعقدةُ React في `useState` تربط الرسالةَ **بلحظة إنشائها**: صنفُها
   *   واتّجاهُها ولغتُها تُجمَّد يوم النداء، فمن بدّل اللغة بقيت رسالتُه
   *   بالسابقة. والبيانات `{href,label}` تعرضها `Flash` بأسلوبها هي.
   *
   * ⚠️ ومستدعو الوسيطين لا يتغيّر سلوكُهم حرفًا: `link` غائبٌ ⇒ لا رابطَ يُرسم.
   */
  const say = useCallback((kind, text, link = null) => {
    setFlash({ kind, text, link });
    // الصوت والاهتزاز من **نتيجة الحكم** لا من ظنّ الواجهة (خطة ٧ ثانيًا).
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(kind === 'ok' ? 40 : [80, 60, 80]);
    }
  }, []);

  /* ── ★★★ الأمرُ الذي جاء من العنوان — آخرُ مترٍ في الرحلة ───────────
   * `?doc=<معرّف المستند>` يُقرأ مرّةً عند الفتح ثمّ يُنظَّف من الشريط. والحكمُ
   * كلُّه في `deepLinkTarget` أعلاه — وهذه تنفّذه ولا تعيد بناءه.
   *
   * ⚠️ **والثلاثةُ تُنتظر ولا تُخمَّن**: الأوامرُ (`loading`) والجلساتُ المفتوحة
   * والهويّة. فالحكمُ على قائمةٍ نصفِ واصلةٍ يقول «ليس في المفتوحة» عن أمرٍ لم
   * يصل بعد، أو يفتح جلسةً ثانيةً على أمرٍ عليه جلسةٌ لم تُقرأ. وكلُّ راياتها
   * تحسم حتمًا (نجاحًا أو فشلًا) فلا انتظارَ صامتٌ إلى الأبد.
   *
   * ★ ومرّةً واحدة (`linkDone`): بعدها يعيش الموظّفُ في الشاشة كما دخلها،
   * فلا يردّه وصولُ جلسةٍ متأخّرةٍ إلى قرارٍ اتُّخذ.
   */
  const [wantedDoc, setWantedDoc] = useState(
    () => (typeof window === 'undefined' ? '' : docParamOf(window.location.search))
  );
  /** الأمرُ الذي جاء من الرابط ولم يُفتح — يُبرَز في القائمة فلا يُبحث عنه. */
  const [linkedOrder, setLinkedOrder] = useState('');
  const linkDone = useRef(false);

  useEffect(() => {
    if (!wantedDoc || linkDone.current) return;
    if (loading || !sessionsProbe.read || !authRead) return;
    linkDone.current = true;

    const target = deepLinkTarget({
      wanted: wantedDoc,
      orders,
      openSessions,
      sessionsKnown: sessionsProbe.ok,
      actor: actorName,
      // ★ عينُ ما يعطّل زرَّ الصفّ — العنوانُ لا يفعل ما يمنعه الضغط.
      allowed: recvGate.allowed,
    });
    if (target.kind === 'session') {
      setSessionId(target.id);
      setActiveDraft('P1');
      say('ok', target.message);
    } else if (target.kind === 'order') {
      setLinkedOrder(target.id);
      begin(orders.find((o) => o.id === target.id));
    } else if (target.kind !== 'none') {
      // مطابقٌ يحتاج ضغطةً، أو غيرُ مطابقٍ — وكلاهما **يُقال** ولا يُصمت عنه.
      setLinkedOrder(target.id);
      say(target.kind === 'missing' ? 'err' : 'ok', target.message);
    }

    // ونمطُ التنظيف نمطُ `ScanFlow.jsx` و`PickingFlow.jsx` حرفًا لا نمطٌ ثانٍ:
    // بغيره تُعيد كلُّ إعادةِ تحميلٍ الموظّفَ إلى أمرٍ تركه بقصد.
    setWantedDoc('');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('doc');
      window.history.replaceState({}, '', url);
    }
  }, [wantedDoc, loading, sessionsProbe, authRead, orders, openSessions, actorName, recvGate.allowed, say]);

  /* ── ‹LPN-214› طورُ التخزين ─────────────────────────────────────
   * المواقعُ والأرصدةُ تُقرأ **في هذا الطور وحده**: شاشةُ الاستلام تُفتح
   * للمسح في أغلب الأحيان، واستماعان دائمان ثمنٌ بلا مقابل على الهاتف. */
  useEffect(() => {
    if (mode !== 'putaway') return undefined;
    const off = [
      listenLocations(setLocations, () => setLocations([])),
      listenBalances(setBalances, () => setBalances([])),
    ];
    return () => off.forEach((f) => typeof f === 'function' && f());
  }, [mode]);

  const refreshQueue = useCallback(async () => {
    try {
      const { units, capped } = await listPutawayQueue({ max: 100 });
      setQueue(units);
      setQueueCapped(capped);
    } catch {
      setQueue([]);
      setQueueCapped(false);
      say('err', 'تعذّرت قراءة قائمة التخزين — تحقّق من الاتّصال.');
    }
  }, [say]);

  useEffect(() => { if (mode === 'putaway') refreshQueue(); }, [mode, refreshQueue]);

  // البندُ الممثّل للطبلية — الاقتراحُ يُحسب على صنفٍ واحد، والمختلطة على
  // أوّلها كما تنصّ `openPutawayTask`.
  const taskItem = useMemo(() => {
    const sku = taskUnit?.lines?.[0]?.sku;
    return sku ? (indexes?.bySku?.get?.(String(sku).toUpperCase()) ?? null) : null;
  }, [taskUnit, indexes]);

  // حكمُ الرفّ الممسوح — **معاينةٌ حيّة بلا كتابة**، فيرى العامل الرفض
  // قبل أن يضغط لا بعده.
  const binVerdict = useMemo(() => {
    if (!taskUnit || !binCode.trim()) return null;
    return previewBin(taskUnit, binCode, { locations, balances, item: taskItem });
  }, [taskUnit, binCode, locations, balances, taskItem]);

  async function pickTask(unit) {
    if (!actorName) { say('err', 'لم تُقرأ هويّتك بعد — أعد تحميل الصفحة.'); return; }
    setBusy(true);
    try {
      const r = await openTask(unit.code, { locations, balances, item: null, actor: actorName });
      if (r.problem) { say('err', r.problem); return; }
      setTask(r.task);
      setTaskUnit(r.unit);
      setBinCode('');
      setOverrideNote('');
      say('ok', r.task.suggestedBin
        ? `المقترح: ${r.task.suggestedBin} — امسح الرفّ الذي وضعتها فيه فعلًا.`
        : 'لا مقترحَ لهذه الطبلية — امسح الرفّ الذي وضعتها فيه.');
    } catch (e) {
      say('err', e?.message || 'تعذّر فتح المهمّة.');
    } finally { setBusy(false); }
  }

  async function finishPutaway(e) {
    e?.preventDefault?.();
    if (!taskUnit || !binCode.trim()) return;
    setBusy(true);
    try {
      const r = await executePutaway(taskUnit.code, binCode, {
        actor: actorName, overrideNote, locations, balances, item: taskItem,
      });
      if (r.problem) { say('err', r.problem); return; }
      say('ok', `${taskUnit.code} → ${r.move.toBin}${r.move.offSuggestion ? ' (خالفت المقترح — سُجّل السبب)' : ''}`);
      setTask(null);
      setTaskUnit(null);
      setBinCode('');
      setOverrideNote('');
      await refreshQueue();
    } catch (err) {
      say('err', err?.message || 'تعذّر إتمام التخزين.');
    } finally { setBusy(false); }
  }

  async function begin(orderCard) {
    if (!actorName) { say('err', 'لم تُقرأ هويّتك بعد — أعد تحميل الصفحة.'); return; }
    setBusy(true);
    try {
      const full = rawOrders.find((d) => d.id === orderCard.id);
      if (!full) throw new Error('تعذّر العثور على الأمر — أعد تحميل الصفحة.');
      const progress = documentLineProgress(full, [], []);
      const { id } = await startSession(full, progress, { actor: actorName, warehouse: orderCard.warehouse, device: 'WEB' });
      setSessionId(id);
      setActiveDraft('P1');
      say('ok', `فُتحت جلسة على ${orderCard.number} — امسح أوّل صنف.`);
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (e) {
      say('err', e?.message || 'تعذّر فتح الجلسة.');
    } finally {
      setBusy(false);
    }
  }

  function submitScan(e) {
    e?.preventDefault?.();
    return runScan(code);
  }

  /**
   * مسارُ قراءةٍ واحدٌ لطرق الإدخال الثلاث: الكاميرا · جهاز الباركود ·
   * الكتابة. فالحكم واحدٌ مهما كان الباب — ولا فرعَ يختلف بصمتٍ عن أخيه.
   */
  async function runScan(rawInput) {
    const raw = normalizeScanned(rawInput);
    if (!raw || busy) return;
    /*
     * ‹JR-301› الترجمةُ تقع على **الباركود الممسوح** لا على ما في الحقل:
     * الكاميرا وجهازُ الباركود لا يمرّان بالحقل، ولو بُنيت على `pickTarget`
     * لَترجمت قراءةَ صنفٍ بمعامل صنفٍ آخر. و`resolveScan` نداءٌ خالصٌ رخيص.
     */
    const scanned = resolveScan(raw, indexes);
    setLastCode(raw);
    const plan = scanQtyPlan({ item: scanned.item, barcodeUom: scanned.uom, qtyText: qty, pick });
    // إعلانٌ ناقصٌ يُوقف **بسببه المسمّى** قبل أن يُشغَل شيء — ولا يمرّ برقمٍ
    // يخالف ما قصده الموظّف. (و`busy` لم يُرفع بعدُ فلا شيءَ يُنزَّل.)
    if (plan.problem) { say('err', plan.problem); return; }
    setBusy(true);
    try {
      seqRef.current += 1;
      const r = await scanIntoDraft(
        sessionId,
        activeDraft,
        // ★ بلا اختيارٍ `plan.qty` **عينُ** `qty === '' ? undefined : Number(qty)`.
        { barcode: raw, qty: plan.qty, batch, expiry, supplierBatch, mfgDate },
        { indexes, actor: actorName, device: 'WEB', seq: seqRef.current }
      );
      if (r.ok) {
        say('ok', `قُبلت: ${raw}`);
        setCode(''); setQty(''); // الدفعة والصلاحية تبقيان — الكرتونة تلو الكرتونة من دفعةٍ واحدة
      } else {
        say(r.needsSupervisor ? 'warn' : 'err', r.message);
      }
    } catch (err) {
      say('err', err?.message || 'تعذّرت القراءة.');
    } finally {
      setBusy(false);
      // حقل القراءة يبقى نشطًا بلا لمسٍ بعد كلّ مسحة (متطلّب خطة ٧).
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }

  async function closeDraft() {
    setBusy(true);
    try {
      await closeDraftToGovernance(sessionId, activeDraft, { actor: actorName });
      say('ok', `رُفعت الطبلية ${activeDraft} للحوكمة — لا قراءة عليها بعد الآن.`);
    } catch (e) {
      say('err', e?.message || 'تعذّر الإغلاق.');
    } finally { setBusy(false); }
  }

  async function newDraft() {
    setBusy(true);
    try {
      const ref = await addDraft(sessionId);
      setActiveDraft(ref);
      say('ok', `فُتحت طبلية ${ref}.`);
    } catch (e) {
      say('err', e?.message || 'تعذّر فتح طبلية.');
    } finally { setBusy(false); }
  }

  /**
   * توليدُ الاستلام الرسميّ — والرسالةُ تحمل **طريقًا** لا رقمًا وحده.
   *
   * ★ 2026-09-03: `r.docId` بيدنا لحظتَها، وكانت تُهمَل ويُقال «اعتمده من
   * صندوق المستندات» — بحثٌ يدويٌّ في صندوقٍ عامّ عن مستندٍ نعرف معرّفَه.
   * ومن تعذّر معرّفُه (مستندٌ وُلد بلا `id` مقروء) لا يُرسم له رابطٌ ميّت.
   */
  async function makeGrn() {
    setBusy(true);
    try {
      const r = await createGrnFromSession(sessionId, { profile: me });
      say(
        'ok',
        `تولّد الاستلام ${r.number || r.docId} مسوّدةً — يُعتمد ثمّ يُنجَز ليتحرّك الرصيد.`,
        r.docId ? { href: docHref('GRN', r.docId), label: 'افتح المستند ←' } : null
      );
    } catch (e) {
      say('err', e?.message || 'تعذّر توليد الاستلام.');
    } finally { setBusy(false); }
  }

  /**
   * تركُ جلسةٍ لم تُنتج شيئًا — بسببٍ إلزاميٍّ يبقى في السجلّ.
   *
   * ★ والسبب **مطلوبٌ لا مقترَح**: جلسةٌ فُتحت ثمّ تُركت سؤالٌ تشغيليّ (وصلت
   * الشاحنة فارغة؟ · الأمر خطأ؟ · تعطّل الجهاز؟)، وإسقاطُه يجعل الجلسات
   * المتروكة رقمًا بلا معنى في أيّ قياسٍ لاحق.
   */
  async function leaveWithReason() {
    const reason = typeof window !== 'undefined'
      ? window.prompt(`${closeProblem}

لماذا لم تُنتج هذه الجلسة شيئًا؟ (سببٌ إلزاميّ)`)
      : '';
    if (reason === null) return;
    setBusy(true);
    try {
      await leaveSession(sessionId, { reason, actor: actorName });
      say('ok', 'تُركت الجلسة والسببُ في السجلّ — والمفتوح يبقى على الأمر لجلسةٍ لاحقة.');
      setSessionId(''); setSession(null);
    } catch (e) {
      say('err', e?.message || 'تعذّر ترك الجلسة.');
    } finally { setBusy(false); }
  }

  async function endSession() {
    setBusy(true);
    try {
      await finishSession(sessionId, { actor: actorName });
      say('ok', 'أُغلقت الجلسة — والمتبقّي المفتوح يبقى على الأمر لجلسةٍ لاحقة.');
      setSessionId(''); setSession(null);
    } catch (e) {
      say('err', e?.message || 'تعذّر الإغلاق.');
    } finally { setBusy(false); }
  }

  if (loading) return <div className="o_theme"><p className="text-ink-2 text-sm">جارٍ قراءة أوامر الشراء…</p></div>;

  // ── ‹LPN-214› طورُ التخزين ──
  // آخرُ خطوةٍ في الاستلام لا شاشةٌ رابعة (ح-٤): العاملُ نفسه، والجهازُ
  // نفسه، والحمولةُ التي مسحها قبل قليل.
  if (mode === 'putaway') {
    return (
      <div className="o_theme" dir={dir}>
        <FieldLangSwitch lang={lang} setLang={setLang} />
        <ModeSwitch mode={mode} setMode={setMode} disabled={busy} tr={tr} />
        <RoleGate gate={putGate} />
        {flash && <Flash flash={flash} />}

        {!taskUnit ? (
          <>
            <h2 className="text-lg font-bold text-ink mb-1">{tr('awaiting_putaway')} ({queue.length})</h2>
            <p className="text-ink-2 text-xs mb-3">
              {tr('awaiting_putaway_hint')}
              {queueCapped && ` ⚠ ${tr('cap_reached')}`}
            </p>
            {queue.length === 0 ? (
              <p className="text-ink-2 text-sm">{tr('no_pallet_waiting')}</p>
            ) : (
              <ul className="space-y-2">
                {queue.map((u) => (
                  <li key={u.code}>
                    <button
                      type="button"
                      disabled={busy || !putGate.allowed}
                      onClick={() => pickTask(u)}
                      className="w-full text-right rounded-lg border px-4 py-4"
                      style={{ borderColor: 'var(--o-border)' }}
                    >
                      <div className="font-bold text-ink tabular-nums">{u.code}</div>
                      <div className="text-ink-2 text-xs mt-1">
                        {u.warehouse || '—'} · {(u.lines ?? []).length} بندًا
                        {(u.flags ?? []).length > 0 && ' · ⚑ موسومة'}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <div className="rounded-lg border px-4 py-3 mb-3" style={{ borderColor: 'var(--o-border)' }}>
              <div className="font-bold text-ink tabular-nums">{taskUnit.code}</div>
              <div className="text-ink-2 text-xs mt-1">
                {taskUnit.warehouse || '—'} · {(taskUnit.lines ?? []).length} بندًا
              </div>
              <div className="text-sm mt-2 text-ink">
                المقترح: <strong className="tabular-nums">{task?.suggestedBin || '— لا مقترح'}</strong>
              </div>
              {(task?.suggestions ?? []).length > 1 && (
                <div className="text-ink-2 text-xs mt-1">
                  وبدائلُه: {task.suggestions.slice(1).map((c) => c.code).join(' · ')}
                </div>
              )}
              {task?.suggestProblem && (
                <div className="text-ink-2 text-xs mt-1">{task.suggestProblem}</div>
              )}
              {/* ★ المرفوضُ يُعرض بسببه لا يُخفى — قرارُ `putawaySuggest`
                  المعلن: عاملٌ يرى لماذا رُفض رفٌّ يختار البديل بعلم. */}
              {(task?.rejectedBins ?? []).length > 0 && (
                <details className="mt-2">
                  <summary className="text-ink-2 text-xs cursor-pointer">
                    ورفوفٌ استُبعدت ({task.rejectedBins.length}) — ولماذا
                  </summary>
                  <ul className="mt-1 space-y-1">
                    {task.rejectedBins.slice(0, 6).map((r) => (
                      <li key={r.code ?? r.bin ?? JSON.stringify(r)} className="text-ink-2 text-xs">
                        <span className="tabular-nums">{r.code ?? r.bin}</span> — {r.reason ?? '—'}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <p className="text-ink-2 text-xs mt-2">
                الاقتراحُ اقتراحٌ لا أمر — امسح الرفّ الذي وضعتها فيه <strong>فعلًا</strong>.
              </p>
            </div>

            <form onSubmit={finishPutaway}>
              {/* ‹LPN-214› الطرقُ الثلاث نفسها كما في المسح: كاميرا · جهازُ
                  باركودٍ مسموعٌ في الشاشة · كتابة. ولا `inputMode="none"` —
                  هي التي كانت تمنع لوحة المفاتيح فيصير الحقل مسدودًا. */}
              <div className="flex gap-2 mb-2">
                <input
                  value={binCode}
                  onChange={(e) => setBinCode(e.target.value)}
                  placeholder={tr('scan_bin')}
                  className="flex-1 rounded-lg border px-4 py-4 text-lg"
                  style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface)', direction: 'ltr', textAlign: 'center' }}
                  autoFocus
                  autoComplete="off"
                  enterKeyHint="go"
                />
                <ScanCameraButton camera={camera} compact />
              </div>
              <ScanCameraPanel camera={camera} hint="وجّه العدسة إلى ملصق الرفّ." />

              {binVerdict && !binVerdict.ok && (
                <div
                  className="rounded-lg border px-4 py-3 text-sm mb-2"
                  style={{ borderColor: 'var(--o-danger, #b42318)' }}
                >
                  {binVerdict.message}
                </div>
              )}
              {binVerdict?.ok && binVerdict.message && (
                <div className="rounded-lg border px-4 py-3 text-sm mb-2" style={{ borderColor: 'var(--o-border)' }}>
                  {binVerdict.message}
                </div>
              )}

              {/* ★ «يمرّ بسبب» لا «ممنوع» — درس LOC: العامل يرى ما لا يراه
                  النظام، والسببُ يُقيَّد باسمه لا يُتجاوَز صامتًا. */}
              {binVerdict && !binVerdict.ok && binVerdict.canOverride && (
                <input
                  value={overrideNote}
                  onChange={(e) => setOverrideNote(e.target.value)}
                  placeholder="سببُ التخزين هنا رغم التحذير — يُقيَّد باسمك"
                  className="w-full rounded-lg border px-4 py-3 text-sm mb-2"
                  style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface)' }}
                />
              )}

              <button
                type="submit"
                className="btn btn-primary w-full py-3"
                disabled={!putGate.allowed || busy || !binCode.trim() || (binVerdict && !binVerdict.ok && !binVerdict.canOverride)}
              >
                {tr('confirm_putaway')}
              </button>
              <button
                type="button"
                className="btn btn-secondary w-full py-2 mt-2"
                disabled={busy}
                onClick={() => { setTask(null); setTaskUnit(null); setBinCode(''); setOverrideNote(''); }}
              >
                {tr('back_to_list')}
              </button>
            </form>
          </>
        )}
      </div>
    );
  }

  // ── اختيار الأمر ──
  if (!sessionId) {
    return (
      <div className="o_theme" dir={dir}>
        <FieldLangSwitch lang={lang} setLang={setLang} />
        <ModeSwitch mode={mode} setMode={setMode} disabled={busy} tr={tr} />
        <RoleGate gate={recvGate} />
        {flash && <Flash flash={flash} />}

        {openSessions.length > 0 && (
          <div className="mb-5">
            <h2 className="text-lg font-bold text-ink mb-1">جلساتٌ مفتوحة ({openSessions.length})</h2>
            <p className="text-ink-2 text-xs mb-2">
              تابعْ جلستك بدل فتح ثانيةٍ على الأمر نفسه — فجلستان على أمرٍ واحد لا ترى إحداهما الأخرى.
            </p>
            <ul className="space-y-2">
              {openSessions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => { setSessionId(s.id); setActiveDraft('P1'); }}
                    className="w-full text-right rounded-lg border px-4 py-3"
                    style={{ borderColor: 'var(--o-primary)', background: 'var(--o-surface)' }}
                  >
                    <div className="font-bold text-ink">{s.order?.number || '—'}</div>
                    <div className="text-ink-2 text-xs">
                      فتحها {s.openedBy || '—'} · {(s.pallets ?? []).length} طبليةً · {s.warehouse || '—'}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ★★ العنوانُ يشمل النقلَ لأنّ القائمة صارت تشمله — وعنوانٌ يعد
            بالشراء وحده فوق قائمةٍ فيها أمرُ نقلٍ يكذب **بثلاث لغات**.
            ومفتاحٌ جديد (`open_orders`) لا توسيعُ `open_pos`: اسمُ المفتاح
            عهدٌ، ومن يستعمله غدًا لقائمةِ شراءٍ محضةٍ يجده كما تركه. */}
        <h2 className="text-lg font-bold text-ink mb-3">{tr('open_orders')} ({orders.length})</h2>
        {orders.length === 0 ? (
          <p className="text-ink-2 text-sm">
            لا أمرَ شراءٍ ولا نقلٍ معتمدًا له رصيدٌ مفتوح. اعتمد أمرًا من{' '}
            {/* ★ «اذهب» بلا طريقٍ ليست إرشادًا — والصندوقُ صفحةٌ قائمة. */}
            <a href={inboxHref} className="o_field_link decoration-bf">صندوق المستندات</a>{' '}
            ثمّ عُد.
          </p>
        ) : (
          <ul className="space-y-2">
            {orders.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  disabled={busy || !recvGate.allowed}
                  onClick={() => begin(o)}
                  className="w-full text-right rounded-lg border px-4 py-4"
                  /* ★ الأمرُ الذي جاء من الرابط ولم يُفتح **يُبرَز**: الرسالةُ
                     وحدَها تقول اسمًا في قائمةٍ من خمسين، والحدُّ أن يبقى البحثُ
                     بالعين. والإبرازُ لونُ الجلسات المفتوحة نفسُه — لا لونَ ثالث. */
                  style={{ borderColor: linkedOrder === o.id ? 'var(--o-primary)' : 'var(--o-border)' }}
                >
                  {/* ★ ولا شارةَ نوعٍ زائدة: الرقمُ يحمل نوعَه أصلًا
                      (`formatNumber` ⇒ «TR-2026-0007»)، فالنقلُ يُقرأ من رقمه.
                      ⚠️ وأمرُ النقل بلا مورّد فيقرأ الحقلُ «—» — نقصٌ معلومٌ
                      لأنّ `openOrderCard` لا تُخرج طرفَي النقل، وتوسيعُها
                      يمسّ منطقًا مشتركًا فتُرك لمن يملكه. */}
                  <div className="font-bold text-ink">{o.number}</div>
                  <div className="text-ink-2 text-xs mt-1">
                    {o.supplier || '—'} · {o.warehouse || '—'} · {o.lineCount} صنفًا
                  </div>
                  <div className="text-ink-2 text-xs mt-1">
                    المطلوب {o.ordered} · المستلم {o.received} · <strong className="text-ink">المفتوح {o.open}</strong>
                  </div>
                  {/* ‹JR-105› «كلُّ مرحلةٍ مربوطةٌ بشخصٍ ما» — والسطرُ من
                      `nextOwnerOf` نفسِها لا صياغةً لها. والمجهولُ يمرّ صامتًا
                      (سطرٌ فارغ) فلا نكتب في شاشةِ موظّفٍ خبرًا عمّا نجهل. */}
                  {orderOwnerLines.get(o.id) && (
                    <div className="text-ink-2 text-xs mt-1">{orderOwnerLines.get(o.id)}</div>
                  )}
                  {/* ولمَ أُبرِز؟ — سطرٌ يقوله، فلا يقف أمام لونٍ يخمّن معناه. */}
                  {linkedOrder === o.id && (
                    <div className="text-ink text-xs mt-1 font-bold">الأمرُ الذي جئتَ من رابطه</div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // ── المسح ──
  return (
    <div className="o_theme" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <div className="font-bold text-ink">{session?.order?.number}</div>
          <div className="text-ink-2 text-xs">{session?.supplier} · {session?.warehouse}</div>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary text-sm" onClick={newDraft} disabled={busy}>{tr('new_pallet')}</button>
          {/*
            ★ **تصحيح 2026-08-27 — طريقٌ مسدود:** كان هنا زرُّ الإنهاء وحده،
            فمن فتح جلسةً بالخطأ ولم يمسح فيها شيئًا يُردّ بـ«اتركها بسببٍ
            مكتوب» — **ولا زرَّ يفعل ذلك**، فتبقى جلستُه مفتوحةً إلى الأبد.
            و`leaveSession` مبنيّةٌ في الخدمة منذ م٥ وبلا مستدعٍ واحد.
            والزرّ يظهر **بحكم `sessionCloseProblem` نفسه** الذي يمنع الإغلاق،
            فلا تختلف الواجهة عن الحَكَم.
          */}
          {closeProblem ? (
            <button type="button" className="btn btn-secondary text-sm" onClick={leaveWithReason} disabled={busy}>
              ترك الجلسة بسبب
            </button>
          ) : (
            <button type="button" className="btn btn-secondary text-sm" onClick={endSession} disabled={busy}>{tr('end_session')}</button>
          )}
        </div>
      </div>

      {totals && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Stat label="المفتوح" value={totals.open} />
          <Stat label="المقروء" value={totals.received} />
          <Stat label="المتبقّي" value={totals.remaining} />
        </div>
      )}

      {flash && <Flash flash={flash} />}

      <div className="flex flex-wrap gap-2 mb-3">
        {(session?.drafts ?? []).map((d) => (
          <button
            key={d.ref}
            type="button"
            onClick={() => setActiveDraft(d.ref)}
            className={d.ref === activeDraft ? 'btn btn-primary text-sm' : 'btn btn-secondary text-sm'}
          >
            {d.ref} ({(d.lines ?? []).length})
            {d.state !== 'SCANNING' && ' ✓'}
          </button>
        ))}
      </div>

      {draft?.state === 'SCANNING' ? (
        <form onSubmit={submitScan} className="mb-4">
          <div className="flex gap-2 mb-2">
            <input
              ref={inputRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="امسح الباركود أو اكتبه"
              className="flex-1 rounded-lg border px-4 py-4 text-lg"
              style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface)', direction: 'ltr', textAlign: 'center' }}
              autoFocus
              autoComplete="off"
              enterKeyHint="go"
              /* ⚠ لا `inputMode="none"`: كانت تمنع لوحة مفاتيح الهاتف من الفتح،
                 فحقلٌ لا يُكتب فيه ولا كاميرا بجانبه = «الماسح لا يقرأ». */
            />
            <ScanCameraButton camera={camera} compact />
          </div>
          <ScanCameraPanel camera={camera} hint="وجّه العدسة إلى الباركود — تبقى مفتوحةً كرتونةً تلو كرتونة." />
          {/* ‹JR-301 · ط‑٥› اختيارُ الوحدة **فوق** ما حسمه الباركود لا بدلًا
              منه: الافتراضُ المختار وحدةُ الباركود، فمن لا يغيّر شيئًا يعمل
              كما كان اليوم حرفًا — والخانةُ لا تظهر أصلًا حيث لا خيار. */}
          <UomPicker
            item={pickTarget?.item ?? null}
            barcodeUom={pickTarget?.uom ?? ''}
            pick={pick}
            setPick={setPick}
            plan={pickPlan}
          />
          <div className="grid grid-cols-3 gap-2 mb-2">
            <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="الكمّيّة (١)" type="number" min="0" step="any"
              className="rounded-lg border px-3 py-3 text-sm" style={{ borderColor: 'var(--o-border)' }} />
            <input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="الدفعة"
              className="rounded-lg border px-3 py-3 text-sm" style={{ borderColor: 'var(--o-border)' }} />
            <input value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="الصلاحية" type="date"
              className="rounded-lg border px-3 py-3 text-sm" style={{ borderColor: 'var(--o-border)' }} />
          </div>

          {/*
            ‹تتبّع› **دفعةُ المورّد وتاريخُ الإنتاج — مطويّان لا محذوفان.**

            ★★ دفعةُ المورّد هي ما يُطابَق به عند **السحب من السوق**: نداءُ
            السحب يأتي برقم المصنع لا برقمنا الداخليّ، فبلا هذا الحقل تُفتَّش
            الطبالي واحدةً واحدة.

            ★ وطُويا عمدًا: المسحُ كرتونةً تلو كرتونة لا يحتمل خمسَ خاناتٍ
            على شاشة هاتف، وهما يُكتبان **مرّةً للدفعة كلِّها** لا لكلّ قراءة.
          */}
          <button type="button" onClick={() => setTrace((v) => !v)}
            className="btn btn-secondary text-xs mb-2"
            style={{ minHeight: '44px' }}>
            {trace ? '▾ إخفاء حقول التتبّع' : '▸ دفعةُ المورّد وتاريخُ الإنتاج (اختياريّ)'}
            {!trace && (supplierBatch || mfgDate) ? ' — مكتوبة' : ''}
          </button>
          {trace && (
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input value={supplierBatch} onChange={(e) => setSupplierBatch(e.target.value)}
                placeholder="دفعة المورّد (رقم المصنع)"
                className="rounded-lg border px-3 py-3 text-sm" style={{ borderColor: 'var(--o-border)' }} />
              <input value={mfgDate} onChange={(e) => setMfgDate(e.target.value)}
                placeholder="تاريخ الإنتاج" type="date"
                className="rounded-lg border px-3 py-3 text-sm" style={{ borderColor: 'var(--o-border)' }} />
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary flex-1 py-3" disabled={busy || !code.trim()}>تسجيل القراءة</button>
            <button type="button" className="btn btn-secondary py-3" onClick={closeDraft} disabled={busy || (draft?.lines ?? []).length === 0}>
              إغلاق ورفعٌ للحوكمة
            </button>
          </div>
        </form>
      ) : (
        <p className="text-ink-2 text-sm mb-4">
          هذه الطبلية رُفعت للحوكمة — افتح طبليةً جديدة لتُكمل.
        </p>
      )}

      {(draft?.lines ?? []).length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ink-2 text-xs border-b" style={{ borderColor: 'var(--o-border)' }}>
              <th className="text-right py-2">الصنف</th>
              <th className="text-right py-2">الدفعة</th>
              <th className="text-left py-2">الكمّيّة</th>
            </tr>
          </thead>
          <tbody>
            {draft.lines.map((l, i) => (
              <tr key={`${l.sku}-${l.batch}-${i}`} className="border-b" style={{ borderColor: 'var(--o-border)' }}>
                <td className="py-2 text-ink">{l.name || l.sku}</td>
                <td className="py-2 text-ink-2">{l.batch || '—'}</td>
                <td className="py-2 text-left text-ink tabular-nums">{l.qty} {l.uom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── الاستلام الرسميّ: حيث تصير الحمولة رصيدًا ── */}
      {grn && (
        <div className="mt-6 rounded-lg border p-4" style={{ borderColor: 'var(--o-border)' }}>
          {/* ★ عنوانٌ يعد بما لا يقع أسوأ من صمت: جلسةُ النقل لا تولّد GRN
              أصلًا، فلا تُعنوَن به ثمّ يُقال لصاحبها «لا يُشتقّ». */}
          <h3 className="font-bold text-ink text-sm mb-2">
            {isTransfer ? 'إقفالُ جلسة النقل' : 'الاستلام الرسميّ (GRN)'}
          </h3>
          {session?.grnNumber ? (
            <>
              <p className="text-ink-2 text-sm">
                تولّد <strong className="text-ink">{session.grnNumber}</strong> من هذه الجلسة.
                يُعتمد ثمّ يُنجَز ليتحرّك الرصيد — ولا يُشتقّ مرّتين.
              </p>
              {/* ‹JR-105› «يُعتمد ثمّ يُنجَز» **بيد من؟** — السؤالُ الذي كان
                  يُسأل شفاهًا فيسقط عند تبديل الورديّة. والأسماءُ من مخطّط
                  النوع (مرآةِ قاعدة الخادم) لا قائمةً مكتوبةً هنا. */}
              {grnOwnerLines.map((l) => (
                <p key={l} className="text-ink-2 text-xs mt-1">{l}</p>
              ))}
              {/* ★ والرابطُ هنا لا في الوميض وحده: الوميضُ يزول بأوّل مسحةٍ أو
                  إعادةِ تحميل، وهذه البطاقةُ تبقى — فمن عاد إلى جلسته بعد
                  ساعةٍ يجد الطريق. و`grnId` مختومٌ على الجلسة في
                  `createGrnFromSession` فهو موجودٌ حيثما وُجد `grnNumber`. */}
              {session.grnId && (
                <a href={docHref('GRN', session.grnId)} className="btn btn-secondary text-sm inline-block mt-2">
                  افتح المستند ←
                </a>
              )}
            </>
          ) : grn.problem ? (
            <>
              {/* ★★★ الرفضُ يُقال بسببه — قِيس لا خُمِّن: الزرُّ لا يُخفى صامتًا،
                  بل يحلّ محلَّه **حكمُ `grnProblem` نفسُه** الذي يردّ الخدمة.
                  فلا تختلف الشاشةُ عن الحَكَم ولا تعيد صياغته. */}
              <p className="text-ink-2 text-sm">{grn.problem}</p>
              {/* ★★ وحدُّ النقل يُعلَن ومعه ما يُفعَل: `TRC` غيرُ موصولٍ بعد،
                  وسكوتُ الشاشة عنه يترك العاملَ أمام جلسةٍ مسح فيها ولا يدري
                  أيُقفلها أم ينتظر. والطبالي **ليست ضائعة**: هويّتُها مثبتةٌ
                  ومخزَّنةٌ برفوفها، والمفقودُ مستندُ التسوية وحده. */}
              {isTransfer && (
                <>
                  <p className="text-ink-2 text-xs mt-2">
                    أقفِل طباليك وارفعها للحوكمة كالمعتاد — الحمولةُ مُثبَتةٌ بهويّتها
                    ومسحاتِها. ومذكّرةُ استلام النقل (TRC) <strong>لم تُوصَل بعد</strong>،
                    فتُسوّى الفروقُ على أمر النقل من صندوق المستندات حتّى تصل الشاشة.
                  </p>
                  {session?.order?.id && (
                    <a href={docHref('TR', session.order.id)} className="btn btn-secondary text-sm inline-block mt-2">
                      افتح أمر النقل ←
                    </a>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <p className="text-ink-2 text-xs mb-2">
                {grn.palletCount} طبليةً معتمدة · {grn.lines.length} بندًا · إجمالي {grn.total}
              </p>
              <ul className="text-sm mb-3 space-y-1">
                {grn.lines.map((l) => (
                  <li key={l.lineId} className="flex justify-between">
                    <span className="text-ink">{l.sku}</span>
                    <span className="text-ink-2 tabular-nums">
                      {l.received} من {l.open}{l.over > 0 && <strong> (+{l.over} فوق المفتوح)</strong>}
                    </span>
                  </li>
                ))}
              </ul>

              {/* ── ‹JR-201› اختلافُ الطبالي **قبل** الزرّ ──────────────────
                  ★★★ **إعلانٌ لا منع** — قرارُ المالك ق‑ج: الزرُّ يبقى عاملًا
                  و`grn.problem` لم يتغيّر، فجلسةٌ كانت تُولّد أمس تُولّد اليوم.
                  ومن حوّل هذه البطاقة إلى حاجزٍ كسر القرار وهو يظنّ أنّه ينفّذه.
                  والقائمةُ من `extrasConflicts` الخالصة — لا مقارنةَ تُبنى هنا. */}
              {grn.extrasConflicts.length > 0 && (
                <div className="rounded-lg border px-3 py-2 mb-3" style={{ borderColor: 'var(--o-border)' }}>
                  <p className="text-ink text-xs font-bold mb-1">
                    اختلافُ الطبالي على حقول التتبّع ({grn.extrasConflicts.length})
                  </p>
                  <ul className="space-y-1">
                    {grn.extrasConflicts.map((c) => (
                      <li key={`${c.lineId}-${c.field}`} className="text-ink-2 text-xs">
                        {/* «البند ٣ (شامبو)» — وإن كان البندُ خارج المعروض
                            سُمّي بكوده، فلا يُقال «البند —». */}
                        <span className="text-ink">{grnLineTag.get(c.lineId) || `البند «${c.sku || c.lineId}»`}</span>
                        {' — '}{c.labelAr}: {c.values.map((v, i) => `${v || 'بلا قيمة'}${c.pallets[i] ? ` (${c.pallets[i]})` : ''}`).join(' · ')}
                      </li>
                    ))}
                  </ul>
                  <p className="text-ink-2 text-xs mt-1">
                    تُترك الخانةُ <strong>فارغةً</strong> في المذكّرة ويملؤها المعتمِد — ولا يُخترع
                    تاريخٌ لنصف الكمّيّة لم يكتبه أحد. والتوليدُ يمضي.
                  </p>
                </div>
              )}

              <button type="button" className="btn btn-primary w-full py-3" onClick={makeGrn} disabled={busy}>
                توليد الاستلام الرسميّ
              </button>
              <p className="text-ink-2 text-xs mt-2">
                يولد <strong>مسوّدةً</strong> — والرصيد يتحرّك عند اعتمادها وإنجازها، لا قبله.
              </p>
              {/* ‹JR-105› وإلى من تذهب بعدك — بأدوارها لا بالسؤال شفاهًا. */}
              {grnOwnerLines.map((l) => (
                <p key={l} className="text-ink-2 text-xs mt-1">{l}</p>
              ))}
            </>
          )}
        </div>
      )}

      {(session?.lines ?? []).length > 0 && (
        <details className="mt-4">
          <summary className="text-sm text-ink-2 cursor-pointer">المتبقّي المفتوح لكلّ صنف</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {session.lines.map((l) => (
              <li key={l.lineId} className="flex justify-between">
                <span className="text-ink">{l.sku}</span>
                <span className="text-ink-2 tabular-nums">{remainingOf(l)} من {l.open}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** ‹LPN-214› بدّالُ الطور — الاستلامُ والتخزينُ طرفا دورةٍ واحدة. */
/** ‹LPN-511› شريطُ الصلاحية — يُعلِم ولا يحجب من لا يُعرَف. */
function RoleGate({ gate }) {
  if (!gate || gate.allowed) return null;
  return (
    <div className="o_alert danger mb-3" style={{ fontSize: 'var(--o-font-size-sm)' }}>
      {gate.message}
    </div>
  );
}

function ModeSwitch({ mode, setMode, disabled, tr }) {
  return (
    <div className="flex gap-2 mb-4">
      {[['receiving', tr('mode_receiving')], ['putaway', tr('mode_putaway')]].map(([id, label]) => (
        <button
          key={id}
          type="button"
          disabled={disabled}
          onClick={() => setMode(id)}
          aria-pressed={mode === id}
          className={mode === id ? 'btn btn-primary text-sm flex-1' : 'btn btn-secondary text-sm flex-1'}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * ‹JR-301 · طلبُ المالك ط‑٥› خانةُ الوحدة عند المسح.
 *
 * ═══ الفجوة ═══
 * ثلاثُ خاناتٍ اليوم: الكمّيّة · الدفعة · الصلاحية. والوحدةُ تُحسم من **أيّ
 * باركودٍ مُسح** — فمن مسح باركودَ القطعة وهو يحمل كرتونًا يكتب ١ ويقصد ١٢،
 * ولا يملك وسيلةً ليقول «كرتون».
 *
 * ═══ ثلاثُ حالاتٍ، وثالثتُها الصمت ═══
 *   ① معرَّفُ الوحدات وله أكثرُ من وحدة ⟶ قائمةُ `scanUomChoices`.
 *   ② لا وحدةَ له أصلًا (`needsPackEntry`) ⟶ الوعاءُ ومحتواه، ومعاملُه
 *      يُختم على القيد لا على بطاقة الصنف.
 *   ③ وحدةٌ واحدةٌ أو باركودٌ مجهول ⟶ **لا خانةَ أصلًا**: خيارٌ من واحدٍ ليس
 *      خيارًا، وعرضُه على واقفٍ أمام رفٍّ ضجيجٌ يُعلَّم تجاهلُه.
 *
 * ★★ والحكمان `needsPackEntry` و`scanUomChoices` يُسألان ولا يُقلَّدان بشرطٍ
 * هنا — فلو تغيّرت قاعدةُ الوحدات غدًا تغيّرت الخانةُ معها في اللحظة نفسِها،
 * ولم تبقَ شاشةٌ تعرض قائمةً وخدمةٌ تزعم أنّها فارغة.
 */
function UomPicker({ item, barcodeUom, pick, setPick, plan }) {
  if (!item) return null;
  const packing = needsPackEntry(item);
  const choices = scanUomChoices(item);
  if (!packing && choices.length < 2) return null;

  const sku = upper(item.sku);
  // اختيارٌ يخصّ صنفًا آخر لا يُعرض على هذا: `scanQtyPlan` لا تطبّقه أصلًا،
  // وعرضُه هنا يجعل الشاشةَ تقول ما لا تفعل — وذلك أسوأ من ألّا تقول.
  const cur = sku && sku === upper(pick?.sku) ? pick : { sku, uom: '', label: '', per: '' };
  const set = (patch) => setPick({ ...cur, sku, ...patch });

  return (
    <div className="rounded-lg border px-3 py-2 mb-2" style={{ borderColor: 'var(--o-border)' }}>
      <div className="text-ink-2 text-xs mb-1">
        وحدةُ الإدخال — <span className="text-ink">{item.name || item.description || item.sku || '—'}</span>
      </div>
      {packing ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={cur.label}
              onChange={(e) => set({ label: e.target.value })}
              placeholder="سمِّ الوعاء (صندوق · شدّة)"
              className="rounded-lg border px-3 py-3 text-sm"
              style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface)' }}
              autoComplete="off"
            />
            <input
              value={cur.per}
              onChange={(e) => set({ per: e.target.value })}
              placeholder="كم قطعةً فيه"
              type="number"
              min="0"
              step="any"
              className="rounded-lg border px-3 py-3 text-sm"
              style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface)' }}
            />
          </div>
          <p className="text-ink-2 text-xs mt-1">
            هذا الصنف بلا وحداتٍ معرّفة — والخانةُ تبقى للمسحات التالية من صنفه نفسِه.
            واتركها فارغةً ليمضي كما كان.
          </p>
        </>
      ) : (
        <select
          value={cur.uom}
          onChange={(e) => set({ uom: e.target.value })}
          className="w-full rounded-lg border px-3 py-3 text-sm"
          style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface)' }}
        >
          {/* ★★ الافتراضُ **ما حسمه الباركود** وقيمتُه فراغ: فمن لم يلمس
              الخانةَ يمرّ بلا ترجمةٍ أصلًا لا بترجمةٍ حاصلُها واحد. وهو كذلك
              الوحيدُ الصالح حين يحمل الباركودُ وحدةً خارج قائمة الصنف. */}
          <option value="">من الباركود: {uomLabel(barcodeUom)}</option>
          {choices.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      )}
      {/* الحكمُ يُعرض ولا يُعاد بناؤه: `problem` من الخدمة و`note` منها. */}
      {plan?.problem ? (
        <p className="text-xs mt-1" style={{ color: 'var(--o-danger, #b42318)' }}>{plan.problem}</p>
      ) : plan?.note ? (
        <p className="text-ink text-xs mt-1 tabular-nums">{plan.note}</p>
      ) : null}
    </div>
  );
}

function Flash({ flash }) {
  const color = flash.kind === 'ok' ? 'var(--o-border)' : 'var(--o-danger, #b42318)';
  return (
    <div className="mb-3 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: color }}>
      {flash.text}
      {/* الرابطُ **حقلٌ في الرسالة** لا وسمٌ في نصّها: البطاقةُ تعرضه بأسلوبها
          (زرٌّ بحجم إصبعٍ لا سطرٌ رفيع)، ورسالةٌ بلا رابطٍ تبقى كما كانت. */}
      {flash.link?.href && (
        <div className="mt-2">
          <a href={flash.link.href} className="btn btn-secondary text-sm inline-block">
            {flash.link.label || 'افتح ←'}
          </a>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border px-3 py-2 text-center" style={{ borderColor: 'var(--o-border)' }}>
      <div className="text-xl font-bold text-ink tabular-nums">{value}</div>
      <div className="text-xs text-ink-2">{label}</div>
    </div>
  );
}
