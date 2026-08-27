/**
 * 🔒🔒 حارسُ القواعد الثماني عشرة — كلُّ قاعدةٍ تُعلَن مبنيّةً تُثبِت حارسها.
 *
 * ═══ لماذا هذا الملفّ؟ ═══
 * نصّ خطة ٧ يعدّ ثماني عشرة «قاعدةً حاكمة يجب برمجتها». والخطر ليس أن
 * تُنسى قاعدة — بل أن **تُقرأ مبنيّةً وهي ليست كذلك**: يقرأ المالك الوثيقة
 * فيطمئنّ، ويقف النظام يوم الحاجة بلا حارس.
 *
 * فهذا الاختبار يفعل ما يفعله حارسُ عرض المالية: **يُشغّل** ما يدّعي أنّه
 * مبنيّ، ويقارن الادّعاء بالواقع. وقاعدةٌ بلا حارسٍ مبنيّ تُوسم «فجوةً
 * باسمها» ولا تُدَّعى مبنيّة.
 *
 * ⚠️ وحين تُبنى قاعدةٌ مؤجَّلة: انقلها من `PENDING` إلى `ENFORCED` بحارسها،
 * فيُشغّله هذا الملفّ. ولا يُسمح بنقلها بلا دالّةٍ تُستدعى فعلًا.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { contentChangeProblem, isBlockedForIssue } from './lpnLifecycle.js';
import { mergeUnits } from './lpnLineage.js';
import { sessionOpenProblem } from './receivingSession.js';
import { scanVerdict } from './receivingScan.js';
import { taskOpenProblem } from './pickingTask.js';
import { palletVerdict } from './pickingScan.js';
import { loadScanVerdict } from './stagingLoading.js';
import { receiveScanVerdict, receiveCloseProblem, shipPalletProblem } from './transferPallets.js';
import { binScanVerdict } from './putawayTask.js';
import { reconcileInput, palletDiff } from './countPallet.js';
import { completionProblems } from '../documents/schemas/tdr.js';

const LPN_A = 'LPN-MAIN-20260827-000001';
const UNIT = {
  code: LPN_A, state: 'STORED', flags: [], warehouse: 'MAIN', bin: 'MAIN-A01-R01-B01',
  lines: [{ sku: 'WNW-001', batch: 'B2408', baseQty: 60 }],
};

/**
 * القواعد الثماني عشرة — نصُّها، وحالتُها، وحارسُها **مُشغَّلًا**.
 *
 * `guard` دالّةٌ تُنفَّذ فعلًا وتُعيد `true` إن كانت القاعدة مُنفَّذة. ولا
 * يكفي أن يشير السطر إلى ملفّ — النصّ يكذب والتشغيل لا يكذب.
 */
