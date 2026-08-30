/**
 * لقطةُ الأساس — ماذا يرى كلُّ دورٍ اليوم؟ ‹RB-100›
 *
 * ═══ لماذا ═══
 * قال المالك 2026-08-29: «أخاف أن ينهار شيء». وهذا الخوفُ في محلّه: طبقةُ
 * الأدوار تمسّ ١٩ دورًا و١١٥ مدخلًا، وسحبُ شاشةٍ من دورٍ لا يُصدر خطأً —
 * يختفي المدخلُ بصمتٍ ولا يعلم أحدٌ حتّى يشتكي الموظّف.
 *
 * فتُلتقط لقطةٌ **قبل** أيّ تغيير، ويحرسها `navBaseline.test.js`:
 *   · **الإضافةُ مسموحة** — دورٌ جديد، شاشةٌ جديدة، توسيعُ وصول.
 *   · **والنقصُ ممنوع** — فقدُ دورٍ مدخلًا كان يملكه يُسقط البوّابة الخضراء.
 *
 * فإن أردتَ سحبًا مقصودًا، شغّل هذه الباني عمدًا فتُحدَّث اللقطة — والفرقُ
 * يظهر في المراجعة سطرًا سطرًا. لا سحبَ بالخطأ، والسحبُ المقصودُ مرئيّ.
 *
 *     node scripts/nav-baseline.mjs          ← يعرض الفرق ولا يكتب
 *     node scripts/nav-baseline.mjs --write  ← يُحدّث اللقطة
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NAV_GROUPS } from '../src/services/auth/navCatalog.js';
import { canSeeGroup, canSeeItem } from '../src/services/auth/navAccess.js';
import { ROLES } from '../src/services/auth/roles.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'src', 'services', 'auth', 'navBaseline.json');

/** ما يراه دورٌ من مداخل — مرتّبًا فلا يتغيّر الملفّ بترتيبٍ عشوائيّ. */
export function visiblePaths(roleId) {
  const out = new Set();
  for (const g of NAV_GROUPS) {
    if (!canSeeGroup(roleId, g.key)) continue;
    for (const it of g.items) if (canSeeItem(roleId, it.roles)) out.add(it.path);
  }
  return [...out].sort();
}

/** اللقطة الحيّة: كلُّ دورٍ ومداخلُه. */
export function snapshot() {
  const out = {};
  for (const roleId of Object.keys(ROLES).sort()) out[roleId] = visiblePaths(roleId);
  return out;
}

/**
 * الفرقُ عن اللقطة المحفوظة.
 * `lost` هو الخطر — والباقي إضافةٌ تُرحَّب بها.
 */
export function diff(saved, live) {
  const lost = {};
  const gained = {};
  for (const roleId of Object.keys(saved)) {
    if (!live[roleId]) { lost[roleId] = ['(الدور نفسه اختفى)']; continue; }
    const now = new Set(live[roleId]);
    const missing = saved[roleId].filter((p) => !now.has(p));
    if (missing.length) lost[roleId] = missing;
  }
  for (const roleId of Object.keys(live)) {
    const before = new Set(saved[roleId] || []);
    const added = live[roleId].filter((p) => !before.has(p));
    if (added.length) gained[roleId] = added;
  }
  return { lost, gained, newRoles: Object.keys(live).filter((r) => !saved[r]) };
}

if (process.argv[1] && process.argv[1].endsWith('nav-baseline.mjs')) {
  const live = snapshot();
  const write = process.argv.includes('--write');
  const exists = fs.existsSync(FILE);

  if (!exists || write) {
    fs.writeFileSync(FILE, JSON.stringify(live, null, 1) + '\n', 'utf8');
    const total = Object.values(live).reduce((a, b) => a + b.length, 0);
    console.log(`✔ لقطةُ الأساس: ${Object.keys(live).length} دورًا · ${total} مدخلًا مرئيًّا`);
    process.exit(0);
  }

  const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const { lost, gained, newRoles } = diff(saved, live);
  if (newRoles.length) console.log(`＋ أدوارٌ جديدة: ${newRoles.join(' · ')}`);
  for (const [r, p] of Object.entries(gained)) console.log(`＋ ${r}: ${p.join(' · ')}`);
  if (!Object.keys(lost).length) {
    console.log('✔ لا دورَ فقد شيئًا.');
    process.exit(0);
  }
  console.error('✘ أدوارٌ فقدت مداخلَ كانت تملكها:');
  for (const [r, p] of Object.entries(lost)) console.error(`   • ${r}: ${p.join(' · ')}`);
  console.error('  إن كان السحبُ مقصودًا: node scripts/nav-baseline.mjs --write');
  process.exit(1);
}
