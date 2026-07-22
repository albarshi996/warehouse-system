/**
 * اختبارات بناء HTML الهيكل — تُغني عن فتح المتصفّح لصفحة محميّة بالدخول.
 *
 * تتحقّق من: تعشيش المخطط الصحيح · إخفاء المقترحات يخفي فروعها كاملةً
 * · الطيّ يحجب الأبناء لا الإخوة · تهريب HTML يمنع الحقن · ألّا يتسرّب
 * `undefined` أو `[object Object]` إلى الصفحة (أشيع عيب في بناء النصوص).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { flatten, diffTrees, updateNode, addChild, jobsOfNode } from './orgModel.js';
import {
  esc,
  CHART_SKINS,
  chartHtml,
  treeRowsHtml,
  supportBandHtml,
  staffingRowsHtml,
  diffListHtml,
  jobCardsHtml,
} from './orgView.js';

const SOURCE = JSON.parse(
  readFileSync(new URL('../../data/org-structure.json', import.meta.url), 'utf8')
);

function sample() {
  return {
    id: 'root',
    title: 'الإدارة العليا',
    type: 'management',
    icon: '🏛️',
    holder: 'فلان الفلاني',
    children: [
      {
        id: 'a',
        title: 'قسم أ',
        type: 'section',
        children: [{ id: 'a1', title: 'وحدة أ-1', type: 'unit', children: [] }],
      },
      {
        id: 'p',
        title: 'قسم مقترح',
        type: 'section',
        source: 'proposed',
        children: [{ id: 'p1', title: 'وحدة تحت المقترح', type: 'unit', children: [] }],
      },
    ],
  };
}

/** أي نصّ يُحقن في الصفحة يجب ألّا يحوي هذه الآثار. */
function assertClean(html, where) {
  for (const bad of ['undefined', 'null', '[object Object]', 'NaN']) {
    assert.ok(!html.includes(bad), `${where}: تسرّب «${bad}» إلى الـHTML`);
  }
}

// ═══════════ التهريب ═══════════

test('التهريب يبطل الحقن ولا يترك وسمًا حيًّا', () => {
  const out = esc('<img src=x onerror="alert(1)"> & "اقتباس"');
  assert.ok(!out.includes('<img'));
  assert.ok(out.includes('&lt;img'));
  assert.ok(out.includes('&amp;'));
  assert.ok(out.includes('&quot;'));
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
});

test('مسمّى خبيث في الشجرة يخرج مهرَّبًا لا منفَّذًا', () => {
  const t = updateNode(sample(), 'a', { title: '<script>bad()</script>' });
  const html = chartHtml(t) + treeRowsHtml(t);
  assert.ok(!html.includes('<script>bad()'));
  assert.ok(html.includes('&lt;script&gt;'));
});

// ═══════════ المخطط ═══════════

test('المخطط يعشّش الأبناء داخل ul ويحمل الأنماط الصحيحة', () => {
  const html = chartHtml(sample(), { skin: 'portal' });
  assert.ok(html.startsWith('<ul><li>'));
  assert.ok(html.includes('cnode t-management'));
  assert.ok(html.includes('cnode t-section'));
  assert.ok(html.includes('cnode t-unit'));
  assert.ok(html.includes('👤 فلان الفلاني'));
  assert.equal((html.match(/<ul>/g) || []).length, (html.match(/<\/ul>/g) || []).length, 'وسوم متوازنة');
  assert.equal((html.match(/<li>/g) || []).length, flatten(sample()).length, 'عقدة لكل صندوق');
  assertClean(html, 'chartHtml');
});

test('نمط التقارير يستخدم أصناف org-node لا cnode', () => {
  const html = chartHtml(sample(), { skin: 'report' });
  assert.ok(html.includes('org-node root'));
  assert.ok(html.includes('org-node dept'));
  assert.ok(html.includes('org-node unit'));
  assert.ok(!html.includes('cnode'));
  assert.deepEqual(Object.keys(CHART_SKINS).sort(), ['portal', 'report']);
});

test('إخفاء المقترحات يُسقط العقدة وفرعها كاملًا', () => {
  const full = chartHtml(sample(), { showProposed: true });
  const lean = chartHtml(sample(), { showProposed: false });
  assert.ok(full.includes('قسم مقترح') && full.includes('وحدة تحت المقترح'));
  assert.ok(!lean.includes('قسم مقترح'), 'العقدة المقترحة اختفت');
  assert.ok(!lean.includes('وحدة تحت المقترح'), 'وابنُها معها');
  assert.ok(lean.includes('قسم أ'), 'وغير المقترح باقٍ');
});

test('الطيّ يحجب أبناء العقدة وحدها', () => {
  const html = chartHtml(sample(), { collapsed: new Set(['a']) });
  assert.ok(!html.includes('وحدة أ-1'), 'ابن المطويّ محجوب');
  assert.ok(html.includes('قسم أ'), 'والمطويّ نفسه ظاهر');
  assert.ok(html.includes('قسم مقترح'), 'وإخوته غير متأثّرين');
});

test('onClick يُحقن فقط عند طلبه (لا في الطباعة)', () => {
  assert.ok(chartHtml(sample(), { onClick: 'selectNode' }).includes('onclick="selectNode('));
  assert.ok(!chartHtml(sample()).includes('onclick'));
});

