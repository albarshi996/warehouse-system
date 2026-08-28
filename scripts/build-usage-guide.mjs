/**
 * بانية دليل الاستخدام — يُولَّد من قائمة البوّابة نفسها لا يُكتب بيد.
 *
 * ═══ لماذا مولَّدًا؟ ═══
 * دليلٌ يُكتب بيدٍ **يفترق عن البوّابة أوّلَ شاشةٍ تُضاف**: يصير فيه روابطُ
 * ميّتةٌ وشاشاتٌ بلا شرح، ولا أحد يعلم. فالمصدرُ هنا واحد: `navCatalog.js`
 * — نفسُ الملفّ الذي تُبنى منه قائمةُ البوّابة. فما لا يوجد في القائمة لا
 * يظهر في الدليل، وما يوجد فيها **يجب** أن يحمل شرحًا (وإلّا سقط الحارس).
 *
 * والشرحُ نفسه في `src/data/usage-guide.json` — بياناتٌ لا كود، يحرّرها من
 * يعرف العمل لا من يعرف البرمجة.
 *
 * الخَرْج: `public/دليل-استخدام-البوابة.html` — صفحةٌ مستقلّةٌ تُفتح من
 * البوّابة أو تُطبع أو تُرسل.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tokensOf } from '../src/services/workspace/identity.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * مسارُ النشر وعنوانُه — **يُشتقّان من بطاقة المكان لا يُكتبان بيد.**
 *
 * ★ كانا مثبَّتَين نصًّا بمسارِ مستودعٍ وعنوانِ نشرٍ بعينهما،
 * وهذه الباني تُزامَن إلى المستودع الشقيق حيث العنوانُ غيرُ عنواننا — فكان
 * الدليلُ يُولَّد هناك **بروابطَ تشير إلى موقعنا نحن**، ويقول للموظّف «افتح
 * ‹عنوانَ مستودعٍ ليس مستودعَك›». ولم يظهر ذلك لأنّ الباني تعمل هنا فتصدق.
 *
 * وحارسُ الهويّة هناك يمسح الملفّاتِ المتعقَّبةَ نصًّا، فأوقف العنوانُ المثبَّت
 * مزامنةَ مستودع الشركة (رُصد 2026-08-28 — يومان و٧٥ كوميتًا معلَّقة).
 *
 * والمصدرُ الآن واحدٌ لكلّ المستودعات: `workspace.json`.
 */
const CARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'workspace.json'), 'utf8'));
const { base: BASE, host: HOST } = tokensOf(CARD);
const LIVE = `${HOST}${BASE}`;

/** أسماءُ الأدوار بالعربيّة — لتُقرأ لا لتُخمَّن. */
const ROLE_AR = {
  admin: 'المدير العام',
  warehouse_manager: 'مدير المستودعات',
  storekeeper: 'أمين المخزن',
  inventory_auditor: 'مدقّق الجرد',
  qc_inspector: 'مفتّش الجودة',
  gate_officer: 'موظّف البوّابة',
  labor_supervisor: 'مشرف المناولة',
  fleet: 'إدارة الحركة',
  sales_rep: 'المندوب',
  sales_supervisor: 'مشرف المبيعات',
  purchase_officer: 'موظّف المشتريات',
  finance_manager: 'المدير المالي',
  treasury: 'الخزينة',
  return_manager: 'مسؤول المرتجعات',
  department_user: 'مستخدم الإدارة',
  fnb_manager: 'مدير قطاع الأغذية',
  executive_chef: 'الشيف التنفيذي',
  branch_manager: 'مدير الفرع',
  viewer: 'مطّلع',
};

