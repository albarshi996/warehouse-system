/**
 * اختبارات دمج الجلسات — منطق خالص.
 *
 * الخاصّيّتان المحوريّتان:
 *   ★★ **لا يُجمع ما لا يُجمع:** جردٌ مع استلامٍ يُنتج مجموعًا بلا معنى.
 *   ★ **والمقفَلُ يُدمج:** وهي حالةُ المالك بعينها — بنغازي أُقفلت ثمّ طرابلس.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newCampaignId,
  normalizeCampaignName,
  mergeVerdict,
  groupByCampaign,
  campaignLabel,
  campaignLogRows,
  byBranch,
  MAX_NAME,
} from './campaign.js';

const BEN = { id: 'op-ben', code: 'BEN123', type: 'جرد', status: 'closed', warehouse: 'BEN' };
const TRI = { id: 'op-tri', code: 'TRP456', type: 'جرد', status: 'open', warehouse: 'TRI' };
const RECV = { id: 'op-r', code: 'RCV789', type: 'استلام', status: 'open' };

/* ───────────────── المعرّف والاسم ───────────────── */

test('المعرّف من أبجديّة الرموز — ستّةُ محارف', () => {
  const id = newCampaignId(() => 0.5);
  assert.equal(id.length, 6);
  assert.match(id, /^[A-Z0-9]{6}$/);
});

test('الاسمُ يُشذَّب ويُضغط فراغُه ويُقصّ عند الحدّ', () => {
  assert.equal(normalizeCampaignName('  جرد   ٢٠٢٦  '), 'جرد ٢٠٢٦');
  assert.equal(normalizeCampaignName('ط'.repeat(200)).length, MAX_NAME);
  assert.equal(normalizeCampaignName(null), '');
});

/* ───────────────── ★★ حكم الدمج ───────────────── */

test('★ جلسةٌ واحدةٌ ليست حملة', () => {
  const v = mergeVerdict([BEN]);
  assert.equal(v.ok, false);
  assert.match(v.reason, /جلستين على الأقلّ/);
  assert.equal(mergeVerdict([]).ok, false);
  assert.equal(mergeVerdict(null).ok, false);
});

test('★★ لا تُدمج أنواعٌ مختلفة — والسببُ مذكورٌ لا حكمٌ مجرَّد', () => {
  const v = mergeVerdict([BEN, RECV]);
  assert.equal(v.ok, false);
  assert.match(v.reason, /جرد/);
  assert.match(v.reason, /استلام/);
  assert.match(v.reason, /بلا معنى/);
});

test('★ بنغازي المُقفلة تُدمج مع طرابلس المفتوحة — حالةُ المالك بعينها', () => {
  const v = mergeVerdict([BEN, TRI]);
  assert.equal(v.ok, true);
  assert.equal(v.type, 'جرد');
  assert.ok(v.notes.some((n) => /مُقفلة/.test(n)), 'يُعلن أنّ فيها مقفَلةً ولا يمنع');
});

test('★ اختلافُ النطاق لا يمنع — وهو الغرضُ من الدمج', () => {
  assert.equal(mergeVerdict([BEN, TRI]).ok, true);
});

test('★ المنتميةُ لحملةٍ أخرى تُنقل — ويُعلَن النقلُ ولا يقع صامتًا', () => {
  const v = mergeVerdict([{ ...BEN, campaignId: 'OLD111' }, TRI]);
  assert.equal(v.ok, true);
  assert.equal(v.moved.length, 1);
  assert.match(v.notes.join(' '), /تنتمي لحملةٍ قائمة وستُنقل/);
  assert.match(v.notes.join(' '), /BEN123/, 'يُسمّى المنقولُ برمزه');
});

test('جلساتٌ بلا نوعٍ مكتوبٍ لا تُسقط الحكم', () => {
  const v = mergeVerdict([{ id: 'a' }, { id: 'b' }]);
  assert.equal(v.ok, true);
  assert.equal(v.type, '');
});

/* ───────────────── التجميع ───────────────── */

const at = (o) => o?.ms ?? null;

test('يجمع الجلسات في حملاتها ويترك ما لا حملةَ له خارجًا', () => {
  const groups = groupByCampaign(
    [
      { ...BEN, campaignId: 'C1', campaignName: 'جرد ٢٠٢٦', ms: 100 },
      { ...TRI, campaignId: 'C1', campaignName: 'جرد ٢٠٢٦', ms: 500 },
      { id: 'lonely', ms: 900 },
    ],
    { toMillis: at }
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, 'C1');
  assert.equal(groups[0].ops.length, 2);
  assert.equal(groups[0].name, 'جرد ٢٠٢٦');
  assert.equal(groups[0].lastAt, 500, 'الأحدثُ من أعضائها');
  assert.deepEqual(groups[0].types, ['جرد']);
});

