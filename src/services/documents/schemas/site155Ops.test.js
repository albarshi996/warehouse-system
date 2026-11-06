/**
 * اختبارات مستندَي موقع 155 التوثيقيّين — المناولة (HND) وسيارات النقل (VEH).
 *
 * كلاهما توثيقيٌّ بحتٌ: **بلا أثرٍ مخزنيٍّ ولا ماليّ** (لا قاعدةَ ترحيلٍ، وأثرٌ
 * ماليٌّ صفريّ)، ويُطبعان **بلا هويّة شركة** (`plainPrint`)، وتحذيراتُهما تنبّه
 * ولا تمنع. والتسجيلُ في السجلّات المركزيّة يحرسه guards المحرّك العامّة؛ هنا
 * نحرس **عقدَ المستندَين نفسَه**.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import hnd, { handlingWarnings } from './hnd.js';
import veh, { vehicleWarnings } from './veh.js';
import { getSchema } from './index.js';
import { FINANCIAL_IMPACT } from '../../odoo/financialImpact.js';
import { postingRuleFor } from '../../ledger/postingRules.js';

/* ───────── المخطّطان مسجَّلان ويُطبعان بلا هويّة ───────── */

test('★★ HND وVEH مسجَّلان في SCHEMAS بأكوادهما', () => {
  assert.equal(getSchema('HND'), hnd);
  assert.equal(getSchema('VEH'), veh);
  assert.equal(hnd.type, 'HND');
  assert.equal(veh.type, 'VEH');
});

test('★★★ يُطبعان بلا هويّة شركة — plainPrint صريحة', () => {
  assert.equal(hnd.plainPrint, true);
  assert.equal(veh.plainPrint, true);
  // وأكوادُ النماذج محايدةٌ بلا بادئة BFP (لا تُظهر صفةَ شركةٍ في المطبوع).
  assert.equal(/BFP/i.test(hnd.formCode), false);
  assert.equal(/BFP/i.test(veh.formCode), false);
});

test('★ بلا إيموجي في عناوين الأقسام (دستور الواجهات)', () => {
  const titles = [...hnd.sections, ...veh.sections].map((s) => s.title).join(' ');
  assert.equal(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(titles), false);
});

/* ───────── توثيقيّان: لا أثرَ مخزنيٌّ ولا ماليّ ───────── */

test('★★★ لا أثرَ مخزنيٌّ ولا ماليّ — ولا قاعدةَ ترحيلٍ (توثيقٌ فقط)', () => {
  for (const t of ['HND', 'VEH']) {
    assert.equal(FINANCIAL_IMPACT[t].financial, false, `${t}: لا أثرَ ماليّ`);
    assert.equal(FINANCIAL_IMPACT[t].stockEffect, false, `${t}: لا أثرَ مخزنيّ`);
    assert.equal(FINANCIAL_IMPACT[t].odooDoc, null, `${t}: لا مرآةَ أودو`);
    // ★ النقض: لا قاعدةَ ترحيلٍ أصلًا — فبلوغُ «منجَز» لا يقيّد حركةً ولا قيدًا.
    assert.ok(!postingRuleFor(t), `${t}: يجب ألّا تكون له قاعدةُ ترحيل`);
  }
});

/* ───────── فصلُ الأدوار: من يعتمد غيرُ مكتفٍ بأمين المخزن وحده ───────── */

test('★ الاعتمادُ لمدير المستودع، والإنشاءُ لأمين المخزن', () => {
  for (const s of [hnd, veh]) {
    assert.ok(s.roles.approve.includes('warehouse_manager'));
    assert.ok(s.roles.create.includes('storekeeper'));
    assert.ok(s.roles.complete.includes('storekeeper'));
  }
});

/* ───────── التحذيرات تنبّه ولا تمنع ───────── */

test('★★ تحذيرُ المناولة: صفرُ عمّالٍ أو بلا وقتٍ يُنبّه', () => {
  const bad = handlingWarnings({ header: { workers: 0 } });
  assert.ok(bad.some((w) => w.includes('العمّال')));
  assert.ok(bad.some((w) => w.includes('وقت')));
  // مكتملٌ: عمّالٌ ووقتٌ ⇒ لا تحذير.
  const ok = handlingWarnings({ header: { workers: 3, durationHours: 2 } });
  assert.equal(ok.length, 0);
});

test('★★ تحذيرُ النقل: بلا لوحةٍ أو اتّجاهٍ يُنبّه', () => {
  const bad = vehicleWarnings({ header: {} });
  assert.ok(bad.some((w) => w.includes('اللوحة')));
  assert.ok(bad.some((w) => w.includes('الاتّجاه')));
  const ok = vehicleWarnings({ header: { plate: 'ط ب 1234', direction: 'دخول' } });
  assert.equal(ok.length, 0);
});
