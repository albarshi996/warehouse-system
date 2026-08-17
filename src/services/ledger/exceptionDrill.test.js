/**
 * اختبارات سلسلة النزول ‹EXE-501› — الحلقة المفقودة تُعلَن ولا تُختلق.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { LINK_STATE, chainCompleteness, drillChain } from './exceptionDrill.js';
import { EXCEPTION_TYPES } from './exceptions.js';

const exc = (over = {}) => ({
  number: 'EXC-2026-0041',
  type: 'transit_variance',
  reason: 'نقصٌ 12 وحدة لم تُستلم',
  docRef: { type: 'TRN', number: 'TRN-2026-0003', id: 'd1' },
  ...over,
});

const task = (over = {}) => ({
  id: 't1',
  title: 'سحب TRN-2026-0003',
  state: 'in_progress',
  docRef: { number: 'TRN-2026-0003' },
  lines: [{ sku: 'A', qtyRequired: 10, qtyDone: 4 }],
  ...over,
});

test('★★ السلسلة أربع حلقات لا رابطُ صفحة', () => {
  const { chain } = drillChain(exc(), { laborTasks: [task()] });
  assert.deepEqual(chain.map((c) => c.id), ['exception', 'document', 'task', 'scans', 'action']);
  assert.ok(chain.every((c) => c.state === LINK_STATE.ready), 'كلّها جاهزة');
});

test('★★ رابط المستند يقود إلى المستند نفسه لا إلى قائمةٍ فيه', () => {
  const { chain } = drillChain(exc(), { laborTasks: [task()], base: '/warehouse-system' });
  const doc = chain.find((c) => c.id === 'document');
  assert.match(doc.href, /^\/warehouse-system\/dashboard\/document/);
  assert.match(doc.href, /d1|TRN/, 'ويحمل هويّة المستند');
});

test('★★ الحلقة المفقودة تُعلَن ولا تُختلق — ورابطٌ لصفحةٍ فارغة أسوأ من غيابه', () => {
  const { chain, firstGap } = drillChain(exc(), { laborTasks: [] });
  const t = chain.find((c) => c.id === 'task');
  assert.equal(t.state, LINK_STATE.missing);
  assert.equal(t.href, '', 'لا رابطَ يُنفق وقتًا ويُنهي بلا شيء');
  assert.match(t.hint, /لا مهمّة مولَّدة/);
  assert.match(firstGap, /لا مهمّة مولَّدة/, 'وأوّل فجوةٍ تُقال للمشرف');
});

test('★ استثناءٌ بلا مستند يقول ذلك بدل أن يخترع رابطًا', () => {
  const { chain } = drillChain(exc({ type: 'expired', docRef: {} }), {});
  const doc = chain.find((c) => c.id === 'document');
  assert.equal(doc.state, LINK_STATE.missing);
  assert.match(doc.hint, /رصيدًا أو موقعًا لا مستندًا/);
});

test('★★ مهمّةٌ أُسندت ولم تبدأ: الأثر مفقودٌ ويُقال سببه', () => {
  const { chain } = drillChain(exc(), { laborTasks: [task({ lines: [{ qtyRequired: 10, qtyDone: 0 }] })] });
  const scans = chain.find((c) => c.id === 'scans');
  assert.equal(scans.state, LINK_STATE.missing);
  assert.match(scans.hint, /لم يُمسح بندٌ بعد/);
});

test('الأثر يُعدّ البنود المنفَّذة فعلًا', () => {
  const { chain } = drillChain(exc(), {
    laborTasks: [task({ lines: [{ qtyDone: 4 }, { qtyDone: 0 }, { qtyDone: 2 }] })],
  });
  assert.match(chain.find((c) => c.id === 'scans').label, /2 بندًا/);
});

test('★★ الإجراء من تعريف النوع لا من الشاشة — ومعه مسؤوله', () => {
  const { chain, actionable } = drillChain(exc(), { laborTasks: [task()] });
  const action = chain.find((c) => c.id === 'action');
  assert.equal(action.label, EXCEPTION_TYPES.transit_variance.action);
  assert.match(action.hint, new RegExp(EXCEPTION_TYPES.transit_variance.owner));
  assert.equal(actionable, true);
});

test('نوعٌ مجهول لا يُقترح له إجراء — ولا تُعدّ السلسلة قابلةً للفعل', () => {
  const { chain, actionable } = drillChain(exc({ type: 'طيران' }), {});
  assert.equal(chain.find((c) => c.id === 'action').state, LINK_STATE.missing);
  assert.equal(actionable, false);
});

test('يبحث في المهامّ الإداريّة والميدانيّة معًا', () => {
  const admin = { id: 'a1', title: 'راجع الفرق', docRef: { number: 'TRN-2026-0003' }, status: 'assigned' };
  const { chain } = drillChain(exc(), { tasks: [admin] });
  assert.equal(chain.find((c) => c.id === 'task').state, LINK_STATE.ready);
});

test('اكتمال السلسلة يُقاس — قياسٌ لاكتمال الأثر', () => {
  const full = chainCompleteness(drillChain(exc(), { laborTasks: [task()] }));
  assert.equal(full.pct, 100);
  const partial = chainCompleteness(drillChain(exc(), {}));
  assert.ok(partial.pct < 100 && partial.ready > 0);
});

test('مدخلٌ فارغ لا يُسقط السلسلة', () => {
  const r = drillChain(null, {});
  assert.equal(r.chain.length, 5);
  assert.equal(r.actionable, false);
});
