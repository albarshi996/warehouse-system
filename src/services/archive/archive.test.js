/**
 * اختبارات الأرشيف الدوريّ الخالصة — تُغني عن فتح متصفّح لصفحة محميّة.
 *
 * تتحقّق من: التحقّق يقبل الصيغ الأربع ويحرس الحدّ · الرقم الإشاريّ يقبل
 * `BFP-SCM-PR` ويرفض العبث · الدمج يجمع البذرة والحيّ ويرتّب بالأحدث ·
 * الملخّص يعدّ التصنيفين ويلتقط المصدر المعتمد.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateArchiveFile,
  isValidRefNumber,
  formatOf,
  MAX_BINARY_BYTES,
  MAX_HTML_BYTES,
  ACCEPTED_ARCHIVE_TYPES,
} from './archiveFile.js';
import {
  normalizeSeed,
  normalizeLive,
  mergeArchive,
  byCategory,
  archiveSummary,
  categoryLabel,
  byDateDesc,
} from './archiveModel.js';

// ═══════════ التحقّق من الملفّ ═══════════

test('يقبل الصيغ الأربع المعتمدة ويوسمها', () => {
  const cases = [
    ['application/pdf', 'PDF', 'pdf'],
    ['text/html', 'HTML', 'html'],
    ['image/jpeg', 'JPG', 'image'],
    ['image/png', 'PNG', 'image'],
  ];
  for (const [type, kind, format] of cases) {
    const r = validateArchiveFile({ name: 'x', size: 1000, type });
    assert.ok(r.ok, `${type} يجب أن يُقبل`);
    assert.equal(r.kind, kind);
    assert.equal(r.format, format);
  }
});

test('يرفض الصيغة غير المدعومة والملفّ الفارغ وغياب الملفّ', () => {
  assert.equal(validateArchiveFile(null).ok, false);
  assert.equal(validateArchiveFile({ name: 'a.docx', size: 10, type: 'application/msword' }).ok, false);
  assert.equal(validateArchiveFile({ name: 'a.pdf', size: 0, type: 'application/pdf' }).ok, false);
});

test('حدّ الـPDF أصرم من حدّ الـHTML', () => {
  // ملفّ بين الحدّين: مرفوض كـPDF، مقبول كـHTML.
  const mid = MAX_BINARY_BYTES + 1024;
  assert.ok(mid < MAX_HTML_BYTES, 'الاختبار يفترض الحدّ الثنائيّ أصغر');
  assert.equal(validateArchiveFile({ name: 'r.pdf', size: mid, type: 'application/pdf' }).ok, false);
  assert.equal(validateArchiveFile({ name: 'r.html', size: mid, type: 'text/html' }).ok, true);
});

test('كل صيغة مقبولة لها وسمٌ في الخريطة، وformatOf يوحّد', () => {
  assert.equal(Object.keys(ACCEPTED_ARCHIVE_TYPES).length, 4);
  assert.equal(formatOf('image/png'), 'image');
  assert.equal(formatOf('application/pdf'), 'pdf');
  assert.equal(formatOf('text/html'), 'html');
  assert.equal(formatOf('application/zip'), 'other');
});

// ═══════════ الرقم الإشاريّ ═══════════

test('الرقم الإشاريّ: يقبل BFP-SCM-PR والفراغ ويرفض العبث', () => {
  assert.ok(isValidRefNumber('BFP-SCM-PR-2026-005'));
  assert.ok(isValidRefNumber('MOM-2026-0001'));
  assert.ok(isValidRefNumber(''), 'الفراغ مقبول — الرقم اختياريّ');
  assert.ok(!isValidRefNumber('bfp-2026-5'), 'الحروف الصغيرة مرفوضة');
  assert.ok(!isValidRefNumber('BFP-SCM-PR-26-5'), 'السنة أربع خانات');
  assert.ok(!isValidRefNumber('لا رقم'));
});

// ═══════════ الدمج والتصنيف ═══════════

const SEED = [
  { id: 's1', category: 'report', refNumber: 'BFP-SCM-PR-2026-002', title: 'تقرير قديم', date: '2026-07-10', format: 'html', path: '/archive/a.html' },
  { id: 's2', category: 'minutes', refNumber: 'BFP-SCM-PR-2026-004', title: 'محضر', date: '2026-07-20', format: 'pdf', path: '/archive/m.pdf', primary: true },
];

const LIVE = {
  L1: { id: 'L1', category: 'report', title: 'تقرير حيّ أحدث', date: '2026-08-01', format: 'html', fileData: 'data:text/html;base64,PGgxPg==' },
  bad: null,
};

test('normalizeSeed يوحّد البذرة بمسارٍ ثابت لا حمولة', () => {
  const n = normalizeSeed(SEED[0]);
  assert.equal(n.source, 'seed');
  assert.equal(n.editable, false);
  assert.equal(n.path, '/archive/a.html');
  assert.equal(n.fileData, null);
  assert.equal(n.category, 'report');
});

test('normalizeLive يوحّد المرفوع بحمولةٍ وقابليّة تحرير', () => {
  const n = normalizeLive(LIVE.L1);
  assert.equal(n.source, 'live');
  assert.equal(n.editable, true);
  assert.ok(n.fileData.startsWith('data:'));
  assert.equal(n.storageUrl, null, 'حقل الترقية محجوزٌ فارغًا');
});

test('mergeArchive يجمع البذرة والحيّ ويرتّب بالأحدث ويُسقط الفارغ', () => {
  const list = mergeArchive(SEED, LIVE);
  assert.equal(list.length, 3, 'بذرتان + حيّ واحد (الفارغ مُسقَط)');
  assert.equal(list[0].id, 'L1', 'الأحدث تاريخًا أولًا');
  assert.equal(list[list.length - 1].id, 's1', 'الأقدم آخرًا');
});

test('التصنيف يفصل التقارير عن المحاضر', () => {
  const list = mergeArchive(SEED, LIVE);
  assert.equal(byCategory(list, 'report').length, 2);
  assert.equal(byCategory(list, 'minutes').length, 1);
  assert.equal(categoryLabel('minutes'), 'محاضر الاجتماعات');
  assert.equal(categoryLabel('مجهول'), 'التقارير', 'المجهول يردّ للتقارير');
});

test('الملخّص يعدّ التصنيفين ويلتقط المصدر المعتمد', () => {
  const s = archiveSummary(mergeArchive(SEED, LIVE));
  assert.equal(s.total, 3);
  assert.equal(s.reports, 2);
  assert.equal(s.minutes, 1);
  assert.equal(s.live, 1);
  assert.ok(s.primary && s.primary.id === 's2', 'المصدر المعتمد هو المُعلَّم primary');
});

test('الفرز التنازليّ يضع الفارغ تاريخًا في الآخر', () => {
  const arr = [{ date: '' }, { date: '2026-08-01' }, { date: '2026-07-01' }].sort(byDateDesc);
  assert.equal(arr[0].date, '2026-08-01');
  assert.equal(arr[2].date, '', 'بلا تاريخ في الآخر');
});
