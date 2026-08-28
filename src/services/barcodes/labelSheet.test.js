/**
 * اختبارات ورقة الملصقات — واحدٌ ومجموعةٌ ودفعة، وقرارُ ما يحمله الباركود.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LABEL_SIZES,
  MAX_SHEET_LABELS,
  SELECTION_MODES,
  buildLabelSheet,
  buildSheetLabel,
  pickSelection,
  reprintSheetProblem,
} from './labelSheet.js';

const RH = { company: 'BR', branch: 'RH' };
const POOL = ['W01-A01-R01', 'W01-A01-R02', 'W01-A01-R03', 'W01-A02-R01'];

test('الاختيار: واحدٌ من القائمة — وما ليس فيها يُردّ', () => {
  assert.deepEqual(pickSelection(POOL, { mode: 'one', code: 'w01 a01 r02' }).codes, ['W01-A01-R02']);
  assert.match(pickSelection(POOL, { mode: 'one', code: 'W09-A01' }).problem, /ليس في القائمة/);
  assert.match(pickSelection(POOL, { mode: 'one' }).problem, /اختر الملصق/);
});

test('الاختيار: مجموعةٌ بمدًى بين كودين — أو بأكوادٍ بعينها', () => {
  const range = pickSelection(POOL, { mode: 'range', from: 'W01-A01-R01', to: 'W01-A01-R03' });
  assert.deepEqual(range.codes, ['W01-A01-R01', 'W01-A01-R02', 'W01-A01-R03']);

  const picked = pickSelection(POOL, { mode: 'range', codes: ['W01-A02-R01', 'W01-A01-R01'] });
  assert.deepEqual(picked.codes, ['W01-A02-R01', 'W01-A01-R01'], 'والمختارة تبقى بترتيب من اختارها');

  assert.match(pickSelection(POOL, { mode: 'range', from: 'W01-A01-R03', to: 'W01-A01-R01' }).problem, /معكوس/);
  assert.match(pickSelection(POOL, { mode: 'range', codes: ['W09-Z'] }).problem, /خارج القائمة/);
  assert.match(pickSelection(POOL, { mode: 'range' }).problem, /أوّل المدى وآخره/);
});

test('الاختيار: الدفعة الكاملة مرتَّبة — والفارغة تُعلن', () => {
  assert.equal(pickSelection(POOL, { mode: 'all' }).codes.length, 4);
  assert.match(pickSelection([], {}).problem, /لا شيء ليُطبع/);
  assert.equal(Object.keys(SELECTION_MODES).length, 3);
});

test('★★ الملصق يُظهر الكود الكامل — والباركود يحمل القانونيّ', () => {
  const label = buildSheetLabel('W01-DOCK-OUT-01', { qualifier: RH, record: { nameAr: 'الرصيف الشماليّ' } });
  assert.equal(label.headline, 'BR-RH-W01-DOCK-OUT-01', 'العينُ تقرأ ما أراده النصّ');
  assert.equal(
    label.barcodeValue,
    'W01-DOCK-OUT-01',
    'والباركود يحمل القانونيّ — وإلّا توقّف كلُّ مسحٍ قائمٍ يوم تُطبع الملصقات'
  );
  assert.equal(label.subline, 'باب تحميل');
  assert.ok(label.lines.includes('الرصيف الشماليّ'));
  assert.ok(label.lines.includes('W01-DOCK-OUT-01'), 'والقانونيّ مكتوبٌ صغيرًا فيُقرأ بالعين عند اللزوم');
});

test('ملصق الرفّ يحمل المختصر الذي يراه العامل', () => {
  const label = buildSheetLabel('W01-A01-R01-B09-LF-P01', { qualifier: RH });
  assert.equal(label.headline, 'BR-RH-W01-A01-R01-B09-LF-P01');
  assert.equal(label.subline, 'R01-09-F', 'المختصر مشتقٌّ من الكود لا مكتوبٌ بجانبه');
});

test('ملصق المركبة يحمل اللوحة والرقم الداخليّ — والعينُ تطابق الحديد', () => {
  const label = buildSheetLabel('VEH-RH-TRK-001', { record: { plateNo: '12-3456', internalNo: 'TRK-09' } });
  assert.equal(label.headline, 'VEH-RH-TRK-001');
  assert.equal(label.subline, 'شاحنة · فرع RH');
  assert.deepEqual(label.lines, ['لوحة 12-3456', 'رقم داخليّ TRK-09']);
});

test('ملصقٌ لقيمةٍ لا يعرفها المصنّف لا يُبنى أصلًا', () => {
  assert.equal(buildSheetLabel('???'), null);
});

test('الورقة تُبنى بمقاسٍ مقترحٍ لكلّ نوع', () => {
  const sheet = buildLabelSheet({ codes: POOL, qualifier: RH });
  assert.equal(sheet.labels.length, 4);
  assert.equal(sheet.size.id, LABEL_SIZES.shelf.id, 'الرفّ مقاسه رفّ');
  assert.equal(sheet.problem, '');

  const doors = buildLabelSheet({ codes: ['W01-DOCK-OUT-01'], qualifier: RH });
  assert.equal(doors.size.id, 'door');

  const explicit = buildLabelSheet({ codes: POOL, size: 'small' });
  assert.equal(explicit.size.id, 'small');
});

test('النسخ تتضاعف — وكلُّ نسخةٍ بعد الأولى موسومةٌ معادة', () => {
  const sheet = buildLabelSheet({ codes: ['W01-A01-R01'], copies: 3 });
  assert.equal(sheet.labels.length, 3);
  assert.deepEqual(sheet.labels.map((l) => l.reprint), [false, true, true]);
});

test('★★ السقف يُعلَن ولا يُقصّ صامتًا — من طلب أكثر يُقال له كم بقي', () => {
  const many = Array.from({ length: MAX_SHEET_LABELS + 20 }, (_, i) => `W01-A01-R${String(i + 1).padStart(3, '0')}`);
  const sheet = buildLabelSheet({ codes: many });
  assert.equal(sheet.labels.length, MAX_SHEET_LABELS);
  assert.equal(sheet.dropped, 20);
  assert.match(sheet.problem, /وبقي 20/);
  assert.match(sheet.problem, /دفعةٍ ثانية/);
});

test('★ إعادة الطباعة تُلزم سببًا — والرسالة تعدّ ما يُعاد', () => {
  assert.match(reprintSheetProblem({ codes: ['W01-A01-R01'] }), /سبب إعادة الطباعة/);
  assert.match(reprintSheetProblem({ codes: POOL }), /إعادةُ 4 ملصقًا/);
  assert.equal(reprintSheetProblem({ codes: POOL, reason: 'تلف بالماء' }), '');
  assert.match(reprintSheetProblem({}), /لا ملصق/);
});
