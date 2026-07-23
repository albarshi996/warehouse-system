/**
 * بناء مستندات الاجتماعات — دوال خالصة تُعيد نصّ HTML، بلا DOM ولا متصفّح.
 *
 * ثلاثة مخرجات من مصدر واحد:
 *   1. شرائح **وضع العرض** — ما نطلبه · لماذا · ما يخصّ الطرف الآخر
 *   2. **المحضر الرسمي** — الجدول والقرارات والحاضرون والتوقيعات
 *   3. **خطاب الدعوة** — بنود الإدارة ونصوص الخطاب الرسمي حرفيًّا
 *
 * ولماذا خالصة؟ لأنها تُختبَر في Node بلا متصفّح، والصفحة محميّة بالدخول
 * فلا سبيل لفحصها بصريًّا دون حساب — وهذا الدرس تعلّمناه في دفعة الهيكل.
 */
import { ITEM_STATES, meetingProgress, itemsByState } from './meetingsModel.js';

/** تهريب HTML — كل نصّ يمرّ من هنا قبل الحقن. */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** يحوّل أسطر النصّ إلى فقرات — الحقول متعددة الأسطر تُكتب في الغرفة. */
function multiline(s) {
  return esc(s)
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => `<p>${l}</p>`)
    .join('');
}

/** شارة حالة البند. */
export function stateBadge(state) {
  const s = ITEM_STATES[state] || ITEM_STATES.pending;
  return `<span class="mb" style="background:${s.color}1f;color:${s.color};">${s.emoji} ${esc(s.label)}</span>`;
}

/* ═══════════════ 1) وضع العرض ═══════════════ */

/**
 * شريحة بندٍ واحد لعرضها على الشاشة في الاجتماع.
 * @param {object} item
 * @param {object} opts { index, total, dept }
 */
export function slideHtml(item, opts = {}) {
  const { index = 0, total = 0, dept = '' } = opts;
  const block = (icon, label, text, cls) =>
    text && String(text).trim()
      ? `<div class="sl-box ${cls}"><h4>${icon} ${esc(label)}</h4>${multiline(text)}</div>`
      : '';

  return (
    `<div class="slide">` +
    `<div class="sl-head"><span class="sl-count">البند ${index + 1} من ${total}</span>` +
    (dept ? `<span class="sl-dept">${esc(dept)}</span>` : '') +
    (item.draft ? `<span class="sl-draft">مسودّة — عدّلها قبل العرض</span>` : '') +
    `</div>` +
    `<h2 class="sl-title">${esc(item.title)}</h2>` +
    block('🎯', 'ما نطلبه', item.ask, 'ask') +
    block('❓', 'لماذا', item.why, 'why') +
    block('🤝', `ما يخصّ ${dept || 'الطرف الآخر'}`, item.theirSide, 'them') +
    (item.decision && String(item.decision).trim()
      ? `<div class="sl-box decided"><h4>✅ القرار المتفق عليه</h4>${multiline(item.decision)}</div>`
      : '') +
    `</div>`
  );
}

/** كل شرائح الاجتماع بالترتيب. */
export function slidesHtml(meeting) {
  const items = meeting.items || [];
  return items
    .map((it, i) => slideHtml(it, { index: i, total: items.length, dept: meeting.dept }))
    .join('');
}

/* ═══════════════ 2) المحضر الرسمي ═══════════════ */

/*
 * التوقيعان المعتمدان (قرار المالك 23.07.2026): حين يطابق اسم الموقّع أحد
 * المديرَين تُدرَج صورة توقيعه الرسمية فوق سطر التوقيع تلقائيًّا.
 * الملفات في public/identity/signatures — والمطابقة باسم العائلة تتسامح مع
 * كتابة الاسم كاملًا أو مختصرًا.
 */
const OFFICIAL_SIGNATURES = [
  { match: 'البرشي', file: 'identity/signatures/signature-2.png' },
  { match: 'الباش', file: 'identity/signatures/signature-1.png' },
];

function officialSigFile(name) {
  const hit = OFFICIAL_SIGNATURES.find((o) => String(name || '').includes(o.match));
  return hit ? hit.file : '';
}

