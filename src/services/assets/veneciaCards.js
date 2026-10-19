/**
 * منطق **بطاقات حركة** مخزن فينسيا — خالصٌ بلا DOM ولا Firestore.
 *
 * فينسيا مستودعٌ قائمٌ بذاته (قرار المالك 2026-10-19): يُصرف منه، ويُدخَل
 * إليه، ويُعدَّل، وله جردُه. والجردُ والتعديلُ في لوحة الجرد؛ وهذا ملفُّ
 * **الحركة**: بطاقةٌ بعدّة بنود، تُحضَّر مسودّةً فتُراجَع، ثمّ زرٌّ واحدٌ
 * يُثبّتها برقمٍ رسميّ ويُحرّك الكمّيّات.
 *
 * ═══ ★★★ بطاقةٌ واحدةٌ باتّجاهين لا بطاقتان ═══
 * الصرفُ والإدخالُ نفسُ المستند: نفسُ البنود، ونفسُ المسودّة، ونفسُ
 * الترقيم، ونفسُ المعاملة الذرّيّة — والفرقُ **إشارةٌ واحدة** (`sign`).
 * فبناؤهما مستندين متوازيين يعني حارسَين ينحرفان: يُصلَح فحصُ التوفّر في
 * أحدهما ويُنسى الآخر، وتُضاف حالةٌ هنا ولا تُضاف هناك. وهي بيّنةُ
 * `pageAccess` نفسُها حين كُتبت قائمةُ صلاحيّاتٍ ثانيةٌ يدويًّا فانحرفت.
 *
 * ═══ ★★★ والمسودّةُ لا تلمس كمّيّةً ═══
 * `draft` سجلٌّ على الورق: تُحرَّر وتُلغى بلا أثر. والحركةُ لا تقع إلّا
 * لحظةَ `posted`، وفي **معاملةٍ ذرّيّةٍ واحدة** تقرأ الكمّيّات من الخادم في
 * اللحظة نفسِها — فبطاقتان تصرفان آخرَ ثلاجةٍ لا تنجحان معًا. وهذا الملفُّ
 * يقرّر، و`veneciaCardsService` ينفّذ.
 */
import {
  populationLabel,
  isPopulation,
  isAssetNo,
  assetDocId,
  rawQty,
  signedText,
} from './veneciaModel.js';

/**
 * اتّجاها البطاقة. `sign` هو كلُّ الفرق بينهما في الحساب، وما عداه عرضٌ
 * ولغة. و`numberType` عدّادٌ مستقلٌّ لكلّ اتّجاه — فتسلسلُ الصرف لا يدفع
 * تسلسلَ الإدخال، كما لكلّ مجموعةِ أصولٍ تسلسلُها.
 */
export const CARD_KINDS = [
  {
    id: 'issue',
    label: 'بطاقة صرف',
    short: 'صرف',
    sign: -1,
    numberType: 'VENISS',
    verb: 'صُرف',
    partyLabel: 'المستلِم',
    postLabel: 'اصرِفْها',
    postedLabel: 'مصروفة',
  },
  {
    id: 'receipt',
    label: 'بطاقة إدخال',
    short: 'إدخال',
    sign: +1,
    numberType: 'VENRCV',
    verb: 'أُدخل',
    partyLabel: 'المورِّد أو الجهة',
    postLabel: 'أدخِلْها',
    postedLabel: 'مُدخَلة',
  },
];

const KIND_BY_ID = new Map(CARD_KINDS.map((k) => [k.id, k]));

/** هل هذا اتّجاهٌ معروف؟ */
export const isCardKind = (id) => KIND_BY_ID.has(id);

/** تعريفُ الاتّجاه — والمجهولُ `null` ولا يُفترض صرفًا. */
export const cardKind = (id) => KIND_BY_ID.get(id) || null;

