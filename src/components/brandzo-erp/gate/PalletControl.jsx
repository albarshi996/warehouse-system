/**
 * الطبلياتُ العائدة ‹GATE-303› — الأرصدةُ الستّ وجدولُ الأطراف.
 *
 * ═══ ★ ق-١: الاسمُ ليس تفصيلًا ═══
 * «الطبالي» في هذه البوّابة **هويّةُ حمولةٍ بباركود** (LPN)، وهذه **الخشبةُ
 * نفسُها** تُعدّ وتُردّ. ولو حملا الاسمَ نفسه ظهر رقمان اسمُهما «عدد
 * الطبليات» لا يتّفقان أبدًا. فلا تُكتب «طبليات» مجرّدةً في هذه الشاشة.
 *
 * ═══ ولا رقمَ يُحسب هنا ═══
 * `palletBalance` في المنطق الخالص المختبَر — والشاشةُ تعرض. وأهمُّ ما
 * تعرضه ليس الرقمَ بل **اتّجاهَه**: أعندنا خشبُه أم عنده خشبُنا؟
 */
import React, { useEffect, useMemo, useState } from 'react';

import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenPalletMoves, recordPalletAdjustment } from '../../../services/gate/gateService.js';
import {
  palletBalance,
  balanceText,
  movesOfParty,
  moveKind,
  UNKNOWN_PARTY,
} from '../../../services/gate/palletLedger.js';
import { PALLET_OWNERSHIP, PALLET_TYPES, PALLET_CONDITIONS, palletOwnershipLabel, palletTypeLabel, palletConditionLabel } from '../../../services/gate/gateModel.js';
import { canWriteGate } from '../../../services/gate/gateRoles.js';

const box = { borderColor: 'var(--o-border)', background: 'var(--o-surface)' };

/** الأرصدةُ الستّ — بترتيبها في ورقة المالك، وكلٌّ بشرحِ ما يعنيه. */
const TILES = [
  { key: 'onSite', label: 'إجمالي الطبليات العائدة بالموقع', hint: 'خشبُنا وخشبُ غيرنا معًا' },
  { key: 'companyOnSite', label: 'ملك الشركة', hint: 'خشبُنا الموجود عندنا' },
  { key: 'othersWithUs', label: 'ملك الموردين لدينا', hint: 'دَينٌ عينيٌّ علينا' },
  { key: 'oursWithOthers', label: 'ملكُنا لدى جهاتٍ خارجيّة', hint: 'دَينٌ عينيٌّ لنا' },
  { key: 'damaged', label: 'تالفة', hint: 'عبرت البوّابة تالفةً أو شُطبت' },
  { key: 'underReview', label: 'تحت المراجعة', hint: 'لا تُحسب سليمةً ولا تُشطب بعد' },
];

