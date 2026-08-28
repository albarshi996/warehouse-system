/**
 * جردُ الطبالي الميدانيّ — «رأيتُها» لا «عددتُها».
 *
 * ═══ ولماذا شاشةٌ رابعةٌ لا وضعٌ في شاشة المسح؟ ═══
 * قِيس الأمر لا خُمِّن: شاشةُ المسح (`ScanFlow.jsx`) تحمل وضعَ «جرد» وتعدّ
 * **صنفًا صنفًا** — وهو صحيحٌ لما وُضع له. وهذا الجردُ عكسُه تمامًا: يمسح
 * **حاويةً** ولا يعدّ محتواها، ويحرسه عقدٌ صريحٌ بألّا يُعرض رقمٌ واحد.
 * ودسُّه في مكوّنٍ من ألفٍ ومئتي سطرٍ يعمل جراحةٌ في شاشةٍ تعمل — وتفويض
 * المالك يمنعها. وليس «صفحةً فوق صفحة» (ح-٤) لأنّ الوظيفة غير موجودةٍ
 * أصلًا: لا شاشةَ اليوم تشهد برؤية حمولةٍ مغلقة.
 *
 * ═══ القاعدة الحاكمة: ق-٢ / ح-٣ ═══
 * **لا رقمَ للعادّ.** ما يُعرض بعد المسح يأتي كلُّه من `counterView` — وهي
 * لا تحمل حقلَ كمّيّةٍ أصلًا. فمن أراد إظهار كمّيّةٍ سيحتاج مسارًا آخر،
 * ويصطدم بالاختبار الذي يحرس هذا العقد.
 */
import React, { useEffect, useMemo, useState } from 'react';

import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { SIGHTING, recordSighting } from '../../../services/lpn/countService.js';
import { sightingTotals } from '../../../services/lpn/countPallet.js';
import { uiGate } from '../../../services/lpn/lpnRoles.js';
import {
  useBarcodeCamera,
  ScanCameraButton,
  ScanCameraPanel,
} from '../scan/BarcodeCamera.jsx';
import { useWedgeScanner } from '../scan/useWedgeScanner.js';
import { normalizeScanned } from '../../../services/scan/scanEngine.js';

