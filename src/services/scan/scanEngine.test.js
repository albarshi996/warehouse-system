/**
 * حارسُ محرّك القراءة — كلّ بندٍ هنا عطلٌ ميدانيٌّ وقع فعلًا أو كاد.
 *
 * البوّابة الحاكمة: شكوى المالك «قارئ الباركود لا يقرأ… والقراءة تتمّ من
 * خلال الهاتف أو جهاز الباركود».
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCAN_FORMATS,
  NATIVE_FORMATS,
  normalizeScanned,
  createScanGate,
  cameraErrorText,
  scanBox,
} from './scanEngine.js';

/* ═══════════════ الصيغ ═══════════════ */

test('الصيغ تغطّي الخطّيّ قبل المربّع — فبضاعة المستودع EAN وCODE_128 لا QR', () => {
  for (const f of ['EAN_13', 'EAN_8', 'UPC_A', 'CODE_128', 'CODE_39', 'ITF']) {
    assert.ok(SCAN_FORMATS.includes(f), `الصيغة ${f} مفقودة`);
  }
  assert.ok(SCAN_FORMATS.includes('QR_CODE'));
  assert.ok(NATIVE_FORMATS.includes('code_128'));
});

/* ═══════════════ التنظيف ═══════════════ */

test('★ جهاز الباركود يُلحق Enter وCR — والمحرف الخفيّ يجعل الصنف «مجهولًا» بلا سبب', () => {
  assert.equal(normalizeScanned('6281006\r\n'), '6281006');
  assert.equal(normalizeScanned('\t6281006\t'), '6281006');
  assert.equal(normalizeScanned('  6281006  '), '6281006');
  assert.equal(normalizeScanned('\u200f6281006'), '6281006');
});

test('الفارغ يبقى فارغًا ولا يُرمى', () => {
  assert.equal(normalizeScanned(null), '');
  assert.equal(normalizeScanned(undefined), '');
  assert.equal(normalizeScanned('   '), '');
  assert.equal(normalizeScanned(6281006), '6281006');
});

/* ═══════════════ بوّابة التكرار ═══════════════ */

test('★★ الكاميرا تُبلّغ الباركود عشراتِ المرّات في الثانية — فيُقبل مرّةً واحدة', () => {
  const gate = createScanGate({ windowMs: 1500 });
  assert.equal(gate.accept('6281006', 1000), true);
  assert.equal(gate.accept('6281006', 1080), false);
  assert.equal(gate.accept('6281006', 1400), false);
  assert.equal(gate.accept('6281006', 2600), true); // مضت المهلة — مسحةٌ ثانية مقصودة
});

test('صنفٌ آخر يمرّ فورًا — العادّ الذي يمسح صنفين متتاليين لا ينتظر', () => {
  const gate = createScanGate({ windowMs: 1500 });
  assert.equal(gate.accept('6281006', 1000), true);
  assert.equal(gate.accept('6281007', 1050), true);
  assert.equal(gate.accept('6281006', 1100), true);
});

test('القيمة الفارغة لا تمرّ ولا تُفسد الحالة', () => {
  const gate = createScanGate();
  assert.equal(gate.accept('  ', 10), false);
  assert.equal(gate.accept('AB1', 20), true);
});

test('reset يفتح الباب لنفس الباركود فورًا — لجلسةٍ جديدة', () => {
  const gate = createScanGate({ windowMs: 1500 });
  gate.accept('X1', 0);
  assert.equal(gate.accept('X1', 100), false);
  gate.reset();
  assert.equal(gate.accept('X1', 120), true);
});

/* ═══════════════ رسالة العطل ═══════════════ */

test('★ لا رسالةَ بلا مخرج: كلّ حالةٍ تدلّ العامل على بديلٍ يُكمل به العمل', () => {
  const cases = [
    cameraErrorText({ name: 'NotAllowedError' }),
    cameraErrorText({ name: 'NotFoundError' }),
    cameraErrorText({ name: 'NotReadableError' }),
    cameraErrorText(new Error('html5-qrcode load failed')),
    cameraErrorText({}),
    cameraErrorText({}, { secure: false }),
  ];
  for (const text of cases) {
    assert.ok(text.includes('اكتب') || text.includes('اكتبه'), `رسالةٌ بلا مخرج: ${text}`);
  }
});

test('الأذن المرفوض يُسمّى بالأذن لا بعطلٍ مبهم — فالعامل يعرف أين يضغط', () => {
  assert.match(cameraErrorText({ name: 'NotAllowedError' }), /أذن/);
  assert.match(cameraErrorText({ name: 'NotFoundError' }), /لا كاميرا/);
  assert.match(cameraErrorText({ name: 'NotReadableError' }), /مشغول/);
  assert.match(cameraErrorText({}, { secure: false }), /https/);
});

/* ═══════════════ صندوق التصويب ═══════════════ */

test('★ الصندوق عريضٌ منخفضٌ لا مربّع — والمربّع يقتطع طرفَي الشريط فلا يُفكّ', () => {
  const box = scanBox(400, 300);
  assert.ok(box.width > box.height, 'صندوقٌ ليس عريضًا');
  assert.ok(box.width <= 400 && box.height <= 300, 'الصندوق تجاوز العرض');
});

test('لا يتجاوز الصندوق أبعاد العرض مهما ضاق — وتجاوزُه يرمي المكتبة', () => {
  for (const [w, h] of [[200, 120], [1200, 700], [320, 640], [150, 150]]) {
    const box = scanBox(w, h);
    assert.ok(box.width <= w, `العرض تجاوز ${w}`);
    assert.ok(box.height <= h, `الارتفاع تجاوز ${h}`);
    assert.ok(box.width > 0 && box.height > 0);
  }
});

test('بلا أبعادٍ بعد (الفيديو لم يبدأ) يُعاد صندوقٌ افتراضيّ لا صفر', () => {
  const box = scanBox(0, 0);
  assert.ok(box.width > 0 && box.height > 0);
});
