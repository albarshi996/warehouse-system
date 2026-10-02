/**
 * لوحةُ التعديل المحكوم والإزالة — التعديلُ في كلّ مرحلة (طلب المالك ٢ و٣).
 *
 * ═══ ★★★ لوحةٌ مستقلّةٌ لا زرُّ «حفظ» مفتوح ═══
 * كان يمكن أن يُفتح `editable` على `submitted`/`approved` فيصير زرُّ الحفظ
 * عاملًا — وذلك **خطأٌ جوهريّ**: التعديلُ بعد الإرسال فعلٌ من نوعٍ آخر، له
 * سببٌ إلزاميٌّ وقيدُ تدقيقٍ مفصَّل. وإخفاؤه خلف زرِّ «حفظ» العاديّ يجعله
 * يبدو روتينًا — وهو ما تمنعه قاعدةُ الخادم أصلًا (`contentUnchanged`).
 *
 * فاللوحةُ **تُعلن نفسَها**: تقول إنّ المستندَ خرج من يد صاحبه، وإنّ التعديلَ
 * سيُسجَّل حقلًا حقلًا، وتُلزِم بسببٍ قبل أن يُفتَح الزرّ. وتعرض **الفارقَ
 * المحسوبَ قبل الحفظ** — فمن يعدّل يرى بعينه ما سيُكتب في السجلّ باسمه.
 *
 * وكلُّ الحكم في `services/documents/amendGuard.js` الخالص المُختبَر.
 */
