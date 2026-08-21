#!/usr/bin/env node
/**
 * npm run identity — هل يذكر هذا المستودع مكانًا غير مكانه؟
 * npm run identity:apply — اختم مواضع الهويّة كلّها من `workspace.json`.
 *
 * الفحص هو الحارس: بعد كلّ مزامنةٍ من الشقيق تعود مواضعُ الهويّة إلى صيغته،
 * فلو نُشرت كما هي لكُسر الموقع (روابط مسارٍ آخر) ووكيلُ أودو (أصلٌ غير مسموح).
 * والختم يُعيدها دفعةً واحدة بلا اعتمادٍ على ذاكرة أحد.
 *
 * المنطق كلّه في `src/services/workspace/identity.js` — وهنا القرص والطباعة فقط.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  SPOTS,
  tokensOf,
  stamp,
  leaks,
  lf,
  agentsBlock,
  replaceBlock,
  workspaceDoc,
} from '../src/services/workspace/identity.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const ESC = String.fromCharCode(27);
const RED = `${ESC}[31m`;
const GREEN = `${ESC}[32m`;
const DIM = `${ESC}[2m`;
const BOLD = `${ESC}[1m`;
const OFF = `${ESC}[0m`;

const apply = process.argv.includes('--apply');
const card = JSON.parse(readFileSync(join(root, 'workspace.json'), 'utf8'));
const me = tokensOf(card);
const you = tokensOf(card.sibling);

/** يقرأ ملفًّا نصيًّا من جذر المستودع، أو `null` إن لم يكن موجودًا. */
function read(file) {
  const path = join(root, file);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/** يكتب الملفّ إن تغيّر فقط — فلا يُلوَّث `git status` بلمساتٍ بلا مضمون. */
function write(file, next, previous) {
  if (next === previous) return false;
  writeFileSync(join(root, file), next, 'utf8');
  return true;
}

const missing = [];
const dirty = [];
const changed = [];

for (const spot of SPOTS) {
  const text = read(spot.file);
  if (text === null) {
    missing.push(spot.file);
    continue;
  }
  if (apply) {
    const next = stamp(text, you, me, spot.kinds);
    if (write(spot.file, next, text)) changed.push(spot.file);
  } else {
    const found = leaks(text, you, spot.kinds);
    if (found.length) dirty.push({ file: spot.file, found, severity: spot.severity });
  }
}

// الوثيقتان المولَّدتان: بطاقة المكان كاملةً، وكتلة الهويّة في رأس الدستور.
const wantDoc = workspaceDoc(card);
const haveDoc = read('WORKSPACE.md');
const agents = read('AGENTS.md');
const wantAgents = agents === null ? null : replaceBlock(agents, agentsBlock(card));

// الختم يكتب بايتًا ببايت عمدًا — فيُعيد ملفًّا بنهايات ويندوز إلى صيغته
// المعياريّة LF. أمّا الفحص فيقارن بـ`lf` لا بـ`===`: نهايةُ السطر ليست هويّةً،
// ومقارنتها كانت تُنتج إنذارًا كاذبًا يقول «تسرّبت هويّة الشقيق» بلا تسرّب.
if (apply) {
  if (haveDoc === null || write('WORKSPACE.md', wantDoc, haveDoc)) changed.push('WORKSPACE.md');
  if (agents !== null && write('AGENTS.md', wantAgents, agents)) changed.push('AGENTS.md');
} else {
  if (haveDoc !== null && lf(haveDoc) !== lf(wantDoc))
    dirty.push({ file: 'WORKSPACE.md', found: ['بطاقةٌ لا تطابق المولَّد'], severity: 'meta' });
  if (agents !== null && lf(agents) !== lf(wantAgents))
    dirty.push({ file: 'AGENTS.md', found: ['كتلة هويّةٍ لا تطابق المولَّد'], severity: 'meta' });
}

if (missing.length) {
  console.info(`${DIM}  · مواضع غير موجودة (تُتجاوَز): ${missing.join(' · ')}${OFF}`);
}

if (apply) {
  const list = changed.length
    ? changed.map((f) => `\n    · ${f}`).join('')
    : ` ${DIM}(لا تغيير)${OFF}`;
  console.info(`\n${GREEN}${BOLD}  ✓ خُتمت هويّة ${card.repo}${OFF}${list}\n`);
  process.exit(0);
}

if (dirty.length) {
  const lines = dirty
    .map(
      (d) =>
        `    · ${d.file}${d.severity === 'break' ? ` ${RED}(يكسر شيئًا حيًّا)${OFF}` : ''}\n      ${DIM}${d.found.join(' · ')}${OFF}`
    )
    .join('\n');
  console.error(
    `\n${RED}${BOLD}  ✕ تسرّبت هويّة الشقيق (${card.sibling.repo}) إلى ${dirty.length} موضعًا${OFF}\n\n` +
      `${lines}\n\n  ${DIM}العلاج: npm run identity:apply${OFF}\n`
  );
  process.exit(1);
}

console.info(`\n${GREEN}  ✓ هويّة ${card.repo} سليمة في ${SPOTS.length} مواضع${OFF}\n`);
