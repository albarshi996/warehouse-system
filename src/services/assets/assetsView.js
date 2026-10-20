/**
 * بناءُ HTML جرد الأصول — دوالُّ خالصةٌ تُعيد نصًّا، بلا DOM وبلا متصفّح.
 *
 * ولمَ هنا لا داخل الصفحة؟ لأنّ ما كان في الوسم **لا يبلغه اختبار** (حارسُ
 * القسم ٧ في `audit-portal.mjs`)، وفي هذا المركَّب ثلاثةُ أشياءَ تستحقّ
 * حارسًا:
 *
 *   ① **التهريبُ**: اسمُ أصلٍ فيه `<` أو `"` يُحقن في `innerHTML` و
 *      في `onclick='…'` معًا — ومهرِّبا الاثنين مختلفان (`esc` و`escJsAttr`).
 *      وخطأٌ في أحدهما لا يُرى في جردٍ عربيٍّ نظيف، ويُرى يوم يأتي اسمٌ غريب.
 *   ② **حصرُ الكتابة**: صفٌّ يرسم زرَّ تكهينٍ لقارئٍ لا يملكها يُضغط فيُرفَض
 *      من القاعدة — فيُقرأ «النظامُ معطوب» لا «لا صلاحيّة».
 *   ③ **علامةُ المكهَّن**: أصلٌ خارجٌ يُعرض كالقائم يُقرأ جردًا، وهو **أخطرُ
 *      من غيابه**: الغائبُ يُسأل عنه، والمعروضُ بلا علامةٍ يُصدَّق.
 *
 * (نمطُ `orgView.js` و`meetingsView.js` في هذا المستودع نفسِه.)
 */
import { esc, escJsAttr } from '../ui/escape.js';
import { conditionBadgeClass } from './assetsModel.js';

const dash = (v) => esc(v || '—');

/** شارةُ الحالة — والمجهولُ يقع على «جيد» كما كانت الشاشة تفعل. */
export const conditionBadge = (condition) =>
  `<span class="badge ${conditionBadgeClass(condition)}">${esc(condition || '—')}</span>`;

/** وسمُ «مكهَّن» بجوار الاسم — فأصلٌ خارجٌ لا يُعرض كالقائم. */
export const archivedTag = (a) => (a?.archived ? '<span class="arch-tag">مكهَّن</span>' : '');

/** سببُ التكهين تحت الاسم — مكتوبٌ لا مُضمَر. */
export const archivedWhy = (a) =>
  a?.archived && a?.archiveReason ? `<div class="arch-why">سببُ التكهين: ${esc(a.archiveReason)}</div>` : '';

/**
 * أزرارُ الصفّ — **وقارئٌ لا يرى زرًّا يُرفَض عند ضغطه**.
 * و`compact` للجدول (أيقوناتٌ) وغيرُه للبطاقة (أيقونةٌ ونصّ).
 */
export function rowActions(a, canWrite, { compact = true } = {}) {
  if (!canWrite) return compact ? '<span style="color:var(--muted);font-size:11px">قراءة</span>' : '';
  const id = escJsAttr(a.id);
  if (a.archived) {
    return `<button class="btn btn-ghost btn-sm" onclick="openRestoreModal('${id}')" title="أرجِعه إلى الجرد">↺ ${compact ? 'أرجِع' : 'أرجِع إلى الجرد'}</button>`;
  }
  return `<button class="btn btn-ghost btn-sm" onclick="startEdit('${id}')" title="تعديل">✎${compact ? '' : ' تعديل'}</button>`
    + `<button class="btn btn-danger btn-sm" onclick="openArchModal('${id}')" title="تكهين — لا حذف">⊘${compact ? '' : ' كهّن'}</button>`;
}

/** صفوفُ الجدول. و`i` للتدرّج الزمنيّ في الظهور لا غير. */
export function tableRowsHtml(assets, canWrite) {
  return (assets ?? []).map((a, i) => `
    <tr class="${a.archived ? 'is-archived' : ''}" style="animation:fadeInUp .3s ease-out ${i * 0.03}s both">
      <td class="asset-id">${esc(a.id)}</td>
      <td>
        <div class="asset-name">${esc(a.assetName)}${archivedTag(a)}</div>
        <div class="asset-type">${esc(a.assetType)}</div>
        ${archivedWhy(a)}
      </td>
      <td>
        <div>${dash(a.brand)}</div>
        <div class="mono">${dash(a.serial)}</div>
      </td>
      <td style="text-align:center;font-weight:700">${a.qty || 1}</td>
      <td>${conditionBadge(a.condition)}</td>
      <td>${dash(a.responsible)}</td>
      <td style="color:var(--muted)">${dash(a.department)}</td>
      <td style="color:var(--muted)">${dash(a.location)}</td>
      <td class="mono">${dash(a.receivedDate)}</td>
      <td><div style="display:flex;gap:6px">${rowActions(a, canWrite)}</div></td>
    </tr>`).join('');
}