export default function PalletControl() {
  const [me, setMe] = useState(null);
  const [moves, setMoves] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [openParty, setOpenParty] = useState('');
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ kind: 'OPENING', count: '', party: '', ownership: 'company', type: 'STD', condition: 'sound', note: '' });

  useEffect(() => subscribeAuth(async (u) => setMe(u ? await fetchUserProfile(u) : null)), []);
  useEffect(
    () =>
      listenPalletMoves(
        (list) => { setMoves(list); setLoadError(''); },
        (e) => setLoadError(e?.message || 'تعذّرت قراءة الدفتر.')
      ),
    []
  );

  const canWrite = canWriteGate(me?.role);
  const { parties, totals, moves: counted } = useMemo(() => palletBalance(moves), [moves]);
  const partyRows = useMemo(
    () => (openParty ? movesOfParty(moves, openParty.split('||')[0], openParty.split('||')[1]) : []),
    [moves, openParty]
  );

  async function submitAdjustment(e) {
    e?.preventDefault?.();
    setBusy(true);
    try {
      await recordPalletAdjustment({ ...form, party: form.party || UNKNOWN_PARTY }, me);
      setFlash({ kind: 'ok', text: 'سُجّل السطر — ولا يُعدَّل بعدها.' });
      setForm((f) => ({ ...f, count: '', note: '' }));
    } catch (err) {
      setFlash({ kind: 'err', text: err?.message || 'تعذّر التسجيل.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="o_theme" dir="rtl">
      {loadError && <div className="o_alert danger mb-3" style={{ fontSize: 'var(--o-font-size-sm)' }}>{loadError}</div>}
      {flash && (
        <div className="mb-3 rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: flash.kind === 'ok' ? 'var(--o-border)' : 'var(--o-danger, #b42318)' }} role="status">
          {flash.text}
        </div>
      )}

      {/* الأرصدةُ الستّ — الطبقةُ الأولى: تدخّلٌ الآن. */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mb-6">
        {TILES.map((t) => (
          <div key={t.key} className="rounded-lg border px-3 py-3" style={box}>
            <div className="text-2xl font-bold text-ink tabular-nums">{totals[t.key]}</div>
            <div className="text-xs text-ink font-bold mt-1">{t.label}</div>
            <div className="text-xs text-ink-2 mt-1">{t.hint}</div>
          </div>
        ))}
      </div>

      {/* جدولُ الأطراف — الطبقةُ الثانية: من له علينا ومن لنا عليه. */}
      <section className="mb-6">
        <h2 className="text-lg font-bold text-ink mb-2">رصيدُ كلّ طرف</h2>
        {parties.length === 0 ? (
          <p className="text-ink-2 text-sm">
            لا حركةَ طبلياتٍ بعد. تُكتب الأسطرُ آليًّا لحظةَ تسجيل الدخول أو الخروج في مركز البوابة —
            وما كان في الموقع قبل بدء التسجيل يُدخَل رصيدًا افتتاحيًّا أدناه.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="o_table w-full text-sm">
              <thead>
                <tr>
                  <th>الطرف</th><th>الملكيّة</th><th>دخل</th><th>خرج</th><th>الرصيد</th><th>ماذا يعني</th><th></th>
                </tr>
              </thead>
              <tbody>
                {parties.map((p) => {
                  const key = `${p.party}||${p.ownership}`;
                  return (
                    <tr key={key}>
                      <td className="font-bold text-ink">{p.party}</td>
                      <td>{palletOwnershipLabel(p.ownership)}</td>
                      <td className="tabular-nums">{p.in}</td>
                      <td className="tabular-nums">{p.out}</td>
                      <td className="tabular-nums font-bold">{p.balance}</td>
                      <td className="text-ink-2">{balanceText(p)}</td>
                      <td>
                        <button type="button" className="btn btn-secondary text-xs"
                          onClick={() => setOpenParty(openParty === key ? '' : key)}>
                          {openParty === key ? 'أغلِق' : 'الحركات'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* حركاتُ طرفٍ — الطبقةُ الثالثة: الفهرسُ الكامل. */}
      {openParty && (
        <section className="mb-6">
          <h2 className="text-lg font-bold text-ink mb-2">حركاتُ «{openParty.split('||')[0]}»</h2>
          <div className="overflow-x-auto">
            <table className="o_table w-full text-sm">
              <thead>
                <tr><th>الحركة</th><th>العدد</th><th>النوع</th><th>الحال</th><th>اللوحة</th><th>البيان</th></tr>
              </thead>
              <tbody>
                {partyRows.map((m, i) => (
                  <tr key={`${m.visitId}-${i}`}>
                    <td>{moveKind(m.kind)?.label || m.kind}</td>
                    <td className="tabular-nums">{m.count}</td>
                    <td>{palletTypeLabel(m.type)}</td>
                    <td>{palletConditionLabel(m.condition)}</td>
                    <td className="tabular-nums" style={{ direction: 'ltr' }}>{m.plate || '—'}</td>
                    <td className="text-ink-2">{m.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* المدخلُ اليدويّ الوحيد — لما لم يعبر البوّابة. */}
      <section className="rounded-lg border px-4 py-4" style={box}>
        <h2 className="text-lg font-bold text-ink mb-1">رصيدٌ افتتاحيّ أو شطبُ تالف</h2>
        <p className="text-xs text-ink-2 mb-3">
          الأسطرُ العاديّة تُكتب آليًّا من البوّابة. وهذا المدخلُ لما لم يعبرها:
          ما كان في الموقع قبل بدء التسجيل، أو شطبُ تالفٍ ومفقود.
          <strong className="text-ink"> ولا سطرَ يُعدَّل أو يُحذف بعد كتابته — كلُّ تصحيحٍ سطرٌ جديدٌ بسببه.</strong>
        </p>
        <form onSubmit={submitAdjustment} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="نوع الحركة">
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}
              className="w-full rounded-lg border px-3 py-2" style={box} disabled={!canWrite}>
              <option value="OPENING">رصيد افتتاحيّ</option>
              <option value="WRITE_OFF">شطب (تالف أو مفقود)</option>
            </select>
          </Field>
          <Field label="العدد">
            <input value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} inputMode="numeric"
              className="w-full rounded-lg border px-3 py-2" style={{ ...box, direction: 'ltr', textAlign: 'center' }} disabled={!canWrite} />
          </Field>
          <Field label="الطرف">
            <input value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value })}
              className="w-full rounded-lg border px-3 py-2" style={box} disabled={!canWrite} placeholder={UNKNOWN_PARTY} />
          </Field>
          <Field label="الملكيّة">
            <select value={form.ownership} onChange={(e) => setForm({ ...form, ownership: e.target.value })}
              className="w-full rounded-lg border px-3 py-2" style={box} disabled={!canWrite}>
              {PALLET_OWNERSHIP.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="النوع">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full rounded-lg border px-3 py-2" style={box} disabled={!canWrite}>
              {PALLET_TYPES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="الحال">
            <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}
              className="w-full rounded-lg border px-3 py-2" style={box} disabled={!canWrite}>
              {PALLET_CONDITIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="البيان (مُلزَم — متى جُرد ومن جرده، أو لماذا شُطب)">
              <textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
                className="w-full rounded-lg border px-3 py-2" style={box} disabled={!canWrite} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn btn-primary py-3" disabled={busy || !canWrite}>سجّل السطر</button>
          </div>
        </form>
      </section>

      <p className="text-ink-2 text-xs mt-4 leading-relaxed">
        الدفترُ يحمل {counted} حركةً. و«الطبليات العائدة» غيرُ «الطبالي» في التنفيذ الميدانيّ:
        تلك هويّةُ حمولةٍ بباركود، وهذه الخشبةُ نفسُها تُعدّ وتُردّ (قرار المالك ق-١).
      </p>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs text-ink-2">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
