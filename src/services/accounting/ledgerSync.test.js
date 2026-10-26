/**
 * اختبارُ تغذية الدفتر بالمزامنة — أجسامُ النداء متوازنةٌ وحتميّةٌ ومُنقّاة.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ledgerCallBodies } from './ledgerSync.js';

const D = '2026-10-21'; // بعد حدّ الافتتاح 2026-10-20
const inv = (id, code, total, state = 'done') => ({
  id, type: 'INV', number: `INV-${id}`, state,
  header: { customerCode: code, customer: 'x', invoiceDate: D }, lines: [{ qty: 1, unitPrice: total }],
});
const rcp = (id, code, amount, state = 'done') => ({
  id, type: 'RCP', number: `RCP-${id}`, state,
  header: { customerCode: code, receiptDate: D }, lines: [{ amount }],
});

const sum = (lines, side) => lines.reduce((s, l) => s + (Number(l[side]) || 0), 0);

test('★★★ كلُّ جسمٍ متوازنٌ ومجموعُه يطابق المعلَن p_amount', () => {
  const bodies = ledgerCallBodies([inv('1', 'C-1', 5000), rcp('2', 'C-1', 400)]);
  assert.equal(bodies.length, 2);
  for (const b of bodies) {
    assert.equal(sum(b.p_lines, 'debit'), sum(b.p_lines, 'credit'), 'مدين = دائن');
    assert.equal(sum(b.p_lines, 'debit'), b.p_amount, 'المجموع = p_amount');
    assert.ok(b.p_key, 'مفتاحٌ موجود');
    assert.ok(b.p_lines.length >= 2, 'سطران فأكثر');
  }
});

test('★★★ الحسابُ أساسٌ لا نصٌّ فرعيّ، والطرفُ في حقله (مفتاحُ accounts الأجنبيّ)', () => {
  const [b] = ledgerCallBodies([inv('K1', 'C-7', 1000)]);
  const partyLine = b.p_lines.find((l) => l.party);
  assert.ok(partyLine, 'سطرُ طرفٍ موجود');
  assert.equal(partyLine.account, 'AR', 'الحسابُ أساسٌ AR لا AR:C-7');
  assert.equal(partyLine.party, 'C-7', 'الطرفُ في حقله');
  for (const l of b.p_lines) assert.ok(!String(l.account).includes(':'), `لا نقطتين في ${l.account}`);
});

test('★★ الأثرُ مُتبَّع: p_source_type نوعُ المستند وp_source_id معرّفُه', () => {
  const [b] = ledgerCallBodies([inv('X9', 'C-1', 1000)]);
  assert.equal(b.p_source_type, 'INV');
  assert.equal(b.p_source_id, 'X9');
});

test('★★ المفتاحُ حتميّ — إعادةُ نفس المستند تُنتج نفسَ p_key (تخطٍّ لا تكرار)', () => {
  const [a] = ledgerCallBodies([rcp('7', 'C-1', 400)]);
  const [b] = ledgerCallBodies([rcp('7', 'C-1', 400)]);
  assert.equal(a.p_key, b.p_key);
});

test('★★★ النهائيُّ وحدَه يُرحَّل: منجَز/مغلق نعم، معتمَد/مسودّة لا', () => {
  // ما يُعدَّل أو يُلغى بعد الترحيل (معتمَد · مسودّة) لا يُرحَّل — تصحيحُ العطب.
  assert.equal(ledgerCallBodies([inv('a', 'C-1', 5000, 'approved')]).length, 0, 'المعتمَدُ متغيّرٌ فلا يُرحَّل');
  assert.equal(ledgerCallBodies([inv('d', 'C-1', 5000, 'draft')]).length, 0, 'المسودّةُ لا تُرحَّل');
  assert.equal(ledgerCallBodies([inv('x', 'C-1', 5000, 'canceled')]).length, 0, 'الملغى لا يُرحَّل');
  // النهائيُّ (منجَز/مغلق) يُرحَّل — لا يُعدَّل ولا يُلغى في آلة الحالات.
  assert.equal(ledgerCallBodies([inv('n', 'C-1', 5000, 'done')]).length, 1, 'المنجَزُ يُرحَّل');
  assert.equal(ledgerCallBodies([inv('c', 'C-1', 5000, 'closed')]).length, 1, 'المغلقُ يُرحَّل');
});

test('★★ ما قبل حدّ الافتتاح يُسقط بهدوء ولا يُسقط الباقي', () => {
  const pre = { ...inv('p', 'C-1', 5000), header: { customerCode: 'C-1', invoiceDate: '2026-10-19' } };
  const bodies = ledgerCallBodies([pre, inv('ok', 'C-2', 3000)]);
  assert.equal(bodies.length, 1, 'القديمُ وحدَه سقط');
  assert.equal(bodies[0].p_source_id, 'ok');
});

test('★ النوعُ غيرُ الماليّ والفراغُ ⇒ لا أجسام', () => {
  assert.equal(ledgerCallBodies([{ id: 'z', type: 'PICK', state: 'done' }]).length, 0);
  assert.equal(ledgerCallBodies([]).length, 0);
  assert.equal(ledgerCallBodies().length, 0);
});