function sigBlock(signatories, assetBase = '') {
  const list = (signatories || []).filter((s) => String(s.name || '').trim());
  if (!list.length) return '';
  return (
    `<div class="d-sigs">` +
    list
      .map((s) => {
        const file = officialSigFile(s.name);
        const img = file
          ? `<img class="sig-img" src="${esc(assetBase + file)}" alt="توقيع ${esc(s.name)}">`
          : '';
        return (
          `<div class="d-sig">${img}<div class="line"></div><b>${esc(s.name)}</b>` +
          `<span>${esc(s.role || '')}</span></div>`
        );
      })
      .join('') +
    `</div>`
  );
}

function attendeesBlock(attendees) {
  const list = (attendees || []).filter((a) => String(a.name || '').trim());
  if (!list.length) return '<p class="d-muted">لم يُسجَّل حاضرون.</p>';
  return (
    `<ul class="d-att">` +
    list
      .map((a) => `<li><b>${esc(a.name)}</b>${a.role ? ` — ${esc(a.role)}` : ''}${a.side === 'us' ? ' <i>(إدارتنا)</i>' : ''}</li>`)
      .join('') +
    `</ul>`
  );
}

/**
 * المحضر الرسمي كاملًا — يُطبع ويُصدَّر PDF.
 * @param {object} meeting
 * @param {object} opts { meta, orgTitle }
 */
export function minutesHtml(meeting, opts = {}) {
  const meta = opts.meta || {};
  const org = opts.orgTitle || 'إدارة السلاسل والإمداد والمخازن';
  const p = meetingProgress(meeting);
  const rows = (meeting.items || [])
    .map(
      (it, i) =>
        `<tr><td class="d-n">${i + 1}</td>` +
        `<td><b>${esc(it.title)}</b>${it.discussion && it.discussion.trim() ? `<div class="d-disc">${multiline(it.discussion)}</div>` : ''}</td>` +
        `<td>${it.decision && it.decision.trim() ? multiline(it.decision) : '<span class="d-muted">—</span>'}</td>` +
        `<td>${esc(it.ownerUs || '—')}<br><span class="d-muted">${esc(it.ownerThem || '')}</span></td>` +
        `<td class="d-c">${esc(it.due || '—')}</td>` +
        `<td class="d-c">${stateBadge(it.state)}</td></tr>`
    )
    .join('');

  const escalated = itemsByState(meeting, 'escalate');

  return (
    `<div class="doc">` +
    `<div class="d-head"><div class="d-logo">Brandzo</div>` +
    `<div class="d-t"><h1>محضر اجتماع تحضيري</h1>` +
    `<div class="en">Preparatory Meeting Minutes · Brandzo Hub</div></div>` +
    `<div class="d-ref">${esc(meeting.number || 'بلا رقم')}<br>${esc(meeting.date || '')}</div></div>` +

    `<div class="d-grid">` +
    `<div class="cell lbl">الطرف الأول</div><div class="cell">${esc(org)}</div>` +
    `<div class="cell lbl">الطرف الثاني</div><div class="cell">${esc(meeting.dept)}</div>` +
    `<div class="cell lbl">التاريخ</div><div class="cell">${esc(meeting.date || '—')}</div>` +
    `<div class="cell lbl">المكان</div><div class="cell">${esc(meeting.place || '—')}</div>` +
    `<div class="cell lbl">عدد البنود</div><div class="cell">${p.total} بندًا — ${p.agreed} متفق عليه · ${p.deferred} مؤجَّل · ${p.escalate} للتصعيد</div>` +
    `</div>` +

    (meeting.goal ? `<div class="d-goal"><b>هدف الاجتماع:</b> ${esc(meeting.goal)}</div>` : '') +

    `<h3 class="d-h">الحاضرون</h3>${attendeesBlock(meeting.attendees)}` +

    `<h3 class="d-h">بنود الاجتماع وما اتُّفق عليه</h3>` +
    `<table class="d-tbl"><thead><tr><th>#</th><th>البند</th><th>القرار المتفق عليه</th>` +
    `<th>المسؤول</th><th>الموعد</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table>` +

    (escalated.length
      ? `<div class="d-warn"><b>بنود تحتاج تصعيدًا للإدارة العامة (${escalated.length}):</b> ` +
        escalated.map((i) => esc(i.title)).join(' · ') +
        `</div>`
      : '') +

    (meeting.notes && meeting.notes.trim() ? `<h3 class="d-h">ملاحظات</h3>${multiline(meeting.notes)}` : '') +

    (meta.outcome ? `<div class="d-outcome">${esc(meta.outcome)}</div>` : '') +

    sigBlock(meeting.signatories, opts.assetBase || '') +
    `<div class="d-foot">وُلّد من نظام Brandzo Hub — ${esc(meeting.number || '')} · لا يُعتد بمحضر غير مُرقَّم</div>` +
    `</div>`
  );
}