import { useMemo, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { int } from '../../odoo/format.js';
import {
  amendVerdict,
  headerDiff,
  linesDiff,
  hasChanges,
  removalOptions,
} from '../../../services/documents/amendGuard.js';
import { amendDocument, hardDeleteDraft } from '../../../services/documents/amendService.js';
import { transitionDocument } from '../../../services/documents/documentsService.js';

export default function AmendPanel({
  doc,
  savedDoc,
  schema,
  me,
  onFlash,
  onAmended,
  onRemoved,
  rulesPublished = false,
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [removeFor, setRemoveFor] = useState('');
  const [removeReason, setRemoveReason] = useState('');

  const user = { role: me?.role, uid: me?.uid };
  const verdict = useMemo(() => amendVerdict(savedDoc, user, { reason }), [savedDoc, me?.role, me?.uid, reason]);

  /** الفارقُ بين المحفوظ وما على الشاشة — يُعرض قبل الحفظ. */
  const headerChanges = useMemo(() => headerDiff(savedDoc?.header, doc?.header, schema), [savedDoc, doc, schema]);
  const lineChanges = useMemo(() => linesDiff(savedDoc?.lines, doc?.lines, schema), [savedDoc, doc, schema]);
  const changed = hasChanges(headerChanges, lineChanges);

  const removals = useMemo(
    () => removalOptions(savedDoc, user, { rulesPublished }),
    [savedDoc, me?.role, me?.uid, rulesPublished]
  );
  const offeredRemovals = removals.filter((r) => r.available);

  const governed = verdict.cls.id === 'governed';
  const sealed = verdict.cls.id === 'sealed';

  // لا لوحةَ على المسودّة: لها زرُّ الحفظ العاديّ، ولا إزالةَ غيرَ الإلغاء
  // الذي يُعرض في شريط الحالة أصلًا.
  if (!savedDoc || (!governed && !sealed && offeredRemovals.length === 0)) return null;

  async function doAmend() {
    if (busy) return;
    setBusy(true);
    try {
      const out = await amendDocument(savedDoc.id, {
        header: doc?.header,
        lines: doc?.lines,
        reason,
        profile: me,
      });
      if (!out.changed) onFlash?.('لا حقلَ تغيّر — لم يُكتب قيد.', 'err');
      else {
        onFlash?.(`عُدِّل المستندُ وسُجِّل ${int(out.headerChanges.length + out.lineChanges.length)} تغييرًا في سجلّ التدقيق.`);
        setReason('');
      }
      onAmended?.(out);
    } catch (e) {
      onFlash?.(e.message || 'تعذّر التعديل.', 'err');
    } finally {
      setBusy(false);
    }
  }

  async function doRemove(option) {
    if (busy) return;
    if (option.needsReason && !removeReason.trim()) {
      onFlash?.('اكتب السببَ أوّلًا.', 'err');
      return;
    }
    setBusy(true);
    try {
      if (option.id === 'cancel') {
        await transitionDocument(savedDoc.id, 'canceled', { note: removeReason, profile: me, schema });
        onFlash?.('أُلغي المستندُ — وبقي في السجلّ.');
      } else {
        await hardDeleteDraft(savedDoc.id, { reason: removeReason, profile: me });
        onFlash?.('مُحيت المسودّة.');
      }
      setRemoveFor('');
      setRemoveReason('');
      onRemoved?.(option.id);
    } catch (e) {
      onFlash?.(e.message || 'تعذّر الإجراء.', 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="o_theme" dir="rtl">
      <div
        className="o_ds_card o_ds_pad"
        style={{ border: '1px solid var(--o-gray-300)', background: 'var(--o-gray-100)' }}
      >
        <h3 className="o_form_title" style={{ fontSize: '15px', marginTop: 0, marginBottom: '8px' }}>
          <Icon name={sealed ? 'lock' : 'notebook'} size={15} /> {verdict.cls.label}
        </h3>
        <p style={{ margin: '0 0 12px', fontSize: 'var(--o-font-size-sm)', color: 'var(--o-main-color-muted)', lineHeight: 1.75 }}>
          {verdict.cls.hint}
        </p>

        {/* ── التعديلُ المحكوم ── */}
        {governed && (
          <>
            {!verdict.allowed && verdict.problem && !reason && (
              <div className="o_alert" style={{ marginBottom: '12px' }}>
                <div className="o_alert_title"><Icon name="shield" size={14} /> {verdict.problem}</div>
              </div>
            )}

            {/* ★★★ «منجَزٌ عندي ≠ وصل المستخدم»: الخادمُ اليومَ يقبل المدير
                العامَّ وحده، فيُقال ذلك **قبل** أن يُكتب تعديلٌ يرتدّ. */}
            {!verdict.serverReady && (verdict.allowed || !verdict.problem) && (
              <div className="o_alert danger" style={{ marginBottom: '12px' }}>
                <div className="o_alert_title">
                  <Icon name="alertTriangle" size={14} /> قواعدُ الأمان لم تُنشَر بعد
                </div>
                <p style={{ margin: '5px 0 0', fontSize: 'var(--o-font-size-xs)', lineHeight: 1.8 }}>
                  دورُك يملك التعديلَ في البوّابة، لكنّ الخادمَ لا يقبله بعد — فالقواعدُ
                  المنشورةُ تُتيحه للمدير العامّ وحده. سيرتدّ الحفظُ حتّى ينشر المالكُ
                  الرقعةَ (<span style={{ fontFamily: 'monospace', direction: 'ltr', unicodeBidi: 'isolate' }}>docs/رقعة-قواعد-التعديل-والمحو.md</span>).
                </p>
              </div>
            )}

            {/* الفارقُ يُعرض قبل الحفظ — فمن يعدّل يرى ما سيُكتب باسمه */}
            {changed ? (
              <div style={{ marginBottom: '12px' }}>
                <span style={{ fontSize: 'var(--o-font-size-xs)', fontWeight: 'var(--o-font-weight-bold)' }}>
                  ما سيُسجَّل في سجلّ التدقيق ({int(headerChanges.length + lineChanges.length)} موضعًا):
                </span>
                <ul style={{ margin: '6px 0 0', paddingInlineStart: '18px', fontSize: 'var(--o-font-size-xs)', lineHeight: 1.9 }}>
                  {headerChanges.slice(0, 12).map((c) => (
                    <li key={c.key}>
                      {c.label}: <Val v={c.before} /> ← <Val v={c.after} strong />
                    </li>
                  ))}
                  {lineChanges.slice(0, 12).map((c) => (
                    <li key={`L${c.row}`}>
                      بند {int(c.row)}:{' '}
                      {c.kind === 'added'
                        ? 'أُضيف'
                        : c.kind === 'removed'
                          ? 'حُذف'
                          : c.fields.map((f) => `${f.label}`).join('، ')}
                      {c.kind === 'changed' && (
                        <>
                          {' — '}
                          {c.fields.map((f, i) => (
                            <span key={f.key}>
                              {i > 0 && ' · '}
                              <Val v={f.before} /> ← <Val v={f.after} strong />
                            </span>
                          ))}
                        </>
                      )}
                    </li>
                  ))}
                  {headerChanges.length + lineChanges.length > 24 && (
                    <li>… و{int(headerChanges.length + lineChanges.length - 24)} موضعًا آخر</li>
                  )}
                </ul>
              </div>
            ) : (
              <p style={{ margin: '0 0 12px', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
                عدّل الحقولَ أعلاه، ثمّ اكتب السببَ واحفظ. ولا يُكتب قيدٌ على حفظٍ بلا تغيير.
              </p>
            )}

            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px', maxWidth: '620px' }}>
              <span style={{ fontSize: 'var(--o-font-size-xs)', fontWeight: 'var(--o-font-weight-bold)' }}>
                سببُ التعديل (إلزاميّ)
              </span>
              <input
                type="text"
                className="o_input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="مثال: المورّد صحّح فاتورته — الكمّيّة 95 لا 100"
                disabled={busy}
              />
            </label>

            <button
              type="button"
              className="btn btn-primary"
              onClick={doAmend}
              disabled={busy || !verdict.allowed || !changed}
            >
              <Icon name="checkCircle" size={15} /> {busy ? 'جارٍ…' : 'حفظُ التعديل وتسجيلُه'}
            </button>
          </>
        )}

        {/* ── المختوم: سببُ الختم والمخرجُ المشروع ── */}
        {sealed && (
          <p style={{ margin: 0, fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', lineHeight: 1.85 }}>
            {verdict.problem}
            <br />
            والمخرجُ المشروع: <strong>مستندٌ عكسيّ</strong> — مرتجعٌ أو إشعارٌ دائنٌ أو تسوية،
            يُنشأ من «إنشاء مستند لاحق» فيُصحّح الأثرَ ويبقى الأصلُ شاهدًا على ما جرى.
          </p>
        )}

        {/* ── الإزالة ── */}
        {offeredRemovals.length > 0 && (
          <div style={{ marginTop: governed || sealed ? '16px' : 0, paddingTop: governed || sealed ? '12px' : 0, borderTop: governed || sealed ? '1px solid var(--o-gray-300)' : 'none' }}>
            <span style={{ fontSize: 'var(--o-font-size-xs)', fontWeight: 'var(--o-font-weight-bold)' }}>إزالةُ المستند</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
              {offeredRemovals.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`btn btn-sm ${removeFor === r.id ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => { setRemoveFor(removeFor === r.id ? '' : r.id); setRemoveReason(''); }}
                  title={r.hint}
                  disabled={busy}
                >
                  <Icon name={r.id === 'cancel' ? 'ban' : 'x'} size={14} /> {r.label}
                </button>
              ))}
            </div>

            {removeFor && (
              <div style={{ marginTop: '10px', maxWidth: '620px' }}>
                <p style={{ margin: '0 0 8px', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', lineHeight: 1.8 }}>
                  {removals.find((r) => r.id === removeFor)?.hint}
                </p>
                <input
                  type="text"
                  className="o_input"
                  value={removeReason}
                  onChange={(e) => setRemoveReason(e.target.value)}
                  placeholder="السبب (إلزاميّ — يُسجَّل في سجلّ التدقيق)"
                  disabled={busy}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ marginTop: '8px' }}
                  onClick={() => doRemove(removals.find((r) => r.id === removeFor))}
                  disabled={busy || !removeReason.trim()}
                >
                  تأكيد: {removals.find((r) => r.id === removeFor)?.label}
                </button>
              </div>
            )}
          </div>
        )}

        {/* سببُ غياب المحو — فلا يظنّ المالكُ أنّ الطلبَ أُهمل */}
        {removals.some((r) => r.requiresRulesPublish) && (
          <p style={{ marginTop: '12px', marginBottom: 0, fontSize: '10.5px', color: 'var(--o-gray-500)', lineHeight: 1.8 }}>
            {removals.find((r) => r.requiresRulesPublish).problem}
          </p>
        )}
      </div>
    </div>
  );
}

function Val({ v, strong }) {
  const s = String(v ?? '').trim();
  const node = s === '' ? <em style={{ color: 'var(--o-gray-500)' }}>فراغ</em> : s;
  return strong ? <strong>{node}</strong> : <span>{node}</span>;
}
