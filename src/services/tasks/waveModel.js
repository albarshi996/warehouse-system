/**
 * الموجات Wave Picking — **تكوينٌ وإطلاقٌ ومتابعةُ إنجاز.**
 * منطقٌ خالصٌ بلا Firebase وبلا ساعة.
 *
 * ‹WMS-701› · الفجوة و-٨: `wave` حقلُ نصٍّ في مخطّط السحب وحدَه
 * (`schemas/pick.js:93`) — يُكتب باليد ولا يفعل شيئًا. فإن كتب موظّفٌ «موجة ٣»
 * وكتب آخرُ «W3» وثالثٌ «الموجة الثالثة»، فهي **ثلاثُ موجاتٍ في التقرير
 * وواحدةٌ في الواقع**. وحقلُ نصٍّ حرٍّ لتجميعٍ تشغيليٍّ ليس ميزةً ناقصةً بل
 * **عطبٌ يُنتج بياناتٍ لا تُجمَع**.
 *
 * ═══ ولماذا الموجةُ أصلًا؟ ═══
 * التجهيزُ المستمرُّ (بلا موجات) هو سلوكُ البوّابة اليوم ويعمل. والموجةُ تحلّ
 * مسألةً أخرى: **التزامنَ مع ما خارج المستودع.** شاحنةُ ناقلٍ تقف الثانيةَ
 * عشرة، وخمسةٌ وعشرون أمرًا يجب أن تكون على الرصيف قبلها. فالموجةُ تجمعها
 * **فتُطلَق معًا وتُقاس معًا** — ولا يُكتشَف عند التحميل أنّ أمرًا منها لم
 * يُحضَّر.
 *
 * ═══ خمسُ قواعدَ ═══
 *
 * ① **مستندٌ في موجةٍ مفتوحةٍ لا يدخل موجةً أخرى** — والحارسُ يقول **في أيّ
 *    موجةٍ هو**. ومنعٌ لا يقول أين الأصلُ يُرسل الموظّفَ يبحث في القوائم كلّها.
 *
 * ② **الإطلاقُ طورٌ مستقلٌّ عن التكوين.** موجةٌ مكوَّنةٌ لم تُطلَق **لا تُنتج
 *    مهمّةً**: المشرفُ يُكوّن ويراجع ويحذف ويضيف، ثمّ يُطلق مرّةً واحدة. ولو
 *    أنتج التكوينُ مهامَّ لَوُلدت مهمّةٌ لكلّ ضغطةِ مراجعة.
 *
 * ③ ★★★ **الإنجازُ من بنود المستندات لا من عددها.** موجةٌ فيها مستندٌ من مئة
 *    بندٍ وتسعةُ مستنداتٍ من بندٍ واحد: إنجازُ التسعةِ يقول «٩٠٪» بالعدد
 *    **و٨٪ بالعمل**. والمشرفُ يقرأ التسعين فيُبلّغ الناقلَ أنّه جاهز.
 *
 * ④ **إغلاقُ موجةٍ بنقصٍ يحتاج سببًا مُقيَّدًا** — موجةٌ تُغلق صامتةً تُخفي
 *    طلبًا لم يُشحَن، فيُكتشَف عند العميل لا عند الرصيف.
 *
 * ⑤ **لا ساعةَ تُقرأ** — `at` يُمرَّر.
 */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const up = (v) => String(v ?? '').trim().toUpperCase();
const txt = (v) => String(v ?? '').trim();
const round = (n) => Math.round(n * 1000) / 1000;

/**
 * معرّفُ عضوٍ في الموجة — نصًّا كان أو كائنًا.
 *
 * ★★★ ويُكتب **صريحًا** لا بـ`m?.id || m`: فعضوٌ `{id:''}` يسقط بـ`||` إلى
 * الكائن نفسِه، فيُقرأ `"[object Object]"` **معرّفًا صالحًا** — فتُكوَّن موجةٌ
 * بعضوٍ وهميٍّ لا مستندَ له، ويُحسَب في بنودها، وتُقرأ نسبتُها خطأً للأبد.
 * (أمسكه حارسُ «موجةٌ بلا مستنداتٍ لا تُنشأ».)
 */
