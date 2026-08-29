/**
 * بانية دليل السلاسل والإمداد والمخازن ‹BFP-SCM-MAN-2026-053›.
 *
 * ═══ لماذا مولَّدًا لا مكتوبًا بيد ═══
 * الدليلُ يعيش عرضًا تقديميًّا (‏١٠٢ شريحة) لدى إدارة السلاسل. ونسخُه بيدٍ
 * إلى صفحةٍ يعني نسختين تفترقان أوّلَ تحديث. فالمصدرُ هنا واحد:
 * `src/data/scm-manual.json` — بياناتٌ مستخرَجةٌ من الملفّ الأصل، والصفحةُ
 * تُبنى منها. فتحديثُ الدليل = إعادةُ الاستخراج، لا تحريرُ HTML.
 *
 * ★ وجداولُ العرض **مرسومةٌ أشكالًا** لا جداولَ حقيقيّة، فتُستخرج
 * بالإحداثيّات (صفوفٌ بحسب y · وأعمدةٌ يمينًا-لِيسارًا). ولولا ذلك لخرجت
 * مصفوفةُ الصلاحيّات معكوسةَ الأعمدة — وهي أهمُّ ما في الدليل.
 *
 * الخَرْج: `public/دليل-السلاسل-والإمداد.html` — صفحةٌ مستقلّةٌ تُفتح من
 * البوّابة أو تُطبع، بفهرسٍ جانبيٍّ وبحثٍ فوريّ.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src', 'data', 'scm-manual.json');
const OUT = path.join(ROOT, 'public', 'دليل-السلاسل-والإمداد.html');

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** رقمُ النموذج في أوّل كلمةٍ إن كان رمزًا لاتينيًّا — يُبرز في الجدول. */
function markCode(cell) {
  const m = String(cell).match(/^([A-Z][A-Z0-9-]{1,9})\s+(.+)$/);
  return m ? `<b class="code">${esc(m[1])}</b> ${esc(m[2])}` : esc(cell);
}

function slideHtml(s) {
  const parts = [];
  parts.push(`<article class="slide" id="s${s.n}" data-sec="${esc(s.section.no)}">`);
  parts.push(`<div class="sn">${s.n}</div>`);
  if (s.title) parts.push(`<h3>${esc(s.title)}</h3>`);
  if (s.body.length) {
    parts.push('<div class="body">');
    for (const line of s.body) parts.push(`<p>${esc(line)}</p>`);
    parts.push('</div>');
  }
  if (s.grid.length) {
    const [head, ...rows] = s.grid;
    parts.push('<div class="scroll"><table><thead><tr>');
    for (const c of head) parts.push(`<th>${esc(c)}</th>`);
    parts.push('</tr></thead><tbody>');
    for (const r of rows) {
      parts.push('<tr>');
      r.forEach((c, i) => parts.push(`<td>${i === 0 ? markCode(c) : esc(c)}</td>`));
      parts.push('</tr>');
    }
    parts.push('</tbody></table></div>');
  }
  parts.push('</article>');
  return parts.join('\n');
}

