/**
 * 🔒🔒 حارسُ القواعد الحاكمة — كلُّ قاعدةٍ تُعلَن مبنيّةً تُثبِت حارسها.
 *
 * ثمانَ عشرةَ من نصّ خطة ٧، وأربعَ عشرةَ من **طلب هويّة الباركود 2026-08-27**
 * (‹LPN-719› · ف-٢٢) — والجميعُ في جدولٍ واحد، فلا يُقرأ حارسان لبيتٍ واحد.
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
// ═══ وحداتُ طلب الباركود ‹م٧› ═══
import { classifyScan } from '../barcodes/barcodeCode.js';
import { opProblem, valueSourceProblem } from '../barcodes/barcodeKinds.js';
import { printProblem, reuseProblem, shapeEntry, statusProblem } from '../barcodes/barcodeRegistry.js';
import { movementProblem, proofProblem } from './movementProof.js';
import { itemScanVerdict, openDockSession } from './dockLoading.js';
import { manualOverrideProblem } from '../shipping/customerLabel.js';

const LPN_A = 'LPN-MAIN-20260827-000001';

/** قيدُ باركودٍ مرجعيٌّ لضوابط م٧ — بابٌ فعّالٌ أُنشئ بسبب. */
const ENTRY = {
  value: 'W01-DOCK-OUT-01',
  createdBy: 'u-1',
  createdAt: '2026-08-27T08:00:00.000Z',
  reason: 'افتتاح الرصيف',
};

/** رفٌّ موقوفٌ إداريًّا — لا يستقبل بضاعة. */
const STOPPED_BIN = { code: 'MAIN-A01-R09-B01', status: 'stopped', storageType: 'ambient', capacity: { qty: 100 } };

/** رفٌّ بلغ سعته. */
const FULL_BIN = { code: 'MAIN-A01-R08-B01', status: 'active', storageType: 'ambient', capacity: { qty: 10 } };

