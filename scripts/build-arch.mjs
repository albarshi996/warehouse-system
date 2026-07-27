/**
 * Arch Wiki — الخريطة المعماريّة الحيّة المولَّدة من الكود نفسه.
 *
 * ═══ لماذا هذا السكربت موجود ═══
 * الكود يُكتب أسرع من التوثيق. بعد أسابيع، فهم المشروع يتطلّب اللفّ على
 * مئات الملفات (٢٤٠ ملف مصدر + ٤٠ موديولًا + قواعد RBAC + موديول Odoo).
 * هذا هدر توكِنز وفهم بطيء وانحراف مؤكَّد بين الوثائق والواقع.
 *
 * الحلّ: مصدرٌ واحد يُشتقّ من الكود آليًّا:
 *
 *     node scripts/build-arch.mjs
 *
 * المخرَجات (كلها مولَّدة — لا تُحرَّر يدويًّا):
 *   • architecture.json          → المصدر الواحد المخصّص للـAI (خريطة كاملة)
 *   • public/arch-wiki/index.html → لوحة تفاعليّة للبشر (بحث + تنقّل سريع)
 *
 * نطاق النسخة الأولى (MVP): الموديولات + الخدمات + الصلاحيات/RBAC.
 * لاحقًا: موديول Odoo + البنية التحتية + طوبولوجيا الخدمات.
 *
 * حتميّ: كل شيء مُرتَّب، بلا طوابع زمنيّة — نفس الكود ⇒ نفس المخرَج.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = (...s) => join(ROOT, ...s);
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');

// ───────────────────────── أدوات مساعدة ─────────────────────────

/** يمشي على شجرة مجلّد ويُعيد كل الملفات المطابقة للفلتر. */
function walk(dir, filter, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries.sort()) {
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      walk(full, filter, out);
    } else if (filter(full)) {
      out.push(full);
    }
  }
  return out;
}

function read(p) {
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
}

/** يستخرج أوّل جملة معنويّة من تعليق JSDoc افتتاحيّ. */
function jsdocSummary(src) {
  const m = src.match(/\/\*\*([\s\S]*?)\*\//);
  if (!m) return '';
  const lines = m[1]
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, '').trim())
    .filter(Boolean);
  return lines[0] || '';
}

// ───────────────────────── ١) الموديولات (المسارات) ─────────────────────────

function scanModules() {
  const pagesDir = P('src', 'pages', 'dashboard');
  const files = walk(pagesDir, (f) => f.endsWith('.astro'));
  return files.map((f) => {
    const src = read(f);
    const name = basename(f, '.astro');
    const titleM = src.match(/title\s*=\s*["']([^"']+)["']/);
    // الخدمات التي يشير إليها الموديول (استيراد مباشر أو ضمن سكربت العميل).
    const svc = new Set();
    for (const m of src.matchAll(/services\/([a-zA-Z0-9_-]+)/g)) svc.add(m[1]);
    return {
      name,
      route: `/dashboard/${name}`,
      title: titleM ? titleM[1].trim() : '',
      summary: jsdocSummary(src),
      file: rel(f),
      usesServices: [...svc].sort(),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

// ───────────────────────── ٢) طبقة الخدمات ─────────────────────────

function scanServices() {
  const svcRoot = P('src', 'services');
  let domains;
  try { domains = readdirSync(svcRoot).filter((d) => statSync(join(svcRoot, d)).isDirectory()); }
  catch { domains = []; }

  return domains.sort().map((domain) => {
    const dir = join(svcRoot, domain);
    const files = walk(dir, (f) => f.endsWith('.js'));
    const exportsAll = new Set();
    const collections = new Set();

    for (const f of files) {
      if (f.endsWith('.test.js')) continue;
      const src = read(f);

      // الدوال/الثوابت/الأصناف المُصدَّرة.
      for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|const|class|let)\s+([A-Za-z0-9_$]+)/g)) {
        exportsAll.add(m[1]);
      }
      for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
        m[1].split(',').forEach((x) => {
          const id = x.split(/\s+as\s+/)[0].trim();
          if (id && /^[A-Za-z0-9_$]+$/.test(id)) exportsAll.add(id);
        });
      }

      // مجموعات Firestore: حرفيّة أو عبر ثابت نحلّه في نفس الملف.
      const consts = {};
      for (const m of src.matchAll(/const\s+([A-Z][A-Z0-9_]*)\s*=\s*['"]([^'"]+)['"]/g)) {
        consts[m[1]] = m[2];
      }
      for (const m of src.matchAll(/collection\(\s*(?:db|firestore)\s*,\s*([^,)]+)/g)) {
        const arg = m[1].trim();
        const lit = arg.match(/^['"]([^'"]+)['"]$/);
        if (lit) collections.add(lit[1]);
        else if (consts[arg]) collections.add(consts[arg]);
      }
    }

    const testCount = files.filter((f) => f.endsWith('.test.js')).length;
    return {
      domain,
      dir: rel(dir),
      files: files.map((f) => basename(f)).sort(),
      fileCount: files.length,
      testCount,
      exports: [...exportsAll].sort(),
      collections: [...collections].sort(),
    };
  });
}