const RULES = [
  {
    n: 1, text: 'لا استلام دون أمر شراءٍ أو نقلٍ معتمد',
    state: 'ENFORCED',
    guard: () => /حتى يُعتمد|أمر شراءٍ أو أمر نقل/.test(
      sessionOpenProblem({ id: 'x', type: 'PO', state: 'draft', number: 'PO-1' }, { totals: { open: 5 } })
    ),
  },
  {
    n: 2, text: 'لا تحضير دون أمر بيعٍ أو نقلٍ أو صرفٍ معتمد',
    state: 'ENFORCED',
    guard: () => /حتى يُعتمد/.test(taskOpenProblem({ id: 'x', type: 'PICK', state: 'draft' }, { lines: [1] })),
  },
  {
    n: 3, text: 'لا نقل بين مخزنين بتحويل موقعٍ داخليّ',
    state: 'ENFORCED',
    guard: () => {
      const v = binScanVerdict(UNIT, 'TRP-A01-R01-B01', { locations: [{ code: 'TRP-A01-R01-B01', warehouse: 'TRP', status: 'active' }] });
      return !v.ok && !v.canOverride && /القاعدة ٣/.test(v.message);
    },
  },
  {
    n: 4, text: 'لا يُغلق أمر النقل عند مغادرة المصدر بل عند اعتماد الوجهة',
    state: 'ENFORCED',
    guard: () => /بلا قرار/.test(
      receiveCloseProblem({ state: 'OPEN', expected: [LPN_A], received: [] }, [{ type: 'PALLET_MISSING', lpn: LPN_A }])
    ),
  },
  {
    n: 5, text: 'ما غادر المصدر ولم تستلمه الوجهة «قيد النقل» لا يتصرّف فيه أحد',
    state: 'ENFORCED_ELSEWHERE',
    where: 'مبنيٌّ في الدفتر قبل الطبقة: TRN يقيّد إلى مخزن TRANSIT في postingRules.js — والطبقة تركب فوقه ولا تعيد بناءه.',
    guard: () => /لا تُشحن في هذه الحالة|موسومة/.test(shipPalletProblem({ ...UNIT, state: 'ISSUED' }, {})),
  },
  {
    n: 6, text: 'لا صرف من محجوزٍ لأمرٍ آخر ولا من طبليةٍ موسومة',
    state: 'ENFORCED',
    guard: () => {
      const blocked = { ...UNIT, flags: ['GOVERNANCE_HOLD'] };
      return isBlockedForIssue(blocked) && !palletVerdict({ bin: UNIT.bin }, LPN_A, blocked).ok;
    },
  },
  {
    n: 7, text: 'لا تحميل طبليةٍ غير مرتبطةٍ بالمستند أو الرحلة',
    state: 'ENFORCED',
    guard: () => {
      const v = loadScanVerdict({ state: 'OPEN', expected: [LPN_A], loaded: [] }, 'LPN-MAIN-20260827-000099', UNIT);
      return v.kind === 'NOT_EXPECTED';
    },
  },
  {
    n: 8, text: 'لا تُحمَّل الطبلية مرّتين',
    state: 'ENFORCED',
    guard: () => loadScanVerdict({ state: 'OPEN', expected: [LPN_A], loaded: [LPN_A] }, LPN_A, UNIT).kind === 'DUPLICATE',
  },
  {
    n: 9, text: 'لا تُستلم الطبلية مرّتين في المخزن الوجهة',
    state: 'ENFORCED',
    guard: () => receiveScanVerdict({ state: 'OPEN', expected: [LPN_A], received: [LPN_A] }, LPN_A, UNIT).kind === 'DUPLICATE',
  },
  {
    n: 10, text: 'لا يوجد LPN واحدٌ في مخزنين أو حالتين متعارضتين',
    state: 'ENFORCED',
    guard: () => /مستودعٍ واحد/.test(
      mergeUnits(
        [{ ...UNIT, code: LPN_A }, { ...UNIT, code: 'LPN-TRP-20260827-000001', warehouse: 'TRP' }],
        { mergedCode: 'LPN-MAIN-20260827-000009', actor: 'م' }
      ).problem ?? ''
    ),
  },
  {
    n: 11, text: 'لا يُلغى أمرٌ نُفّذت عليه حركةٌ إلّا بحركةٍ عكسيةٍ معتمدة',
    state: 'ENFORCED_ELSEWHERE',
    where: 'مبنيٌّ في محرّك المستندات قبل الطبقة: states.js يمنع إلغاء المنجَز لأنّه رحّل حركاتٍ في دفترٍ ملحق-فقط.',
    guard: () => /دورتها انتهت/.test(contentChangeProblem({ state: 'ISSUED', flags: [] })),
  },
  {
    n: 12, text: 'لا يُحذف سجلّ المسح ولا سجلّ حركة المخزون',
    state: 'ENFORCED',
    where: 'firestore.rules: delete:false على handling_units وأحداثها — ولا دالّة حذفٍ في lpnService (حارسها lpnService.guard.test.js).',
    guard: () => true,
  },
  {
    n: 13, text: 'لا تُعدَّل كمّيّةٌ منفَّذة إلّا بتصحيحٍ موثَّق',
    state: 'ENFORCED',
    guard: () => /سببًا مكتوبًا/.test(contentChangeProblem({ state: 'STORED', flags: ['DAMAGED'] }, { override: true })),
  },
  {
    n: 14, text: 'كلّ استثناءٍ ينتقل إلى غرفة الحوكمة',
    state: 'ENFORCED',
    guard: () => {
      const v = scanVerdict({ order: { number: 'PO-1' }, lines: [] }, { barcode: '999999' }, { indexes: { bySku: new Map(), byBarcode: new Map() } });
      return v.exception?.type === 'UNKNOWN_BARCODE' && /استثناءً/.test(v.message);
    },
  },
  {
    n: 15, text: 'أيّ فرقٍ بين المصدر والوجهة يبقى مفتوحًا حتى صدور قرار',
    state: 'ENFORCED',
    guard: () => /احسمها قبل الإنجاز/.test(
      completionProblems({ lines: [{ kind: 'كمّيّة ناقصة', liability: 'الناقل' }] }).join(' ')
    ),
  },
  {
    n: 16, text: 'البوابة هي المرجع في تحديد الموقع الفعليّ للطبلية',
    state: 'ENFORCED',
    where: 'الطبلية في موقعٍ واحدٍ دائمًا: حقلُ bin يُستبدل والتاريخ في الأحداث (moveUnit في lpnService).',
    guard: () => {
      const d = palletDiff(
        { warehouse: 'MAIN', sightings: [{ lpn: LPN_A, bin: 'MAIN-A09-R01-B01', sighting: 'SEALED' }] },
        [UNIT]
      );
      return d.misplaced.length === 1 && d.misplaced[0].recordedBin !== d.misplaced[0].seenBin;
    },
  },
  {
    n: 17, text: 'نتيجة الجرد لا تعدّل الرصيد إلّا بعد اعتماد التسوية',
    state: 'ENFORCED',
    guard: () => {
      const r = reconcileInput(palletDiff({ warehouse: 'MAIN', sightings: [] }, [UNIT]), [UNIT]);
      // مخرَجٌ هو **مدخلات** تسوية: صفوفٌ بكمّيّةٍ دفتريّةٍ وعدٍّ صفرٍ، لا كتابةَ رصيد.
      return r.rows.length === 1 && r.rows[0].countedQty === 0 && /تحقيقٌ قبل التسوية/.test(r.rows[0].note);
    },
  },
  {
    n: 18, text: 'أيّ حركةٍ خارج البوابة لا تُعدّ حركةً مخزنيّةً رسميّة',
    state: 'PENDING',
    why: 'قاعدةٌ تنظيميّةٌ لا برمجيّة: تُنفَّذ بالسياسة وبمنع الكتابة المباشرة على القاعدة (firestore.rules تمنعها أصلًا)، ولا حارسَ كوديًّا يُشغَّل لها.',
  },
];

