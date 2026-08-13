/**
 * حارس اتّجاه التكامل (SAP-15 · يسدّ ف‑٣٥ وف‑٣٦ وف‑٣٧).
 *
 * هذا الملفّ ليس توثيقًا للحاضر بل حارسًا للمستقبل. الجرد كشف أنّ أربعة مساراتٍ
 * في `odooSyncService` كانت تكتب إلى أودو متجاوزةً حارس السياسة. فمن يضيف
 * مسارًا خامسًا بعد ستّة أشهر — أو يستعمل فعلًا يكتب باسمٍ لا يوحي بالكتابة مثل
 * `copy` أو `button_validate` — يُسقط الاختبار قبل أن تصل الكتابة إلى أودو.
 *
 * ثلاث طبقاتٍ من الإثبات:
 *   1. المنطق الخالص — القرار نفسه.
 *   2. حدّ النقل — أنّ عميل أودو الحقيقيّ يرفض فعلًا، بلا شبكة.
 *   3. منعُ الباب الثاني — ألّا يوجد مخرجٌ إلى الشبكة خارج العميل المختوم.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  INTEGRATION_DIRECTION,
  READ_METHODS,
  isPushSealed,
  isReadMethod,
  directionDecision,
  assertPullOnly,
} from './directionGuard.js';
import { create, write, unlink, searchRead, authenticate } from './odooClient.js';
import { odoo, mockOdooClient } from './index.js';
import { defaultPolicyFor, pushDecision, fullPolicy } from '../integration/integrationPolicy.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ── 1. المنطق الخالص ────────────────────────────────────────────────────────

test('الاتّجاه المعتمد سحبٌ والدفع مختوم', () => {
  assert.equal(INTEGRATION_DIRECTION, 'pull');
  assert.equal(isPushSealed(), true);
});

test('أفعال القراءة تمرّ', () => {
  for (const method of READ_METHODS) {
    assert.equal(isReadMethod(method), true, `${method} يجب أن يكون قراءة`);
    assert.equal(directionDecision(method, 'res.partner').allowed, true, `${method} يجب أن يمرّ`);
  }
});

test('أفعال الكتابة الثلاثة المعروفة تُمنع', () => {
  for (const method of ['create', 'write', 'unlink']) {
    const decision = directionDecision(method, 'purchase.order');
    assert.equal(decision.allowed, false, `${method} يجب أن يُمنع`);
    assert.match(decision.reason, /مختوم/);
    assert.match(decision.reason, /purchase\.order/);
  }
});

test('الكتابة بأسماءٍ لا توحي بالكتابة تُمنع أيضًا — قائمة سماحٍ لا منع', () => {
  // هذه أفعالٌ حقيقيّة في أودو تكتب، ولا تحمل اسم create/write/unlink.
  // لو كان الحارس قائمةَ منعٍ لعبرت كلّها.
  const sneaky = [
    'copy',
    'name_create',
    'web_save',
    'action_confirm',
    'button_validate',
    'button_confirm',
    'message_post',
    'toggle_active',
    'action_post',
    'action_cancel',
  ];
  for (const method of sneaky) {
    assert.equal(directionDecision(method).allowed, false, `${method} يجب أن يُمنع`);
  }
});

test('النداء بلا فعلٍ مسمّى يُرفض مغلقًا — لا يُفترض خيرًا', () => {
  for (const bad of [undefined, null, '', '   ', 0, false, {}]) {
    assert.equal(directionDecision(bad).allowed, false, `«${String(bad)}» يجب أن يُرفض`);
  }
  assert.equal(isReadMethod(undefined), false);
  assert.equal(isReadMethod(''), false);
});

test('assertPullOnly ترمي بسببٍ مكتوب ولا تكشف سرًّا عن النظام المتّصل', () => {
  assert.throws(() => assertPullOnly('create', 'stock.move'), (error) => {
    assert.match(error.message, /الدفع إلى أودو مختوم/);
    assert.match(error.message, /سحبٌ فقط/);
    // §16.20 ‹801›: لا اعتماد ولا مسار وسيطٍ ولا قاعدة بياناتٍ في نصّ الخطأ.
    assert.doesNotMatch(error.message, /http|api|key|password|token|db=/i);
    return true;
  });
  // القراءة لا ترمي.
  assert.doesNotThrow(() => assertPullOnly('search_read', 'product.product'));
});

// ── 2. حدّ النقل — بلا شبكة ─────────────────────────────────────────────────

test('عميل أودو الحقيقيّ يرفض الكتابة قبل أيّ نداء شبكة', async () => {
  await assert.rejects(() => create('res.partner', { name: 'x' }), /مختوم/);
  await assert.rejects(() => write('purchase.order', [1], { state: 'purchase' }), /مختوم/);
  await assert.rejects(() => unlink('stock.picking', [1]), /مختوم/);
});

test('المسارات الأربعة التي كانت تتجاوز حارس السياسة مختومةٌ الآن', async () => {
  // نفس النداءات الحرفيّة في odooSyncService ‹194› ‹301› ‹519› ‹556›.
  await assert.rejects(() => write('purchase.order', 7, { state: 'purchase' }), /مختوم/);
  await assert.rejects(() => write('stock.picking', 7, { state: 'done' }), /مختوم/);
  await assert.rejects(() => write('sale.order', 7, { state: 'sale' }), /مختوم/);
  await assert.rejects(() => create('stock.move', { product_id: 1 }), /مختوم/);
});

test('السحب يعبر الحارس ويسقط عند الإعداد لا عند الختم', async () => {
  // بلا وسيطٍ مضبوط في بيئة الاختبار، فالخطأ المتوقّع خطأ إعدادٍ لا خطأ ختم.
  // هذا ما يُثبت أنّ القراءة **مرّت** من الحارس.
  await assert.rejects(() => searchRead('product.product'), (error) => {
    assert.doesNotMatch(error.message, /مختوم/);
    return true;
  });
  await assert.rejects(() => authenticate(), (error) => {
    assert.doesNotMatch(error.message, /مختوم/);
    return true;
  });
});

test('★★ المسار التشغيليّ مختومٌ في الوضعين — والتدريب هو الوضع الحيّ اليوم', async () => {
  // العطب الذي كشفته لقطة المالك 2026-08-13: الختم كان على العميل الحقيقيّ
  // وحده، والبوابة تعمل في وضع التدريب، فكان المحاكي يقبل الدفع حيًّا.
  // `odoo` هو ما تستورده الخدمات، فالختم عليه يغطّي الوضعين.
  assert.match(odoo.kind, /\+sealed$/, 'العميل الفعّال يجب أن يكون مختومًا');
  await assert.rejects(() => odoo.create('purchase.order', { name: 'x' }), /مختوم/);
  await assert.rejects(() => odoo.write('stock.picking', [1], { state: 'done' }), /مختوم/);
  await assert.rejects(() => odoo.unlink('product.product', [1]), /مختوم/);
});

test('★ والقراءة تمرّ من المسار التشغيليّ بلا عائق', async () => {
  const rows = await odoo.searchRead('product.product', [], []);
  assert.ok(Array.isArray(rows), 'السحب يجب أن يعمل — الختم على الكتابة وحدها');
});

test('★ والمحاكي المستورد مباشرةً يبقى صندوقًا رمليًّا للتدريب', async () => {
  // صريحٌ لا مصادفة: من يستورد المحاكي بذاته يعلن أنّه خارج المسار التشغيليّ.
  assert.equal(mockOdooClient.kind, 'mock');
  assert.equal(typeof mockOdooClient.create, 'function');
});

// ── 3. لا بابَ ثانٍ ─────────────────────────────────────────────────────────

test('لا مخرج شبكةٍ إلى أودو خارج العميل المختوم', () => {
  const files = fs
    .readdirSync(HERE)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js') && f !== 'odooClient.js');
  const offenders = files.filter((f) => /\bfetch\s*\(/.test(fs.readFileSync(path.join(HERE, f), 'utf8')));
  assert.deepEqual(
    offenders,
    [],
    `ملفّاتٌ تنادي الشبكة مباشرةً خارج odooClient.js المختوم: ${offenders.join(' · ')}`
  );
});

// ── 4. الخطّ الثاني: السياسة ────────────────────────────────────────────────

test('الافتراض عند غياب السياسة صار سحبًا لكلّ نوع', () => {
  for (const type of ['items', 'PO', 'GRN', 'documents', 'accounts', 'أيّ-نوعٍ-غير-معروف']) {
    assert.equal(defaultPolicyFor(type).direction, 'pull', `${type} يجب أن يكون سحبًا افتراضًا`);
  }
});

test('لا نوعَ يُدفع بسياسةٍ فارغة', () => {
  const policy = fullPolicy({});
  for (const type of Object.keys(policy)) {
    assert.equal(pushDecision(policy, type).allowed, false, `${type} يجب ألّا يُدفع`);
  }
});

test('حقول المال تبقى ممنوعة في كلّ الأحوال', () => {
  assert.equal(defaultPolicyFor('PO').money, 'pull');
});
