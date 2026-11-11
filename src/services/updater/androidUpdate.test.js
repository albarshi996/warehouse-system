import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cmpSemver, isNewer, checkAndroidUpdate } from './androidUpdate.js';

test('cmpSemver يرتّب النسخ رقميًّا لا نصّيًّا', () => {
  assert.equal(cmpSemver('1.0.18', '1.0.17'), 1);
  assert.equal(cmpSemver('1.0.17', '1.0.18'), -1);
  assert.equal(cmpSemver('1.0.17', '1.0.17'), 0);
  // نصّيًّا «1.0.9» > «1.0.10»؛ رقميًّا العكس.
  assert.equal(cmpSemver('1.0.10', '1.0.9'), 1);
  // أطوالٌ مختلفة: 1.2 == 1.2.0
  assert.equal(cmpSemver('1.2', '1.2.0'), 0);
  assert.equal(cmpSemver('2.0.0', '1.9.9'), 1);
});

test('isNewer غلافٌ مقروء', () => {
  assert.equal(isNewer('1.0.18', '1.0.17'), true);
  assert.equal(isNewer('1.0.17', '1.0.17'), false);
  assert.equal(isNewer('1.0.16', '1.0.17'), false);
});

test('checkAndroidUpdate يكشف توفّر تحديث', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ version: '1.0.18', url: 'https://x/app.apk', notes: 'جديد' }),
  });
  const r = await checkAndroidUpdate('1.0.17', { fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.updateAvailable, true);
  assert.equal(r.version, '1.0.18');
  assert.equal(r.url, 'https://x/app.apk');
});

test('checkAndroidUpdate: لا تحديثَ حين تساوى الإصدار', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ version: '1.0.17' }) });
  const r = await checkAndroidUpdate('1.0.17', { fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.updateAvailable, false);
});

test('checkAndroidUpdate لا ترمي عند فشل الشبكة', async () => {
  const fetchImpl = async () => {
    throw new Error('offline');
  };
  const r = await checkAndroidUpdate('1.0.17', { fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'error');
});

test('checkAndroidUpdate لا ترمي عند ردٍّ غير ناجح', async () => {
  const fetchImpl = async () => ({ ok: false, status: 404 });
  const r = await checkAndroidUpdate('1.0.17', { fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'fetch-failed');
});
