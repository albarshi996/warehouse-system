/**
 * منطق الهيكل التنظيمي الخالص — بلا Firestore وبلا DOM.
 *
 * المصدر الواحد للحقيقة هو `src/data/org-structure.json`: منه تُولَّد الصفحة
 * التفاعلية والتقريران المنشوران وكتالوج الوظائف. كل تعديل على الشجرة يمرّ
 * من هنا، فلا تنشأ حالة غير صالحة (معرّف مكرّر · عقدة تُنقل داخل نفسها
 * · حذف الجذر).
 *
 * كل الدوال **لا تُعدّل مدخلاتها** — تُعيد شجرة جديدة، فالمقارنة قبل/بعد
 * (`diffTrees`) تبقى ممكنة دائمًا.
 */

/** أنواع العقد من الأعلى للأسفل — الترتيب يعني عمق الهرم لا أكثر. */
export const NODE_TYPES = ['management', 'section', 'unit', 'subunit'];

/** اسم النوع بالعربية — للعرض والطباعة. */
export const TYPE_LABELS = {
  management: 'إدارة',
  section: 'قسم',
  unit: 'وحدة',
  subunit: 'فريق',
};

/** مصدر العقدة: من التقرير المعتمد · من نصّ المالك · اقتراح قابل للحذف. */
export const SOURCE_LABELS = {
  report: 'من التقرير المعتمد',
  owner: 'باعتماد المالك',
  proposed: 'مقترح — يحتاج قرارك',
};

const kids = (node) => node.children || [];

/** نسخة عميقة آمنة (البيانات JSON خالصة). */
function clone(node) {
  return JSON.parse(JSON.stringify(node));
}

/**
 * يسطّح الشجرة إلى قائمة مرتّبة كترتيب العرض:
 * `[{ node, depth, parentId, path }]` حيث `path` مسار العناوين من الجذر.
 */
export function flatten(tree, depth = 0, parentId = null, path = []) {
  if (!tree) return [];
  const here = [...path, tree.title];
  const rows = [{ node: tree, depth, parentId, path: here }];
  for (const child of kids(tree)) {
    rows.push(...flatten(child, depth + 1, tree.id, here));
  }
  return rows;
}

/** يبحث عن عقدة بمعرّفها. */
export function findNode(tree, id) {
  return flatten(tree).find((r) => r.node.id === id)?.node || null;
}

/** مسار العناوين من الجذر حتى العقدة (شامل)، أو [] إن لم توجد. */
export function pathTo(tree, id) {
  return flatten(tree).find((r) => r.node.id === id)?.path || [];
}

/** معرّفات العقدة وكل أحفادها — أساس منع النقل داخل الذات. */
export function descendantIds(tree, id) {
  const node = findNode(tree, id);
  return node ? flatten(node).map((r) => r.node.id) : [];
}

/** عدّ العقد حسب النوع + الإجمالي. */
export function countByType(tree) {
  const out = { total: 0 };
  for (const t of NODE_TYPES) out[t] = 0;
  for (const { node } of flatten(tree)) {
    out.total += 1;
    if (node.type in out) out[node.type] += 1;
  }
  return out;
}

/** كم عقدة مقترحة ما زالت تنتظر قرار المالك؟ */
export function proposedCount(tree) {
  return flatten(tree).filter((r) => r.node.source === 'proposed').length;
}

/**
 * تحقّق شامل قبل الحفظ. يُعيد `{ ok, problems[] }` — لا يرمي، لأن الواجهة
 * تعرض المشاكل للمستخدم بدل أن تنهار.
 */
export function validateTree(tree) {
  const problems = [];
  if (!tree || !tree.id) return { ok: false, problems: ['الشجرة فارغة أو بلا جذر'] };

  const seen = new Map();
  for (const { node, depth, path } of flatten(tree)) {
    const where = path.join(' ← ');
    if (!node.id) problems.push(`عقدة بلا معرّف عند: ${where}`);
    else if (seen.has(node.id)) problems.push(`معرّف مكرّر «${node.id}»: ${seen.get(node.id)} و${where}`);
    else seen.set(node.id, where);

    if (!node.title || !String(node.title).trim()) problems.push(`عقدة بلا مسمّى عند العمق ${depth}`);
    if (node.type && !NODE_TYPES.includes(node.type)) {
      problems.push(`نوع غير معروف «${node.type}» في: ${where}`);
    }
  }
  return { ok: problems.length === 0, problems };
}

/** يطبّق تحويلًا على عقدة بعينها ويعيد شجرة جديدة. */
function mapNode(node, id, fn) {
  if (node.id === id) return fn(node);
  const children = kids(node);
  if (!children.length) return node;
  return { ...node, children: children.map((c) => mapNode(c, id, fn)) };
}

