/**
 * حارسُ جهاز الباركود — «القراءة تتمّ من خلال الهاتف أو جهاز الباركود».
 *
 * والجهاز لوحةُ مفاتيح: يطبع بسرعةٍ ثمّ Enter. فالمطلوب أن يُسمع في الشاشة
 * كلّها، وألّا يُخلَط بإنسانٍ يكتب، وألّا تُسجَّل مسحتُه مرّتين.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createWedgeReader, isTypingTarget } from './wedgeScanner.js';

/** يُطعم سلسلةً بفاصلٍ ثابتٍ بين المحارف، ثمّ مفتاح الإنهاء. */
function scan(reader, text, { gap = 15, start = 1000, end = 'Enter' } = {}) {
  let t = start;
  let out = null;
  for (const ch of text) {
    out = reader.feed(ch, t) || out;
    t += gap;
  }
  const done = reader.feed(end, t);
  return done || out;
}

/* ═══════════════ التمييز بالسرعة ═══════════════ */

test('★★ الجهاز يُقرأ: محارفُ سريعةٌ ثمّ Enter تُعطي الباركود كاملًا', () => {
  const r = createWedgeReader();
  assert.deepEqual(scan(r, '6281006521'), { code: '6281006521' });
});

test('★★ الإنسان لا يُقرأ: كتابةٌ بمهلٍ بشريّةٍ لا تُنتج قراءةً', () => {
  const r = createWedgeReader();
  assert.equal(scan(r, '6281006', { gap: 220 }), null);
});

test('★ حتّى Enter يجب أن يصل سريعًا — رقمٌ كُتب ثمّ Enter بعد ثانيةٍ ليس جهازًا', () => {
  const r = createWedgeReader();
  let t = 0;
  for (const ch of '628100') { r.feed(ch, t); t += 15; }
  assert.equal(r.feed('Enter', t + 900), null);
});

test('Tab كإنهاءٍ أيضًا — طُرُزٌ من الأجهزة تُلحقه بدل Enter', () => {
  const r = createWedgeReader();
  assert.deepEqual(scan(r, 'ABC123', { end: 'Tab' }), { code: 'ABC123' });
});

/* ═══════════════ ما لا يُعدّ قراءة ═══════════════ */

test('Enter وحده ليس قراءةً — ولا سلسلةٌ أقصر من الحدّ', () => {
  const r = createWedgeReader({ minLength: 3 });
  assert.equal(r.feed('Enter', 10), null);
  assert.deepEqual(scan(r, 'AB'), null);
  assert.deepEqual(scan(r, 'ABC'), { code: 'ABC' });
});

test('مفاتيح التحكّم لا تُبنى منها سلسلة', () => {
  const r = createWedgeReader();
  let t = 0;
  for (const k of ['Shift', 'ArrowLeft', 'F5', 'CapsLock']) { r.feed(k, t); t += 10; }
  assert.equal(r.feed('Enter', t), null);
});

test('★ سلسلتان متتاليتان: الثانية لا تلتصق بالأولى', () => {
  const r = createWedgeReader();
  assert.deepEqual(scan(r, '111111', { start: 0 }), { code: '111111' });
  assert.deepEqual(scan(r, '222222', { start: 5000 }), { code: '222222' });
});

test('انقطاعٌ في منتصف السلسلة يُسقط ما قبله — فلا يُلفَّق باركودٌ من نصفين', () => {
  const r = createWedgeReader({ maxGapMs: 80 });
  r.feed('1', 0);
  r.feed('2', 20);
  r.feed('9', 900); // مهلةٌ بشريّة — يبدأ من هنا
  r.feed('8', 915);
  r.feed('7', 930);
  assert.deepEqual(r.feed('Enter', 945), { code: '987' });
});

/* ═══════════════ الحقلُ المركَّز يملك ضغطته ═══════════════ */

test('★★ الحقلُ المركَّز يملك ضغطته — والتقاطُها مرّتين يفسد العدّ صامتًا', () => {
  assert.equal(isTypingTarget({ tagName: 'INPUT' }), true);
  assert.equal(isTypingTarget({ tagName: 'textarea' }), true);
  assert.equal(isTypingTarget({ tagName: 'SELECT' }), true);
  assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isTypingTarget({ tagName: 'DIV' }), false);
  assert.equal(isTypingTarget({ tagName: 'BODY' }), false);
  assert.equal(isTypingTarget(null), false);
});
