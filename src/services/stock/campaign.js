/**
 * ═══════════════════════════════════════════════════════════════════
 *  دمجُ الجلسات في حملةٍ واحدة — «بنغازي أوّلًا ثمّ طرابلس»
 * ═══════════════════════════════════════════════════════════════════
 *
 * ═══ ★★★ ولمَ الدمجُ منطقيٌّ لا فيزيائيّ ═══
 * قاعدةُ `scans` تمنع التعديلَ والحذفَ منعًا باتًّا (`allow update, delete:
 * if false`) — وهذا مقدَّسٌ في دستور المستودع. فـ**نقلُ** قيود بنغازي إلى
 * جلسة طرابلس مستحيلٌ من أصله.
 *
 * و**نسخُها أسوأ**: القاعدة تشترط `request.resource.data.byUid ==
 * request.auth.uid`، فالمديرُ الذي ينسخ يكتب باسمه هو. فيصير جردُ محمدٍ
 * مكتوبًا «عدّه المدير» — وهو **تزويرٌ للأثر الذي طُلب الدمجُ من أجله**:
 * المالكُ أراد مرجعًا احتياطيًّا يقول من قرأ، فلا يُبنى بمحو أسماء القرّاء.
 *
 * ★★ فالحملةُ **رابطةٌ على الرؤوس**: يُكتب `campaignId` على رأسَي الجلستين،
 * وتبقى كلُّ جلسةٍ بقيودها وكاتبيها كما هي. وشاشةُ المدير تجمع دفترَيهما في
 * جدولٍ واحدٍ بعمود الفرع، وتُصدّرهما ملفًّا واحدًا أو منفصلَين.
 *
 * ★ **وبلا تعديلِ سطرٍ في `firestore.rules`:** قاعدة `operations` تُجيز
 *   `update` للمديرين أصلًا ولا تحصر الحقول. فالميزةُ تعمل يومَ رفعِها، ولا
 *   تنتظر نشرًا من الكونسول — وهذا فرقُ «منجَزٌ عندي» عن «وصل المستخدم».
 *
 * ★ **وفكُّ الدمج مسحُ حقلٍ لا حذفُ بيان** — فلا تُفقد جلسةٌ بفكِّ ارتباطها.
 *
 * منطق خالص: بلا Firestore وبلا DOM.
 */
import { generateOperationCode, normalizeOperationCode } from './operationCode.js';

const str = (v) => String(v ?? '').trim();

/** حدُّ اسم الحملة — سطرٌ يُقرأ في بطاقة، لا فقرة. */
export const MAX_NAME = 60;

/** يولّد معرّف حملةٍ من أبجديّة الرموز نفسها — يُملى صوتًا ولا يلتبس حرفُه برقم. */
export function newCampaignId(rand = Math.random, taken = []) {
  return generateOperationCode(rand, { taken: taken.filter(Boolean) });
}

/** يُطبّع اسم الحملة — والفارغُ يبقى فارغًا فيُعرض بمعرّفه لا باسمٍ مخترع. */
export function normalizeCampaignName(name) {
  return str(name).replace(/\s+/g, ' ').slice(0, MAX_NAME);
}

/**
 * ★★ حكمُ الدمج — ما يجوز وما لا يجوز، ولماذا.
 *
 * القاعدتان اللتان تمنعان فعلًا:
 *   ★ **جلسةٌ واحدةٌ ليست حملة:** الدمجُ رابطةٌ بين اثنتين فأكثر.
 *   ★★ **لا تُدمج أنواعٌ مختلفة:** جردٌ مع استلامٍ يُنتج جدولًا مجموعُه
 *      لا معنى له — الأوّل يقيس ما على الرفّ والثاني يقيس ما دخل. وجمعُهما
 *      في رقمٍ واحدٍ خطأٌ يُقرأ بيانًا.
 *
 * وما **لا** يمنع عمدًا:
 *   · **المُقفَلة تُدمج**: هذا عينُ حالة المالك — بنغازي أُقفلت ثمّ طرابلس.
 *   · **اختلافُ النطاق يُدمج**: فالفرعان مختلفان بالضرورة، وهو الغرض.
 *   · **المنتميةُ لحملةٍ أخرى تُنقل**، ويُعلَن النقلُ ولا يقع صامتًا.
 *
 * @param {object[]} ops رؤوسُ الجلسات المختارة
 * @returns {{ok:boolean, reason:string, notes:string[], type:string, moved:object[]}}
 */