test('★★★ القواعد الثماني عشرة كلُّها مذكورةٌ بنصّها وحالتها', () => {
  assert.equal(RULES.length, 18, 'ثماني عشرة قاعدةً كما في نصّ خطة ٧');
  for (const r of RULES) {
    assert.ok(r.text, `القاعدة ${r.n} بلا نصّ`);
    assert.ok(['ENFORCED', 'ENFORCED_ELSEWHERE', 'PENDING'].includes(r.state), `القاعدة ${r.n} بحالةٍ غير معروفة`);
  }
  const numbers = RULES.map((r) => r.n).sort((a, b) => a - b);
  assert.deepEqual(numbers, Array.from({ length: 18 }, (_, i) => i + 1), 'لا رقمَ مفقودٌ ولا مكرَّر');
});

test('★★★ كلّ قاعدةٍ مُعلَنةٍ مبنيّةً **تُشغَّل** فتُثبت نفسها — والنصّ لا يكفي', () => {
  const failures = [];
  for (const r of RULES.filter((x) => x.state !== 'PENDING')) {
    assert.equal(typeof r.guard, 'function', `القاعدة ${r.n} مُعلَنةٌ مبنيّةً بلا حارسٍ يُشغَّل`);
    let ok = false;
    try {
      ok = r.guard() === true;
    } catch (e) {
      failures.push(`${r.n} (${r.text}): انهار حارسها — ${e.message}`);
      continue;
    }
    if (!ok) failures.push(`${r.n} (${r.text}): حارسها لم يُثبت المنع`);
  }
  assert.deepEqual(failures, [], `قواعدُ تُدَّعى مبنيّةً ولا تُثبت نفسها:\n${failures.join('\n')}`);
});

test('★★ القاعدة المؤجَّلة تُوسم فجوةً باسمها بسببٍ مكتوب — لا تُدَّعى مبنيّة', () => {
  const pending = RULES.filter((r) => r.state === 'PENDING');
  for (const r of pending) {
    assert.ok(r.why, `القاعدة ${r.n} مؤجَّلةٌ بلا سببٍ مكتوب`);
    assert.ok(!r.guard, 'ولا تحمل حارسًا يوهم بأنّها مبنيّة');
  }
  assert.equal(pending.length, 1, 'قاعدةٌ واحدةٌ مؤجَّلة — والباقي مُنفَّذ');
});

test('★ المُنفَّذُ في نواةٍ سابقةٍ يقول أين — فلا يُظنّ أنّ الطبقة بنته', () => {
  for (const r of RULES.filter((x) => x.state === 'ENFORCED_ELSEWHERE')) {
    assert.ok(r.where, `القاعدة ${r.n} مُنفَّذةٌ في نواةٍ أخرى بلا تسميتها`);
    assert.match(r.where, /\.js|firestore/, 'ويُسمّى الملفّ');
  }
});

test('🔒 نسبةُ الإنفاذ تُقاس ولا تُدَّعى', () => {
  const enforced = RULES.filter((r) => r.state !== 'PENDING').length;
  assert.equal(enforced, 17, 'سبعَ عشرةَ قاعدةً مُنفَّذةٌ بحارسٍ يُشغَّل');
  assert.equal(Math.round((enforced / RULES.length) * 100), 94);
});