test('★ آخرُ اسمٍ مكتوبٍ يفوز — فإعادةُ التسمية لا تحتاج كتابةً على كلّ عضو', () => {
  const [g] = groupByCampaign(
    [
      { id: 'a', campaignId: 'C1', campaignName: 'قديم' },
      { id: 'b', campaignId: 'C1', campaignName: 'جديد' },
    ],
    { toMillis: at }
  );
  assert.equal(g.name, 'جديد');
});

test('حملةٌ بلا اسمٍ تُعرض بمعرّفها لا بفراغ', () => {
  assert.equal(campaignLabel({ id: 'C1', name: '' }), 'C1');
  assert.equal(campaignLabel({ id: 'C1', name: 'جرد ٢٠٢٦' }), 'جرد ٢٠٢٦ (C1)');
  assert.equal(campaignLabel(null), '—');
});

test('الحملاتُ مرتّبةٌ بالأحدث', () => {
  const g = groupByCampaign(
    [
      { id: 'a', campaignId: 'OLD', ms: 10 },
      { id: 'b', campaignId: 'NEW', ms: 900 },
    ],
    { toMillis: at }
  );
  assert.deepEqual(g.map((x) => x.id), ['NEW', 'OLD']);
});

test('لا ينهار على مُدخَلٍ غير قائمة', () => {
  assert.deepEqual(groupByCampaign(null), []);
  assert.deepEqual(groupByCampaign(undefined), []);
});

/* ───────────────── ★ صفوف الحملة ───────────────── */

const PARTS = [
  {
    op: BEN,
    rows: [
      { id: 'b1', atMs: 100, byName: 'محمد', barcode: '801', name: 'شامبو', base: 60 },
      { id: 'b2', atMs: 300, byName: 'محمد', barcode: '802', name: 'صابون', base: 5 },
    ],
  },
  {
    op: TRI,
    rows: [{ id: 't1', atMs: 200, byName: 'رمزي', barcode: '801', name: 'شامبو', base: 12 }],
  },
];

test('★ كلُّ صفٍّ يحمل فرعَه ورمزَ جلسته', () => {
  const rows = campaignLogRows(PARTS, (op) => op.warehouse);
  assert.equal(rows.length, 3);
  assert.equal(rows.find((r) => r.id === 'b1').branch, 'BEN');
  assert.equal(rows.find((r) => r.id === 't1').branch, 'TRI');
  assert.equal(rows.find((r) => r.id === 't1').opCode, 'TRP456');
  assert.equal(rows.find((r) => r.id === 't1').opId, 'op-tri');
});

test('★ رمزُ الجلسة يُطبَّع بأبجديّة الرموز — فـ«I» تصير «1» ولا يُعرض رمزان لشيءٍ واحد', () => {
  const rows = campaignLogRows([{ op: { id: 'x', code: 'TRI456' }, rows: [{ id: 'r', atMs: 1 }] }]);
  assert.equal(rows[0].opCode, 'TR1456', 'الأبجديّة تُسقط I و L و O و U — والتطبيع واحدٌ في البوّابة كلّها');
});

test('★★ الترتيبُ بالوقت **عبر الجلستين** لا داخل كلٍّ على حدة', () => {
  const rows = campaignLogRows(PARTS, (op) => op.warehouse);
  assert.deepEqual(rows.map((r) => r.id), ['b2', 't1', 'b1'], '300 · 200 · 100');
});

test('★ لا تُجمع القيود في صفٍّ واحد — كلُّ قيدٍ يبقى بقارئه', () => {
  const rows = campaignLogRows(PARTS, (op) => op.warehouse);
  assert.equal(rows.filter((r) => r.barcode === '801').length, 2, 'شامبو في الفرعين — صفّان');
});

test('ما لا وقتَ له يُقدَّم، ولا ينهار بلا دالّة فرع', () => {
  const rows = campaignLogRows([{ op: BEN, rows: [{ id: 'x', atMs: null }, { id: 'y', atMs: 5 }] }]);
  assert.equal(rows[0].id, 'x');
  assert.equal(rows[0].branch, '');
  assert.deepEqual(campaignLogRows(null), []);
});

/* ───────────────── توزيع الفروع ───────────────── */

test('★ «كم عُدّ في بنغازي وكم في طرابلس»', () => {
  const rows = campaignLogRows(PARTS, (op) => op.warehouse);
  const b = byBranch(rows);
  const ben = b.find((x) => x.branch === 'BEN');
  assert.equal(ben.scans, 2);
  assert.equal(ben.base, 65);
  assert.equal(ben.items, 2);
  assert.equal(ben.people, 1);
  const tri = b.find((x) => x.branch === 'TRI');
  assert.equal(tri.base, 12);
});

test('الفرعُ الفارغ يُسمّى «—» ولا يُسقط صفَّه', () => {
  const b = byBranch([{ branch: '', base: 3, barcode: 'x', byName: 'م' }]);
  assert.equal(b[0].branch, '—');
  assert.equal(b[0].scans, 1);
});

test('لا فروعَ من مُدخَلٍ غير قائمة', () => {
  assert.deepEqual(byBranch(null), []);
});
