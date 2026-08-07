import { useState, useRef, useEffect } from 'react';
import { useAudioRecorder } from '../brandzo-erp/MeetingAssistant/useAudioRecorder.js';

/**
 * مسجّل اجتماع «غرفة القرار» — شريط تسجيل صوتي مضغوط.
 *
 * يعيد استخدام `useAudioRecorder` من مساعد الاجتماعات حرفيًّا (منطق التسجيل
 * في مكان واحد — قاعدة المستودع): بدء/إيقاف مؤقت/استئناف/إيقاف + مشغّل
 * استماع + **تنزيل محلي** للملف (webm/opus؛ الصوت لا يغادر الجهاز — قرار
 * المالك الثابت من مساعد الاجتماعات).
 */
export default function MeetingRecorderDock() {
  const {
    audioBlob, audioUrl, audioSupported,
    startAudio, stopAudio, pauseAudio, resumeAudio, resetAudio, downloadAudio,
  } = useAudioRecorder();

  /** idle → recording ⇄ paused → stopped(idle+blob) */
  const [phase, setPhase] = useState('idle');
  const [denied, setDenied] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const tickRef = useRef(null);

  useEffect(() => () => clearInterval(tickRef.current), []);

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  async function onStart() {
    setDenied(false);
    resetAudio();
    const ok = await startAudio();
    if (!ok) { setDenied(true); return; }
    setSeconds(0);
    setPhase('recording');
    tickRef.current = setInterval(() => setSeconds((v) => v + 1), 1000);
  }

  function onPause() { pauseAudio(); setPhase('paused'); clearInterval(tickRef.current); }
  function onResume() { resumeAudio(); setPhase('recording'); tickRef.current = setInterval(() => setSeconds((v) => v + 1), 1000); }
  function onStop() { stopAudio(); setPhase('idle'); clearInterval(tickRef.current); }
  function onDownload() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadAudio(`غرفة-قرار-سلاسل-الإمداد-${stamp}`);
  }

  if (!audioSupported) return null;

  return (
    <div className="er-recorder" dir="rtl">
      {phase === 'idle' && !audioBlob && (
        <button type="button" className="er-rec-btn" onClick={onStart} title="تسجيل صوت الاجتماع — يُحفظ على جهازك فقط">
          <span className="er-dot" /> تسجيل الاجتماع
        </button>
      )}
      {phase !== 'idle' && (
        <span className="er-rec-live">
          <span className={`er-dot ${phase === 'recording' ? 'on' : ''}`} />
          <b>{fmt(seconds)}</b>
          {phase === 'recording'
            ? <button type="button" onClick={onPause}>إيقاف مؤقت</button>
            : <button type="button" onClick={onResume}>استئناف</button>}
          <button type="button" className="er-stop" onClick={onStop}>إنهاء</button>
        </span>
      )}
      {phase === 'idle' && audioBlob && (
        <span className="er-rec-done">
          <audio src={audioUrl} controls preload="metadata" />
          <button type="button" onClick={onDownload}>تنزيل الصوت</button>
          <button type="button" className="er-again" onClick={onStart}>تسجيل جديد</button>
        </span>
      )}
      {denied && <small className="er-denied">تعذّر الوصول للميكروفون — تحقّق من إذن المتصفح</small>}
    </div>
  );
}
