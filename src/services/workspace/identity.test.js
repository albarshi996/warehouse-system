/**
 * اختبارات هويّة المستودع — `identity.js`.
 *
 * القسم الأوّل منطقٌ خالص: اشتقاق الرموز والختم والفحص.
 * والقسم الثاني **حارسُ انحرافٍ على المستودع الحقيقيّ**: يقرأ `workspace.json`
 * وملفّات جدول المواضع من القرص، ويثبت أنّ أيّ رمزٍ للشقيق لم يتسرّب إليها.
 * وهو موضعه هنا عمدًا: `npm test` حاجزٌ صلب في خطّ النشر، فيصير استحالةُ نشر
 * نسخةٍ بهويّة المستودع الآخر مضمونةً بالبناء لا بالتذكّر.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KINDS,
  SPOTS,
  BLOCK_START,
  BLOCK_END,
  tokensOf,
  stamp,
  leaks,
  replaceBlock,
  agentsBlock,
  workspaceDoc,
} from './identity.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const card = JSON.parse(fs.readFileSync(path.join(root, 'workspace.json'), 'utf8'));

const PERSONAL = { repo: 'albarshi996/warehouse-system' };
const COMPANY = { repo: 'warehouse-art/brand-zo-hub' };

// ═══ اشتقاق الرموز ════════════════════════════════════════════════════════

test('الرموز تُشتقّ من العنوان وحده حين لا رابط نشرٍ صريح', () => {
  assert.deepEqual(tokensOf(PERSONAL), {
    slug: 'albarshi996/warehouse-system',
    host: 'https://albarshi996.github.io',
    base: '/warehouse-system',
    name: 'warehouse-system',
  });
});

test('رابط النشر الصريح يتقدّم على الاشتقاق — لنطاقٍ مستقلّ لاحقًا', () => {
  const t = tokensOf({
    repo: 'warehouse-art/brand-zo-hub',
    pages: 'https://hub.example.ly/portal/',
  });
  assert.equal(t.host, 'https://hub.example.ly');
  assert.equal(t.base, '/portal');
  assert.equal(t.name, 'brand-zo-hub', 'اسم الحزمة يبقى من العنوان لا من الرابط');
});

test('بطاقةٌ بلا عنوان صالح تتوقّف بدل أن تختم فراغًا', () => {
  assert.throws(() => tokensOf({ repo: 'warehouse-system' }), /owner\/repo/);
  assert.throws(() => tokensOf({}), /owner\/repo/);
});

test('رابط نشرٍ بلا مسارٍ فرعيّ يتوقّف — الختم بمسارٍ فارغ يمحو ما لا يقصده', () => {
  assert.throws(() => tokensOf({ repo: 'a/b', pages: 'https://x.ly/' }), /مسارٍ فرعيّ/);
});

// ═══ الختم ════════════════════════════════════════════════════════════════

const me = tokensOf(PERSONAL);
const you = tokensOf(COMPANY);

test('ختم package.json: العنوان الكامل قبل الاسم المجرّد، فلا يتمزّق أحدهما', () => {
  const src = [
    '  "name": "brand-zo-hub",',
    '  "url": "git+https://github.com/warehouse-art/brand-zo-hub.git"',
    '  "homepage": "https://github.com/warehouse-art/brand-zo-hub#readme"',
  ].join('\n');
  const out = stamp(src, you, me, ['slug', 'name']);
  assert.equal(
    out,
    [
      '  "name": "warehouse-system",',
      '  "url": "git+https://github.com/albarshi996/warehouse-system.git"',
      '  "homepage": "https://github.com/albarshi996/warehouse-system#readme"',
    ].join('\n')
  );
});

test('ختم رابطٍ كامل: المضيف ثمّ المسار', () => {
  const out = stamp('https://warehouse-art.github.io/brand-zo-hub/dashboard/', you, me, [
    'host',
    'base',
  ]);
  assert.equal(out, 'https://albarshi996.github.io/warehouse-system/dashboard/');
});

test('الختم ساكن: تشغيله مرّتين كتشغيله مرّة', () => {
  const src = "site: 'https://warehouse-art.github.io', base: '/brand-zo-hub'";
  const once = stamp(src, you, me, ['host', 'base']);
  assert.equal(stamp(once, you, me, ['host', 'base']), once);
});

test('الختم يعود بالنصّ كما كان إذا خُتم ذهابًا وإيابًا', () => {
  const src = '"name": "brand-zo-hub" — https://warehouse-art.github.io/brand-zo-hub/';
  const there = stamp(src, you, me, KINDS);
  assert.equal(stamp(there, me, you, KINDS), src);
});

test('لا يُختم رمزٌ خارج ما يخصّ الموضع', () => {
  const src = '"name": "brand-zo-hub" و https://warehouse-art.github.io';
  assert.equal(
    stamp(src, you, me, ['host']),
    '"name": "brand-zo-hub" و https://albarshi996.github.io'
  );
});

// ═══ الفحص ════════════════════════════════════════════════════════════════

test('الفحص يذكر الرموز المتسرّبة، ويسكت عن النظيف', () => {
  assert.deepEqual(leaks('base: /brand-zo-hub', you, ['base']), ['/brand-zo-hub']);
  assert.deepEqual(leaks('base: /warehouse-system', you, ['base']), []);
});

test('الفحص لا يشتكي من رمزٍ خارج ما يخصّ الموضع', () => {
  assert.deepEqual(leaks('"name": "brand-zo-hub"', you, ['host']), []);
});

// ═══ الكتلة المولَّدة ═════════════════════════════════════════════════════

test('استبدال كتلة الهويّة لا يمسّ ما حول العلامتين', () => {
  const src = `رأس\n${BLOCK_START}\nقديم\n${BLOCK_END}\nذيل`;
  const out = replaceBlock(src, 'جديد');
  assert.equal(out, `رأس\n${BLOCK_START}\nجديد\n${BLOCK_END}\nذيل`);
});

test('غياب العلامتين يتوقّف بدل أن يكتب في مكانٍ مجهول', () => {
  assert.throws(() => replaceBlock('بلا علامات', 'جديد'), /identity:start/);
});

test('الكتلة والبطاقة تذكران المستودعين معًا، وتبدآن بمَن نحن فيه', () => {
  const block = agentsBlock(card);
  assert.ok(block.includes(card.repo), 'الكتلة تذكر المستودع الحاليّ');
  assert.ok(block.includes(card.sibling.repo), 'وتذكر الشقيق');
  assert.ok(block.indexOf(card.repo) < block.indexOf(card.sibling.repo), 'والحاليّ أوّلًا');

  const doc = workspaceDoc(card);
  assert.ok(doc.includes('npm run sync'), 'البطاقة تُعلّم أمر المزامنة');
  for (const spot of SPOTS) assert.ok(doc.includes(spot.file), `البطاقة تسرد ${spot.file}`);
});

// ═══ حارس الانحراف على المستودع الحقيقيّ ══════════════════════════════════

test('كلّ موضعٍ في الجدول موجودٌ على القرص — الجدول لا يذكر ملفًّا رحل', () => {
  const gone = SPOTS.map((s) => s.file).filter((f) => !fs.existsSync(path.join(root, f)));
  assert.deepEqual(gone, [], 'مواضع هويّة في الجدول بلا ملفّات');
});

test('لم يتسرّب رمزٌ من هويّة الشقيق إلى أيّ موضع في هذا المستودع', () => {
  const sibling = tokensOf(card.sibling);
  const dirty = [];
  for (const spot of SPOTS) {
    const text = fs.readFileSync(path.join(root, spot.file), 'utf8');
    const found = leaks(text, sibling, spot.kinds);
    if (found.length) dirty.push(`${spot.file} ← ${found.join(' · ')}`);
  }
  assert.deepEqual(dirty, [], 'العلاج: npm run identity:apply');
});

test('البطاقة وكتلة الدستور مطابقتان للمولَّد من workspace.json', () => {
  const doc = fs.readFileSync(path.join(root, 'WORKSPACE.md'), 'utf8');
  assert.equal(doc, workspaceDoc(card), 'WORKSPACE.md مولَّد — العلاج: npm run identity:apply');

  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.equal(agents, replaceBlock(agents, agentsBlock(card)), 'كتلة الهويّة في AGENTS.md');
});

test('البطاقة تحمل ما يلزم المزامنة: عنوان الشقيق ومجلّده وريموته', () => {
  for (const key of ['name', 'repo', 'purpose', 'rules', 'folder']) {
    assert.ok(card[key], `البطاقة بلا ${key}`);
    assert.ok(card.sibling[key], `كتلة الشقيق بلا ${key}`);
  }
  assert.match(card.sibling.remote, /^https:\/\/github\.com\//, 'ريموت الشقيق للجلب لمرّةٍ واحدة');
  assert.notEqual(card.repo, card.sibling.repo, 'البطاقة تشير إلى نفسها شقيقًا');
});
