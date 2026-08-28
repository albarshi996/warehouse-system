/**
 * سجلّ زيارات البوّابة ‹VIS-301› — من دخل، ومن أيّ جهاز، وأيَّ شاشةٍ فتح.
 *
 * ═══ ثلاثُ طبقاتٍ كنمط لوحات البوّابة ═══
 *   ① تدخّلٌ الآن — **حسابٌ فُتح من جهازين في اليوم نفسه** (سؤال المالك).
 *   ② لقطة — كم زائرًا · كم جهازًا · أنشطُ الشاشات.
 *   ③ فهرسٌ كامل — الجدولُ الذي أقرّه المالك.
 *
 * ═══ ولا رقمَ يُحسب هنا ═══
 * `visitsSnapshot` و`multiDeviceAccounts` و`visitText` في المنطق الخالص
 * المختبَر — والشاشةُ تعرض.
 *
 * ═══ ★ والحسابُ بجهازين **سؤالٌ لا تهمة** ═══
 * قد يكون الموظّفُ نفسُه انتقل من هاتفه إلى حاسوبه. فتُعرض الحقيقةُ بلا حكم،
 * ويُقال ذلك في الشاشة صراحةً — فلا يُبنى على السجلّ ظنٌّ لا يحتمله.
 */
import React, { useEffect, useMemo, useState } from 'react';

import { listenVisits } from '../../../services/activity/visitService.js';
import {
  visitsSnapshot,
  multiDeviceAccounts,
  visitText,
  daysIn,
  dayKey,
} from '../../../services/activity/visitModel.js';

const box = { borderColor: 'var(--o-border)', background: 'var(--o-surface)' };