export default function CountFlow() {
  const [me, setMe] = useState(null);
  const [bin, setBin] = useState('');
  const [code, setCode] = useState('');
  const [sighting, setSighting] = useState('SEALED');
  const [session, setSession] = useState({ sightings: [] });
  const [view, setView] = useState(null);
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);

  // معرّفُ الجلسة ثابتٌ ما دامت الصفحة مفتوحة — يدخل في معرّف الحدث
  // الحتميّ فإعادةُ المسح تكتب فوق نفسها ولا تُسجّل مشاهدتين.
  const [sessionId] = useState(() => `C${Date.now().toString(36)}`);

  const actorName = me?.name || me?.displayName || me?.email || '';
  const gate = uiGate(me?.role, 'COUNT');
  const totals = useMemo(() => sightingTotals(session), [session]);

  useEffect(() => subscribeAuth(async (u) => setMe(u ? await fetchUserProfile(u) : null)), []);

  function say(kind, text) {
    setFlash({ kind, text });
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(kind === 'ok' ? 40 : [80, 60, 80]);
    }
  }

  async function submit(e, scanned) {
    e?.preventDefault?.();
    const lpn = String(scanned ?? code).trim();
    if (!lpn) return;
    if (!bin.trim()) { say('err', 'امسح باركود الموقع أوّلًا — مشاهدةٌ بلا موقعٍ لا تُفيد الجرد.'); return; }
    if (!actorName) { say('err', 'لم تُقرأ هويّتك بعد — أعد تحميل الصفحة.'); return; }

    setBusy(true);
    try {
      const r = await recordSighting(session, lpn, { bin, sighting, actor: actorName, sessionId });
      if (r.problem) { say('err', r.problem); setView(null); return; }
      setSession(r.session);
      setView(r.view);
      setCode('');
      say('ok', r.view.hint);
    } catch (err) {
      say('err', err?.message || 'تعذّر تسجيل المشاهدة.');
    } finally { setBusy(false); }
  }

  // القراءةُ تتبع الحقل المنتظِر: الموقعُ أوّلًا ثمّ الطبالي تباعًا.
  const onScanned = (c) => {
    const v = normalizeScanned(c);
    if (!bin.trim()) { setBin(v); return; }
    submit(null, v);
  };

  const camera = useBarcodeCamera({ onCode: onScanned });
  useWedgeScanner(onScanned, { enabled: true });

  return (
    <div className="o_theme" dir="rtl">
      {!gate.allowed && (
        <div className="o_alert danger mb-3" style={{ fontSize: 'var(--o-font-size-sm)' }}>{gate.message}</div>
      )}
      {flash && (
        <div
          className="mb-3 rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: flash.kind === 'ok' ? 'var(--o-border)' : 'var(--o-danger, #b42318)' }}
        >
          {flash.text}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="rounded-lg border px-3 py-2 text-center" style={{ borderColor: 'var(--o-border)' }}>
          <div className="text-xl font-bold text-ink tabular-nums">{totals.seen}</div>
          <div className="text-xs text-ink-2">طبليةً شوهدت</div>
        </div>
        <div className="rounded-lg border px-3 py-2 text-center" style={{ borderColor: 'var(--o-border)' }}>
          <div className="text-xl font-bold text-ink tabular-nums">{totals.sealed ?? 0}</div>
          <div className="text-xs text-ink-2">مغلقةً سليمة</div>
        </div>
      </div>

      <label className="block mb-3">
        <span className="text-xs text-ink-2">الموقع الحاليّ</span>
        <div className="flex gap-2 mt-1">
          <input
            value={bin}
            onChange={(e) => setBin(e.target.value)}
            placeholder="امسح باركود الرفّ"
            className="flex-1 rounded-lg border px-4 py-3"
            style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface)', direction: 'ltr', textAlign: 'center' }}
            autoComplete="off"
          />
          <ScanCameraButton camera={camera} compact />
        </div>
      </label>
      <ScanCameraPanel camera={camera} hint="امسح الرفّ أوّلًا، ثمّ الطبالي فيه واحدةً تلو أخرى." />

      {/* ★ حالُ المشاهدة يُختار قبل المسح — لا يُسأل عنه بعده فيُبطئ العدّ. */}
      <div className="flex flex-wrap gap-2 mb-3">
        {Object.entries(SIGHTING).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSighting(id)}
            aria-pressed={sighting === id}
            className={sighting === id ? 'btn btn-primary text-sm' : 'btn btn-secondary text-sm'}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="امسح ملصق الطبلية"
          className="w-full rounded-lg border px-4 py-4 text-lg mb-2"
          style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface)', direction: 'ltr', textAlign: 'center' }}
          autoComplete="off"
          enterKeyHint="go"
          disabled={!gate.allowed}
        />
        <button type="submit" className="btn btn-primary w-full py-3" disabled={busy || !gate.allowed || !code.trim()}>
          سجّل المشاهدة
        </button>
      </form>

      {/* ★★ ما يُعرض للعادّ — نصٌّ ووصفٌ ولا رقمَ واحد (ح-٣). */}
      {view && (
        <div className="rounded-lg border px-4 py-3 mt-4" style={{ borderColor: 'var(--o-border)' }}>
          <div className="font-bold text-ink tabular-nums">{view.lpn}</div>
          <div className="text-ink-2 text-sm mt-1">{view.status} · {view.bin}</div>
          {view.itemsHint && <div className="text-ink-2 text-sm mt-1">تحمل: {view.itemsHint}</div>}
          <div className={view.needsManualCount ? 'text-sm mt-2 font-bold text-ink' : 'text-sm mt-2 text-ink-2'}>
            {view.hint}
          </div>
        </div>
      )}

      <p className="text-ink-2 text-xs mt-4 leading-relaxed">
        الطبليةُ المغلقةُ سليمةُ الختم <strong>تُشهَد ولا تُعدّ</strong> — وهذه شهادةُ رؤيةٍ لا كمّيّة،
        فلا تُغيّر رصيدًا. والمفتوحةُ أو التالفة تُعدّ صنفًا صنفًا من شاشة المسح كالمعتاد.
      </p>
    </div>
  );
}
