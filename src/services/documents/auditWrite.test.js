/**
 * ‹ODOO-ORD› قيدُ التدقيق لا يوقف السلسلة إن أعاد الـSDK كتابةً بلغت الخادم.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { isOwnRetriedCreate } from './auditWrite.js';

test('«موجودٌ سلفًا» وحدَه نجاح — وما سواه يُرمى كما هو', () => {
  assert.equal(isOwnRetriedCreate({ code: 'already-exists', message: 'Document already exists: projects/x/documents/d/audit/a' }), true);
  assert.equal(isOwnRetriedCreate({ code: 'firestore/already-exists' }), true);
  for (const code of ['permission-denied', 'unavailable', 'aborted', 'not-found', '']) {
    assert.equal(isOwnRetriedCreate({ code }), false, code || 'بلا رمز');
  }
  assert.equal(isOwnRetriedCreate(new Error('Document already exists')), false, 'الرسالةُ وحدها لا تكفي — الرمزُ هو الحكم');
  assert.equal(isOwnRetriedCreate(null), false);
});

test('★★ `appendAudit` يمرّ بالحارس — فلا يعود الخطأ يوقف مستندًا في منتصف سلسلته', () => {
  const src = fs
    .readFileSync(new URL('./documentsService.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  const start = src.indexOf('export async function appendAudit(');
  assert.ok(start >= 0, 'appendAudit غائبةٌ أو صارت متزامنة');
  const body = src.slice(start, src.indexOf('\nexport ', start + 10));
  assert.match(body, /addDoc\(collection\(db, DOCS, docId, AUDIT\)/);
  assert.match(body, /catch \(err\) \{\s*if \(isOwnRetriedCreate\(err\)\) return null;\s*throw err;/);
});
