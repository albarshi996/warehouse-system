/**
 * بناء HTML الهيكل التنظيمي — دوال خالصة تُعيد نصًّا، بلا DOM وبلا متصفّح.
 *
 * لماذا هنا لا داخل الصفحة؟ لأن **نفس** هذه الدوال تُستخدم في ثلاثة مواضع:
 *   1. الصفحة التفاعلية `/dashboard/org-structure` (عرض وتعديل)
 *   2. قالب الطباعة/PDF بهوية Brandzo
 *   3. سكربت `build-org.mjs` الذي يحقن الهيكل في التقريرين المنشورين
 * فلو انحرف أحدها عن الآخر عاد العيب الذي جئنا لعلاجه. ووجودها خالصةً
 * يعني أنها تُختبَر في Node بلا متصفّح.
 */
import { flatten, TYPE_LABELS } from './orgModel.js';

/** تهريب HTML — كل نصّ يمرّ من هنا قبل الحقن. */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** أنماط الصناديق: `portal` لصفحة البوابة، `report` لتقارير public. */
export const CHART_SKINS = {
  portal: {
    nodeClass: 'cnode',
    typeClass: (t) => `t-${t || 'unit'}`,
    proposedClass: 'prop',
  },
  report: {
    nodeClass: 'org-node',
    typeClass: (t) => (t === 'management' ? 'root' : t === 'section' ? 'dept' : 'unit'),
    proposedClass: 'proposed',
  },
};

/**
 * المخطط الهرمي المتشعّب (`<ul><li>`) — نفس تقنية شجرة CSS في التقارير.
 *
 * @param {object} node   عقدة الجذر
 * @param {object} opts   { skin, showProposed, collapsed:Set, onClick, showHolder }
 */
export function chartHtml(node, opts = {}) {
  const skin = CHART_SKINS[opts.skin || 'portal'] || CHART_SKINS.portal;
  const showProposed = opts.showProposed !== false;
  const collapsed = opts.collapsed || new Set();
  const showHolder = opts.showHolder !== false;

  function li(n) {
    if (!showProposed && n.source === 'proposed') return '';
    const kids = (n.children || []).filter((c) => showProposed || c.source !== 'proposed');
    const inner = kids.length && !collapsed.has(n.id) ? `<ul>${kids.map(li).join('')}</ul>` : '';
    const cls = [skin.nodeClass, skin.typeClass(n.type), n.source === 'proposed' ? skin.proposedClass : '']
      .filter(Boolean)
      .join(' ');
    const click = opts.onClick ? ` onclick="${opts.onClick}('${esc(n.id)}')"` : '';
    const who = showHolder && n.holder ? `<span class="who">👤 ${esc(n.holder)}</span>` : '';
    const icon = n.icon ? `${esc(n.icon)} ` : '';
    return `<li><div class="${cls}"${click}>${icon}${esc(n.title)}${who}</div>${inner}</li>`;
  }

  const body = li(node);
  return body ? `<ul>${body}</ul>` : '';
}

/** هل العقدة أو أحد آبائها مقترح؟ (لإخفاء الفرع كاملًا عند إطفاء المقترحات) */
function branchHasProposedAncestor(rows, index) {
  const { path } = rows[index];
  for (let i = 0; i < index; i++) {
    const r = rows[i];
    if (r.node.source === 'proposed' && path.length > r.path.length && r.path.every((t, k) => path[k] === t)) {
      return true;
    }
  }
  return false;
}

/**
 * الشجرة المسنّنة القابلة للتعديل (صفوف `div.orow`).
 * @param {object} tree
 * @param {object} opts { selectedId, collapsed:Set, showProposed, term }
 */
