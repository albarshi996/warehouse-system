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
 *   • src/generated/arch-wiki.html → لوحة تفاعليّة للبشر، تُعرَض داخل صفحة
 *     `/dashboard/arch-wiki` المحميّة (iframe srcdoc) — لا تُخدَم للعامّة
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

// ───────────────────────── ٤) موديول Odoo (الباك-إند الحقيقي) ─────────────────────────

function scanOdoo() {
  const modDir = P('brandzo-addons', 'brandzo_warehouse');
  const manifestSrc = read(join(modDir, '__manifest__.py'));
  if (!manifestSrc) return null; // الموديول غير موجود — لا نُخرج قسمًا فارغًا

  // ── الmanifest ──
  const pick = (k) => {
    const m = manifestSrc.match(new RegExp(`['"]${k}['"]\\s*:\\s*['"]([^'"]+)['"]`));
    return m ? m[1].trim() : '';
  };
  const dependsBlock = manifestSrc.match(/['"]depends['"]\s*:\s*\[([\s\S]*?)\]/);
  const depends = dependsBlock
    ? [...dependsBlock[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]).sort()
    : [];
  const manifest = {
    name: pick('name'),
    version: pick('version'),
    category: pick('category'),
    summary: pick('summary'),
    license: pick('license'),
    depends,
  };

  // ── النماذج (models/*.py) ──
  const modelFiles = walk(join(modDir, 'models'), (f) => f.endsWith('.py') && !f.endsWith('__init__.py'));
  const models = [];
  for (const f of modelFiles) {
    const src = read(f);
    const fileDoc = jsdocSummary(src) || (src.match(/^\s*"""([\s\S]*?)"""/m)?.[1] || '').split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
    // فصل الأصناف داخل الملف.
    const chunks = src.split(/\nclass\s+/).slice(1);
    for (const chunk of chunks) {
      const nameM = chunk.match(/_name\s*=\s*['"]([^'"]+)['"]/);
      const inheritM = chunk.match(/_inherit\s*=\s*(\[[^\]]*\]|['"][^'"]+['"])/);
      const inherits = inheritM
        ? [...inheritM[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
        : [];
      const name = nameM ? nameM[1] : (inherits[0] || '');
      if (!name) continue;
      const descM = chunk.match(/_description\s*=\s*['"]([^'"]+)['"]/);

      // الحقول المُعرَّفة في هذا الصنف.
      const fields = [...chunk.matchAll(/^\s{4}([a-z_][a-z0-9_]*)\s*=\s*fields\.([A-Z][A-Za-z0-9]*)\(/gm)]
        .map((m) => ({ name: m[1], type: m[2] }));

      // حالات دورة الحياة من حقل state (إن وُجد).
      let states = [];
      const stateBlock = chunk.match(/state\s*=\s*fields\.Selection\(\s*(?:selection\s*=\s*)?\[([\s\S]*?)\]/);
      if (stateBlock) {
        states = [...stateBlock[1].matchAll(/\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g)]
          .map((m) => ({ key: m[1], label: m[2] }));
      }

      // الحرّاس الذهبية: قيود + استثناءات صريحة.
      const guards = (chunk.match(/@api\.constrains|raise\s+UserError|raise\s+ValidationError/g) || []).length;
      const methods = (chunk.match(/^\s{4}def\s+[a-z_]/gm) || []).length;

      models.push({
        name,
        kind: nameM ? 'new' : 'extension',
        inherits: inherits.filter((x) => x !== name),
        description: descM ? descM[1] : '',
        summary: nameM ? fileDoc : '',
        fields,
        fieldCount: fields.length,
        states,
        guards,
        methods,
        file: rel(f),
      });
    }
  }
  models.sort((a, b) => (b.kind === 'new') - (a.kind === 'new') || a.name.localeCompare(b.name));

  // ── مجموعات الأمان (res.groups) ──
  const secSrc = read(join(modDir, 'security', 'brandzo_security.xml'));
  const groups = [];
  for (const m of secSrc.matchAll(/<record\s+id="([^"]+)"\s+model="res\.groups">([\s\S]*?)<\/record>/g)) {
    const nameM = m[2].match(/<field\s+name="name">([^<]+)</);
    groups.push({ id: m[1], name: nameM ? nameM[1].trim() : m[1] });
  }
  groups.sort((a, b) => a.id.localeCompare(b.id));

  // ── مصفوفة الوصول (ir.model.access.csv) ──
  const csv = read(join(modDir, 'security', 'ir.model.access.csv'));
  const access = csv.split('\n').slice(1).map((l) => l.trim()).filter(Boolean).map((line) => {
    const c = line.split(',');
    const model = (c[2] || '').replace(/^model_/, '').replace(/_/g, '.');
    const group = (c[3] || '').split('.').pop();
    const perms = ['read', 'write', 'create', 'unlink'].filter((_, i) => c[4 + i] === '1');
    return { model, group, perms };
  }).filter((a) => a.model);

  // ── الـViews (عدد لكل نموذج) ──
  const viewFiles = walk(join(modDir, 'views'), (f) => f.endsWith('.xml'));
  const viewsByModel = {};
  let viewTotal = 0;
  for (const f of viewFiles) {
    const src = read(f);
    for (const m of src.matchAll(/<field\s+name="model">([^<]+)</g)) {
      const mdl = m[1].trim();
      viewsByModel[mdl] = (viewsByModel[mdl] || 0) + 1;
      viewTotal++;
    }
  }

  return {
    path: rel(modDir),
    manifest,
    models,
    groups,
    access,
    viewsByModel,
    counts: {
      models: models.length,
      newModels: models.filter((m) => m.kind === 'new').length,
      extensions: models.filter((m) => m.kind === 'extension').length,
      groups: groups.length,
      accessRules: access.length,
      views: viewTotal,
      guards: models.reduce((n, m) => n + m.guards, 0),
    },
  };
}

// ───────────────────────── ٥) البنية التحتية وطوبولوجيا الخدمات ─────────────────────────

function exists(...seg) {
  try { statSync(P(...seg)); return true; } catch { return false; }
}

function scanInfra() {
  const nodes = [];
  const edges = [];

  // ── الاستضافة (Astro / GitHub Pages) ──
  const astroCfg = read(P('astro.config.mjs'));
  const site = astroCfg.match(/site:\s*['"]([^'"]+)['"]/)?.[1] || '';
  const base = astroCfg.match(/base:\s*['"]([^'"]+)['"]/)?.[1] || '';
  const integrations = [...astroCfg.matchAll(/integrations:\s*\[([^\]]*)\]/g)]
    .flatMap((m) => [...m[1].matchAll(/([a-zA-Z]+)\(/g)].map((x) => x[1]));
  const hasPwa = exists('src', 'integrations', 'pwa-sw.mjs');
  nodes.push({
    id: 'host-pages', layer: 'الاستضافة والحافة', name: 'GitHub Pages',
    tech: 'Astro (static + React islands)' + (hasPwa ? ' + PWA' : ''),
    role: 'يستضيف الواجهة الرسميّة — بناء ثابت يُخدَم من CDN' + (hasPwa ? '، وservice worker يتيح العمل دون اتصال والتحديث الذاتي' : ''),
    url: site && base ? site + base : site,
    refs: ['astro.config.mjs', hasPwa ? 'src/integrations/pwa-sw.mjs' : ''].filter(Boolean),
    meta: { integrations },
  });

  // ── العملاء ──
  nodes.push({
    id: 'client-browser', layer: 'العملاء', name: 'المتصفّح',
    tech: 'PWA', role: 'وصول الموظّفين عبر الويب — قابل للتثبيت ويعمل دون اتصال', refs: [],
  });
  const tauri = read(P('src-tauri', 'tauri.conf.json'));
  if (tauri) {
    const pn = tauri.match(/"productName":\s*"([^"]+)"/)?.[1] || 'Tauri';
    const idf = tauri.match(/"identifier":\s*"([^"]+)"/)?.[1] || '';
    const front = tauri.match(/"frontendDist":\s*"([^"]+)"/)?.[1] || '';
    nodes.push({
      id: 'client-desktop', layer: 'العملاء', name: pn + ' (سطح المكتب)',
      tech: 'Tauri (Rust shell)', role: 'تطبيق سطح مكتب يغلّف الواجهة المستضافة',
      identifier: idf, wraps: front, refs: ['src-tauri/tauri.conf.json'],
    });
    edges.push({ from: 'client-desktop', to: 'host-pages', label: 'يحمّل الواجهة المستضافة' });
  }
  edges.push({ from: 'client-browser', to: 'host-pages', label: 'يفتح الموقع' });

  // ── البيانات والمصادقة (Firebase) ──
  const fb = read(P('src', 'config', 'firebase.js'));
  if (fb) {
    const svc = [];
    if (/getFirestore/.test(fb)) svc.push('Firestore');
    if (/getAuth/.test(fb)) svc.push('Auth');
    if (/getStorage/.test(fb)) svc.push('Storage');
    nodes.push({
      id: 'data-firebase', layer: 'البيانات والمصادقة', name: 'Firebase',
      tech: svc.join(' + '), role: 'قاعدة البيانات الحيّة والمصادقة — مصدر الحقيقة التشغيليّ (القواعد في firestore.rules)',
      refs: ['src/config/firebase.js', 'firestore.rules'], meta: { services: svc },
    });
    edges.push({ from: 'host-pages', to: 'data-firebase', label: 'Firestore/Auth SDK (مباشر)' });
  }

  // ── وكيل Odoo + الخلفية ──
  if (exists('odoo-proxy')) {
    const variants = [];
    if (exists('odoo-proxy', 'cloudflare-worker', 'worker.js')) variants.push('Cloudflare Worker');
    if (exists('odoo-proxy', 'firebase-function', 'index.js')) variants.push('Firebase Function');
    nodes.push({
      id: 'proxy-odoo', layer: 'الخلفية', name: 'وكيل Odoo',
      tech: variants.join(' / '),
      role: 'بوّابة CORS بين الواجهة وخادم Odoo (نسختان قابلتان للنشر)',
      refs: ['odoo-proxy/'], meta: { variants },
    });
    edges.push({ from: 'host-pages', to: 'proxy-odoo', label: 'استدعاءات Odoo API' });
  }
  if (odoo) {
    nodes.push({
      id: 'backend-odoo', layer: 'الخلفية', name: 'Odoo 19 — ' + (odoo.manifest.name || 'brandzo_warehouse'),
      tech: 'Python (' + odoo.counts.models + ' نموذج · ' + odoo.counts.guards + ' حارس)',
      role: 'الباك-إند الحقيقي للدورة المستنديّة والقواعد الذهبية (تفصيله في تبويب Odoo)',
      refs: [odoo.path], link: 'odoo',
    });
    if (exists('odoo-proxy')) edges.push({ from: 'proxy-odoo', to: 'backend-odoo', label: 'يمرّر إلى خادم Odoo' });
  }

  // ── خطوط CI/CD ──
  const wfDir = P('.github', 'workflows');
  const pipelines = walk(wfDir, (f) => f.endsWith('.yml') || f.endsWith('.yaml')).map((f) => {
    const src = read(f);
    const name = src.match(/^name:\s*(.+)$/m)?.[1].trim() || basename(f);
    const onIdx = src.search(/^on:/m);
    const triggers = [];
    if (onIdx >= 0) {
      for (const line of src.slice(onIdx).split('\n').slice(1)) {
        if (/^\S/.test(line)) break;
        const t = line.match(/^ {2}([a-z_]+):/);
        if (t) triggers.push(t[1]);
      }
    }
    return { name, triggers, file: rel(f) };
  }).sort((a, b) => a.name.localeCompare(b.name));

  // ── التبعيّات المصنّفة ──
  const pkg = JSON.parse(read(P('package.json')) || '{}');
  const deps = Object.keys(pkg.dependencies || {}).sort();
  const dev = Object.keys(pkg.devDependencies || {}).sort();

  return {
    hosting: { site, base, url: site && base ? site + base : site },
    nodes,
    edges,
    pipelines,
    dependencies: { runtime: deps, dev },
    scripts: pkg.scripts || {},
  };
}

// ───────────────────────── التجميع ─────────────────────────

const modules = scanModules();
const services = scanServices();
const rbac = scanRules();
const odoo = scanOdoo();
const infra = scanInfra();

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
    odooModels: odoo ? odoo.counts.models : 0,
    odooGuards: odoo ? odoo.counts.guards : 0,
    infraNodes: infra.nodes.length,
    pipelines: infra.pipelines.length,
  },
  modules,
  services,
  rbac,
  odoo,
  infra,
};

