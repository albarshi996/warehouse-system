/**
 * نموذج «سجلّ حركة الأدوار» الحيّ — دوال خالصة (بلا Firestore/DOM) تدمج مصدرين
 * حقيقيّين إضافة-فقط في سجلّ نشاطٍ موحّد مرتّب بالأحدث:
 *
 *   1. رؤوس المستندات (`documents`) — واقعتا الإنشاء والاعتماد، كلٌّ بدور فاعلها
 *      (`createdByRole` / `approvedByRole`) واسمه ووقته.
 *   2. دفتر الحركات (`stock_moves`) — كل حركة مخزونٍ فعليّة، بدور من قيّدها
 *      (`postedByRole`) والصنف والكمية والاتجاه والمستند.
 *
 * لماذا هذان المصدران؟ لأنهما **مجموعتان عُلويّتان مقروءتان** للمدير بلا أي تغيير
 * قواعد، ويحملان الدور فعلًا — فالسجلّ حقيقيٌّ يمتلئ تلقائيًّا مع كل حركة، لا بذرة.
 */

/** يحوّل طابعًا زمنيًّا (Firestore Timestamp | {seconds} | ms | ISO) إلى ميلي ثانية، أو 0. */
export function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  if (typeof ts === 'string') {
    const n = Date.parse(ts);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

/** تنسيق وقتٍ مختصر عربيّ بأرقام لاتينية من ميلي ثانية. */
export function fmtWhen(ms) {
  if (!ms) return '—';
  try {
    return new Date(ms).toLocaleString('ar-LY-u-nu-latn', {
      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

/** وصفٌ مقروء لحركة مخزون. */
function moveNote(m) {
  const item = m.nameAr || m.sku || m.barcode || 'صنف';
  const qty = Number(m.qty) || 0;
  const label = m.reasonLabel || 'حركة مخزون';
  const from = m.from || '—';
  const to = m.to == null ? 'خارج المنشأة' : (m.to || '—');
  return `${label}: ${item} × ${qty} — من ${from} إلى ${to}`;
}

/**
 * يبني قائمة النشاط الموحّدة من المصدرين، مرتّبةً بالأحدث ومقصوصةً بالحدّ.
 * @param {{docs?: Array, moves?: Array, limit?: number}} src
 * @returns {Array} قيود موحّدة: {id, kind, action, atMs, roleId, actorName, docType, docNumber, note}
 */
export function buildActivity({ docs = [], moves = [], limit = 200 } = {}) {
  const out = [];

  for (const d of docs || []) {
    if (!d || !d.id) continue;
    const docType = d.type || '';
    const docNumber = d.number || '';
    out.push({
      id: `${d.id}:create`,
      kind: 'doc',
      action: 'create',
      atMs: toMillis(d.createdAt),
      roleId: d.createdByRole || '',
      actorName: d.createdByName || '',
      docType,
      docNumber: docNumber || '(مسودّة)',
      state: d.state || '',
      note: docNumber ? '' : 'مسودّة قبل الترقيم',
    });
    if (d.approvedAt || d.approvedByName) {
      out.push({
        id: `${d.id}:approved`,
        kind: 'doc',
        action: 'approved',
        atMs: toMillis(d.approvedAt),
        roleId: d.approvedByRole || '',
        actorName: d.approvedByName || '',
        docType,
        docNumber: docNumber || '',
        state: d.state || '',
        note: '',
      });
    }
  }

  for (const m of moves || []) {
    if (!m) continue;
    out.push({
      id: m.id || `${m.docId || 'move'}:${m.lineIndex ?? 0}`,
      kind: 'move',
      action: 'posted',
      atMs: toMillis(m.postedAt),
      roleId: m.postedByRole || '',
      actorName: m.postedByName || '',
      docType: m.docType || '',
      docNumber: m.docNumber || '',
      note: moveNote(m),
    });
  }

  out.sort((a, b) => b.atMs - a.atMs);
  return out.slice(0, limit);
}

/** ملخّصٌ للبطاقات العلوية. المسودّة لا تُحسب مستندًا متأثّرًا. */
export function activitySummary(entries) {
  const roles = new Set();
  const docs = new Set();
  let approvals = 0;
  for (const e of entries || []) {
    if (e.roleId) roles.add(e.roleId);
    if (e.docNumber && e.docNumber !== '(مسودّة)') docs.add(e.docNumber);
    if (e.action === 'approved') approvals += 1;
  }
  return { total: (entries || []).length, roles: roles.size, approvals, docs: docs.size };
}

/** الأدوار الفاعلة فعلًا مرتّبةً بعدد قيودها تنازليًّا (للمصفّي بالدور). */
export function activeRoles(entries) {
  const count = {};
  const order = [];
  for (const e of entries || []) {
    const id = e.roleId || 'unknown';
    if (!(id in count)) order.push(id);
    count[id] = (count[id] || 0) + 1;
  }
  return order.map((id) => ({ id, count: count[id] })).sort((a, b) => b.count - a.count);
}

/** أنواع الحركة الموجودة فعلًا بالترتيب المنطقيّ (للمصفّي بنوع الحركة). */
export function usedActions(entries) {
  const ORDER = ['create', 'submitted', 'approved', 'rejected', 'posted'];
  const count = {};
  for (const e of entries || []) count[e.action] = (count[e.action] || 0) + 1;
  return ORDER.filter((a) => count[a]).map((a) => ({ action: a, count: count[a] }));
}