function memberId(m) {
  return typeof m === 'string' || typeof m === 'number' ? txt(m) : txt(m?.id);
}

/** أطوارُ الموجة — ثلاثةٌ لا أكثر، ولكلٍّ ما يجوز بعده. */
export const WAVE_STATES = Object.freeze({
  forming: { id: 'forming', labelAr: 'قيد التكوين', hint: 'تُضاف المستنداتُ وتُحذف — ولا مهمّةَ تُنتَج بعد.', open: true },
  released: { id: 'released', labelAr: 'مُطلَقة', hint: 'انطلق العملُ — لا تُضاف ولا تُحذف، وتُتابَع نسبتُها.', open: true },
  closed: { id: 'closed', labelAr: 'مُغلَقة', hint: 'خرجت من العمل — بسببٍ مُقيَّدٍ إن أُغلقت بنقص.', open: false },
  cancelled: { id: 'cancelled', labelAr: 'ملغاة', hint: 'أُلغيت قبل الإطلاق — والمستنداتُ عادت حرّة.', open: false },
});

/** النقلاتُ المسموحة — آلةُ حالاتٍ لا شروطٌ مبعثرة (نمطُ `documents/states`). */
export const WAVE_TRANSITIONS = Object.freeze({
  forming: ['released', 'cancelled'],
  released: ['closed'],
  closed: [],
  cancelled: [],
});

/**
 * معاييرُ التكوين — **مُعلَنةٌ لا حرّة** (وهو جوهرُ إصلاح الفجوة).
 * فحقلُ نصٍّ حرٍّ أنتج «موجة ٣» و«W3» و«الموجة الثالثة» ثلاثَ موجات.
 */
export const WAVE_CRITERIA = Object.freeze({
  carrier: { id: 'carrier', labelAr: 'الناقل', field: 'carrier', hint: 'كلُّ ما يحمله ناقلٌ واحدٌ يُجهَّز معًا.' },
  shipDate: { id: 'shipDate', labelAr: 'موعد الخروج', field: 'mustShipBy', hint: 'ما يخرج في موعدٍ واحدٍ يُقاس معًا.' },
  zone: { id: 'zone', labelAr: 'المنطقة', field: 'zone', hint: 'مجهّزٌ واحدٌ يمشي منطقةً واحدةً مرّةً واحدة.' },
  route: { id: 'route', labelAr: 'خطّ التوزيع', field: 'route', hint: 'رحلةُ توزيعٍ واحدةٌ تُحمَّل بترتيبها.' },
});

export const CRITERION_IDS = Object.freeze(Object.keys(WAVE_CRITERIA));

/** تسميةُ الطور — والمجهولُ يُعرض كما كُتب لا كـ«غير معروف». */
export function stateLabel(state) {
  return WAVE_STATES[txt(state)]?.labelAr || txt(state) || '—';
}

/** أموجةٌ ما زالت في العمل؟ (تكوينٌ أو إطلاقٌ) — وعليها يقوم منعُ التضاعف. */
export function isOpenWave(wave) {
  return WAVE_STATES[txt(wave?.state)]?.open === true;
}

/**
 * كودُ الموجة — تاريخٌ وتسلسل. و`at` يُمرَّر (القاعدة ⑤).
 *
 * ★ والتسلسلُ **يُمرَّر لا يُحتسب هنا**: عدُّ موجاتِ اليوم يحتاج قراءةَ
 * المجموعة، وهي ليست شغلَ منطقٍ خالص. والمستدعي يعرف ما عنده.
 */