// ───────────────────────── ٣) الصلاحيات / RBAC ─────────────────────────

const ROLE_FNS = /^(is[A-Z]\w*|.*Roles|myRole|hasProfile|signedIn)$/;

function scanRules() {
  const src = read(P('firestore.rules'));
  const lines = src.split('\n');

  // الدوال (حرّاس/أدوار).
  const functions = [];
  for (const m of src.matchAll(/function\s+([A-Za-z0-9_]+)\s*\(/g)) {
    functions.push(m[1]);
  }
  const knownFns = new Set(functions);
  const roles = [...new Set(functions)].filter((f) => ROLE_FNS.test(f)).sort();

  // محلّل يتتبّع عمق الأقواس ليربط كل `allow` بمجموعتها الصحيحة،
  // ويتجاهل الغلاف الجذر `match /databases/{database}/documents`،
  // ويجمع أسطر `allow` المتعدّدة حتى الفاصلة المنقوطة.
  const collections = {};
  const stack = []; // { seg, openDepth }
  let depth = 0;
  let buf = null; // تجميع عبارة allow متعدّدة الأسطر

  const flush = () => {
    if (!buf) return;
    const m = buf.text.match(/allow\s+([a-z, ]+):\s*if\s+([\s\S]+?);/);
    if (m && buf.path) {
      const actions = m[1].split(',').map((x) => x.trim()).filter(Boolean);
      const cond = m[2].replace(/\s+/g, ' ').trim();
      const refRoles = [...new Set(
        [...cond.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)]
          .map((x) => x[1])
          .filter((f) => knownFns.has(f)),
      )];
      const key = buf.path;
      if (!collections[key]) collections[key] = { name: buf.seg, path: key, rules: [] };
      collections[key].rules.push({ actions, condition: cond.slice(0, 160), roles: refRoles });
    }
    buf = null;
  };

  for (const raw of lines) {
    const code = raw.replace(/\/\/.*$/, ''); // إسقاط تعليقات السطر
    const startDepth = depth;

    const mm = code.match(/match\s+\/([A-Za-z0-9_]+)\//);
    if (mm && mm[1] !== 'databases') {
      const parentPath = stack.map((s) => s.seg).join('/');
      const seg = mm[1];
      const path = parentPath ? `${parentPath}/${seg}` : seg;
      stack.push({ seg, path, openDepth: startDepth });
      if (!collections[path]) collections[path] = { name: seg, path, rules: [] };
    }

    // تجميع allow (قد يمتدّ لأسطر).
    if (/\ballow\b/.test(code) && !buf) {
      buf = { text: code, path: stack.length ? stack[stack.length - 1].path : null, seg: stack.length ? stack[stack.length - 1].seg : null };
      if (code.includes(';')) flush();
    } else if (buf) {
      buf.text += ' ' + code;
      if (code.includes(';')) flush();
    }

    depth += (code.match(/\{/g) || []).length - (code.match(/\}/g) || []).length;
    while (stack.length && depth <= stack[stack.length - 1].openDepth) stack.pop();
  }
  flush();

  return {
    roles,
    functions: [...new Set(functions)].sort(),
    collections: Object.values(collections).sort((a, b) => a.path.localeCompare(b.path)),
    file: 'firestore.rules',
  };
}

// ───────────────────────── التجميع ─────────────────────────

const modules = scanModules();
const services = scanServices();
const rbac = scanRules();

const architecture = {
  $schema: 'arch-wiki/v1',
  project: 'Brandzo Warehouse & Supply-Chain System',
  generatedBy: 'scripts/build-arch.mjs',
  note: 'ملف مولَّد آليًّا من الكود — لا يُحرَّر يدويًّا. المصدر الواحد المخصّص للـAI.',
  stack: {
    frontend: 'Astro (islands) + vanilla JS services',
    backend: 'Firebase (Firestore/Auth) + Odoo module (brandzo_warehouse) + odoo-proxy',
    desktop: 'Tauri (src-tauri)',
  },
  counts: {
    modules: modules.length,
    serviceDomains: services.length,
    serviceFiles: services.reduce((n, s) => n + s.fileCount, 0),
    collections: rbac.collections.length,
    roles: rbac.roles.length,
  },
  modules,
  services,
  rbac,
};

writeFileSync(P('architecture.json'), JSON.stringify(architecture, null, 2) + '\n', 'utf8');

// ───────────────────────── لوحة البشر ─────────────────────────

const outDir = P('public', 'arch-wiki');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), renderDashboard(architecture), 'utf8');

