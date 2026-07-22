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

/** بطاقات الوصف الوظيفي المرتبطة بعقدة. */
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
        `</div>`
    )
    .join('');
}
