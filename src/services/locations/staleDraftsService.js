/**
 * ‹ODOO-ORD› قراءةُ مسوّدات أودو القديمة وإلغاؤها — راجع `staleDrafts.js`.
 *
 * ★★★ الإلغاءُ حلقةٌ على مُنفِّذ الجماعيّ (`planBulk` ثمّ `runBulk`) لا طريقٌ ثانٍ إلى الحالة: كلُّ مستندٍ يمرّ بـ
 *     `transitionDocument` وحرّاسه وصلاحيّاته، ويُكتب سببُه في سجلّ تدقيقه. والسقفُ خمسون في الدفعة كما في الشاشة.
 */
import { collection, getDocs, limit, query, where, db } from '../_db/index.js';
import { planBulk } from '../documents/bulkActions.js';
import { runBulk } from '../documents/bulkActionsService.js';
import { STALE_DRAFT_TYPES, STALE_SCAN_LIMIT, isStaleOdooDraft, sourceDayOf } from './staleDrafts.js';

/**
 * قراءةٌ واحدةٌ بالنوع بسقف (لا اشتراك)، ثمّ القاعدةُ الضيّقة — مرتّبةً بالتاريخ فالمرجع.
 * @returns {Promise<{drafts:object[], scanned:number, capped:boolean}>}
 */
export async function fetchStaleOdooDrafts() {
  const snap = await getDocs(query(collection(db, 'documents'), where('type', 'in', [...STALE_DRAFT_TYPES]), limit(STALE_SCAN_LIMIT)));
  const drafts = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((d) => isStaleOdooDraft(d))
    .sort((a, b) => sourceDayOf(a).localeCompare(sourceDayOf(b)) || String(a.header?.sourceRef).localeCompare(String(b.header?.sourceRef)));
  return { drafts, scanned: snap.size, capped: snap.size >= STALE_SCAN_LIMIT };
}

/**
 * يلغيها دفعةً بعد دفعة. فشلُ مستندٍ لا يوقف إخوتَه، وما رفضته الخطّةُ (صلاحيّةٌ أو حالةٌ تغيّرت) يُسمّى بسببه.
 * @returns {Promise<{canceled:object[], failed:{doc:object, error:string}[], blocked:{doc:object, reason:string}[]}>}
 */
export async function cancelStaleDrafts(docs, profile, { note, onProgress } = {}) {
  if (!String(note || '').trim()) throw new Error('السببُ إلزاميّ — يُسجَّل على كلّ مستند.');
  const user = { role: profile?.role, uid: profile?.uid };
  const canceled = [];
  const failed = [];
  const blocked = [];
  let done = 0;
  let rest = docs || [];
  while (rest.length) {
    const plan = planBulk(rest, 'cancel', user, { note });
    blocked.push(...plan.blocked);
    if (!plan.canRun) break;
    await runBulk(plan, {
      note,
      profile,
      onProgress: ({ doc, phase, error }) => {
        if (phase === 'ok') canceled.push(doc);
        else if (phase === 'fail') failed.push({ doc, error });
        else return;
        done += 1;
        onProgress?.({ written: done, total: docs.length });
      },
    });
    rest = plan.deferred;
  }
  return { canceled, failed, blocked };
}
