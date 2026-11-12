/**
 * بيّنةُ زرّ الرجوع — الحكمُ الخالص، والوصلُ في القالب العامّ.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { backAction, trimPath } from './backNav.js';

const ORIGIN = 'http://tauri.localhost';
const HOME = '/dashboard';

test('trimPath: الشَّرطةُ الختاميّة لا تفرّق بين الشاشة ونفسِها', () => {
  assert.equal(trimPath('/dashboard/'), '/dashboard');
  assert.equal(trimPath('/dashboard'), '/dashboard');
  assert.equal(trimPath(null), '');
});

test('الرئيسيّة: لا زرَّ رجوعٍ منها (بشَرطةٍ ختاميّةٍ أو بدونها، وتحت مسارٍ أساس)', () => {
  assert.equal(backAction({ pathname: '/dashboard', home: HOME, origin: ORIGIN }), 'none');
  assert.equal(backAction({ pathname: '/dashboard/', home: HOME, origin: ORIGIN }), 'none');
  assert.equal(
    backAction({ pathname: '/warehouse-system/dashboard/', home: '/warehouse-system/dashboard', origin: ORIGIN }),
    'none'
  );
});

test('★ شاشةٌ فُتحت من شاشةٍ في البوّابة: رجوعٌ خطوةً', () => {
  assert.equal(
    backAction({
      pathname: '/dashboard/cash-custody/',
      home: HOME,
      referrer: `${ORIGIN}/dashboard/`,
      origin: ORIGIN,
      historyLength: 3,
    }),
    'back'
  );
});

test('★★ لا سابقَ يُؤمَن ⇒ إلى الرئيسيّة لا إلى خارج التطبيق', () => {
  const at = { pathname: '/dashboard/gate-post/', home: HOME, origin: ORIGIN };
  // فتحٌ مباشر: لا مُحيل.
  assert.equal(backAction({ ...at, referrer: '', historyLength: 1 }), 'home');
  // مُحيلٌ من موقعٍ آخر.
  assert.equal(backAction({ ...at, referrer: 'https://example.com/x', historyLength: 5 }), 'home');
  // مُحيلٌ من البوّابة لكنّ التاريخَ بلا سابق (لسانٌ جديد).
  assert.equal(backAction({ ...at, referrer: `${ORIGIN}/dashboard/`, historyLength: 1 }), 'home');
  // جاء من صفحة الدخول: الرجوعُ إليها يُعيد توجيهَه فيدور.
  assert.equal(backAction({ ...at, referrer: `${ORIGIN}/login/`, historyLength: 2 }), 'home');
  assert.equal(backAction({ ...at, referrer: `${ORIGIN}/login?next=x`, historyLength: 2 }), 'home');
  // نداءٌ ناقصٌ لا يرمي.
  assert.equal(backAction({ pathname: '/dashboard/x', home: HOME }), 'home');
});

test('★★★ والقالبُ العامُّ يوصل الزرَّ فعلًا — لا منطقَ بلا مستدعٍ', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const layout = fs.readFileSync(path.join(here, '../../layouts/DashboardLayout.astro'), 'utf8');
  assert.ok(layout.includes('id="bz-back"'), 'القالبُ بلا زرّ الرجوع');
  assert.ok(layout.includes("from '../services/ui/backNav.js'"), 'الزرُّ مرسومٌ ولا يستورد حكمَه');
  assert.ok(layout.includes('backAction('), 'الحكمُ مبنيٌّ ولا يستدعيه القالب');
});
