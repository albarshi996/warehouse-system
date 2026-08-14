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
  sha256Hex,
  newVersionPayload,
  versionChains,
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

/* ═══════════ SAP-11: البصمة والإصدارات (ف‑٢٦ · ف‑٢٧ · §17 ‹881-883›) ═══════════ */

test('★★ ف‑٢٧: البصمة حتميّة — المحتوى نفسه بصمته نفسها، والمختلف مختلفة', async () => {
  const a = await sha256Hex('data:image/jpeg;base64,AAAA');
  const b = await sha256Hex('data:image/jpeg;base64,AAAA');
  const c = await sha256Hex('data:image/jpeg;base64,BBBB');
  assert.equal(a, b, 'التطابق يكشف النسخة المكرّرة');
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/, 'ستّون خانة سداسيّة — SHA-256');
  assert.equal(await sha256Hex(''), '', 'ولا بصمة لفراغ');
});

test('★★ ف‑٢٦: الإصدار الجديد يشير لسابقه ويرث تصنيفه — والسابق لا يُمسّ', () => {
  const prev = { id: 'att-1', kind: 'invoice', label: 'فاتورة المورّد', version: 1 };
  const next = newVersionPayload(prev);
  assert.deepEqual(next, { kind: 'invoice', label: 'فاتورة المورّد', version: 2, supersedes: 'att-1' });
  // مرفقٌ قديم بلا version يُحسب أوّلًا فيليه الثاني.
  assert.equal(newVersionPayload({ id: 'x', kind: 'other' }).version, 2);
});

test('★★ §17 ‹882›: سلسلة الإصدارات تعرض الأحدث وتحفظ التاريخ كاملًا', () => {
  const attachments = [
    { id: 'a1', label: 'فاتورة', version: 1 },
    { id: 'b1', label: 'توقيع', version: 1 },
    { id: 'a2', label: 'فاتورة', version: 2, supersedes: 'a1' },
    { id: 'a3', label: 'فاتورة', version: 3, supersedes: 'a2' },
  ];
  const chains = versionChains(attachments);
  assert.equal(chains.length, 2, 'سلسلتان: الفاتورة والتوقيع');
  const invoice = chains.find((c) => c.latest.id === 'a3');
  assert.equal(invoice.count, 3);
  assert.deepEqual(invoice.history.map((h) => h.id), ['a2', 'a1'], 'التاريخ من الأحدث للأقدم');
  const sig = chains.find((c) => c.latest.id === 'b1');
  assert.equal(sig.count, 1);
  assert.deepEqual(sig.history, []);
});

test('حلقة supersedes مكسورة أو دائريّة لا تُسقط العرض', () => {
  const broken = versionChains([{ id: 'x1', supersedes: 'ghost' }]);
  assert.equal(broken.length, 1);
  assert.equal(broken[0].count, 1);
  // دائرة (لا تقع من الخدمة — لكنّ العرض لا ينهار لو وقعت من بياناتٍ يدويّة).
  const cyclic = versionChains([
    { id: 'c1', supersedes: 'c2' },
    { id: 'c2', supersedes: 'c1' },
  ]);
  assert.ok(Array.isArray(cyclic));
});
