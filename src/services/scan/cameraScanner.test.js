/**
 * حارسُ فتح الكاميرا — يُختبَر ببيئةٍ مصغّرة (نمط `overlayHistory`).
 *
 * وكلّ بندٍ هنا حالةٌ يراها العامل في الممرّ: اتصالٌ غير آمن · جهازٌ بلا
 * عدسة · باركودٌ أمام العدسة عشرَ لقطاتٍ في الثانية · شاشةٌ تُغلق مرّتين.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { startCameraScan, formatCodes } from './cameraScanner.js';
import { SCAN_FORMATS } from './scanEngine.js';

/** مكتبةٌ مصغّرة تُسجّل ما استُدعي به، وتُمسك مُبلِّغ القراءة لنُطلقه يدويًّا. */
function fakeEnv(overrides = {}, { failStop = false } = {}) {
  const calls = { started: [], stopped: 0, cleared: 0, constructed: [] };
  let onDecode = null;
  let clock = 0;

  class FakeHtml5Qrcode {
    constructor(elementId, config) {
      calls.constructed.push({ elementId, config });
    }
    async start(camera, config, success) {
      calls.started.push({ camera, config });
      onDecode = success;
    }
    async stop() {
      calls.stopped += 1;
      if (failStop) throw new Error('already under teardown');
    }
    clear() { calls.cleared += 1; }
  }

  const table = Object.fromEntries(SCAN_FORMATS.map((n, i) => [n, i]));
  return {
    calls,
    decode: (text) => onDecode?.(text),
    tick: (ms) => { clock += ms; },
    env: {
      isSecure: () => true,
      hasCamera: () => true,
      loadLibrary: async () => FakeHtml5Qrcode,
      formatTable: () => table,
      now: () => clock,
      ...overrides,
    },
  };
}

/* ═══════════════ ما يمنع الفتح أصلًا ═══════════════ */

test('★ اتصالٌ غير آمن يرمي SecurityError — والرسالة عندئذٍ تقول https لا «عطلٌ ما»', async () => {
  const { env } = fakeEnv({ isSecure: () => false });
  await assert.rejects(
    () => startCameraScan({ elementId: 'x', env }),
    (e) => e.name === 'SecurityError'
  );
});

test('★ جهازٌ بلا كاميرا يرمي NotFoundError قبل تحميل أيّ مكتبة', async () => {
  let loaded = false;
  const { env } = fakeEnv({ hasCamera: () => false, loadLibrary: async () => { loaded = true; } });
  await assert.rejects(
    () => startCameraScan({ elementId: 'x', env }),
    (e) => e.name === 'NotFoundError'
  );
  assert.equal(loaded, false, 'حُمّلت ٣٦٧ك.ب على جهازٍ لا عدسة فيه');
});

/* ═══════════════ الإعداد الذي يُبنى عليه الفكّ ═══════════════ */

test('★★ الكاشف العتاديّ يُطلب من داخل المكتبة — وهذا ما يجعل المسار واحدًا لا اثنين', async () => {
  const f = fakeEnv();
  await startCameraScan({ elementId: 'cam-1', env: f.env });
  const cfg = f.calls.constructed[0];
  assert.equal(cfg.elementId, 'cam-1');
  assert.equal(cfg.config.experimentalFeatures.useBarCodeDetectorIfSupported, true);
  assert.equal(cfg.config.formatsToSupport.length, SCAN_FORMATS.length);
});

test('الكاميرا الخلفيّة تُطلب، وصندوقُ التصويب دالّةٌ لا مقاسٌ ثابت', async () => {
  const f = fakeEnv();
  await startCameraScan({ elementId: 'cam-1', env: f.env });
  const { camera, config } = f.calls.started[0];
  assert.deepEqual(camera, { facingMode: 'environment' });
  assert.equal(typeof config.qrbox, 'function', 'مقاسٌ ثابتٌ يرمي إن تجاوز الفيديو');
  const box = config.qrbox(400, 300);
  assert.ok(box.width > box.height);
});

test('صيغةٌ لا تعرفها نسخة المكتبة تُسقَط ولا تُعطّل الباقي', () => {
  assert.deepEqual(formatCodes({ EAN_13: 3, CODE_128: 7 }), [3, 7]);
  assert.equal(formatCodes({}), undefined, 'قائمةٌ فارغة تعني «كلّ الصيغ» لا «لا صيغة»');
  assert.equal(formatCodes(null), undefined);
});

/* ═══════════════ القراءة ═══════════════ */

test('★★ الباركود أمام العدسة يُبلَّغ عشرات المرّات — ويُسجَّل مرّةً واحدة', async () => {
  const f = fakeEnv();
  const seen = [];
  await startCameraScan({ elementId: 'c', onCode: (c) => seen.push(c), env: f.env });
  for (let i = 0; i < 10; i += 1) { f.decode('6281006521001'); f.tick(90); }
  assert.deepEqual(seen, ['6281006521001']);
  f.tick(2000);
  f.decode('6281006521001'); // مسحةٌ ثانية مقصودة بعد المهلة
  assert.equal(seen.length, 2);
});

test('لواحقُ جهاز الباركود تُنظَّف قبل أن يراها المنطق', async () => {
  const f = fakeEnv();
  const seen = [];
  await startCameraScan({ elementId: 'c', onCode: (c) => seen.push(c), env: f.env });
  f.decode('  ABC-123\r\n');
  assert.deepEqual(seen, ['ABC-123']);
});

test('onReady لا يُنادى إلّا بعد أن تبدأ العدسة فعلًا', async () => {
  const f = fakeEnv();
  let ready = 0;
  await startCameraScan({ elementId: 'c', onReady: () => { ready += 1; }, env: f.env });
  assert.equal(ready, 1);
  assert.equal(f.calls.started.length, 1);
});

/* ═══════════════ الإطفاء ═══════════════ */

test('★ الإيقاف آمنٌ مهما تكرّر — الزرّ وتفكيك المكوّن يُطفئان معًا', async () => {
  const f = fakeEnv();
  const stop = await startCameraScan({ elementId: 'c', env: f.env });
  await stop();
  await stop();
  await stop();
  assert.equal(f.calls.stopped, 1, 'ضوء الكاميرا يُطفأ مرّةً ولا يُنادى الإيقاف مرّتين');
  assert.equal(f.calls.cleared, 1);
});

test('★ عطلٌ في الإيقاف لا يُرمى على الشاشة — والعدسة تُنظَّف على أيّ حال', async () => {
  const f = fakeEnv({}, { failStop: true });
  const stop = await startCameraScan({ elementId: 'c', env: f.env });
  await assert.doesNotReject(() => stop(), 'رميةُ إيقافٍ تصل الشاشة تُظهر عطلًا وهميًّا للعامل');
  assert.equal(f.calls.stopped, 1);
  assert.equal(f.calls.cleared, 1, 'العنصر لم يُنظَّف بعد فشل الإيقاف');
});