/** اسمُ الاتّجاه للعرض. */
export const cardKindLabel = (id) => KIND_BY_ID.get(id)?.label || 'بطاقة غير معروفة';

/** حالاتُ البطاقة. */
export const CARD_STATES = ['draft', 'posted', 'cancelled'];

/**
 * اسمُ الحالة — **بلغة الاتّجاه**: «مصروفة» للصرف و«مُدخَلة» للإدخال.
 * فحالةٌ تُسمّى `posted` في كلّ مكانٍ تُفقد الموظّفَ معنى ما يراه.
 */
export function cardStateLabel(state, kindId) {
  if (state === 'draft') return 'مسودّة';
  if (state === 'cancelled') return 'ملغاة';
  if (state === 'posted') return KIND_BY_ID.get(kindId)?.postedLabel || 'مثبَّتة';
  return 'حالة غير معروفة';
}

/**
 * الانتقالاتُ المسموحة.
 * ★ والمثبَّتةُ **نهائيّة**: لا تُلغى ولا تُعدَّل. فبطاقةُ صرفٍ خرجت
 * بضاعتُها، وإلغاؤها بعدها كذبٌ على الرصيد — والتصحيحُ **بطاقةٌ مضادّةٌ
 * في الاتّجاه الآخر** تُقيَّد باسم فاعلها وسببها، لا محوٌ لما جرى.
 */
const TRANSITIONS = { draft: ['posted', 'cancelled'], posted: [], cancelled: [] };