export function treeRowsHtml(tree, opts = {}) {
  const { selectedId = null, collapsed = new Set(), showProposed = true, term = '' } = opts;
  const rows = flatten(tree);
  const out = [];

  rows.forEach((row, i) => {
    const { node, depth, path } = row;
    if (!showProposed && node.source === 'proposed') return;
    if (!showProposed && branchHasProposedAncestor(rows, i)) return;

    // مطويّ: أي جدّ في المسار مطويّ ⇒ لا يُعرض
    const foldedAncestor = rows
      .slice(0, i)
      .some((r) => collapsed.has(r.node.id) && path.length > r.path.length && r.path.every((t, k) => path[k] === t));
    if (foldedAncestor) return;

    const kids = (node.children || []).length;
    const tw = kids ? (collapsed.has(node.id) ? '▶' : '▼') : '•';
    const hit = term && [node.title, node.titleEn, node.holder].some((x) => String(x || '').includes(term));

    out.push(
      `<div class="orow t-${node.type || 'unit'}${selectedId === node.id ? ' sel' : ''}"` +
        ` style="margin-right:${depth * 22}px" data-id="${esc(node.id)}" onclick="selectNode('${esc(node.id)}')">` +
        `<span class="tw" onclick="event.stopPropagation();toggleFold('${esc(node.id)}')">${tw}</span>` +
        `<span class="ico">${esc(node.icon || (node.type === 'subunit' ? '·' : '▫'))}</span>` +
        `<span><span class="ttl${hit ? ' ohit' : ''}">${esc(node.title)}</span>` +
        (node.titleEn ? `<span class="en"> — ${esc(node.titleEn)}</span>` : '') +
        `</span>` +
        `<span class="otag tg-type">${esc(TYPE_LABELS[node.type] || node.type || '—')}</span>` +
        (node.source === 'proposed' ? `<span class="otag tg-prop">مقترح</span>` : '') +
        (node.source === 'owner' ? `<span class="otag tg-owner">باعتمادك</span>` : '') +
        (node.holder ? `<span class="otag tg-holder">👤 ${esc(node.holder)}</span>` : '') +
        ((node.pages || []).length ? `<span class="otag tg-pages">🔗 ${(node.pages || []).length}</span>` : '') +
        `</div>`
    );
  });

  return out.join('');
}

/** شريط الوظائف المساندة (خارج التبعية المباشرة). */
export function supportBandHtml(supportFunctions, opts = {}) {
  const cls = opts.cls || 'supp';
  return (supportFunctions || [])
    .map(
      (s) =>
        `<div class="${cls}">${esc(s.icon || '')} ${esc(s.title)}` +
        `<small>${esc(s.note || s.titleEn || '')}</small></div>`
    )
    .join('');
}

/** صفوف جدول الكادر (بلا وسم الجدول — ليصلح للصفحة وللتقارير معًا). */
export function staffingRowsHtml(staffing) {
  return (staffing || [])
    .map(
      (r) =>
        `<tr><td><b>${esc(r.unit)}</b></td><td>${esc(r.phase1)}</td>` +
        `<td>${esc(r.phase2)}</td><td>${esc(r.role)}</td></tr>`
    )
    .join('');
}

/** قائمة الفروق قبل/بعد. */
export function diffListHtml(diff) {
  return [
    ...diff.added.map((x) => `<div class="diffrow d-add"><b>＋ أُضيف</b> «${esc(x.title)}» تحت ${esc(x.under || 'الجذر')}</div>`),
    ...diff.removed.map((x) => `<div class="diffrow d-del"><b>✕ حُذف</b> «${esc(x.title)}» من ${esc(x.under || 'الجذر')}</div>`),
    ...diff.renamed.map((x) => `<div class="diffrow d-ren"><b>✎ أُعيدت التسمية</b> «${esc(x.from)}» ← «${esc(x.to)}»</div>`),
    ...diff.moved.map((x) => `<div class="diffrow d-mov"><b>⇄ نُقل</b> «${esc(x.title)}» من ${esc(x.from)} إلى ${esc(x.to)}</div>`),
  ].join('');
}

/**
 * كتلة «المتطلبات الوظيفية» — مشتركة بين بطاقة تفاصيل العقدة وشبكة كل الأدوار.
 * تُعيد '' إن لم تكن هناك متطلبات (الحقل اختياريّ فلا تنكسر البطاقات القديمة).
 */