export function build(doc) {
  const sections = [];
  for (const s of doc.slides) {
    const last = sections[sections.length - 1];
    if (!last || last.no !== s.section.no) {
      sections.push({ no: s.section.no, title: s.section.title, slides: [s] });
    } else {
      last.slides.push(s);
    }
  }

  const toc = sections
    .map(
      (sec) =>
        `<li><a href="#sec${esc(sec.no)}"><span class="tn">${esc(sec.no)}</span>${esc(sec.title)}<em>${sec.slides.length}</em></a></li>`
    )
    .join('\n');

  const bodyHtml = sections
    .map(
      (sec) =>
        `<section class="sec" id="sec${esc(sec.no)}">
<h2><span class="hn">القسم ${esc(sec.no)}</span>${esc(sec.title)}</h2>
${sec.slides.map(slideHtml).join('\n')}
</section>`
    )
    .join('\n');

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)} — ${esc(doc.code)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Readex+Pro:wght@400;500;600&family=IBM+Plex+Sans+Arabic:wght@300;400;500;600&family=IBM+Plex+Mono:wght@500&display=swap">
<style>
:root{--ground:#FBF8F9;--surface:#fff;--surface-2:#F5EFF1;--ink:#241820;--ink-2:#5B4A53;--ink-3:#8A7A82;
--line:#E4D8DC;--line-2:#D2C0C7;--plum:#4A2B3A;--plum-soft:#7A5265;--gold:#8F6A18;--gold-bg:#FBF1D9}
@media (prefers-color-scheme:dark){:root{--ground:#171015;--surface:#1F171C;--surface-2:#291E25;--ink:#F3E9ED;
--ink-2:#C0AEB6;--ink-3:#8D7B84;--line:#3A2C33;--line-2:#4C3A43;--plum:#D9AFC3;--plum-soft:#B98BA0;
--gold:#E0B75C;--gold-bg:#33280F}}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);direction:rtl;text-align:right;
font-family:"IBM Plex Sans Arabic","Segoe UI",Tahoma,sans-serif;font-size:15.5px;line-height:1.75;
-webkit-font-smoothing:antialiased}
h1,h2,h3{font-family:"Readex Pro","IBM Plex Sans Arabic",sans-serif;text-wrap:balance;margin:0}
.code,.sn,.tn,.hn{font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums}
.layout{display:grid;grid-template-columns:280px 1fr;gap:0;min-height:100vh}
nav{position:sticky;top:0;height:100vh;overflow-y:auto;background:var(--surface);
border-inline-start:1px solid var(--line);padding:26px 20px}
nav .doc{font-size:12px;color:var(--plum-soft);letter-spacing:.1em;direction:ltr;text-align:right;margin-bottom:8px}
nav h1{font-size:19px;font-weight:600;line-height:1.4;margin-bottom:6px}
nav .cls{font-size:11.5px;color:var(--ink-3);margin-bottom:18px}
#q{width:100%;padding:9px 12px;border:1px solid var(--line-2);border-radius:3px;background:var(--ground);
color:var(--ink);font:inherit;font-size:14px;margin-bottom:16px}
nav ul{list-style:none;margin:0;padding:0}
nav li a{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:3px;color:var(--ink-2);
text-decoration:none;font-size:14px}
nav li a:hover{background:var(--surface-2);color:var(--ink)}
nav .tn{color:var(--plum-soft);font-size:12px;min-width:14px}
nav em{margin-inline-start:auto;font-style:normal;color:var(--ink-3);font-size:11.5px}
main{padding:44px 40px 100px;max-width:1000px}
.sec{margin-bottom:56px}
.sec h2{font-size:25px;font-weight:600;padding-bottom:12px;border-bottom:2px solid var(--plum);margin-bottom:26px}
.sec .hn{display:block;font-size:12px;color:var(--plum-soft);letter-spacing:.1em;margin-bottom:5px;font-weight:500}
.slide{background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:20px 22px;
margin-bottom:16px;position:relative}
.slide .sn{position:absolute;inset-inline-end:14px;top:14px;font-size:11px;color:var(--ink-3)}
.slide h3{font-size:17px;font-weight:600;margin-bottom:10px;padding-inline-end:34px}
.body p{margin:0 0 9px;color:var(--ink-2);max-width:74ch}
.body p:last-child{margin-bottom:0}
.scroll{overflow-x:auto;border:1px solid var(--line);border-radius:3px;margin-top:14px}
table{width:100%;border-collapse:collapse;font-size:13.5px;min-width:560px}
th{background:var(--surface-2);color:var(--ink-2);font-weight:600;font-size:12px;text-align:right;
padding:9px 11px;border-bottom:1px solid var(--line-2);white-space:nowrap}
td{padding:9px 11px;border-bottom:1px solid var(--line);color:var(--ink-2);vertical-align:top}
tbody tr:last-child td{border-bottom:none}
td .code{color:var(--plum);font-size:12.5px}
mark{background:var(--gold-bg);color:var(--ink);padding:0 2px;border-radius:2px}
.hidden{display:none}
.empty{padding:30px;color:var(--ink-3);text-align:center}
:focus-visible{outline:2px solid var(--plum);outline-offset:2px}
@media(max-width:900px){.layout{grid-template-columns:1fr}nav{position:static;height:auto;
border-inline-start:none;border-bottom:1px solid var(--line)}main{padding:26px 18px 70px}}
@media print{nav{display:none}.layout{display:block}.slide{break-inside:avoid;border:none;padding:0 0 14px}}
</style>
</head>
<body>
<div class="layout">
<nav>
  <div class="doc">${esc(doc.code)}</div>
  <h1>${esc(doc.title)}</h1>
  <div class="cls">${esc(doc.owner)}<br>${esc(doc.classification)} · ${doc.sourceSlides} شريحة</div>
  <input id="q" type="search" placeholder="ابحث في الدليل…" aria-label="بحث">
  <ul>${toc}</ul>
</nav>
<main id="main">
${bodyHtml}
<p class="empty hidden" id="none">لا نتيجة.</p>
</main>
</div>
<script>
(function(){
  var q=document.getElementById('q'),none=document.getElementById('none');
  var slides=[].slice.call(document.querySelectorAll('.slide'));
  var secs=[].slice.call(document.querySelectorAll('.sec'));
  slides.forEach(function(s){s.dataset.text=s.textContent.toLowerCase();});
  q.addEventListener('input',function(){
    var v=q.value.trim().toLowerCase();
    var hits=0;
    slides.forEach(function(s){
      var ok=!v||s.dataset.text.indexOf(v)>-1;
      s.classList.toggle('hidden',!ok); if(ok)hits++;
    });
    secs.forEach(function(sec){
      var any=sec.querySelector('.slide:not(.hidden)');
      sec.classList.toggle('hidden',!any);
    });
    none.classList.toggle('hidden',hits>0);
  });
})();
</script>
</body>
</html>
`;
  return { html, sections: sections.length, slides: doc.slides.length };
}

if (import.meta.url === `file://${process.argv[1].split(path.sep).join('/')}` || process.argv[1].endsWith('build-scm-manual.mjs')) {
  const doc = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const { html, sections, slides } = build(doc);
  fs.writeFileSync(OUT, html, 'utf8');
  console.log(`✔ دليل السلاسل: ${slides} شريحة في ${sections} أقسام — ${(html.length / 1024).toFixed(0)} ك.ب`);
}
