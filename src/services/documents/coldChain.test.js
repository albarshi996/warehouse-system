/**
 * حارس سلسلة التبريد ‹FNB-505›.
 *
 * أخطر ما يحرسه: **القياس الغائب ليس خرقًا** (نقصُ إجراءٍ يُعلَن ولا يفتح
 * استثناءً)، و**الحدود مصدرها CCP1_LIMITS القائم** لا أرقامٌ تُكرَّر،
 * و**دفعةٌ خُرقت سلسلتها لا تُخصَّص قبل قرار جودةٍ مكتوب**.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEMP_MODES, CONTROL_POINTS, controlPoint, pointsForDoc,
  readingVerdict, checkpointVerdict, coldChainExceptions, batchReleaseVerdict,
} from './coldChain.js';
import { CCP1_LIMITS } from './schemas/grn.js';
import { EXCEPTION_TYPES } from '../ledger/exceptions.js';

/* ═══════════ ‹FNB-505› سلسلة التبريد ═══════════ */

test('★ الحدود مصدرها CCP1_LIMITS القائم — لا أرقامٌ تُكرَّر', () => {
  assert.equal(TEMP_MODES.chilled.max, CCP1_LIMITS.chilled);
  assert.equal(TEMP_MODES.frozen.max, CCP1_LIMITS.frozen);
  assert.equal(TEMP_MODES.hot.min, 63, 'الساخن أرضيّةٌ لا سقف');
});

test('النقاط الخمس على امتداد الدورة — والاستلام قائمٌ من قبل', () => {
  assert.equal(CONTROL_POINTS.length, 5);
  assert.equal(controlPoint('CCP1').existing, true, 'الاستلام مبنيٌّ منذ GRN');
  assert.deepEqual(pointsForDoc('PACK').map((p) => p.id), ['CCP4']);
  assert.deepEqual(pointsForDoc('TRN').map((p) => p.id), ['CCP5']);
  assert.deepEqual(pointsForDoc('PR'), [], 'مستندٌ بلا حرارةٍ لا تسري عليه نقطة');
});

test('★★ القياس الغائب ليس خرقًا — نقصُ إجراءٍ يُعلَن ولا يفتح استثناء', () => {
  const missing = readingVerdict({ mode: 'chilled' });
  assert.equal(missing.status, 'unmeasured');
  assert.match(missing.problem, /لم تُقَس/);

  const breach = readingVerdict({ mode: 'chilled', celsius: 9 });
  assert.equal(breach.status, 'breach');
  assert.equal(readingVerdict({ mode: 'chilled', celsius: 3 }).status, 'ok');
  // والمجمَّد سقفُه سالب: −١٥ خرقٌ و−٢٠ سليم.
  assert.equal(readingVerdict({ mode: 'frozen', celsius: -15 }).status, 'breach');
  assert.equal(readingVerdict({ mode: 'frozen', celsius: -20 }).status, 'ok');
  // والساخن دون ٦٣ خرق.
  assert.equal(readingVerdict({ mode: 'hot', celsius: 50 }).status, 'breach');
});

test('حكم المستند يفصل الخرق عن غير المقيس', () => {
  const v = checkpointVerdict('PACK', [
    { mode: 'chilled', celsius: 9, sku: 'A' },
    { mode: 'frozen', sku: 'B' },
    { mode: 'chilled', celsius: 2, sku: 'C' },
  ]);
  assert.equal(v.point, 'CCP4');
  assert.equal(v.breaches.length, 1);
  assert.equal(v.unmeasured.length, 1);
  assert.equal(v.ok, false);
});

test('★ الخرق يفتح استثناء جودةٍ قائم — لا نوعَ ثالثًا من الأعطاب', () => {
  const exc = coldChainExceptions('TRN', [{ mode: 'chilled', celsius: 12, sku: 'SAUCE', batch: 'PB-1', qty: 5 }], { location: 'KITCHEN' });
  assert.equal(exc.length, 1);
  assert.equal(exc[0].type, 'qc_reject');
  assert.ok(EXCEPTION_TYPES.qc_reject, 'النوع مبنيٌّ من قبل');
  assert.match(exc[0].reason, /خرقُ سلسلة تبريدٍ عند الشحن/);
  assert.match(exc[0].reason, /دفعة PB-1/);
  // وغير المقيس لا يفتح استثناءً.
  assert.deepEqual(coldChainExceptions('TRN', [{ mode: 'chilled', sku: 'X' }]), []);
});

test('★★ دفعةٌ خُرقت سلسلتها لا تُخصَّص قبل قرار جودةٍ مكتوب', () => {
  const history = [{ mode: 'chilled', celsius: 2 }, { mode: 'chilled', celsius: 11 }];

  const blocked = batchReleaseVerdict(history);
  assert.equal(blocked.ok, false);
  assert.match(blocked.problem, /يلزم قرار جودةٍ مكتوب/);
  assert.equal(blocked.breaches.length, 1);

  assert.equal(batchReleaseVerdict(history, { qcDecision: 'accepted' }).ok, true);
  assert.equal(batchReleaseVerdict(history, { qcDecision: 'rejected' }).ok, false);
  // وسلسلةٌ سليمة تمرّ بلا قرار.
  assert.equal(batchReleaseVerdict([{ mode: 'chilled', celsius: 2 }]).ok, true);
});
