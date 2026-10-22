/**
 * ‹ODOO-ORD› العملُ الفعليّ: حدُّ الافتتاح بتوقيت ليبيا، وأودو عملٌ فعليٌّ أيًّا كان تاريخُه.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OPENING_DAY, OPENING_MS, actualDocs, actualMoves, actualRecords,
  isOdooDoc, isPreOpeningDoc, isPreOpeningRecord, libyaDayOfStamp, stampMs,
} from './actualWork.js';

const ts = (iso) => ({ toMillis: () => Date.parse(iso) });

test('الحدُّ منتصفُ ليل 20 أكتوبر بتوقيت ليبيا', () => {
  assert.equal(OPENING_DAY, '2026-10-20');
  assert.equal(new Date(OPENING_MS).toISOString(), '2026-10-19T22:00:00.000Z');
});

test('يومُ الطابع بتوقيت ليبيا من كلّ صورةٍ يكتبها Firestore أو REST', () => {
  assert.equal(libyaDayOfStamp(ts('2026-10-19T21:59:59Z')), '2026-10-19');
  assert.equal(libyaDayOfStamp(ts('2026-10-19T22:00:00Z')), '2026-10-20');
  assert.equal(libyaDayOfStamp({ seconds: Date.parse('2026-08-25T10:00:00Z') / 1000 }), '2026-08-25');
  assert.equal(libyaDayOfStamp('2026-10-19T22:06:43.645Z'), '2026-10-20');
  assert.equal(libyaDayOfStamp(new Date('2026-07-01T00:00:00Z')), '2026-07-01');
  assert.equal(libyaDayOfStamp(null), '');
  assert.equal(libyaDayOfStamp({}), '');
  assert.ok(Number.isNaN(stampMs('ليس تاريخًا')));
});

test('مستندُ البوّابة قبل الافتتاح يُخفى بأيّ حالة — ومستندُ أودو لا', () => {
  const portal = (iso, state = 'done') => ({ type: 'PO', state, createdAt: ts(iso), header: {} });
  assert.equal(isPreOpeningDoc(portal('2026-08-25T10:00:00Z')), true);
  assert.equal(isPreOpeningDoc(portal('2026-08-25T10:00:00Z', 'approved')), true);
  assert.equal(isPreOpeningDoc(portal('2026-10-20T08:00:00Z')), false, 'ما أُنشئ بعد الافتتاح عملٌ حقيقيّ');
  const odoo = { type: 'PICK', state: 'canceled', createdAt: ts('2026-10-19T10:00:00Z'), header: { sourceSystem: 'Odoo' } };
  assert.equal(isOdooDoc(odoo), true);
  assert.equal(isPreOpeningDoc(odoo), false, 'أودو عملٌ فعليٌّ أيًّا كان تاريخُ إنشائه');
  assert.equal(isPreOpeningDoc({ type: 'SO', header: {} }), false, 'بلا طابعٍ — كُتب للتوّ — يُعرض');
});

test('الحركاتُ بطابع القيد، والسجلّاتُ بحقلٍ يُسمّى', () => {
  const moves = [{ id: 'old', postedAt: ts('2026-09-01T00:00:00Z') }, { id: 'new', postedAt: ts('2026-10-22T07:00:00Z') }, { id: 'pending' }];
  assert.deepEqual(actualMoves(moves).map((m) => m.id), ['new', 'pending']);
  assert.equal(isPreOpeningRecord({ ts: ts('2026-10-01T00:00:00Z') }, 'ts'), true);
  assert.deepEqual(actualRecords([{ createdAt: ts('2026-08-01T00:00:00Z') }, { createdAt: ts('2026-10-21T00:00:00Z') }]).length, 1);
  assert.deepEqual(actualDocs(null), []);
});