/** قراءةُ القائمة نصًّا — الملفّ يستورد أيقوناتٍ فلا يُنفَّذ هنا. */
export function readNav(src) {
  const groups = [];
  let cur = null;
  for (const line of src.split('\n')) {
    const g = line.match(/group:\s*'([^']+)'/);
    if (g) { cur = { group: g[1], items: [] }; groups.push(cur); continue; }
    const it = line.match(/\{\s*path:\s*'([^']+)',\s*label:\s*'([^']+)'(?:[^}]*?roles:\s*\[([^\]]*)\])?/);
    if (it && cur) {
      cur.items.push({
        path: it[1],
        label: it[2],
        roles: it[3] ? it[3].replace(/'/g, '').split(',').map((x) => x.trim()).filter(Boolean) : null,
      });
    }
  }
  return groups;
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** تحويلٌ صغير: `**غامق**` و`` `كود` `` — فيكتب الشرحَ من لا يعرف HTML. */
const rich = (s) => esc(s)
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/`([^`]+)`/g, '<code>$1</code>');

export function build({ nav, guide }) {
  const seen = new Set();
  let toc = '';
  let body = '';
  let n = 0;

  for (const grp of nav) {
    const items = grp.items.filter((i) => !seen.has(i.path) && (seen.add(i.path), true));
    if (!items.length) continue;
    const gid = `g${toc.length}${items[0].path.replace(/\W/g, '')}`;
    toc += `<li><a href="#${gid}">${esc(grp.group)}</a> <span class="c">${items.length}</span></li>`;
    body += `<section class="grp" id="${gid}"><h2>${esc(grp.group)}</h2>`;

    for (const it of items) {
      n += 1;
      const e = guide[it.path] || {};
      const url = it.path.startsWith('/dashboard') ? `${BASE}${it.path}` : `${BASE}${it.path}`;
      const who = it.roles
        ? it.roles.map((r) => ROLE_AR[r] || r).join(' · ')
        : 'كلّ من له حساب';
      body += `<article class="app"><h3>${esc(it.label)}</h3>`;
      body += `<p class="who"><b>لمن؟</b> ${esc(who)}</p>`;
      if (e.what) body += `<p class="what">${rich(e.what)}</p>`;
      if (e.steps?.length) {
        body += e.readOnly
          ? `<p class="note">${rich(e.steps[0])}</p>`
          : `<ol class="steps">${e.steps.map((s) => `<li>${rich(s)}</li>`).join('')}</ol>`;
      }
      if (e.tips?.length) {
        body += `<ul class="tips">${e.tips.map((t) => `<li>${rich(t)}</li>`).join('')}</ul>`;
      }
      body += `<p class="go"><a href="${url}">افتح الشاشة ↩</a> <span class="url">${esc(LIVE + it.path)}</span></p>`;
      body += `</article>`;
    }
    body += `</section>`;
  }
  return { html: page(toc, body, n), count: n };
}

function page(toc, body, n) {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>دليل استخدام بوابة برند زو</title>
<style>
:root{--ink:#12212f;--ink2:#5b6b7a;--line:#dde5ec;--bg:#fff;--soft:#f6f9fb;--gold:#b8892b;--navy:#12294a}
@media(prefers-color-scheme:dark){:root{--ink:#e8eef4;--ink2:#a4b3c1;--line:#2b3a48;--bg:#0f1720;--soft:#161f29;--gold:#d8a83f;--navy:#9db8dd}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.85 "Segoe UI","Dubai",system-ui,sans-serif}
.wrap{max-width:920px;margin:0 auto;padding:24px 18px 80px}
header{border-bottom:3px solid var(--gold);padding-bottom:16px;margin-bottom:24px}
h1{font-size:1.9rem;margin:0 0 6px;color:var(--navy)}
.sub{color:var(--ink2);margin:0}
.start{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:20px 0}
.start h2{margin:0 0 8px;font-size:1.1rem;color:var(--gold)}
.start ol{margin:0;padding-inline-start:20px}
nav.toc{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin-bottom:28px}
nav.toc h2{margin:0 0 8px;font-size:1rem;color:var(--ink2)}
nav.toc ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:4px}
nav.toc a{color:var(--navy);text-decoration:none;font-weight:600}
nav.toc a:hover{text-decoration:underline}
.c{color:var(--ink2);font-size:.8rem}
.grp{margin:34px 0}
.grp>h2{font-size:1.35rem;color:var(--gold);border-bottom:2px solid var(--line);padding-bottom:8px;margin:0 0 4px}
.app{border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:16px 0;background:var(--bg)}
.app h3{margin:0 0 8px;font-size:1.12rem;color:var(--navy)}
.who{margin:0 0 8px;font-size:.88rem;color:var(--ink2)}
.what{margin:0 0 10px}
.steps{margin:0 0 10px;padding-inline-start:22px}
.steps li{margin-bottom:5px}
.tips{list-style:none;margin:10px 0 0;padding:10px 14px;background:var(--soft);border-inline-start:3px solid var(--gold);border-radius:0 8px 8px 0}
.tips li{font-size:.92rem;margin-bottom:4px}
.tips li::before{content:"★ ";color:var(--gold)}
.note{margin:0 0 10px;color:var(--ink2);font-size:.94rem}
.go{margin:12px 0 0;font-size:.9rem}
.go a{display:inline-block;background:var(--navy);color:#fff;text-decoration:none;padding:6px 14px;border-radius:8px;font-weight:700}
.url{display:block;color:var(--ink2);font-size:.76rem;direction:ltr;text-align:start;margin-top:6px;word-break:break-all}
code{background:var(--soft);padding:1px 5px;border-radius:4px;font-size:.88em;direction:ltr;display:inline-block}
b{color:var(--ink)}
footer{margin-top:50px;padding-top:16px;border-top:1px solid var(--line);color:var(--ink2);font-size:.85rem;text-align:center}
@media print{
  body{font-size:11pt}.go a{background:none;color:#000;padding:0;text-decoration:underline}
  nav.toc{break-after:page}.app{break-inside:avoid}
}
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>دليل استخدام بوابة برند زو</h1>
  <p class="sub">شرحُ كلّ تطبيقٍ خطوةً خطوة — ${n} شاشةً برابطها ومَن يفتحها.</p>
</header>

<div class="start">
  <h2>كيف تبدأ؟</h2>
  <ol>
    <li>افتح <b>${LIVE}</b> وسجّل دخولك ببريدك وكلمة مرورك.</li>
    <li>لا ترى في القائمة إلّا ما يخصّ <b>دورك</b> — فإن نقصك تطبيقٌ فراجع مدير النظام.</li>
    <li>ابدأ من <b>عمليات البوابة</b>: كلُّ التطبيقات في شبكةٍ واحدة مع بحثٍ يشملها.</li>
    <li>وفي كلّ شاشةٍ أدناه: <b>لمن هي</b> · <b>ماذا تفعل</b> · <b>الخطوات</b> · <b>ورابطُها</b>.</li>
  </ol>
</div>

<nav class="toc"><h2>المحتويات</h2><ul>${toc}</ul></nav>
${body}
<footer>
  مولَّدٌ آليًّا من قائمة البوّابة — <code>npm run guide</code>.<br>
  فما يُضاف إلى البوّابة يظهر هنا، وما لا شرحَ له يُوقف البناء.
</footer>
</div>
</body>
</html>`;
}

/* ── التنفيذ ──
 * لا يعمل إلّا حين يُستدعى الملفُّ أمرًا. فالاختبار يستورد `readNav`/`build`
 * ليفحص، ولا ينبغي أن يكتب ملفًّا لمجرّد أنّه استورد.
 */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();

function main() {
const navSrc = fs.readFileSync(path.join(ROOT, 'src/services/auth/navCatalog.js'), 'utf8');
const guide = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/usage-guide.json'), 'utf8'));
const nav = readNav(navSrc);

const missing = [];
for (const g of nav) for (const it of g.items) if (!guide[it.path]?.steps?.length) missing.push(it.path);
if (missing.length) {
  console.error(`✘ ${missing.length} شاشةً بلا شرحٍ في src/data/usage-guide.json:`);
  missing.forEach((m) => console.error(`   • ${m}`));
  process.exit(1);
}

const { html, count } = build({ nav, guide });
const out = path.join(ROOT, 'public', 'دليل-استخدام-البوابة.html');
fs.writeFileSync(out, html, 'utf8');
console.log(`✔ دليل الاستخدام: ${count} شاشةً في ${nav.length} مجموعة — ${(html.length / 1024).toFixed(0)} ك.ب`);
}