/** ساعةٌ ودقيقةٌ بأرقامٍ لاتينيّة (قاعدة البوّابة: أرقام لاتينية). */
function clockOf(ms) {
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function PortalVisits() {
  const [visits, setVisits] = useState([]);
  const [error, setError] = useState('');
  const [day, setDay] = useState('');
  const [who, setWho] = useState('');

  useEffect(
    () =>
      listenVisits(
        (list) => { setVisits(list); setError(''); },
        (e) =>
          setError(
            e?.code === 'permission-denied'
              ? 'سجلُّ الزيارات للمدير العامّ وحده — وهذا حدٌّ في قاعدة البيانات لا في الشاشة.'
              : e?.message || 'تعذّرت قراءة السجلّ.'
          )
      ),
    []
  );

  const days = useMemo(() => daysIn(visits), [visits]);
  const activeDay = day || days[0] || '';
  const snap = useMemo(() => visitsSnapshot(visits, activeDay), [visits, activeDay]);
  const flags = useMemo(() => multiDeviceAccounts(visits), [visits]);

  const rows = useMemo(
    () =>
      visits
        .filter((v) => (!activeDay || (v.at && dayKey(v.at) === activeDay)) && (!who || v.uid === who))
        .slice(0, 300),
    [visits, activeDay, who]
  );

  const people = useMemo(() => {
    const m = new Map();
    for (const v of visits) if (v.uid && !m.has(v.uid)) m.set(v.uid, v.userName || v.uid);
    return [...m.entries()];
  }, [visits]);

  if (error) {
    return (
      <div className="o_theme" dir="rtl">
        <div className="o_alert danger" style={{ fontSize: 'var(--o-font-size-sm)' }}>{error}</div>
      </div>
    );
  }

  return (
    <div className="o_theme" dir="rtl">
      {/* ① تدخّلٌ الآن — سؤال المالك أوّلَ ما يُرى. */}
      <section className="mb-6">
        <h2 className="text-lg font-bold text-ink mb-2">حسابٌ فُتح من أكثر من جهاز</h2>
        {flags.length === 0 ? (
          <p className="text-ink-2 text-sm">لا حساب فُتح من جهازين في يومٍ واحد.</p>
        ) : (
          <ul className="space-y-2">
            {flags.map((f) => (
              <li key={`${f.uid}-${f.day}`} className="rounded-lg border px-3 py-3" style={box}>
                <div className="font-bold text-ink">
                  {f.userName || f.uid} — {f.devices.length} أجهزة في {f.day}
                </div>
                <div className="text-xs text-ink-2 mt-1 tabular-nums" style={{ direction: 'ltr', textAlign: 'right' }}>
                  {f.devices.join(' · ')}
                </div>
                <button type="button" className="btn btn-secondary text-xs mt-2"
                  onClick={() => { setWho(f.uid); setDay(f.day); }}>
                  اعرض حركتَه ذلك اليوم
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-ink-2 text-xs mt-2 leading-relaxed">
          وهذا <strong className="text-ink">سؤالٌ لا تهمة</strong>: قد يكون الموظّفُ نفسُه انتقل من هاتفه
          إلى حاسوبه. اقرأ حركتَه قبل أن تحكم.
        </p>
      </section>

      {/* ② اللقطة. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-6">
        <Tile n={snap.users} label="زائرًا" />
        <Tile n={snap.devices} label="جهازًا" />
        <Tile n={snap.logins} label="تسجيلَ دخول" />
        <Tile n={snap.rows} label="حركةً مسجَّلة" />
      </div>

      {snap.topScreens.length > 0 && (
        <section className="mb-6">
          <h2 className="text-lg font-bold text-ink mb-2">أنشطُ الشاشات</h2>
          <ul className="flex flex-wrap gap-2">
            {snap.topScreens.map((t) => (
              <li key={t.path} className="rounded-lg border px-3 py-2 text-sm" style={box}>
                {t.label} <span className="text-ink-2 tabular-nums">· {t.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ③ الفهرسُ الكامل — جدولُ المالك. */}
      <section>
        <div className="flex flex-wrap gap-2 mb-3 items-end">
          <label className="block">
            <span className="text-xs text-ink-2">اليوم</span>
            <select value={activeDay} onChange={(e) => setDay(e.target.value)}
              className="rounded-lg border px-3 py-2 mt-1" style={box}>
              {days.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-ink-2">الموظّف</span>
            <select value={who} onChange={(e) => setWho(e.target.value)}
              className="rounded-lg border px-3 py-2 mt-1" style={box}>
              <option value="">الجميع</option>
              {people.map(([uid, name]) => <option key={uid} value={uid}>{name}</option>)}
            </select>
          </label>
        </div>

        {rows.length === 0 ? (
          <p className="text-ink-2 text-sm">لا حركةَ مسجَّلة بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="o_table w-full text-sm">
              <thead>
                <tr><th>الوقت</th><th>من</th><th>الجهاز</th><th>ماذا فعل</th></tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id}>
                    <td className="tabular-nums">{clockOf(v.at)}</td>
                    <td className="font-bold text-ink">{v.userName || v.uid}</td>
                    <td className="tabular-nums" style={{ direction: 'ltr', textAlign: 'right' }}>
                      {v.deviceId || '—'}
                      {v.devicePersisted === false && (
                        <span className="text-ink-2"> · مؤقّت</span>
                      )}
                    </td>
                    <td>{visitText(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-ink-2 text-xs mt-4 leading-relaxed">
        السجلُّ <strong className="text-ink">لا يُعدَّل ولا يُحذف</strong>. ولا يُسجَّل موقعٌ جغرافيّ
        ولا عنوانُ إنترنت — البوّابةُ بلا خادمٍ خاصّ، والمتصفّحُ هو من يكتب السطر. و«مؤقّت» بجانب
        رقم الجهاز تعني متصفّحًا يمنع التخزين، فرقمُه يتغيّر كلّ جلسة.
      </p>
    </div>
  );
}

function Tile({ n, label }) {
  return (
    <div className="rounded-lg border px-3 py-3 text-center" style={box}>
      <div className="text-xl font-bold text-ink tabular-nums">{n}</div>
      <div className="text-xs text-ink-2 mt-1">{label}</div>
    </div>
  );
}