console.info(
  `✓ Arch Wiki: ${architecture.counts.modules} موديول · ` +
  `${architecture.counts.serviceDomains} نطاق خدمة (${architecture.counts.serviceFiles} ملف) · ` +
  `${architecture.counts.collections} مجموعة · ${architecture.counts.roles} دور\n` +
  `  → architecture.json\n  → public/arch-wiki/index.html`,
);

// ───────────────────────── مولّد HTML ─────────────────────────

function renderDashboard(arch) {
  const dataJson = JSON.stringify(arch)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Arch Wiki — خريطة النظام الحيّة</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&family=Cairo:wght@600;700;900&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#0d1b2a; --surface:#f8fafc; --card:#ffffff; --border:#d4dce8;
    --accent:#8b5cf6; --accent2:#c4b5fd; --text:#1e293b; --muted:#64748b;
    --ok:#00b87a; --warn:#f59e0b; --bad:#ef4444; --code:#0f172a;
  }
  *{box-sizing:border-box}
  body{margin:0;font-family:'Tajawal','Cairo',sans-serif;background:linear-gradient(135deg,#eef0fb,#f0f4fb);color:var(--text);min-height:100vh}
  header{background:var(--bg);position:sticky;top:0;z-index:50;box-shadow:0 4px 20px rgba(0,0,0,.35)}
  header::after{content:'';display:block;height:3px;background:linear-gradient(90deg,var(--accent),var(--accent2),var(--accent))}
  .bar{max-width:1200px;margin:0 auto;padding:14px 22px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
  .logo{background:linear-gradient(135deg,var(--accent),var(--accent2));border-radius:10px;padding:7px 14px;font-family:'Cairo';font-weight:900;color:#fff;font-size:1.15rem}
  .htitle{color:#fff;font-weight:700}
  .htitle small{display:block;color:rgba(255,255,255,.6);font-weight:500;font-size:.75rem}
  .search{margin-inline-start:auto;display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:22px;padding:8px 16px;min-width:260px}
  .search input{background:transparent;border:0;outline:0;color:#fff;font-family:inherit;font-size:.9rem;width:100%}
  .search input::placeholder{color:rgba(255,255,255,.5)}
  main{max-width:1200px;margin:22px auto;padding:0 20px 80px}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:22px}
  .kpi{background:var(--bg);border-radius:16px;padding:18px 20px;color:#fff;position:relative;overflow:hidden}
  .kpi::before{content:'';position:absolute;top:-40px;inset-inline-start:-40px;width:160px;height:160px;background:radial-gradient(circle,rgba(139,92,246,.25),transparent 70%);border-radius:50%}
  .kpi b{font-size:2rem;font-family:'Cairo';display:block;line-height:1}
  .kpi span{color:rgba(255,255,255,.7);font-size:.82rem}
  .tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
  .tab{background:var(--card);border:1px solid var(--border);border-radius:22px;padding:9px 20px;font-family:inherit;font-weight:700;font-size:.88rem;color:var(--muted);cursor:pointer}
  .tab.active{background:var(--accent);border-color:var(--accent);color:#fff}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
  .card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:18px;box-shadow:0 6px 20px rgba(13,27,42,.06)}
  .card h3{margin:0 0 4px;font-family:'Cairo';font-size:1.05rem}
  .card .route{font-family:ui-monospace,monospace;font-size:.78rem;color:var(--accent);direction:ltr;text-align:right;display:block;margin-bottom:8px}
  .card p{margin:6px 0;color:var(--muted);font-size:.85rem;line-height:1.6}
  .tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
  .tag{background:#f1f0fb;color:#6d28d9;border-radius:8px;padding:3px 9px;font-size:.72rem;font-weight:700;font-family:ui-monospace,monospace;direction:ltr}
  .tag.col{background:#eafaf3;color:#047857}
  .tag.role{background:#fef3e7;color:#b45309}
  .meta{font-size:.75rem;color:var(--muted);margin-top:8px;display:flex;gap:12px;flex-wrap:wrap}
  .rule{border-top:1px dashed var(--border);padding-top:8px;margin-top:8px}
  .acts{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:4px}
  .act{border-radius:6px;padding:2px 8px;font-size:.72rem;font-weight:700;font-family:ui-monospace,monospace}
  .act.read{background:#e0f2fe;color:#0369a1}.act.create{background:#dcfce7;color:#15803d}
  .act.update{background:#fef9c3;color:#a16207}.act.delete{background:#fee2e2;color:#b91c1c}
  code{font-family:ui-monospace,monospace;font-size:.76rem;color:var(--code);direction:ltr;display:inline-block;background:#f1f5f9;padding:2px 6px;border-radius:5px;word-break:break-all}
  .hidden{display:none}
  .empty{color:var(--muted);text-align:center;padding:40px}
  footer{text-align:center;color:var(--muted);font-size:.78rem;padding:20px}
  footer code{background:none;color:var(--muted)}
</style>
</head>
<body>
<header>
  <div class="bar">
    <span class="logo">Brandzo</span>
    <div class="htitle">Arch Wiki<small>خريطة النظام الحيّة — مولَّدة من الكود</small></div>
    <label class="search">🔎<input id="q" placeholder="ابحث في الموديولات والخدمات والصلاحيات…" autocomplete="off"></label>
  </div>
</header>
<main>
  <div class="kpis" id="kpis"></div>
  <div class="tabs">
    <button class="tab active" data-tab="modules">الموديولات</button>
    <button class="tab" data-tab="services">الخدمات</button>
    <button class="tab" data-tab="rbac">الصلاحيات · RBAC</button>
  </div>
  <div id="view"></div>
</main>
<footer>مولَّد آليًّا بـ <code>node scripts/build-arch.mjs</code> — لا يُحرَّر يدويًّا · المصدر للـAI: <code>architecture.json</code></footer>

<script>
const A = ${dataJson};
const el = (h) => { const d=document.createElement('div'); d.innerHTML=h; return d.firstElementChild; };
let TAB='modules', Q='';

document.getElementById('kpis').innerHTML = [
  ['الموديولات', A.counts.modules],
  ['نطاقات الخدمة', A.counts.serviceDomains],
  ['ملفات الخدمة', A.counts.serviceFiles],
  ['المجموعات', A.counts.collections],
  ['الأدوار', A.counts.roles],
].map(([l,n]) => \`<div class="kpi"><b>\${n}</b><span>\${l}</span></div>\`).join('');

function match(txt){ return !Q || String(txt).toLowerCase().includes(Q); }

function renderModules(){
  const items = A.modules.filter(m => match(m.name+' '+m.title+' '+m.summary+' '+m.usesServices.join(' ')));
  if(!items.length) return '<div class="empty">لا نتائج</div>';
  return '<div class="grid">'+items.map(m => \`
    <div class="card">
      <h3>\${esc(m.title||m.name)}</h3>
      <span class="route">\${esc(m.route)}</span>
      <p>\${esc(m.summary||'—')}</p>
      <div class="tags">\${m.usesServices.map(s=>'<span class="tag">'+esc(s)+'</span>').join('')}</div>
      <div class="meta"><code>\${esc(m.file)}</code></div>
    </div>\`).join('')+'</div>';
}

function renderServices(){
  const items = A.services.filter(s => match(s.domain+' '+s.exports.join(' ')+' '+s.collections.join(' ')));
  if(!items.length) return '<div class="empty">لا نتائج</div>';
  return '<div class="grid">'+items.map(s => \`
    <div class="card">
      <h3>\${esc(s.domain)}</h3>
      <div class="meta"><span>\${s.fileCount} ملف</span><span>\${s.testCount} اختبار</span><span>\${s.exports.length} تصدير</span></div>
      \${s.collections.length?'<div class="tags">'+s.collections.map(c=>'<span class="tag col">'+esc(c)+'</span>').join('')+'</div>':''}
      \${s.exports.length?'<div class="tags">'+s.exports.slice(0,14).map(e=>'<span class="tag">'+esc(e)+'</span>').join('')+(s.exports.length>14?'<span class="tag">+'+(s.exports.length-14)+'</span>':'')+'</div>':''}
      <div class="meta"><code>\${esc(s.dir)}</code></div>
    </div>\`).join('')+'</div>';
}

function renderRbac(){
  const rolesCard = \`<div class="card"><h3>الأدوار والحرّاس</h3><div class="tags">\${A.rbac.roles.map(r=>'<span class="tag role">'+esc(r)+'</span>').join('')}</div></div>\`;
  const cols = A.rbac.collections.filter(c => match(c.path+' '+c.rules.map(r=>r.actions.join(' ')+' '+r.roles.join(' ')).join(' ')));
  const colCards = cols.map(c => \`
    <div class="card">
      <h3>\${esc(c.name)}</h3>
      <span class="route">\${esc(c.path)}</span>
      \${c.rules.map(r=>\`<div class="rule">
        <div class="acts">\${r.actions.map(a=>'<span class="act '+esc(a)+'">'+esc(a)+'</span>').join('')}</div>
        \${r.roles.length?'<div class="tags">'+r.roles.map(x=>'<span class="tag role">'+esc(x)+'</span>').join('')+'</div>':''}
        <code>\${esc(r.condition)}</code>
      </div>\`).join('')||'<p>—</p>'}
    </div>\`).join('');
  return '<div class="grid">'+ (match('roles أدوار حرّاس')?rolesCard:'') + colCards + '</div>' || '<div class="empty">لا نتائج</div>';
}

function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function render(){
  const v = document.getElementById('view');
  v.innerHTML = TAB==='modules'?renderModules():TAB==='services'?renderServices():renderRbac();
}
document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  t.classList.add('active'); TAB=t.dataset.tab; render();
});
document.getElementById('q').addEventListener('input', e => { Q=e.target.value.trim().toLowerCase(); render(); });
render();
</script>
</body>
</html>
`;
}
