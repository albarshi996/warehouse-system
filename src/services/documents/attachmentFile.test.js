/**
 * اختبارات وحدة لمنطق مرفقات المستندات — تُشغَّل بـ `node --test`.
 * تغطّي القبول/الرفض بالصيغة والحجم، وحساب حجم base64 من سلسلة dataURL —
 * كلّه منطق خالص بلا شبكة ولا متصفّح.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateSource,
  validateEncoded,
  base64Size,
  dataUrlBytes,
  isImageType,
  kindLabel,
  MAX_ATTACHMENT_BYTES,
  MAX_SOURCE_BYTES,
} from './attachmentFile.js';

// ── قبول الصيغة ────────────────────────────────────────────────────
test('يقبل الصور وPDF ويرفض ما سواها', () => {
  assert.equal(validateSource({ name: 'a.jpg', type: 'image/jpeg', size: 1000 }).kind, 'JPG');
  assert.equal(validateSource({ name: 'a.png', type: 'image/png', size: 1000 }).kind, 'PNG');
  assert.equal(validateSource({ name: 'a.webp', type: 'image/webp', size: 1000 }).kind, 'WEBP');
  assert.equal(validateSource({ name: 'inv.pdf', type: 'application/pdf', size: 1000 }).kind, 'PDF');
  assert.equal(validateSource({ name: 'a.docx', type: 'application/msword', size: 1000 }).ok, false);
});

test('يرفض الفارغ والمعدوم والعملاق', () => {
  assert.equal(validateSource(null).ok, false);
  assert.equal(validateSource({ name: 'e.jpg', type: 'image/jpeg', size: 0 }).ok, false);
  assert.equal(
    validateSource({ name: 'big.jpg', type: 'image/jpeg', size: MAX_SOURCE_BYTES + 1 }).ok,
    false
  );
  assert.equal(validateSource({ name: 'ok.jpg', type: 'image/jpeg', size: MAX_SOURCE_BYTES }).ok, true);
});

// ── الحجم بعد الترميز ──────────────────────────────────────────────
test('يقبل تحت حدّ المرفق ويرفض فوقه، برسالة تناسب النوع', () => {
  assert.equal(validateEncoded(MAX_ATTACHMENT_BYTES).ok, true);
  const overImg = validateEncoded(MAX_ATTACHMENT_BYTES + 1, { isImage: true });
  assert.equal(overImg.ok, false);
  assert.match(overImg.error, /الصورة/);
  const overPdf = validateEncoded(MAX_ATTACHMENT_BYTES + 1, { isImage: false });
  assert.match(overPdf.error, /PDF/);
});

// ── حساب الأحجام ───────────────────────────────────────────────────
test('base64Size يضخّم بالثلث كما يفعل الترميز فعلًا', () => {
  assert.equal(base64Size(3), 4);
  assert.equal(base64Size(6), 8);
  assert.equal(base64Size(700 * 1024), Math.ceil((700 * 1024) / 3) * 4);
});

test('dataUrlBytes يطرح الترويسة ويحسب الحمولة مع الحشو', () => {
  // "AAAA" = 3 بايت بلا حشو
  assert.equal(dataUrlBytes('data:image/jpeg;base64,AAAA'), 3);
  // حشوة واحدة = بايتان، حشوتان = بايت واحد
  assert.equal(dataUrlBytes('data:image/png;base64,AAA='), 2);
  assert.equal(dataUrlBytes('data:image/png;base64,AA=='), 1);
  assert.equal(dataUrlBytes(''), 0);
  // بلا ترويسة: يُحسب كامل النصّ base64
  assert.equal(dataUrlBytes('AAAA'), 3);
});

// ── مساعدات ────────────────────────────────────────────────────────
test('isImageType يميّز الصور عن PDF', () => {
  assert.equal(isImageType('image/jpeg'), true);
  assert.equal(isImageType('application/pdf'), false);
  assert.equal(isImageType(''), false);
  assert.equal(isImageType(null), false);
});

test('kindLabel يترجم المعروف ويُبقي المجهول', () => {
  assert.equal(kindLabel('invoice'), 'فاتورة المورّد');
  assert.equal(kindLabel('signature'), 'توقيع المندوب/المستلم');
  assert.equal(kindLabel('zzz'), 'zzz');
});
