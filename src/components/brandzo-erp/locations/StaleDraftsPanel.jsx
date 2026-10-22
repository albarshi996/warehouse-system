/**
 * ‹ODOO-ORD› لوحةُ «مسوّداتُ أودو القديمة» — في تبويب «مستندٌ منجَز ← يُرحَّل».
 *
 * تبحث (قراءةٌ واحدةٌ بالنوع عند الضغط، لا عند الفتح) عن مسوّدات التخزين والسحب المستورَدة من أودو قبل الافتتاح،
 * وتعرض عددَها ومراجعَها، ثمّ تلغيها كلَّها بسببٍ يُسجَّل على كلّ مستند — بمسار الإلغاء الجماعيّ نفسه.
 * والمنطقُ في `services/locations/staleDrafts.js`.
 */
import { useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { STALE_CANCEL_NOTE, sourceDayOf, summarizeStale } from '../../../services/locations/staleDrafts.js';
import { cancelStaleDrafts, fetchStaleOdooDrafts } from '../../../services/locations/staleDraftsService.js';
import { writeProgressLabel } from '../../../services/ui/leaveGuard.js';
import { useLeaveGuard } from '../../../services/ui/useLeaveGuard.js';

const muted = { fontSize: '12px', color: 'var(--o-main-color-muted)' };
const listStyle = { fontSize: '12px', margin: '8px 0 0', paddingInlineStart: '18px', lineHeight: 1.8 };
const TYPE_LABELS = { PUTAWAY: 'تخزين (استلام)', PICK: 'سحب (تسليم ونقل)' };

export default function StaleDraftsPanel({ profile, canAct }) {
  const [drafts, setDrafts] = useState(null);
  const [capped, setCapped] = useState(false);
  const [note, setNote] = useState(STALE_CANCEL_NOTE);
  const [busy, setBusy] = useState('');
  const [writing, setWriting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  useLeaveGuard(writing);

  async function find() {
    setBusy('يبحث…');
    setError('');
    setResult(null);
    try {
      const found = await fetchStaleOdooDrafts();
      setDrafts(found.drafts);
      setCapped(found.capped);
    } catch (err) {
      setError(err?.message || 'تعذّر البحث.');
    } finally {
      setBusy('');
    }
  }

  async function cancelAll() {
    setWriting(true);
    setError('');
    try {
      const out = await cancelStaleDrafts(drafts, profile, { note, onProgress: (p) => setBusy(writeProgressLabel(p)) });
      setResult(out);
      setDrafts(null);
    } catch (err) {
      setError(err?.message || 'تعذّر الإلغاء.');
    } finally {
      setBusy('');
      setWriting(false);
    }
  }

  const sum = drafts ? summarizeStale(drafts) : null;

  return (
    <div className="o_ds_card o_ds_pad" style={{ marginTop: '24px' }}>
      <h3 className="o_form_title" style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon name="archive" size={17} /> مسوّداتُ أودو القديمة
      </h3>
      <p style={{ ...muted, lineHeight: 1.7, margin: '0 0 12px' }}>
        قبل الترحيل استُوردت مستنداتُ أودو حتّى 19 أكتوبر مسوّداتِ تخزينٍ وسحب. أثرُها داخلٌ في الرصيد الافتتاحيّ، فإنجازُ أيٍّ منها
        يضاعفه — فتُلغى بسببٍ يُسجَّل على كلّ مستند، <strong>ولا تُحذف</strong>.
      </p>

      {error && <div className="o_alert danger" style={{ marginBottom: '12px' }}>{error}</div>}

      <button type="button" className="btn btn-secondary" disabled={!canAct || Boolean(busy)} onClick={find}>
        <Icon name="search" size={15} /> {busy && !writing ? busy : 'ابحث عنها'}
      </button>

      {capped && (
        <div className="o_alert warning" style={{ marginTop: '12px' }}>بلغت القراءةُ سقفَها — قد يبقى غيرُ ما ظهر. ألغِ هذه ثمّ ابحث مرّةً أخرى.</div>
      )}

      {sum && sum.total === 0 && (
        <div className="o_alert success" style={{ marginTop: '12px' }}>لا مسوّدةَ قديمة — لا شيء يُلغى.</div>
      )}

      {sum && sum.total > 0 && (
        <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '14px' }}>
            وُجد <strong>{sum.total}</strong> مسودّة:{' '}
            {Object.entries(sum.byType).filter(([, n]) => n).map(([t, n]) => `${TYPE_LABELS[t] || t} ${n}`).join(' · ')}
          </div>
          <details>
            <summary style={{ cursor: 'pointer', ...muted }}>المراجع ({sum.total})</summary>
            <ul style={{ ...listStyle, maxHeight: '220px', overflowY: 'auto' }}>
              {drafts.map((d) => (
                <li key={d.id}>
                  <span style={{ direction: 'ltr', display: 'inline-block' }}>{d.header?.sourceRef}</span> · {sourceDayOf(d)} · {d.header?.warehouse}
                </li>
              ))}
            </ul>
          </details>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
            السبب (إلزاميّ — يُسجَّل على كلّ مستند)
            <textarea className="o_input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={writing} />
          </label>
          <div>
            <button type="button" className="btn btn-primary" disabled={!canAct || writing || !note.trim()} onClick={cancelAll}>
              <Icon name="close" size={15} /> {writing ? busy : `ألغِ ${sum.total} مسودّة`}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className={`o_alert ${result.failed.length || result.blocked.length ? 'warning' : 'success'}`} style={{ marginTop: '12px' }}>
          <div className="o_alert_title">
            أُلغي {result.canceled.length}
            {result.failed.length > 0 && ` · تعذّر ${result.failed.length}`}
            {result.blocked.length > 0 && ` · لم يُسمح بـ${result.blocked.length}`}
          </div>
          {(result.failed.length > 0 || result.blocked.length > 0) && (
            <ul style={listStyle}>
              {result.failed.map((f) => (
                <li key={f.doc.id}>
                  <span style={{ direction: 'ltr', display: 'inline-block' }}>{f.doc.header?.sourceRef}</span> — {f.error}
                </li>
              ))}
              {result.blocked.map((b) => (
                <li key={b.doc.id}>
                  <span style={{ direction: 'ltr', display: 'inline-block' }}>{b.doc.header?.sourceRef}</span> — {b.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
