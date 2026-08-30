/**
 * 🔒🔒🔒 حارسُ «لا يفقد أحدٌ شيئًا» ‹RB-100›.
 *
 * ═══ الوعدُ الذي يحرسه ═══
 * قال المالك 2026-08-29: **«أخاف أن ينهار شيء»**. وطبقةُ الأدوار أخطرُ ما
 * في البوّابة على هذا الخوف: سحبُ شاشةٍ من دورٍ **لا يُصدر خطأً**. لا رسالةَ
 * ولا اختبارَ أحمر — يختفي المدخلُ بصمتٍ ولا يعلم أحدٌ حتّى يشتكي الموظّف
 * بعد أسبوع، وحينها لا أحدَ يذكر أيُّ تغييرٍ فعلها.
 *
 * فهذا الحارسُ يقلب الصمتَ صراخًا:
 *   · **الإضافةُ مسموحةٌ ومرحَّبٌ بها** — دورٌ جديد، شاشةٌ جديدة، توسيعُ وصول.
 *   · **والنقصُ يُسقط البوّابة** — ولو مدخلًا واحدًا لدورٍ واحد.
 *
 * ⚠️ وإن كان السحبُ **مقصودًا** فالعلاج ليس تليينَ الحارس، بل تشغيل
 * `node scripts/nav-baseline.mjs --write` عمدًا — فيظهر الفرقُ في المراجعة
 * سطرًا سطرًا. لا سحبَ بالخطأ، والسحبُ المقصودُ مرئيٌّ في الكوميت.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { snapshot, diff, visiblePaths } from '../../../scripts/nav-baseline.mjs';
import { ROLES } from './roles.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const saved = JSON.parse(fs.readFileSync(path.join(HERE, 'navBaseline.json'), 'utf8'));

test('🔒🔒🔒 لا دورَ يفقد مدخلًا كان يملكه — والإضافةُ مرحَّبٌ بها', () => {
  const { lost } = diff(saved, snapshot());
  const detail = Object.entries(lost)
    .map(([r, p]) => `${r}: ${p.join(' · ')}`)
    .join('\n   ');
  assert.deepEqual(
    lost,
    {},
    `أدوارٌ فقدت مداخلَ كانت تملكها:\n   ${detail}\n` +
      '  إن كان السحبُ مقصودًا فشغّل: node scripts/nav-baseline.mjs --write'
  );
});

test('★ واللقطةُ تغطّي كلَّ دورٍ معرَّف — فلا دورَ يمرّ بلا حراسة', () => {
  const missing = Object.keys(ROLES).filter((r) => !(r in saved));
  assert.deepEqual(
    missing,
    [],
    `أدوارٌ بلا لقطةٍ محفوظة: ${missing.join(' · ')} — شغّل nav-baseline.mjs --write`
  );
});

test('★★ والحارسُ يفشل فعلًا حين يُسحب مدخل — نقضٌ لا دعوى', () => {
  // نُحاكي سحبَ مدخلٍ من دورٍ: نضيفه إلى اللقطة المحفوظة وحدها
  const rigged = { ...saved, storekeeper: [...saved.storekeeper, '/dashboard/لا-وجود-له'] };
  const { lost } = diff(rigged, snapshot());
  assert.equal(Object.keys(lost).length, 1);
  assert.deepEqual(lost.storekeeper, ['/dashboard/لا-وجود-له']);
});

test('والإضافةُ لا تُسقطه — دورٌ يكسب شاشةً يمرّ', () => {
  const trimmed = { ...saved, storekeeper: saved.storekeeper.slice(1) };
  const { lost, gained } = diff(trimmed, snapshot());
  assert.deepEqual(lost, {});
  assert.ok(gained.storekeeper?.length, 'الكسبُ يُرصد ويُعلَن');
});

test('★ ودورٌ جديدٌ يُرصد ولا يُعدّ فقدًا', () => {
  const live = { ...snapshot(), دور_تجريبيّ: ['/dashboard/x'] };
  const { lost, newRoles } = diff(saved, live);
  assert.deepEqual(lost, {});
  assert.deepEqual(newRoles, ['دور_تجريبيّ']);
});

test('والمدير العام يبقى الأوسع — حسابُه الشامل (قرار المالك)', () => {
  const admin = visiblePaths('admin');
  for (const roleId of Object.keys(ROLES)) {
    if (roleId === 'admin') continue;
    const extra = visiblePaths(roleId).filter((p) => !admin.includes(p));
    assert.deepEqual(extra, [], `الدور ${roleId} يرى ما لا يراه المدير العام: ${extra.join(' · ')}`);
  }
});