/* ═══════════════ 3) خطاب الدعوة ═══════════════ */

/**
 * خطاب دعوة رسمي موجَّه لإدارة بعينها، ببنودها ونصوص الخطاب حرفيًّا.
 * @param {object} meeting
 * @param {object} opts { meta, orgTitle, signatories, date }
 */
export function invitationHtml(meeting, opts = {}) {
  const meta = opts.meta || {};
  const org = opts.orgTitle || 'إدارة السلاسل والإمداد والمخازن';
  const sigs = opts.signatories || meeting.signatories || [];
  const items = (meeting.items || [])
    .map((it, i) => `<li><span class="l-n">${i + 1}</span> ${esc(it.title)}</li>`)
    .join('');

  return (
    `<div class="doc letter">` +
    `<div class="d-head"><div class="d-logo">Brandzo</div>` +
    `<div class="d-t"><h1>دعوة لاجتماع تحضيري</h1>` +
    `<div class="en">Preparatory Meeting Invitation · Brandzo Hub</div></div>` +
    `<div class="d-ref">${esc(meeting.letterNumber || 'بلا رقم')}<br>${esc(opts.date || meta.issuedAt || '')}</div></div>` +

    `<p class="l-to"><b>السادة / ${esc(meeting.dept)}</b> &nbsp;&nbsp; المحترمين</p>` +
    `<p class="l-sub"><b>الموضوع:</b> اجتماع تحضيري رقم (${esc(meeting.no)}) — ${esc(meeting.dept)}</p>` +
    `<p class="l-greet">تحية طيبة وبعد،</p>` +

    (meta.preamble ? `<p class="l-body">${esc(meta.preamble)}</p>` : '') +
    (meeting.goal ? `<p class="l-body"><b>هدف اجتماعكم:</b> ${esc(meeting.goal)}</p>` : '') +

    `<p class="l-body"><b>الموضوعات المطروحة للنقاش:</b></p>` +
    `<ol class="l-items">${items}</ol>` +

    (meeting.date
      ? `<p class="l-body"><b>الموعد المقترح:</b> ${esc(meeting.date)}${meeting.place ? ` — ${esc(meeting.place)}` : ''}</p>`
      : '') +

    (meta.outcome ? `<p class="l-body"><b>المخرج النهائي للخطة:</b> ${esc(meta.outcome)}</p>` : '') +
    (meta.closing ? `<p class="l-close">${esc(meta.closing)}</p>` : '') +

    sigBlock(sigs, opts.assetBase || '') +
    `<div class="d-foot">${esc(org)} — ${esc(meeting.letterNumber || '')}</div>` +
    `</div>`
  );
}

/* ═══════════════ بطاقات القائمة ═══════════════ */

/** بطاقة اجتماع في اللوحة الرئيسية. */
export function meetingCardHtml(meeting, opts = {}) {
  const p = meetingProgress(meeting);
  const st = opts.states?.[meeting.state] || { label: meeting.state, emoji: '', color: '#64748b' };
  return (
    `<button class="mcard${opts.selectedId === meeting.id ? ' sel' : ''}" onclick="selectMeeting('${esc(meeting.id)}')">` +
    `<div class="mc-top"><span class="mc-no">${esc(meeting.no)}</span>` +
    `<span class="mc-ico">${esc(meeting.icon || '')}</span>` +
    `<span class="mc-dept">${esc(meeting.dept)}</span></div>` +
    `<div class="mc-state" style="color:${st.color};">${st.emoji} ${esc(st.label)}</div>` +
    `<div class="mc-bar"><span style="width:${p.percent}%"></span></div>` +
    `<div class="mc-meta">${p.settled}/${p.total} بندًا محسومًا` +
    (meeting.number ? ` · ${esc(meeting.number)}` : '') +
    `</div></button>`
  );
}