writeFileSync(P('architecture.json'), JSON.stringify(architecture, null, 2) + '\n', 'utf8');

// ───────────────────────── لوحة البشر ─────────────────────────

const outDir = P('src', 'generated');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'arch-wiki.html'), renderDashboard(architecture), 'utf8');

console.info(
  `✓ Arch Wiki: ${architecture.counts.modules} موديول · ` +
  `${architecture.counts.serviceDomains} نطاق خدمة (${architecture.counts.serviceFiles} ملف) · ` +
  `${architecture.counts.collections} مجموعة · ${architecture.counts.roles} دور` +
  (odoo ? ` · Odoo: ${odoo.counts.models} نموذج (${odoo.counts.guards} حارس · ${odoo.counts.groups} مجموعة)` : '') +
  ` · بنية: ${infra.nodes.length} عقدة · ${infra.pipelines.length} خطّ CI` +
  `\n  → architecture.json\n  → src/generated/arch-wiki.html (تُعرَض في /dashboard/arch-wiki المحميّة)`,
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
  .odoo-head{grid-column:1/-1;background:linear-gradient(135deg,#faf5ff,#fff)}
  .odoo-head h3{font-size:1.2rem}
  .ver{font-family:ui-monospace,monospace;font-size:.75rem;color:#fff;background:var(--accent);border-radius:6px;padding:2px 8px;direction:ltr}
  .pill-new{font-size:.68rem;font-weight:700;background:#dcfce7;color:#15803d;border-radius:8px;padding:2px 8px}
  .pill-ext{font-size:.68rem;font-weight:700;background:#e0f2fe;color:#0369a1;border-radius:8px;padding:2px 8px}
  .g-badge{background:#fef3e7;color:#b45309;border-radius:8px;padding:2px 8px;font-weight:700}
  .states{display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin:10px 0}
  .state-pill{background:#0d1b2a;color:#fff;border-radius:20px;padding:3px 12px;font-size:.74rem;font-weight:700}
  .arrow{color:var(--accent);font-weight:900}
  .tag.fld{background:#f8fafc;color:var(--text);border:1px solid var(--border);display:inline-flex;gap:5px;align-items:center}
  .tag.fld i{font-style:normal;color:var(--accent);font-size:.66rem}
  .matrix-card{grid-column:1/-1}
  .mtable{overflow-x:auto}
  .mtable table{width:100%;border-collapse:collapse;font-size:.82rem;direction:rtl}
  .mtable th,.mtable td{padding:7px 10px;text-align:right;border-bottom:1px solid var(--border);white-space:nowrap}
  .mtable th{color:var(--muted);font-weight:700;position:sticky;top:0;background:var(--card)}
  .mtable td.m{font-family:ui-monospace,monospace;direction:ltr;color:var(--accent)}
  .mtable td.g{font-weight:700}
  .perm{display:inline-block;width:22px;text-align:center;border-radius:5px;margin-inline-end:3px;font-weight:700;font-size:.78rem}
  .perm.on{background:#dcfce7;color:#15803d}.perm.off{background:#f1f5f9;color:#cbd5e1}
  .legend{color:var(--muted);font-size:.74rem;margin-top:8px}
  .diagram{grid-column:1/-1}
  .topo{display:flex;flex-direction:column;gap:6px;margin-top:8px}
  .layer{border:1px dashed var(--border);border-radius:14px;padding:10px 12px;background:#fbfcfe}
  .layer-lbl{font-family:'Cairo';font-weight:700;color:var(--muted);font-size:.8rem;margin-bottom:8px}
  .layer-nodes{display:flex;flex-wrap:wrap;gap:10px}
  .node{flex:1 1 220px;min-width:200px;border:1px solid var(--border);border-radius:12px;padding:12px 14px;background:var(--card);border-top:3px solid var(--accent)}
  .node.n-client{border-top-color:#0ea5e9}.node.n-host{border-top-color:#8b5cf6}
  .node.n-data{border-top-color:#f59e0b}.node.n-proxy{border-top-color:#14b8a6}.node.n-backend{border-top-color:#ef4444}
  .node b{display:block;font-family:'Cairo';font-size:1rem}
  .node .tech{font-size:.74rem;color:var(--accent);font-weight:700}
  .node p{margin:6px 0;font-size:.8rem;color:var(--muted);line-height:1.55}
  .flow-down{text-align:center;color:var(--accent);font-size:1rem;line-height:1}
  .flow-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-top:1px dashed var(--border);padding:8px 0;font-size:.84rem}
  .flow-row:first-of-type{border-top:0}
  .fnode{font-weight:700}
  .farrow{color:var(--accent);font-weight:900;direction:ltr}
  .flabel{color:var(--muted);font-size:.78rem;margin-inline-start:auto}
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
    <button class="tab" data-tab="odoo" id="odooTab">Odoo</button>
    <button class="tab" data-tab="infra">البنية التحتية</button>
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
  ...(A.odoo ? [['نماذج Odoo', A.counts.odooModels], ['حرّاس Odoo', A.counts.odooGuards]] : []),
  ['عقد البنية', A.counts.infraNodes],
  ['خطوط CI', A.counts.pipelines],
].map(([l,n]) => \`<div class="kpi"><b>\${n}</b><span>\${l}</span></div>\`).join('');
if(!A.odoo){ const t=document.getElementById('odooTab'); if(t) t.remove(); }

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

function renderOdoo(){
  const o = A.odoo;
  if(!o) return '<div class="empty">موديول Odoo غير موجود</div>';
  const man = o.manifest;
  const head = \`<div class="card odoo-head">
    <h3>\${esc(man.name)} <span class="ver">v\${esc(man.version)}</span></h3>
    <p>\${esc(man.summary)}</p>
    <div class="meta"><span>\${o.counts.newModels} نموذج جديد</span><span>\${o.counts.extensions} امتداد</span><span>\${o.counts.guards} حارس</span><span>\${o.counts.groups} مجموعة</span><span>\${o.counts.accessRules} قاعدة وصول</span><span>\${o.counts.views} view</span></div>
    <div class="tags">\${man.depends.map(d=>'<span class="tag">'+esc(d)+'</span>').join('')}</div>
  </div>\`;

  const models = o.models.filter(m => match(m.name+' '+m.description+' '+m.summary+' '+m.fields.map(f=>f.name).join(' ')));
  const modelCards = models.map(m => \`
    <div class="card">
      <h3>\${esc(m.name)} <span class="\${m.kind==='new'?'pill-new':'pill-ext'}">\${m.kind==='new'?'جديد':'امتداد'}</span></h3>
      \${m.description?'<p>'+esc(m.description)+'</p>':(m.summary?'<p>'+esc(m.summary)+'</p>':'')}
      \${m.inherits.length?'<div class="meta"><span>يرث: '+m.inherits.map(esc).join(' · ')+'</span></div>':''}
      <div class="meta"><span>\${m.fieldCount} حقل</span><span>\${m.methods} دالّة</span>\${m.guards?'<span class="g-badge">🛡️ '+m.guards+' حارس</span>':''}</div>
      \${m.states.length?'<div class="states">'+m.states.map(s=>'<span class="state-pill">'+esc(s.label)+'</span>').join('<span class="arrow">←</span>')+'</div>':''}
      \${m.fields.length?'<div class="tags">'+m.fields.slice(0,16).map(f=>'<span class="tag fld">'+esc(f.name)+'<i>'+esc(f.type)+'</i></span>').join('')+(m.fields.length>16?'<span class="tag">+'+(m.fields.length-16)+'</span>':'')+'</div>':''}
      <div class="meta"><code>\${esc(m.file)}</code></div>
    </div>\`).join('');

  // مصفوفة الوصول: مجموعة × نموذج → صلاحيات
  const P2={read:'ق',write:'ت',create:'ج',unlink:'ح'};
  const matrix = match('access وصول صلاحيات مصفوفة') ? \`<div class="card matrix-card">
    <h3>مصفوفة الوصول (المجموعة ← النموذج)</h3>
    <div class="mtable"><table><thead><tr><th>المجموعة</th><th>النموذج</th><th>الصلاحيات</th></tr></thead><tbody>
    \${o.access.map(a=>\`<tr><td class="g">\${esc(a.group)}</td><td class="m">\${esc(a.model)}</td><td>\${['read','write','create','unlink'].map(p=>'<span class="perm '+(a.perms.includes(p)?'on':'off')+'">'+P2[p]+'</span>').join('')}</td></tr>\`).join('')}
    </tbody></table></div>
    <div class="legend">ق=قراءة · ت=تعديل · ج=إنشاء · ح=حذف</div>
  </div>\` : '';

  const groups = match('groups مجموعات أدوار') ? \`<div class="card"><h3>مجموعات الأمان (\${o.groups.length})</h3><div class="tags">\${o.groups.map(g=>'<span class="tag role" title="'+esc(g.id)+'">'+esc(g.name)+'</span>').join('')}</div></div>\` : '';

  return head + '<div class="grid">' + groups + matrix + modelCards + '</div>';
}

function renderInfra(){
  const inf = A.infra;
  if(!inf) return '<div class="empty">لا بيانات بنية</div>';
  const LAYERS = ['العملاء','الاستضافة والحافة','البيانات والمصادقة','الخلفية'];
  const byLayer = l => inf.nodes.filter(n => n.layer===l && match(n.name+' '+n.tech+' '+n.role));

  const diagram = \`<div class="card diagram">
    <h3>مخطّط المعماريّة — طوبولوجيا الخدمات</h3>
    <div class="topo">\${LAYERS.map(l => {
      const ns = byLayer(l); if(!ns.length) return '';
      return \`<div class="layer"><div class="layer-lbl">\${esc(l)}</div><div class="layer-nodes">\${ns.map(n => \`
        <div class="node n-\${esc(n.id.split('-')[0])}">
          <b>\${esc(n.name)}</b>
          <span class="tech">\${esc(n.tech)}</span>
          <p>\${esc(n.role)}</p>
          \${n.url?'<code>'+esc(n.url)+'</code>':''}
          \${n.wraps?'<div class="meta"><span>يغلّف: <code>'+esc(n.wraps)+'</code></span></div>':''}
          \${n.identifier?'<div class="meta"><span>المعرّف: '+esc(n.identifier)+'</span></div>':''}
          \${n.refs&&n.refs.length?'<div class="tags">'+n.refs.map(r=>'<span class="tag">'+esc(r)+'</span>').join('')+'</div>':''}
        </div>\`).join('')}</div></div>\`;
    }).join('<div class="flow-down">▼</div>')}</div>
  </div>\`;

  const flows = match('flow تدفّق البيانات') ? \`<div class="card"><h3>تدفّق البيانات</h3>\${inf.edges.map(e=>{
    const nm=id=>{const x=inf.nodes.find(n=>n.id===id);return x?x.name:id;};
    return '<div class="flow-row"><span class="fnode">'+esc(nm(e.from))+'</span><span class="farrow">──▶</span><span class="fnode">'+esc(nm(e.to))+'</span><span class="flabel">'+esc(e.label)+'</span></div>';
  }).join('')}</div>\` : '';

  const pipes = \`<div class="card"><h3>خطوط CI/CD (\${inf.pipelines.length})</h3>\${inf.pipelines.filter(p=>match(p.name+' '+p.triggers.join(' '))).map(p=>\`
    <div class="rule"><b>\${esc(p.name)}</b><div class="tags">\${p.triggers.map(t=>'<span class="tag role">'+esc(t)+'</span>').join('')}</div><div class="meta"><code>\${esc(p.file)}</code></div></div>\`).join('')}</div>\`;

  const deps = match('deps تبعيّات dependencies') ? \`<div class="card"><h3>التبعيّات (\${inf.dependencies.runtime.length} تشغيل · \${inf.dependencies.dev.length} تطوير)</h3>
    <div class="meta"><span>تشغيل:</span></div><div class="tags">\${inf.dependencies.runtime.map(d=>'<span class="tag">'+esc(d)+'</span>').join('')}</div>
    <div class="meta"><span>تطوير:</span></div><div class="tags">\${inf.dependencies.dev.map(d=>'<span class="tag fld">'+esc(d)+'</span>').join('')}</div></div>\` : '';

  return diagram + '<div class="grid">' + flows + pipes + deps + '</div>';
}

function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function render(){
  const v = document.getElementById('view');
  v.innerHTML = TAB==='modules'?renderModules():TAB==='services'?renderServices():TAB==='rbac'?renderRbac():TAB==='odoo'?renderOdoo():renderInfra();
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