export function waveCode(at, seq) {
  const d = Number.isFinite(at) ? new Date(at) : null;
  const day = d
    ? `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
    : '00000000';
  return `WV-${day}-${String(Math.max(1, num(seq) || 1)).padStart(2, '0')}`;
}

/**
 * قيمةُ معيارٍ في مستند — ومنها يُقترح التجميع.
 * و`''` تعني «المستندُ لا يحمل هذا المعيار» فلا يُجمَع به.
 */
export function criterionValueOf(document, criterionId) {
  const c = WAVE_CRITERIA[txt(criterionId)];
  if (!c) return '';
  const h = document?.header || {};
  if (c.id === 'shipDate') {
    const raw = h.mustShipBy ?? h.shipDate ?? h.dueDate ?? '';
    return txt(raw).slice(0, 10);
  }
  if (c.id === 'carrier') return up(h.carrier ?? h.carrierName ?? '');
  if (c.id === 'zone') return up(h.zone ?? h.warehouse ?? '');
  return up(h[c.field] ?? '');
}

/**
 * مستنداتٌ مُقترَحةٌ لموجةٍ بمعيارٍ وقيمة — **والمحجوزُ في موجةٍ أخرى يُستبعد
 * بسببه** (القاعدة ①).
 *
 * @param {Array} documents مستنداتُ السحب المرشَّحة
 * @param {object} p `{criterion, value, waves}` — `waves` الموجاتُ القائمةُ كلُّها
 * @returns {{eligible:Array, taken:Array, problem:string}}
 */
export function proposeMembers(documents, { criterion, value, waves = [] } = {}) {
  const c = WAVE_CRITERIA[txt(criterion)];
  if (!c) {
    return { eligible: [], taken: [], problem: `معيارُ تكوينٍ مجهول «${criterion}» — المسموح: ${CRITERION_IDS.join(' · ')}.` };
  }
  const want = c.id === 'shipDate' ? txt(value).slice(0, 10) : up(value);
  if (!want) return { eligible: [], taken: [], problem: `لم تُحدَّد قيمةُ «${c.labelAr}».` };

  const claimed = claimIndex(waves);
  const eligible = [];
  const taken = [];

  for (const doc of documents || []) {
    if (!doc?.id) continue;
    if (criterionValueOf(doc, c.id) !== want) continue;
    const holder = claimed.get(doc.id);
    if (holder) {
      // ① المنعُ يقول **في أيّ موجةٍ هو** — وإلّا بحث الموظّفُ في القوائم كلّها.
      taken.push({
        id: doc.id,
        number: doc.number || doc.id,
        reason: `محجوزٌ في الموجة ${holder.code} (${stateLabel(holder.state)}).`,
        waveCode: holder.code,
      });
      continue;
    }
    eligible.push({ id: doc.id, number: doc.number || doc.id, lines: (doc.lines || []).length });
  }

  return {
    eligible,
    taken,
    problem: eligible.length
      ? ''
      : taken.length
        ? 'كلُّ مستندات هذا المعيار محجوزةٌ في موجاتٍ أخرى — راجع الأسباب.'
        : `لا مستندَ سحبٍ مفتوحٌ بـ${c.labelAr} «${want}».`,
  };
}

/** فهرسُ «المستند ← الموجةُ المفتوحةُ التي تحجزه». */
function claimIndex(waves) {
  const index = new Map();
  for (const w of waves || []) {
    if (!isOpenWave(w)) continue;
    for (const m of w?.members || []) {
      const id = memberId(m);
      if (id && !index.has(id)) index.set(id, { code: txt(w.code), state: txt(w.state) });
    }
  }
  return index;
}

/**
 * يُكوّن موجةً — **في طور التكوين، ولا تُنتج مهمّةً** (القاعدة ②).
 *
 * @returns {{ok:boolean, problem:string, wave:object|null}}
 */
export function formWave({ criterion, value, members, at, seq, actor, actorName = '', warehouse = '' } = {}) {
  const c = WAVE_CRITERIA[txt(criterion)];
  if (!c) return { ok: false, problem: `معيارُ تكوينٍ مجهول «${criterion}».`, wave: null };
  if (!txt(actor)) return { ok: false, problem: 'موجةٌ بلا مُكوِّنٍ لا تُنشأ.', wave: null };

  const rows = (members || [])
    .map((m) => ({ id: memberId(m), number: txt(m?.number) || memberId(m), lines: num(m?.lines) }))
    .filter((m) => m.id);
  // ★ التفرّدُ داخل الموجة أيضًا: مستندٌ مرّتين في موجةٍ واحدةٍ يُضاعف بنودَها
  // فتقرأ نسبةً خطأً — وهو أخطرُ من تكرارٍ ظاهر.
  const seen = new Set();
  const unique = rows.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  if (!unique.length) return { ok: false, problem: 'موجةٌ بلا مستنداتٍ لا تُكوَّن.', wave: null };

  return {
    ok: true,
    problem: '',
    wave: {
      code: waveCode(at, seq),
      state: WAVE_STATES.forming.id,
      criterion: c.id,
      criterionLabel: c.labelAr,
      value: c.id === 'shipDate' ? txt(value).slice(0, 10) : up(value),
      warehouse: up(warehouse),
      members: unique,
      plannedLines: unique.reduce((s, m) => s + m.lines, 0),
      formedBy: txt(actor),
      formedByName: txt(actorName),
      formedAt: Number.isFinite(at) ? at : null,
      releasedBy: '',
      releasedAt: null,
      closedBy: '',
      closedAt: null,
      closeReason: '',
    },
  };
}

/**
 * يضيف مستندًا إلى موجةٍ **قيد التكوين وحدَها** (القاعدة ②).
 */
export function addMember(wave, document, { waves = [] } = {}) {
  if (wave?.state !== WAVE_STATES.forming.id) {
    return { ok: false, problem: `لا تُضاف مستنداتٌ لموجةٍ ${stateLabel(wave?.state)} — التكوينُ انتهى.`, wave: null };
  }
  const id = txt(document?.id);
  if (!id) return { ok: false, problem: 'مستندٌ بلا هويّة.', wave: null };
  if ((wave.members || []).some((m) => txt(m.id) === id)) {
    return { ok: false, problem: 'المستندُ في هذه الموجة أصلًا.', wave: null };
  }
  const holder = claimIndex(waves.filter((w) => txt(w?.code) !== txt(wave.code))).get(id);
  if (holder) {
    return { ok: false, problem: `محجوزٌ في الموجة ${holder.code} (${stateLabel(holder.state)}).`, wave: null };
  }
  const row = { id, number: txt(document.number) || id, lines: (document.lines || []).length };
  const members = [...(wave.members || []), row];
  return { ok: true, problem: '', wave: { ...wave, members, plannedLines: members.reduce((s, m) => s + num(m.lines), 0) } };
}

/** يحذف مستندًا من موجةٍ قيد التكوين — والموجةُ لا تبقى فارغةً بلا إعلان. */
export function removeMember(wave, docId) {
  if (wave?.state !== WAVE_STATES.forming.id) {
    return { ok: false, problem: `لا تُحذف مستنداتٌ من موجةٍ ${stateLabel(wave?.state)}.`, wave: null };
  }
  const id = txt(docId);
  const members = (wave.members || []).filter((m) => txt(m.id) !== id);
  if (members.length === (wave.members || []).length) return { ok: false, problem: 'المستندُ ليس في هذه الموجة.', wave: null };
  return {
    ok: true,
    problem: members.length ? '' : 'الموجةُ صارت فارغةً — ألغِها أو أضِف مستندًا قبل الإطلاق.',
    wave: { ...wave, members, plannedLines: members.reduce((s, m) => s + num(m.lines), 0) },
  };
}

/** حكمُ نقلةِ طورٍ — آلةُ الحالات وحدَها تقرّر. */
export function transitionProblem(from, to) {
  const f = txt(from);
  const t = txt(to);
  if (!WAVE_STATES[f]) return `طورٌ غيرُ معروف «${from}».`;
  if (!WAVE_STATES[t]) return `طورٌ غيرُ معروف «${to}».`;
  const allowed = WAVE_TRANSITIONS[f] || [];
  if (!allowed.includes(t)) {
    return allowed.length
      ? `لا تُنقل موجةٌ من «${stateLabel(f)}» إلى «${stateLabel(t)}» — المسموح: ${allowed.map(stateLabel).join(' · ')}.`
      : `«${stateLabel(f)}» طورٌ نهائيّ — لا نقلةَ بعده.`;
  }
  return '';
}

/**
 * يُطلق الموجة — **طورٌ مستقلٌّ، وبعده تُنتَج المهامّ** (القاعدة ②).
 */
export function releaseWave(wave, { actor, actorName = '', at } = {}) {
  const problem = transitionProblem(wave?.state, WAVE_STATES.released.id);
  if (problem) return { ok: false, problem, wave: null };
  if (!txt(actor)) return { ok: false, problem: 'إطلاقٌ بلا فاعلٍ لا يُقبل.', wave: null };
  if (!(wave?.members || []).length) return { ok: false, problem: 'موجةٌ فارغةٌ لا تُطلَق.', wave: null };
  return {
    ok: true,
    problem: '',
    wave: {
      ...wave,
      state: WAVE_STATES.released.id,
      releasedBy: txt(actor),
      releasedByName: txt(actorName),
      releasedAt: Number.isFinite(at) ? at : null,
    },
  };
}

/** يُلغي موجةً قيد التكوين — فتعود مستنداتُها حرّةً. */
export function cancelWave(wave, { actor, reason, at } = {}) {
  const problem = transitionProblem(wave?.state, WAVE_STATES.cancelled.id);
  if (problem) return { ok: false, problem, wave: null };
  if (!txt(actor)) return { ok: false, problem: 'إلغاءٌ بلا فاعلٍ لا يُقبل.', wave: null };
  if (!txt(reason)) return { ok: false, problem: 'سببُ الإلغاء إلزاميّ.', wave: null };
  return {
    ok: true,
    problem: '',
    wave: { ...wave, state: WAVE_STATES.cancelled.id, closedBy: txt(actor), closedAt: Number.isFinite(at) ? at : null, closeReason: txt(reason) },
  };
}

/**
 * ★★★ نسبةُ إنجاز الموجة — **من البنود لا من عدد المستندات** (القاعدة ③).
 *
 * @param {object} wave
 * @param {object|Map} progress خريطةُ «المستند ← {requested, executed}»
 * @returns {{pct:number, byDocPct:number, requested:number, executed:number,
 *            docsDone:number, docs:number, unknownDocs:number, lines:Array, gap:number,
 *            complete:boolean, caveat:string}}
 */
export function waveProgress(wave, progress) {
  const get = (id) => {
    if (!progress) return null;
    if (typeof progress.get === 'function') return progress.get(id) || null;
    return progress[id] || null;
  };

  let requested = 0;
  let executed = 0;
  let docsDone = 0;
  let unknownDocs = 0;
  const lines = [];

  for (const m of wave?.members || []) {
    const p = get(txt(m.id));
    if (!p) {
      unknownDocs += 1;
      lines.push({ id: m.id, number: m.number, requested: null, executed: null, pct: null });
      continue;
    }
    const req = Math.max(0, num(p.requested));
    const exe = Math.max(0, Math.min(req || num(p.executed), num(p.executed)));
    requested += req;
    executed += exe;
    const pct = req > 0 ? Math.round((exe / req) * 100) : null;
    if (req > 0 && exe >= req) docsDone += 1;
    lines.push({ id: m.id, number: m.number, requested: req, executed: exe, pct });
  }

  const docs = (wave?.members || []).length;
  return {
    pct: requested > 0 ? Math.round((executed / requested) * 100) : 0,
    // ★ النسبةُ بالعدد تُحسب **وتُعرض بجانبها** لا بدلًا منها: المشرفُ يرى
    // الفرقَ بعينه فيعرف أنّ «تسعةٌ من عشرة» ليست «تسعين بالمئة من العمل».
    byDocPct: docs > 0 ? Math.round((docsDone / docs) * 100) : 0,
    requested: round(requested),
    executed: round(executed),
    gap: round(Math.max(0, requested - executed)),
    docsDone,
    docs,
    unknownDocs,
    lines,
    complete: requested > 0 && executed >= requested && unknownDocs === 0,
    caveat: unknownDocs
      ? `${unknownDocs} مستندًا بلا قياسِ تنفيذٍ — النسبةُ على ما يُعرف، والواقعُ قد يكون أقلّ.`
      : '',
  };
}

/**
 * ★★★ إغلاقُ الموجة — **والنقصُ يحتاج سببًا مُقيَّدًا** (القاعدة ④).
 */
export function closeWave(wave, progress, { actor, actorName = '', reason = '', at } = {}) {
  const problem = transitionProblem(wave?.state, WAVE_STATES.closed.id);
  if (problem) return { ok: false, problem, wave: null, needsReason: false };
  if (!txt(actor)) return { ok: false, problem: 'إغلاقٌ بلا فاعلٍ لا يُقبل.', wave: null, needsReason: false };

  const p = waveProgress(wave, progress);
  if (!p.complete && !txt(reason)) {
    return {
      ok: false,
      needsReason: true,
      problem: p.unknownDocs
        ? `لا يُغلَق بلا سبب: ${p.unknownDocs} مستندًا بلا قياسِ تنفيذٍ — موجةٌ تُغلق صامتةً تُخفي طلبًا لم يُشحَن.`
        : `لا يُغلَق بلا سبب: ناقصٌ ${p.gap} من ${p.requested} (${p.pct}٪) — موجةٌ تُغلق صامتةً تُخفي طلبًا لم يُشحَن.`,
      wave: null,
    };
  }

  return {
    ok: true,
    problem: '',
    needsReason: false,
    wave: {
      ...wave,
      state: WAVE_STATES.closed.id,
      closedBy: txt(actor),
      closedByName: txt(actorName),
      closedAt: Number.isFinite(at) ? at : null,
      closeReason: txt(reason),
      closedPct: p.pct,
      closedGap: p.gap,
    },
  };
}

/**
 * لوحةُ الموجات — المفتوحةُ أوّلًا، والأقربُ موعدًا قبلها.
 */
export function waveBoard(waves, progressByDoc) {
  const rows = (waves || []).map((w) => ({ wave: w, progress: waveProgress(w, progressByDoc) }));
  rows.sort((a, b) => {
    const oa = isOpenWave(a.wave) ? 0 : 1;
    const ob = isOpenWave(b.wave) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    const va = txt(a.wave.value);
    const vb = txt(b.wave.value);
    if (va !== vb) return va < vb ? -1 : 1;
    return txt(a.wave.code) < txt(b.wave.code) ? -1 : 1;
  });
  return {
    rows,
    counts: {
      total: rows.length,
      forming: rows.filter((r) => r.wave.state === WAVE_STATES.forming.id).length,
      released: rows.filter((r) => r.wave.state === WAVE_STATES.released.id).length,
      closed: rows.filter((r) => r.wave.state === WAVE_STATES.closed.id).length,
      behind: rows.filter((r) => r.wave.state === WAVE_STATES.released.id && r.progress.pct < 100).length,
    },
  };
}

/** سطرٌ يُقرأ على الشاشة — والنسبتان معًا كي لا يُخدع القارئ. */
export function waveSummary(wave, progress) {
  if (!wave?.code) return '';
  const p = waveProgress(wave, progress);
  const head = `${wave.code} · ${wave.criterionLabel} «${wave.value}» · ${stateLabel(wave.state)}`;
  const body = `${p.executed} من ${p.requested} بندًا (${p.pct}٪) · ${p.docsDone} من ${p.docs} مستندًا (${p.byDocPct}٪)`;
  return `${head} — ${body}${p.caveat ? ` · ${p.caveat}` : ''}`;
}