// ═══════════ الشجرة المسنّنة ═══════════

test('الشجرة المسنّنة تُصدر صفًّا لكل عقدة بمسافة بادئة متدرّجة', () => {
  const html = treeRowsHtml(sample());
  assert.equal((html.match(/class="orow/g) || []).length, flatten(sample()).length);
  assert.ok(html.includes('margin-right:0px'));
  assert.ok(html.includes('margin-right:22px'));
  assert.ok(html.includes('margin-right:44px'));
  assertClean(html, 'treeRowsHtml');
});

test('الصف المحدَّد يحمل sel، والمقترح شارته، وشاغل المنصب شارته', () => {
  const html = treeRowsHtml(sample(), { selectedId: 'a' });
  assert.ok(/class="orow t-section sel"/.test(html));
  assert.ok(html.includes('tg-prop">مقترح'));
  assert.ok(html.includes('tg-holder">👤 فلان الفلاني'));
});

test('الطيّ في الشجرة المسنّنة يخفي الأحفاد لا الإخوة', () => {
  const html = treeRowsHtml(sample(), { collapsed: new Set(['a']) });
  assert.ok(!html.includes('وحدة أ-1'));
  assert.ok(html.includes('قسم أ') && html.includes('قسم مقترح'));
  assert.ok(html.includes('▶'), 'سهم المطويّ');
});

test('إخفاء المقترحات في الشجرة المسنّنة يُسقط الفرع كاملًا', () => {
  const html = treeRowsHtml(sample(), { showProposed: false });
  assert.ok(!html.includes('قسم مقترح'));
  assert.ok(!html.includes('وحدة تحت المقترح'));
  assert.equal((html.match(/class="orow/g) || []).length, 3, 'يبقى الجذر وقسم أ ووحدته');
});

test('البحث يبرز المطابق وحده', () => {
  const html = treeRowsHtml(sample(), { term: 'وحدة أ' });
  assert.ok(html.includes('class="ttl ohit"'));
  assert.equal((html.match(/ohit/g) || []).length, 1);
});

// ═══════════ الأجزاء الثابتة ═══════════

test('شريط المساندة وجدول الكادر يخرجان كاملَين من المصدر الحقيقي', () => {
  const supp = supportBandHtml(SOURCE.supportFunctions);
  assert.equal((supp.match(/class="supp"/g) || []).length, SOURCE.supportFunctions.length);
  assertClean(supp, 'supportBandHtml');

  const rows = staffingRowsHtml(SOURCE.staffing);
  assert.equal((rows.match(/<tr>/g) || []).length, SOURCE.staffing.length);
  assert.ok(rows.includes('إدارة السلاسل والإمداد والمخازن'));
  assert.ok(rows.includes('إدارة الخدمات اللوجستية والخدمية'));
  assertClean(rows, 'staffingRowsHtml');
});

test('القوائم الفارغة تُخرج نصًّا فارغًا لا تنهار', () => {
  assert.equal(supportBandHtml(null), '');
  assert.equal(staffingRowsHtml(undefined), '');
  assert.equal(jobCardsHtml([]), '');
});

test('قائمة الفروق تعرض الأنواع الأربعة بأصنافها', () => {
  const before = sample();
  let after = updateNode(before, 'a', { title: 'قسم أ الجديد' });
  after = addChild(after, 'root', { id: 'z', title: 'قسم ز', type: 'section' });
  const html = diffListHtml(diffTrees(before, after));
  assert.ok(html.includes('d-ren') && html.includes('قسم أ الجديد'));
  assert.ok(html.includes('d-add') && html.includes('قسم ز'));
  assertClean(html, 'diffListHtml');
});

// ═══════════ المصدر الحقيقي كاملًا ═══════════

test('المصدر الحقيقي يُرسم كاملًا بلا تسرّب ولا وسم مختلّ', () => {
  const chart = chartHtml(SOURCE.tree, { skin: 'portal' });
  const nodes = flatten(SOURCE.tree).length;
  assert.equal((chart.match(/<li>/g) || []).length, nodes);
  assert.equal((chart.match(/<ul>/g) || []).length, (chart.match(/<\/ul>/g) || []).length);
  assert.equal((chart.match(/<li>/g) || []).length, (chart.match(/<\/li>/g) || []).length);
  assert.ok(chart.includes('إدارة السلاسل والإمداد والمخازن'));
  assert.ok(chart.includes('إدارة الخدمات اللوجستية والخدمية'));
  assert.ok(chart.includes('👤 محمد البرشي') && chart.includes('👤 رمزي الباش'));
  assertClean(chart, 'chartHtml(SOURCE)');

  const rows = treeRowsHtml(SOURCE.tree, { selectedId: 'root' });
  assert.equal((rows.match(/class="orow/g) || []).length, nodes);
  assertClean(rows, 'treeRowsHtml(SOURCE)');
});

test('بطاقات وظائف عقدة حقيقية تُبنى بمهامها وتبعيتها', () => {
  const html = jobCardsHtml(jobsOfNode(SOURCE.jobs, 'mgmt-logistics'));
  assert.ok(html.includes('jobcard'));
  assert.ok(html.includes('التبعية:'));
  assert.ok(html.includes('كان: مدير إدارة سلاسل الإمداد'), 'يظهر المسمّى السابق للشفافية');
  assertClean(html, 'jobCardsHtml');
});
