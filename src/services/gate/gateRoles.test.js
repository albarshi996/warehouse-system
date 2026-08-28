/**
 * 🔒 حارسُ أدوار البوابة ‹GATE-501› — **الشاشةُ والقاعدةُ لا تفترقان**.
 *
 * الاختبارُ الأهمّ هنا ليس منطقيًّا بل **مطابقةُ نصّ**: قائمةُ الكتّاب في
 * الكود تُقرأ من `firestore.rules` نفسِها. فيومَ يُضاف دورٌ في أحدهما ولا
 * يُضاف في الآخر يسقط هذا — لا يومَ يشتكي موظّفٌ من ارتدادٍ لا يفهمه.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GATE_WRITERS, VISITOR_READERS, canWriteGate, canReadVisitor, gateUiGate } from './gateRoles.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

test('★★★ قائمةُ كتّاب الساحة في الكود = قائمتُها في firestore.rules حرفيًّا', () => {
  const fn = RULES.match(/function isYardWriter\(\)\s*\{[\s\S]*?\}/)?.[0];
  assert.ok(fn, 'دالّةُ isYardWriter غير موجودةٍ في القواعد — أين حارسُ الخادم؟');
  const inRules = [...fn.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(
    [...GATE_WRITERS].sort(),
    [...new Set(inRules)].sort(),
    'الشاشةُ تسمح لمن تمنعه القاعدة (أو العكس) — وهو عطبُ ل-١٨ بعينه'
  );
});

test('★★★ الدورُ المجهول يمرّ — ومنعٌ بُني على جهلٍ بالهويّة أسوأ من سماحٍ يردّه الخادم', () => {
  assert.equal(canWriteGate(''), true);
  assert.equal(canWriteGate(null), true);
  assert.equal(canWriteGate('دورٌ لم يُخترع بعد'), true);
  assert.equal(gateUiGate(undefined).known, false);
  assert.equal(gateUiGate(undefined).allowed, true);
  assert.equal(gateUiGate(undefined).message, '', 'رسالةُ منعٍ لمن لا نعرفه');
});

test('★ ومن نعرفه يُحكَم بمصفوفته', () => {
  for (const r of GATE_WRITERS) assert.equal(canWriteGate(r), true, `${r} يكتب في القواعد ويُمنع في الشاشة`);
  assert.equal(canWriteGate('viewer'), false);
  assert.equal(canWriteGate('storekeeper'), false, 'أمينُ المخزن يستلم ولا يفتح الحاجز');
  assert.equal(canWriteGate('sales_rep'), false);
});

test('★ ونصُّ المنع يقول من يملكها — فيذهب الممنوعُ إليه', () => {
  const g = gateUiGate('viewer');
  assert.equal(g.allowed, false);
  assert.ok(g.message.includes('ضابطُ البوابة'), 'مُنع ولا يعرف إلى من يذهب');
});

test('ق-٧ قراءةُ بيانات الزائر أضيقُ من الكتابة — ولا يراها مشرفُ المناولة', () => {
  assert.deepEqual([...VISITOR_READERS].sort(), ['admin', 'gate_officer', 'warehouse_manager']);
  assert.equal(canReadVisitor('gate_officer'), true);
  assert.equal(canReadVisitor('labor_supervisor'), false, 'بياناتُ زائرٍ شخصيّةٌ ظهرت لمن لا يحتاجها');
  assert.equal(canReadVisitor('fleet'), false);
});

test('★ قوائمُ الأدوار بلا تكرارٍ ولا فراغ', () => {
  assert.equal(new Set(GATE_WRITERS).size, GATE_WRITERS.length);
  for (const r of [...GATE_WRITERS, ...VISITOR_READERS]) assert.ok(r.trim(), 'دورٌ فارغٌ في القائمة');
});