/** بطاقاتُ عرض الشبكة. */
export function cardsHtml(assets, canWrite) {
  return (assets ?? []).map((a) => `
    <div class="asset-card${a.archived ? ' is-archived' : ''}">
      <div class="card-header">
        <div>
          <div class="card-name">${esc(a.assetName)}${archivedTag(a)}</div>
          <div class="card-type">${esc(a.assetType)}</div>
        </div>
        ${conditionBadge(a.condition)}
      </div>
      <div class="card-detail">🔑 <span class="mono" style="color:var(--brand-secondary)">${esc(a.id)}</span></div>
      <div class="card-detail">🏷 ${dash(a.brand)} · <span class="mono">${dash(a.serial)}</span></div>
      <div class="card-detail">👤 ${dash(a.responsible)}</div>
      <div class="card-detail">🏢 ${dash(a.department)}${a.location ? ' · ' + esc(a.location) : ''}</div>
      ${archivedWhy(a)}
      ${canWrite ? `<div class="card-actions">${rowActions(a, canWrite, { compact: false })}</div>` : ''}
    </div>`).join('');
}

/**
 * سطرُ العدّ — **ويقول كم مكهَّنًا أُخفي**.
 * فجردٌ يُعرض ناقصًا بلا إشارةٍ إلى نقصه يُقرأ تامًّا.
 */
export function countLineHtml({ shown, base, hidden }) {
  return `عرض <strong>${shown}</strong> من <strong>${base}</strong> أصل`
    + (hidden > 0 ? ` <span style="color:#c2410c">· ${hidden} مكهَّنٌ مخفيّ</span>` : '');
}

/**
 * أعمدةُ توزيع الإدارات — نسبةُ العرض من الأكبر لا من المجموع، فإدارةٌ
 * واحدةٌ تملأ عمودَها ولا تظهر شريطًا ضامرًا.
 */
export function deptBarsHtml(departments) {
  const list = departments ?? [];
  const mx = Math.max(...list.map((e) => e[1]), 1);
  return list.map(([d, c]) => `
      <div class="bar-row">
        <div class="bar-label">${esc(d)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(c / mx) * 100}%"><span class="bar-count">${c}</span></div></div>
      </div>`).join('');
}

/**
 * حقولُ نموذج الأصل: **خريطةٌ واحدةٌ** تربط مُعرِّفَ الحقل في الصفحة بحقل
 * السجلّ وقيمتِه الفارغة.
 *
 * ★★★ وكانت ثلاثَ قوائمَ متوازيةٍ في الوسم (تفريغٌ · تعبئةٌ · قراءة)، وهو
 * عطبٌ ينتظر: حقلٌ يُضاف إلى النموذج ويُنسى في قائمة التفريغ **يحمل قيمةَ
 * الأصل السابق** إلى الأصل الجديد — ولا شيء يشتكي. فخريطةٌ واحدةٌ تخدم
 * الثلاثةَ، واختبارٌ يحرس أنّها تغطّي شكلَ السجلّ كلَّه.
 *
 * و`today: true` على تاريخ الاستلام: يُفرَّغ إلى **يومِ التقويم المحلّيّ**.
 * (وكان الوسمُ يكتب `toISOString()` أي UTC، وليبيا على +2 — فمنتصفُ الليل
 * محلّيًّا هو أمسُ بتوقيت UTC، فيُفتح النموذجُ على تاريخِ أمس. وهو عطبُ
 * «اليوم الواحد» الذي عُولج في `normalizeReceivedDate` ثمّ عاد من هذا الباب.)
 */
export const FORM_FIELDS = [
  { id: 'f-type',        key: 'assetType',    empty: '',     required: true },
  { id: 'f-name',        key: 'assetName',    empty: '',     required: true },
  { id: 'f-brand',       key: 'brand',        empty: '' },
  { id: 'f-serial',      key: 'serial',       empty: '' },
  { id: 'f-qty',         key: 'qty',          empty: 1,      required: true },
  { id: 'f-cond',        key: 'condition',    empty: 'جيد' },
  { id: 'f-responsible', key: 'responsible',  empty: '' },
  { id: 'f-dept',        key: 'department',   empty: '',     required: true },
  { id: 'f-section',     key: 'section',      empty: '' },
  { id: 'f-location',    key: 'location',     empty: '' },
  { id: 'f-date',        key: 'receivedDate', empty: '',     today: true },
  { id: 'f-notes',       key: 'notes',        empty: '' },
];

/**
 * مُعرِّفاتُ الحقول الناقصة — لتُعلَّم بـ`.error` في الشاشة.
 * والكمّيّةُ تُقاس رقمًا لا نصًّا فارغًا: «صفر» مكتوبٌ وهو ناقص.
 */
export function missingFormFields(values) {
  const v = values ?? {};
  return FORM_FIELDS.filter((f) => {
    if (!f.required) return false;
    if (f.key === 'qty') {
      const n = Number.parseInt(v.qty, 10);
      return !Number.isFinite(n) || n < 1;
    }
    return !String(v[f.key] ?? '').trim();
  }).map((f) => f.id);
}

/** صفوفُ ورقة الطباعة. */
export function printRowsHtml(assets) {
  return (assets ?? []).map((a) => `
    <tr>
      <td class="pid">${esc(a.id)}</td><td>${dash(a.assetType)}</td>
      <td>${dash(a.assetName)}</td><td>${dash(a.brand)}</td>
      <td>${dash(a.serial)}</td><td style="text-align:center;font-weight:700">${a.qty || 1}</td>
      <td>${conditionBadge(a.condition)}</td>
      <td>${dash(a.responsible)}</td><td>${dash(a.department)}</td>
      <td>${dash(a.section)}</td><td>${dash(a.location)}</td>
      <td>${dash(a.receivedDate)}</td><td>${dash(a.notes)}</td>
    </tr>`).join('');
}