/** هل يجوز الانتقالُ من حالةٍ إلى حالة؟ */
export function canTransitionCard(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

/** الاتّجاهُ المضادّ — به يُصحَّح ما ثُبِّت. */
export const oppositeKind = (id) => (id === 'issue' ? 'receipt' : id === 'receipt' ? 'issue' : null);

/** بندٌ مُطبَّع — والكمّيّةُ رقمٌ لا نصّ. */
export function normalizeCardLine(line) {
  const l = line ?? {};
  return {
    population: String(l.population ?? '').trim(),
    assetNo: String(l.assetNo ?? l.id ?? '').trim(),
    assetName: String(l.assetName ?? '').trim(),
    category: String(l.category ?? l.serial ?? '').trim(),
    brand: String(l.brand ?? '').trim(),
    condition: String(l.condition ?? '').trim(),
    qty: Number(l.qty),
    /** إدخالٌ لأصلٍ لم يُسجَّل بعد — يُنشئه التثبيتُ بهذه البيانات. */
    createNew: l.createNew === true,
  };
}

/** هويّةُ الأصل الذي يشير إليه البند، أو `null` إن كان البندُ مشوّهًا. */
export function lineAssetKey(line) {
  const l = normalizeCardLine(line);
  if (!isPopulation(l.population) || !isAssetNo(l.assetNo)) return null;
  return assetDocId(l.population, l.assetNo);
}

/** مجاميعُ البطاقة: كم بندًا وكم وحدة. */
export function cardTotals(card) {
  const lines = (card?.lines ?? []).map(normalizeCardLine);
  return {
    lines: lines.length,
    units: lines.reduce((s, l) => s + (Number.isFinite(l.qty) ? l.qty : 0), 0),
  };
}

/**
 * حكمٌ على البطاقة قبل حفظها أو تثبيتها.
 *
 * @param {object} card البطاقة كما في الشاشة
 * @param {Map<string, object>} assetsByKey الأصولُ الحيّة مفهرسةً بـ`docId`
 * @param {{ forPost?: boolean }} [opts] `forPost` يُضيف فحصَ التوفّر للصرف
 * @returns {{ ok: boolean, problems: string[] }}
 *
 * ويجمع كلَّ المشاكل مرّةً واحدة — فلا يُصلح الموظّفُ بندًا ليُفاجأ بالثاني.
 */
export function cardVerdict(card, assetsByKey, { forPost = false } = {}) {
  const c = card ?? {};
  const kind = cardKind(c.kind);
  const problems = [];
  const index = assetsByKey instanceof Map ? assetsByKey : new Map(Object.entries(assetsByKey ?? {}));

  if (!kind) problems.push('اتّجاهُ البطاقة غير محدَّد (صرفٌ أو إدخال).');
  if (!String(c.party ?? '').trim()) {
    problems.push(`${kind ? kind.partyLabel : 'الطرف'} مطلوب — بطاقةٌ بلا طرفٍ لا تُسلَّم ولا تُستلَم.`);
  }
  if (!String(c.cardDate ?? '').trim()) problems.push('تاريخُ البطاقة مطلوب.');

  const lines = (c.lines ?? []).map(normalizeCardLine);
  if (!lines.length) problems.push('لا بندَ في البطاقة — بطاقةٌ بلا حركةٍ لا تُقيَّد.');

  const seen = new Map();
  lines.forEach((l, i) => {
    const at = `البند ${i + 1}`;
    const key = lineAssetKey(l);
    if (!key) {
      problems.push(`${at}: أصلٌ غيرُ محدَّد — المجموعةُ ورقمٌ على صيغة BRZ-0001.`);
      return;
    }
    if (seen.has(key)) {
      problems.push(
        `${at}: «${l.assetName || l.assetNo}» مكرَّرٌ مع البند ${seen.get(key) + 1} — اجمعهما في بندٍ واحد.`
      );
      return;
    }
    seen.set(key, i);

    if (!Number.isFinite(l.qty) || l.qty <= 0) {
      problems.push(`${at}: الكمّيّةُ رقمٌ أكبرُ من صفر.`);
      return;
    }

    const asset = index.get(key);
    if (!asset) {
      // ★ الإدخالُ وحدَه يجوز أن يُنشئ أصلًا — والصرفُ لا يصرف ما لا وجودَ له.
      if (kind?.id === 'receipt' && l.createNew) {
        if (!l.assetName) problems.push(`${at}: أصلٌ جديد — اسمُه مطلوب.`);
        return;
      }
      problems.push(
        `${at}: «${l.assetNo}» في ${populationLabel(l.population)} غيرُ موجودٍ في الجرد` +
          (kind?.id === 'receipt' ? ' — أشّر «أصلٌ جديد» لإنشائه.' : '.')
      );
      return;
    }
    if (l.createNew) {
      problems.push(`${at}: «${l.assetNo}» مسجَّلٌ سلفًا — أزِل تأشير «أصلٌ جديد».`);
      return;
    }
    if (asset.archived) {
      problems.push(`${at}: «${asset.assetName}» مكهَّنٌ — أرجِعه إلى الجرد أوّلًا.`);
      return;
    }
    // ★★★ والتوفّرُ يُفحص للصرف وحدَه وعند التثبيت وحدَه: المسودّةُ تُحضَّر
    // ولو لم يكن الرصيدُ جاهزًا، والرصيدُ يُقطع في معاملة التثبيت لا قبلها.
    if (forPost && kind?.sign === -1) {
      const have = rawQty(asset.qty);
      if (l.qty > have) {
        problems.push(`${at}: «${asset.assetName}» المتاحُ ${have} والمطلوبُ ${l.qty}.`);
      }
    }
  });

  return { ok: problems.length === 0, problems };
}

/**
 * الكمّيّةُ بعد تثبيت البند. والصرفُ **يرفض** ما يُنزل الرصيدَ دون صفر ولا
 * يقصّه صامتًا: صرفُ ما لا يُملَك خطأٌ يُقال، لا رقمٌ يُسوَّى.
 */
export function qtyAfterCard(asset, qty, kindId) {
  const kind = cardKind(kindId);
  if (!kind) throw new Error('اتّجاهُ البطاقة غير معروف.');
  const want = Number(qty);
  if (!Number.isFinite(want) || want <= 0) throw new Error('كمّيّةُ البطاقة رقمٌ أكبرُ من صفر.');
  const have = rawQty(asset?.qty);
  const next = have + kind.sign * want;
  if (next < 0) throw new Error(`المتاحُ ${have} والمطلوبُ ${want} — لا يُصرَف ما لا يُملَك.`);
  return next;
}

/** سطرُ السجلّ الذي يُلحَق بالأصل عند تثبيت البطاقة. */
export function cardNoteLine(card, line) {
  const l = normalizeCardLine(line);
  const kind = cardKind(card?.kind);
  const party = String(card?.party ?? '').trim();
  const where = String(card?.destination ?? '').trim();
  return (
    `${kind ? kind.verb : 'حُرّك'} ${l.qty} بالبطاقة ${card?.number || '—'}` +
    (party ? ` ${kind?.sign === -1 ? 'إلى' : 'من'} ${party}` : '') +
    (where ? ` · ${where}` : '')
  );
}

/** أثرُ البطاقة على الرصيد نصًّا معزولَ الإشارة — للعرض في الجدول. */
export function cardEffectText(card) {
  const kind = cardKind(card?.kind);
  if (!kind) return '—';
  return signedText(kind.sign * cardTotals(card).units);
}

/** لقطةُ البطاقات — والملغاةُ خارجَ كلّ رقم. */
export function cardsSnapshot(cards) {
  const all = cards ?? [];
  const live = all.filter((c) => c.state !== 'cancelled');
  const posted = live.filter((c) => c.state === 'posted');
  const per = (id) => {
    const rows = posted.filter((c) => c.kind === id);
    return { cards: rows.length, units: rows.reduce((s, c) => s + cardTotals(c).units, 0) };
  };
  const out = { issued: per('issue'), received: per('receipt') };
  return {
    total: all.length,
    drafts: live.filter((c) => c.state === 'draft').length,
    posted: posted.length,
    cancelled: all.length - live.length,
    ...out,
    net: out.received.units - out.issued.units,
  };
}

/** تصفيةُ البطاقات: بحثٌ حرٌّ واتّجاهٌ وحالةٌ ومدى تاريخ. */
export function filterCards(cards, { q = '', kind = '', state = '', from = '', to = '' } = {}) {
  const term = String(q ?? '').trim().toLowerCase();
  return (cards ?? []).filter((c) => {
    if (kind && c.kind !== kind) return false;
    if (state && c.state !== state) return false;
    const d = String(c.cardDate ?? '');
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (!term) return true;
    const hay = [
      c.number,
      c.party,
      c.destination,
      c.purpose,
      cardKindLabel(c.kind),
      cardStateLabel(c.state, c.kind),
      ...(c.lines ?? []).flatMap((l) => [l.assetNo, l.assetName, l.category]),
    ]
      .map((x) => String(x ?? '').toLowerCase())
      .join(' ');
    return hay.includes(term);
  });
}

/**
 * حركةُ كلّ أصلٍ عبر البطاقات المثبَّتة — مفهرسةً بـ`docId`.
 * تُستعمل في لوحة الجرد لتقول بجوار الأصل «صُرف منه ١٢ وأُدخل ٥».
 */
export function movementByAsset(cards) {
  const out = new Map();
  for (const c of (cards ?? []).filter((x) => x.state === 'posted')) {
    const kind = cardKind(c.kind);
    if (!kind) continue;
    for (const line of c.lines ?? []) {
      const key = lineAssetKey(line);
      if (!key) continue;
      const l = normalizeCardLine(line);
      const q = Number.isFinite(l.qty) ? l.qty : 0;
      const prev = out.get(key) || { issued: 0, received: 0, cards: 0 };
      out.set(key, {
        issued: prev.issued + (kind.sign === -1 ? q : 0),
        received: prev.received + (kind.sign === 1 ? q : 0),
        cards: prev.cards + 1,
      });
    }
  }
  return out;
}
