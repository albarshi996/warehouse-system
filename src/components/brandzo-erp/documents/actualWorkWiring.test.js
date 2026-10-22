/**
 * ‹ODOO-ORD› حارسُ وصلِ «العمل الفعليّ» في صندوقَي المستندات — `DocumentsInbox` و`OpenDocumentsBox`.
 *
 * ═══ لماذا يقرأ نصَّ المكوّن ═══
 * المنطقُ كلُّه خالصٌ مُختبَر (`actualWork` · `openBox` · `inbox`) — والعطبُ الذي قيس حيًّا 2026-10-22 كان في
 * **الوصلة**: صفحةُ المستندات تعرض تجاربَ يوليو «معلّقةً منذ 88 يومًا» ولا شيءَ من أودو، لأنّ الصندوقَ لم يستدعِ
 * المرشِّحَ ولم يمرّر سياقًا ولم يطلب أنواعَ أودو أصلًا. فاختباراتُ الطبقة الخالصة تبقى خضراءَ والشاشةُ على حالها.
 * وهذا الحارسُ يُسقط كلَّ وصلةٍ تُنزع منها — كنمط `bulkActionBarWiring.test.js`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readyTypes } from '../../../services/documents/schemas/index.js';
import { isSourceOrder, tracksExecution } from '../../../services/documents/openBox.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** نصُّ المكوّن بلا أسطر التعليق — كي لا يُرضي الشرحُ الحارسَ بذكر الاسم. */
function codeOf(file) {
  return fs
    .readFileSync(path.join(here, file), 'utf8')
    .split(/\r?\n/)
    .filter((line) => !/^\s*(\*|\/\/|\/\*|\{\/\*)/.test(line))
    .join('\n');
}

const inbox = codeOf('DocumentsInbox.jsx');
const openBox = codeOf('OpenDocumentsBox.jsx');

test('★★ «الكل» يقرأ من الخادم ما بعد الافتتاح وحده — لا كلَّ المستندات ثمّ يصفّي', () => {
  assert.doesNotMatch(inbox, /listenAllDocuments\s*\(/, 'عاد «الكل» يقرأ تجاربَ ما قبل الافتتاح');
  assert.match(inbox, /listenDocumentsSince\(\s*setAll\s*,\s*\{\s*max:\s*100\s*\}\s*\)/);
});

test('★★ «مستنداتي» و«بانتظار اعتمادي» تمرّان بـactualDocs قبل أيّ عرض', () => {
  assert.match(inbox, /const mine = useMemo\(\(\) => actualDocs\(rawMine\)/);
  assert.match(inbox, /const pending = useMemo\(\(\) => actualDocs\(rawPending\)/);
  // والمشتقّاتُ من المصفّى لا من الخام — وإلّا عادت التجاربُ من بابٍ جانبيّ.
  assert.match(inbox, /awaitingMyApproval\(pending, me\)/);
  assert.match(inbox, /qcQueue\(pending,/);
  assert.doesNotMatch(inbox, /tab === 'mine' \? rawMine/, 'التبويبُ يعرض الخامَ');
});

test('★ ما أُخفي يُقال — والطرفُ partner أودو أوّلًا', () => {
  assert.match(inbox, /preOpeningNote\(/);
  assert.match(inbox, /\{hiddenNote && \(/, 'السطرُ يُحسب ولا يُرسم');
  assert.match(inbox, /partyText\(d, partyLabel\(d\)\)/);
  assert.match(openBox, /preOpeningNote\(box\.hidden/);
  assert.match(openBox, /partyOf\(d\)/);
});

test('★★ صندوقُ العمل يُبنى بالعمل الفعليّ وسياقه — لا buildOpenBox عاريًا', () => {
  assert.match(openBox, /buildActualOpenBox\(\[\.\.\.portalDocs, \.\.\.orderDocs\]\)/);
  assert.doesNotMatch(openBox, /buildOpenBox\(/, 'بُني بلا actualDocs وبلا سياق — فكلُّ معتمَدٍ مفتوحٌ أبدًا');
});

test('★★ أوامرُ أودو تُطلب باستعلامٍ وحدها — وبالمخطّط لا بقائمةٍ مكتوبة', () => {
  assert.match(openBox, /readyTypes\(\)\.filter\(isSourceOrder\)/);
  assert.match(openBox, /listenDocumentsByTypes\(orderTypes, setOrderDocs/);
  const orders = readyTypes().filter(isSourceOrder);
  assert.deepEqual(orders.sort(), ['OPO', 'OSO']);
  // وحدُّ Firestore في `in` ثلاثون: كلا الاستعلامين تحته فلا يُسقط `slice` نوعًا صامتًا.
  assert.ok(readyTypes().filter(tracksExecution).length <= 30);
  assert.ok(orders.every((t) => !tracksExecution(t)), 'نوعٌ في الاستعلامين يُعدّ مرّتين');
});