export function mergeVerdict(ops) {
  const list = (Array.isArray(ops) ? ops : []).filter(Boolean);
  const notes = [];
  if (list.length < 2) {
    return { ok: false, reason: 'اختر جلستين على الأقلّ — جلسةٌ واحدةٌ ليست حملة.', notes, type: '', moved: [] };
  }
  const types = [...new Set(list.map((o) => str(o.type)).filter(Boolean))];
  if (types.length > 1) {
    return {
      ok: false,
      reason: `لا تُدمج أنواعٌ مختلفة (${types.join(' · ')}): الجردُ يقيس ما على الرفّ والاستلامُ يقيس ما دخل، وجمعُهما رقمٌ بلا معنى.`,
      notes,
      type: '',
      moved: [],
    };
  }
  const moved = list.filter((o) => str(o.campaignId));
  if (moved.length) {
    notes.push(
      `${moved.length} من المختارة تنتمي لحملةٍ قائمة وستُنقل: ${moved
        .map((o) => normalizeOperationCode(o.code) || o.id.slice(0, 6))
        .join(' · ')}`
    );
  }
  const closed = list.filter((o) => o.status === 'closed').length;
  if (closed) notes.push(`${closed} منها مُقفلة — وتُدمج، فالمقفَلُ تاريخٌ يُقرأ لا يُمنع.`);
  return { ok: true, reason: '', notes, type: types[0] || '', moved };
}

/**
 * يجمع الجلسات في حملاتها — ومن لا حملةَ له يبقى خارجها.
 *
 * @param {object[]} ops
 * @returns {{id:string, name:string, ops:object[], types:string[], lastAt:number}[]}
 *   مرتّبةً بالأحدث.
 */
export function groupByCampaign(ops, { toMillis } = {}) {
  const at = typeof toMillis === 'function' ? toMillis : () => null;
  const map = new Map();
  for (const op of Array.isArray(ops) ? ops : []) {
    const id = str(op?.campaignId);
    if (!id) continue;
    const cur = map.get(id) || { id, name: '', ops: [], types: new Set(), lastAt: 0 };
    cur.ops.push(op);
    if (op.type) cur.types.add(str(op.type));
    // آخرُ اسمٍ مكتوبٍ يفوز — فإعادةُ التسمية تصل كلَّ الأعضاء بلا كتابةٍ ثانية.
    const nm = normalizeCampaignName(op?.campaignName);
    if (nm) cur.name = nm;
    const raw = at(op);
    const ms = raw == null ? null : Number(raw);
    if (ms != null && Number.isFinite(ms) && ms > cur.lastAt) cur.lastAt = ms;
    map.set(id, cur);
  }
  return [...map.values()]
    .map((c) => ({ ...c, types: [...c.types] }))
    .sort((a, b) => b.lastAt - a.lastAt);
}

/** اسمُ الحملة كما يُعرض — وبلا اسمٍ يُعرض معرّفُها لا فراغ. */
export function campaignLabel(campaign) {
  const name = normalizeCampaignName(campaign?.name);
  const id = str(campaign?.id);
  if (name && id) return `${name} (${id})`;
  return name || id || '—';
}

/**
 * ★ صفوفُ الحملة — دفاترُ الجلسات مجموعةً **وكلُّ صفٍّ يحمل فرعَه**.
 *
 * ولا تُجمع القيود في صفٍّ واحدٍ لكلّ صنف: المقصودُ سجلٌّ يُحتجّ به، فيبقى
 * كلُّ قيدٍ بقارئه ووقته وفرعه. والتجميعُ فوق ذلك يُبنى من هذه الصفوف.
 *
 * @param {{op:object, rows:object[]}[]} parts لكلّ جلسةٍ رأسُها وصفوفُ سجلّها
 * @param {(op:object)=>string} branchOf يُشتقّ نصُّ الفرع من الرأس (يُحقن)
 * @returns {object[]} مرتّبةً بالأحدث عبر الجلستين معًا
 */
export function campaignLogRows(parts, branchOf) {
  const label = typeof branchOf === 'function' ? branchOf : () => '';
  const out = [];
  for (const part of Array.isArray(parts) ? parts : []) {
    const op = part?.op || {};
    const branch = str(label(op));
    const opCode = normalizeOperationCode(op?.code) || str(op?.id).slice(0, 6);
    for (const r of Array.isArray(part?.rows) ? part.rows : []) {
      out.push({ ...r, branch, opCode, opId: str(op?.id) });
    }
  }
  return out.sort((a, b) => {
    if (a.atMs == null && b.atMs == null) return 0;
    if (a.atMs == null) return -1;
    if (b.atMs == null) return 1;
    return b.atMs - a.atMs;
  });
}

/** توزيعُ عمل الحملة على الفروع — «كم عُدّ في بنغازي وكم في طرابلس». */
export function byBranch(rows) {
  const m = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const key = r.branch || '—';
    const cur = m.get(key) || { branch: key, scans: 0, base: 0, items: new Set(), people: new Set() };
    cur.scans++;
    cur.base += Number(r.base) || 0;
    cur.items.add(r.barcode || r.sku || r.name);
    cur.people.add(r.byName);
    m.set(key, cur);
  }
  return [...m.values()]
    .map((v) => ({
      branch: v.branch,
      scans: v.scans,
      base: Math.round(v.base * 1e6) / 1e6,
      items: v.items.size,
      people: v.people.size,
    }))
    .sort((a, b) => b.scans - a.scans);
}