export function jobRequirementsHtml(req) {
  if (!req) return '';
  const rows = [
    `<div class="jobreq-row"><b>المؤهل:</b> ${esc(req.education || '—')}` +
      (req.experienceYears ? ` · <b>الخبرة:</b> ${esc(req.experienceYears)}+ سنوات` : '') +
      `</div>`,
    req.skills && req.skills.length
      ? `<div class="jobreq-row"><b>المهارات:</b> ${req.skills.map(esc).join(' · ')}</div>`
      : '',
    req.certifications && req.certifications.length
      ? `<div class="jobreq-row"><b>الشهادات:</b> ${req.certifications.map(esc).join(' · ')}</div>`
      : '',
    req.notes ? `<div class="jobreq-note">${esc(req.notes)}</div>` : '',
  ]
    .filter(Boolean)
    .join('');
  return `<div class="jobreq"><div class="jobreq-h">المتطلبات الوظيفية</div>${rows}</div>`;
}

/** بطاقات الوصف الوظيفي المرتبطة بعقدة (تُظهر المهام + المتطلبات). */
export function jobCardsHtml(jobs, opts = {}) {
  const max = opts.maxDuties || 4;
  return (jobs || [])
    .map(
      (j) =>
        `<div class="jobcard"><h5>${esc(j.icon || '')} ${esc(j.title)}` +
        (j.holder ? ` — ${esc(j.holder)}` : '') +
        `</h5><div class="meta">${esc(j.layer)}` +
        (j.formerTitle ? ` · <b style="color:#b45309;">كان: ${esc(j.formerTitle)}</b>` : '') +
        `</div><div class="meta">التبعية: ${esc(j.reportingTo)}</div>` +
        `<ul>${j.duties.slice(0, max).map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` +
        (j.duties.length > max ? `<div class="meta">+ ${j.duties.length - max} مهام أخرى</div>` : '') +
        jobRequirementsHtml(j.requirements) +
        `</div>`
    )
    .join('');
}

/**
 * الملف التعريفيّ للموظف المُسكَّن — بطاقةٌ احترافيّة تجمع الشخص + الوصف
 * الوظيفيّ + المتطلبات + التبعيّة. `candidate` اختياريّ (يُجلب من التوظيف
 * عند الطلب؛ إن غاب نعرض ما في الوظيفة فقط). لا يكشف السيرة — رابطٌ للتوظيف.
 */
export function employeeProfileHtml(job, candidate, base = '') {
  if (!job) return '<div class="oempty">لا بيانات.</div>';
  const initial = esc((job.holder || '؟').trim().slice(0, 1) || '؟');
  const duties = (job.duties || []).map((d) => `<li>${esc(d)}</li>`).join('');
  const person = candidate
    ? `<div class="empprof-facts">
        ${candidate.qualification ? `<div><span>المؤهل</span><b>${esc(candidate.qualification)}</b></div>` : ''}
        ${candidate.experienceYears ? `<div><span>الخبرة</span><b>${esc(candidate.experienceYears)} سنوات</b></div>` : ''}
        ${candidate.phone ? `<div><span>الهاتف</span><b style="direction:ltr;display:inline-block;">${esc(candidate.phone)}</b></div>` : ''}
        ${candidate.email ? `<div><span>البريد</span><b style="direction:ltr;display:inline-block;">${esc(candidate.email)}</b></div>` : ''}
      </div>`
    : job.holder
      ? '<div class="empprof-note">لا بطاقة مرشّحٍ مربوطة (تسكين يدويّ أو من مصدر الهيكل).</div>'
      : '<div class="empprof-note">المنصب شاغرٌ حاليًّا.</div>';
  return `
    <div class="empprof">
      <div class="empprof-head">
        <div class="empprof-avatar">${initial}</div>
        <div>
          <div class="empprof-name">${esc(job.holder || 'شاغر')}</div>
          <div class="empprof-role">${esc(job.icon || '')} ${esc(job.title)}${job.layer ? ' — ' + esc(job.layer) : ''}</div>
        </div>
      </div>
      ${person}
      <div class="empprof-sec"><h4>الوصف الوظيفيّ / المهام</h4><ul>${duties || '<li>—</li>'}</ul></div>
      ${jobRequirementsHtml(job.requirements)}
      <div class="empprof-sec"><h4>التبعيّة والمؤشّرات</h4>
        <div class="jobreq-row"><b>التبعيّة:</b> ${esc(job.reportingTo || '—')}</div>
        <div class="jobreq-row"><b>المؤشّرات:</b> ${esc(job.kpis || '—')}</div>
      </div>
      ${candidate ? `<a class="pglink" href="${base}/dashboard/recruitment#job=${esc(job.id)}">بطاقة المرشّح الكاملة في التوظيف ←</a>` : ''}
    </div>`;
}