/** تعديل حقول عقدة (مسمّى · مسمّى إنجليزي · شاغل المنصب · ملاحظة · نوع). */
export function updateNode(tree, id, patch) {
  return mapNode(clone(tree), id, (n) => ({ ...n, ...patch }));
}

/**
 * إضافة عقدة تحت أب. المعرّف يجب أن يكون جديدًا — وإلّا تُرمى خطأ، لأن
 * التكرار يفسد كل شيء لاحقًا بصمت.
 */
export function addChild(tree, parentId, node) {
  if (findNode(tree, node.id)) throw new Error(`المعرّف «${node.id}» مستخدم بالفعل`);
  if (!findNode(tree, parentId)) throw new Error(`الأب «${parentId}» غير موجود`);
  const child = { source: 'proposed', children: [], ...node };
  return mapNode(clone(tree), parentId, (n) => ({ ...n, children: [...kids(n), child] }));
}

/** حذف عقدة بكل ما تحتها. الجذر لا يُحذف. */
export function removeNode(tree, id) {
  if (tree.id === id) throw new Error('لا يمكن حذف جذر الهيكل');
  if (!findNode(tree, id)) throw new Error(`العقدة «${id}» غير موجودة`);
  const strip = (n) => ({
    ...n,
    children: kids(n)
      .filter((c) => c.id !== id)
      .map(strip),
  });
  return strip(clone(tree));
}

/**
 * نقل عقدة تحت أب جديد. يرفض: نقل الجذر · النقل إلى الذات أو إلى أحد
 * أحفادها (يقطع الشجرة) · أب غير موجود.
 */
export function moveNode(tree, id, newParentId) {
  if (tree.id === id) throw new Error('لا يمكن نقل جذر الهيكل');
  const node = findNode(tree, id);
  if (!node) throw new Error(`العقدة «${id}» غير موجودة`);
  if (!findNode(tree, newParentId)) throw new Error(`الأب الجديد «${newParentId}» غير موجود`);
  if (descendantIds(tree, id).includes(newParentId)) {
    throw new Error('لا يمكن نقل عقدة إلى داخل نفسها أو أحد فروعها');
  }
  const detached = clone(node);
  return addChild(removeNode(tree, id), newParentId, detached);
}

/** ترتيب عقدة بين إخوتها (تحريك لأعلى/أسفل). `delta` = ‎-1‎ أو ‎+1‎. */
export function reorderNode(tree, id, delta) {
  const parentId = flatten(tree).find((r) => r.node.id === id)?.parentId;
  if (!parentId) throw new Error('لا يمكن ترتيب الجذر');
  return mapNode(clone(tree), parentId, (p) => {
    const list = [...kids(p)];
    const i = list.findIndex((c) => c.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return p;
    [list[i], list[j]] = [list[j], list[i]];
    return { ...p, children: list };
  });
}

/**
 * مقارنة نسختين من الشجرة — أساس عرض «قبل/بعد» في التقرير النهائي.
 * يُعيد `{ added, removed, renamed, moved }` بمعرّفات وعناوين مقروءة.
 */
export function diffTrees(before, after) {
  const A = new Map(flatten(before).map((r) => [r.node.id, r]));
  const B = new Map(flatten(after).map((r) => [r.node.id, r]));

  const added = [];
  const removed = [];
  const renamed = [];
  const moved = [];

  for (const [id, rb] of B) {
    const ra = A.get(id);
    if (!ra) {
      added.push({ id, title: rb.node.title, under: rb.path.slice(0, -1).join(' ← ') });
      continue;
    }
    if (ra.node.title !== rb.node.title) {
      renamed.push({ id, from: ra.node.title, to: rb.node.title });
    }
    if (ra.parentId !== rb.parentId) {
      moved.push({
        id,
        title: rb.node.title,
        from: ra.path.slice(0, -1).join(' ← ') || '—',
        to: rb.path.slice(0, -1).join(' ← ') || '—',
      });
    }
  }
  for (const [id, ra] of A) {
    if (!B.has(id)) removed.push({ id, title: ra.node.title, under: ra.path.slice(0, -1).join(' ← ') });
  }
  return { added, removed, renamed, moved };
}

/** هل هناك أي فرق بين النسختين؟ */
export function hasChanges(diff) {
  return Boolean(diff.added.length || diff.removed.length || diff.renamed.length || diff.moved.length);
}

/** بطاقات الوصف المرتبطة بعقدة بعينها. */
export function jobsOfNode(jobs, nodeId) {
  return (jobs || []).filter((j) => j.orgId === nodeId);
}

/** صفحات النظام الحيّ التي تخدم عقدة وكل ما تحتها (بلا تكرار). */
export function pagesOfBranch(tree, nodeId) {
  const node = nodeId ? findNode(tree, nodeId) : tree;
  if (!node) return [];
  const set = new Set();
  for (const { node: n } of flatten(node)) (n.pages || []).forEach((p) => set.add(p));
  return [...set];
}
