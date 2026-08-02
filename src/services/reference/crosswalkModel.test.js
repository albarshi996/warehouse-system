/**
 * اختبار نموذج سجلّ المطابقة — يحرس بنية `reference-crosswalk.json` وحساباته.
 * لو انحرفت بنية الملفّ (حالة غير معروفة · قسم فارغ) سقط الاختبار قبل النشر.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  crosswalkSummary,
  countByStatus,
  gapsByDirection,
  crosswalkVerdict,
  STATUS_ORDER,
} from './crosswalkModel.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const data = JSON.parse(readFileSync(resolve(ROOT, 'src/data/reference-crosswalk.json'), 'utf8'));

test('حارس البنية: كل الأقسام ممتلئة وحالاتها معروفة', () => {
  const v = crosswalkVerdict(data);
  assert.ok(v.ok, 'مشاكل بنيوية: ' + v.problems.join(' · '));
});

test('countByStatus: يعدّ كل الحالات المعروفة ولا يُسقط عنصرًا', () => {
  const counts = countByStatus(data.forms);
  const sum = STATUS_ORDER.reduce((n, k) => n + counts[k], 0);
  assert.equal(sum, data.forms.length);
});

test('الملخّص: ٢٤ نموذجًا محكومًا (يحمل portalCode) و١٣ دورًا', () => {
  const s = crosswalkSummary(data);
  assert.equal(s.portalGovernedForms, 24, 'عدد النماذج المحكومة يجب أن يكون ٢٤');
  assert.equal(s.rolesTotal, 13, 'عدد الأدوار يجب أن يكون ١٣');
  assert.equal(s.chainsTotal, 7, 'عدد السلاسل يجب أن يكون ٧');
});

test('الملخّص: نسبة المحاذاة بين 0 و100', () => {
  const s = crosswalkSummary(data);
  assert.ok(s.alignedPct >= 0 && s.alignedPct <= 100);
});

test('الفجوات: مقسّمة باتجاهين ومجموعهما = الإجمالي', () => {
  const { refBehind, portalMissing } = gapsByDirection(data.gaps);
  assert.equal(refBehind.length + portalMissing.length, data.gaps.length);
});

test('كل دور معروف: من هو treasury الثالث عشر ومصنّف add-ref', () => {
  const treasury = data.roles.find((r) => r.id === 'treasury');
  assert.ok(treasury, 'أمين الخزينة يجب أن يكون في السجلّ');
  assert.equal(treasury.status, 'add-ref');
});
