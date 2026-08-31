/**
 * اختبارات طابور الإرسال ‹CAP-303 · CAP-304› — منطق خالص.
 *
 * يحرس خاصّيّتين لا ثالثة لهما:
 *   ★ **الصمت يُكسر:** كلُّ قيدٍ لم يُقرّه الخادم يُعدّ ويُقال رقمُه.
 *   ★★ **الإقفال لا يبتلع:** ما دام في الطابور قيدٌ واحد، لا ختمَ للجلسة —
 *      لأنّ قاعدة `scans` ترفض ما يصل بعد الإقفال، فيضيع عملٌ وقع على الرفّ.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPending,
  queueState,
  pendingCount,
  queueLabel,
  closeVerdict,
  lastSeenByUser,
} from './scanQueue.js';

/* ───────────────── قراءة العلامة ───────────────── */

test('يقرأ العلامة المختومة `_pending`', () => {
  assert.equal(isPending({ _pending: true }), true);
  assert.equal(isPending({ _pending: false }), false);
});

test('ويقرأ `metadata.hasPendingWrites` الخام حين يصل غيرَ مهيَّأ', () => {
  assert.equal(isPending({ metadata: { hasPendingWrites: true } }), true);
  assert.equal(isPending({ metadata: { hasPendingWrites: false } }), false);
});

test('★ القيد بلا علامةٍ يُقرأ واصلًا لا معلَّقًا — وإلّا ادّعى المؤشّر طابورًا وهميًّا', () => {
  assert.equal(isPending({ barcode: '801', qty: 3 }), false);
  assert.equal(isPending(null), false);
  assert.equal(isPending(undefined), false);
  assert.equal(isPending('نصّ'), false);
});

test('`_pending` الصريحة تسبق `metadata` — فالمهيَّأ أحدثُ من الخام', () => {
  assert.equal(isPending({ _pending: false, metadata: { hasPendingWrites: true } }), false);
});

/* ───────────────── حالة الطابور ───────────────── */

test('يعدّ المعلَّق والواصل والمجموع', () => {
  const st = queueState([
    { _pending: true },
    { _pending: true },
    { _pending: false },
    {},
  ]);
  assert.equal(st.pending, 2);
  assert.equal(st.sent, 2);
  assert.equal(st.total, 4);
  assert.equal(st.allSent, false);
});

test('جلسةٌ كلُّها واصلةٌ = طابورٌ خالٍ', () => {
  const st = queueState([{ _pending: false }, {}]);
  assert.equal(st.pending, 0);
  assert.equal(st.allSent, true);
});

test('لا قيودَ = لا طابور (ولا انهيار على مُدخَلٍ غير قائمة)', () => {
  assert.equal(queueState([]).allSent, true);
  assert.equal(queueState(null).total, 0);
  assert.equal(queueState(undefined).pending, 0);
  assert.equal(pendingCount([{ _pending: true }]), 1);
});

/* ───────────────── نصّ المؤشّر ───────────────── */

test('★ الصفر بلا نصّ — مؤشّرٌ دائمٌ تتدرّب العين على تجاهله', () => {
  assert.equal(queueLabel(0), '');
  assert.equal(queueLabel(-3), '');
  assert.equal(queueLabel(null), '');
});

test('يصوغ المفرد والمثنّى والجمع عربيًّا', () => {
  assert.match(queueLabel(1), /قراءةٌ واحدة/);
  assert.match(queueLabel(2), /قراءتان/);
  assert.match(queueLabel(40), /^40 قراءة/);
});

/* ───────────────── ★★ حكم الإقفال ───────────────── */

test('★★ يمنع الإقفال ما دام في الطابور قيدٌ واحد', () => {
  const v = closeVerdict({ pending: 1 });
  assert.equal(v.ok, false);
  assert.equal(v.pending, 1);
  assert.match(v.reason, /لا يُقفَل/);
  assert.match(v.reason, /تضيع/, 'يقول العاقبة لا الحكم وحده');
});

test('يجيز الإقفال حين يخلو الطابور', () => {
  const v = closeVerdict({ pending: 0 });
  assert.equal(v.ok, true);
  assert.equal(v.reason, '');
});

test('يجيز إقفال جلسةٍ فارغة — صفرُ قيودٍ صفرُ طابور', () => {
  assert.equal(closeVerdict({ scans: [] }).ok, true);
  assert.equal(closeVerdict({}).ok, true);
});

test('يحسب الطابور من القيود حين لا يُمرَّر الرقم — فلا حسابَ مكرَّرٌ على المستدعي', () => {
  const v = closeVerdict({ scans: [{ _pending: true }, {}, { _pending: true }] });
  assert.equal(v.ok, false);
  assert.equal(v.pending, 2);
  assert.match(v.reason, /2 قراءة/);
});

test('الرقم السالب يُقرأ صفرًا — لا يُقلب المنعُ إجازةً بحسابٍ شاذّ', () => {
  assert.equal(closeVerdict({ pending: -5 }).ok, true);
});

test('★ المنع على الإقفال لا على العدّ — الحكم لا يعرف المسح أصلًا', () => {
  // الدالّة لا تُعيد أيّ حقلٍ يمنع مسحًا؛ عقدُها الإقفال وحدَه.
  const v = closeVerdict({ pending: 9 });
  assert.deepEqual(Object.keys(v).sort(), ['ok', 'pending', 'reason']);
});

/* ───────────────── آخر وصولٍ لكلّ عادّ ───────────────── */

const ms = (s) => (s?.at ? s.at : null);

test('يعطي لكلّ عادٍّ آخرَ وصولٍ وعددَ قيوده', () => {
  const rows = lastSeenByUser(
    [
      { byName: 'محمد', at: 1000 },
      { byName: 'محمد', at: 3000 },
      { byName: 'عبدالله', at: 2000 },
    ],
    ms
  );
  assert.equal(rows.length, 2);
  const m = rows.find((r) => r.name === 'محمد');
  assert.equal(m.lastAt, 3000, 'الأحدث يفوز');
  assert.equal(m.count, 2);
});

test('★ يُرتّب الأقدمَ صمتًا أوّلًا — فمن توقّف يظهر في الأعلى', () => {
  const rows = lastSeenByUser(
    [
      { byName: 'رمزي', at: 9000 },
      { byName: 'محمد', at: 1000 },
    ],
    ms
  );
  assert.equal(rows[0].name, 'محمد');
});

test('★★ القيد المعلَّق لا يُقاس به وصول — طابعُه فارغٌ فيكذب «وصلت الآن»', () => {
  const rows = lastSeenByUser(
    [
      { byName: 'محمد', at: 1000 },
      { byName: 'محمد', at: null, _pending: true },
    ],
    ms
  );
  assert.equal(rows[0].lastAt, 1000);
  assert.equal(rows[0].count, 1, 'المعلَّق لا يُعدّ واصلًا');
});

test('الاسم الفارغ يصير «غير معروف» ولا يُسقط القيد', () => {
  const rows = lastSeenByUser([{ byName: '  ', at: 5 }], ms);
  assert.equal(rows[0].name, 'غير معروف');
});

test('بلا محوِّل زمنٍ لا ينهار — يُعيد الأسماء بصفر', () => {
  const rows = lastSeenByUser([{ byName: 'محمد', at: 5 }]);
  assert.equal(rows[0].name, 'محمد');
  assert.equal(rows[0].lastAt, 0);
});