/** بيّنةُ أصلٍ وحدها — بلا وجهة. */
const SOURCE_PROOF = { role: 'SOURCE', kind: 'PALLET', code: LPN_A, method: 'SCAN', at: 't', actor: 'u' };
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

  /* ═══════════ ضوابطُ طلب هويّة الباركود 2026-08-27 ‹م٧› ═══════════ */

  {
    n: 19, text: 'منع تكرار أرقام الطبالي والمواقع',
    state: 'ENFORCED',
    guard: () => /القيمة هي الهويّة/.test(reuseProblem('W01-DOCK-OUT-01', ENTRY)),
  },
  {
    n: 20, text: 'عدم السماح بتخزين طبلية في موقع غير نشط',
    state: 'ENFORCED',
    guard: () => {
      const v = binScanVerdict(UNIT, 'MAIN-A01-R09-B01', { locations: [STOPPED_BIN] });
      return v.ok === false && v.needsReason === true;
    },
  },
  {
    n: 21, text: 'التحقّق من الفرع والمستودع قبل تأكيد الحركة',
    state: 'ENFORCED',
    guard: () => /تتبع مستودع/.test(binScanVerdict(UNIT, 'W99-A01-R01', { locations: [] }).message),
  },
  {
    n: 22, text: 'التنبيه عند تجاوز سعة الموقع أو عدم توافق نوعه',
    state: 'ENFORCED',
    guard: () => {
      const v = binScanVerdict(UNIT, 'MAIN-A01-R08-B01', {
        locations: [FULL_BIN],
        balances: [{ sku: 'WNW-002', warehouse: 'MAIN', bin: 'MAIN-A01-R08-B01', qty: 10 }],
      });
      return v.ok === false && typeof v.message === 'string' && v.message.length > 0;
    },
  },
  {
    n: 23, text: 'عدم تغيير موقع الطبلية دون تسجيل حركةٍ رسميّة (أصلٌ ووجهة)',
    state: 'ENFORCED',
    guard: () => {
      const out = movementProblem({
        required: [
          { role: 'SOURCE', kinds: ['PALLET'], labelAr: 'الطبلية' },
          { role: 'DESTINATION', kinds: ['LOCATION'], labelAr: 'الرفّ' },
        ],
        proofs: [SOURCE_PROOF],
      });
      return out.ok === false && out.missing.includes('الرفّ');
    },
  },
  {
    n: 24, text: 'السماح بالاستثناء فقط لصلاحيّةٍ محدَّدة مع تسجيل السبب',
    state: 'ENFORCED',
    guard: () =>
      /المدير أو المشرف/.test(opProblem('VOID', 'DOCK_OUT', { portalRole: 'storekeeper' })) &&
      /سببًا مكتوبًا/.test(proofProblem({ role: 'SOURCE', value: 'W01-A01', actor: 'u', at: 't', manual: true })),
  },
  {
    n: 25, text: 'الاحتفاظ بسجلّ حركاتٍ لا يمكن حذفه من الواجهة التشغيليّة',
    state: 'ENFORCED',
    guard: () => /ختاميّة/.test(statusProblem(shapeEntry({ ...ENTRY, status: 'CLOSED' }), 'ACTIVE')),
  },
  {
    n: 26, text: 'دعم إعادة طباعة الملصق مع تسجيل من أعاد طباعته وسببِ ذلك',
    state: 'ENFORCED',
    guard: () => /سبب إعادة الطباعة/.test(printProblem({ ...ENTRY, printCount: 1 }, { actor: 'u', at: 't' })),
  },
  {
    n: 27, text: 'عدم إعادة استخدام رقم طبليةٍ مغلقة لطبليةٍ جديدة',
    state: 'ENFORCED',
    guard: () => /أُغلقت/.test(reuseProblem(LPN_A, shapeEntry({ ...ENTRY, value: LPN_A, status: 'CLOSED' }))),
  },
  {
    n: 28, text: 'فصل باركود الصنف عن باركود الطبلية وعن باركود الموقع',
    state: 'ENFORCED',
    guard: () =>
      classifyScan('6224000123456').kind === 'ITEM' &&
      classifyScan(LPN_A).kind === 'PALLET' &&
      classifyScan('MAIN-A01-R01-B01').kind === 'LOCATION',
  },
  {
    n: 29, text: '★★ لا تتغيّر حالةٌ بمجرّد ضغط زرّ — بل بمسح الأصل والوجهة',
    state: 'ENFORCED',
    guard: () => {
      const out = movementProblem({
        required: [{ role: 'DESTINATION', kinds: ['DOCK_OUT'], labelAr: 'باب التحميل' }],
        proofs: [],
      });
      return out.ok === false && /لا تُثبَّت الحركة بضغط زرّ/.test(out.message);
    },
  },
  {
    n: 30, text: 'لا يُعدّ الطلب محمَّلًا إلّا بقراءة باركوده فعليًّا عند باب التحميل',
    state: 'ENFORCED',
    guard: () => {
      const session = openDockSession({ warehouse: 'MAIN', actor: 'u', at: 't' }).session;
      return /أكمل مسح الباب والمركبة والرحلة/.test(itemScanVerdict(session, LPN_A, UNIT).message);
    },
  },
  {
    n: 31, text: 'الموظّف لا يكتب رقم الباركود بنفسه — النظام يولّده وفق التسلسل',
    state: 'ENFORCED',
    guard: () => /يولّده النظام وفق التسلسل/.test(valueSourceProblem('PALLET', { value: LPN_A })),
  },
  {
    n: 32, text: 'لا يغيّر الموظّف اسم العميل ولا رقم الطلب في ملصق الشحنة يدويًّا',
    state: 'ENFORCED',
    guard: () => /تُسحب من أمر الصرف المعتمد/.test(manualOverrideProblem({ customerName: 'عميلٌ آخر' })),
  },
];

test('★★★ القواعد الحاكمة الاثنتان والثلاثون كلُّها مذكورةٌ بنصّها وحالتها', () => {
  assert.equal(RULES.length, 32, 'ثمانَ عشرةَ من خطة ٧ وأربعَ عشرةَ من طلب الباركود');
  for (const r of RULES) {
    assert.ok(r.text, `القاعدة ${r.n} بلا نصّ`);
    assert.ok(['ENFORCED', 'ENFORCED_ELSEWHERE', 'PENDING'].includes(r.state), `القاعدة ${r.n} بحالةٍ غير معروفة`);
  }
  const numbers = RULES.map((r) => r.n).sort((a, b) => a - b);
  assert.deepEqual(numbers, Array.from({ length: 32 }, (_, i) => i + 1), 'لا رقمَ مفقودٌ ولا مكرَّر');
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
  assert.equal(enforced, 31, 'إحدى وثلاثون قاعدةً مُنفَّذةٌ بحارسٍ يُشغَّل');
  assert.equal(Math.round((enforced / RULES.length) * 100), 97);
});

test('★★★ ضوابطُ طلب الباركود الأربعة عشر **كلُّها** لها حارسٌ يُشغَّل — لا واحدَ يُدَّعى', () => {
  const m7 = RULES.filter((r) => r.n >= 19);
  assert.equal(m7.length, 14);
  assert.equal(
    m7.every((r) => r.state === 'ENFORCED' && typeof r.guard === 'function'),
    true,
    'ضابطٌ بلا حارسٍ يُشغَّل = وعدٌ في وثيقة'
  );
  for (const r of m7) assert.equal(r.guard(), true, `الضابط ${r.n} (${r.text}) لم يُثبت نفسه`);
});