/**
 * شبكة **كل الأدوار** (الكتالوج كاملًا — 36 دورًا) بتفاصيلها، بما فيها وظائف
 * الوظائف المساندة التي لا تظهر عند النقر على شجرة التبعية.
 *
 * @param {Array}  jobs   الكتالوج (JOBS)
 * @param {object} opts   { orgTitles: { [orgId]: عنوان العقدة }, term }
 *   `orgTitles` تُبنى في الصفحة من الشجرة + الوظائف المساندة لعرض «الموقع في الهيكل».
 */
export function allJobsGridHtml(jobs, opts = {}) {
  const titles = opts.orgTitles || {};
  const term = opts.term || '';
  const hire = opts.hireHandler || ''; // اسم دالّة عالميّة لزرّ «توظيف» (اختياريّ)
  const profileH = opts.profileHandler || ''; // زرّ «الملف التعريفيّ» للمُسكّنة
  const editH = opts.editHandler || ''; // زرّ «تعديل» (للمديرين)
  const deleteH = opts.deleteHandler || ''; // زرّ «حذف» (للمديرين)
  const cards = (jobs || [])
    .map((j) => {
      const where = titles[j.orgId] || j.layer || '';
      const occ = j.occupied
        ? `<span class="jobtag occ">مشغول${j.holder ? ' — ' + esc(j.holder) : ''}</span>`
        : `<span class="jobtag vac">شاغرة</span>`;
      const duties = (j.duties || []).map((d) => `<li>${esc(d)}</li>`).join('');
      const hit =
        term &&
        [j.title, j.layer, where, j.holder, ...(j.requirements?.skills || [])].some((x) =>
          String(x || '').includes(term)
        );
      const actions = [
        hire ? `<button type="button" class="jobhire" onclick="${esc(hire)}('${esc(j.id)}')">توظيف لهذا المنصب ←</button>` : '',
        profileH && j.occupied ? `<button type="button" class="jobmini" onclick="${esc(profileH)}('${esc(j.id)}')">الملف التعريفيّ</button>` : '',
        editH ? `<button type="button" class="jobmini" onclick="${esc(editH)}('${esc(j.id)}')">تعديل</button>` : '',
        deleteH ? `<button type="button" class="jobmini danger" onclick="${esc(deleteH)}('${esc(j.id)}')">حذف</button>` : '',
      ].filter(Boolean).join('');
      const actionsBar = actions ? `<div class="jobacts">${actions}</div>` : '';
      return (
        `<div class="jobfull${hit ? ' ohit' : ''}" data-job-id="${esc(j.id)}" data-org-id="${esc(j.orgId || '')}">` +
        `<div class="jobfull-head"><span class="jobfull-ico">${esc(j.icon || '👤')}</span>` +
        `<div class="jobfull-t"><div class="jobfull-title">${esc(j.title)} <span class="jobfull-id">${esc(j.id)}</span></div>` +
        `<div class="jobfull-sub">${esc(where)}</div></div>${occ}</div>` +
        `<div class="jobfull-body">` +
        `<div class="jobfull-sec-h">الوصف الوظيفي / المهام</div>` +
        `<ul class="jobfull-duties">${duties}</ul>` +
        jobRequirementsHtml(j.requirements) +
        actionsBar +
        `</div></div>`
      );
    })
    .join('');
  return `<div class="jobsgrid">${cards}</div>`;
}
