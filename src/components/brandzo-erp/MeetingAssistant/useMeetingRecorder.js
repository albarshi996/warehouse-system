import { useState, useRef, useEffect, useCallback } from 'react';
import { useAudioRecorder } from './useAudioRecorder.js';

/**
 * خطّاف تسجيل الاجتماع — التفريغ النصّيّ الحيّ + التسجيل الصوتيّ معًا.
 *
 * لماذا الاثنان بالتوازي؟ لأن `Web Speech API` **لا تفرّغ ملفًّا مسجّلًا**؛
 * تعمل على الميكروفون الحيّ لحظةً بلحظة فحسب. فلا سبيل لـ«سجّل ثمّ فرّغ».
 * الحلّ: `MediaRecorder` (عبر `useAudioRecorder`) يسجّل الصوت، و
 * `SpeechRecognition` يفرّغه، وكلاهما يقرأ الميكروفون نفسه في آنٍ واحد —
 * فنخرج بملفٍّ صوتيّ **ونصٍّ** معًا.
 *
 * ملاحظتان حدّيّتان في `Web Speech`: تحتاج إنترنت (Chrome يرسل الصوت لخوادم
 * Google)، وتعمل على Chrome/Edge/Safari لا Firefox. لذا الملف الصوتيّ هو
 * المرجع الموثوق، والنصّ مساعدٌ يُحرَّر يدويًّا عند الحاجة.
 */
export function useMeetingRecorder({ lang = 'ar-SA', timesliceMs = 15000, onError, onNotice } = {}) {
  const audio = useAudioRecorder({ timesliceMs });
  const {
    startAudio,
    stopAudio,
    pauseAudio,
    resumeAudio,
    resetAudio,
    downloadAudio,
    audioBlob,
    audioUrl,
    audioSupported,
  } = audio;

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [segments, setSegments] = useState([]); // [{ text, ts }]
  const [speechSupported, setSpeechSupported] = useState(true);

  // مرايا للحالة المتغيّرة — معالِجات التعرّف تُثبَّت مرّةً واحدة فلا تقرأ إغلاقًا بائتًا.
  const recognitionRef = useRef(null);
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);
  const interimRef = useRef('');
  const restartTimerRef = useRef(null);
  const langRef = useRef(lang);
  const cbRef = useRef({ onError, onNotice });
  const audioSupportedRef = useRef(audioSupported);

  useEffect(() => {
    cbRef.current = { onError, onNotice };
    langRef.current = lang;
    audioSupportedRef.current = audioSupported;
  });

  const notify = (msg) => cbRef.current.onNotice && cbRef.current.onNotice(msg);
  const fail = (msg) => cbRef.current.onError && cbRef.current.onError(msg);

  /** يُلحق مقطع نصّ مُفرَّغ — يلمس الحالة والمرايا فقط، فآمنٌ داخل معالِجٍ مثبَّت. */
  const appendSegment = (text) => {
    const clean = String(text || '').trim();
    if (!clean) return;
    setSegments((prev) => [...prev, { text: clean, ts: new Date().toISOString() }]);
  };

  const flushInterim = () => {
    const pending = interimRef.current.trim();
    if (pending) {
      appendSegment(pending);
      interimRef.current = '';
    }
  };

  // ── تهيئة التعرّف الصوتيّ مرّةً واحدة ──
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return undefined;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e) => {
      if (!isRecordingRef.current || isPausedRef.current) return;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript.trim();
        if (e.results[i].isFinal) {
          if (transcript) appendSegment(transcript);
        } else {
          interim += transcript;
        }
      }
      interimRef.current = interim;
    };

    recognition.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        fail('تعذّر الوصول للميكروفون — تحقّق من إذن المتصفّح');
      }
      // 'no-speech' / 'network' تسقط إلى onend فيُعيد التشغيل.
    };

    recognition.onend = () => {
      if (!isRecordingRef.current || isPausedRef.current) return;
      try {
        recognition.start();
      } catch {
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          if (isRecordingRef.current && !isPausedRef.current) {
            try {
              recognition.start();
            } catch {
              /* المحاولة القادمة من onend ستُعيد */
            }
          }
        }, 300);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      isRecordingRef.current = false;
      try {
        recognition.abort();
      } catch {
        /* تجاهل */
      }
      recognitionRef.current = null;
    };
  }, []);

  // ── المؤقّت — يدقّ أثناء التسجيل الفعليّ فقط (يتوقّف عند التعليق) ──
  useEffect(() => {
    if (!isRecording || isPaused) return undefined;
    const id = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isRecording, isPaused]);

  /** يبدأ التسجيل: يطلب الميكروفون للصوت، فيشغّل التفريغ الحيّ معه. */
  const start = useCallback(async () => {
    if (isRecordingRef.current) return;

    if (audioSupportedRef.current) {
      const ok = await startAudio();
      if (!ok) {
        fail('تعذّر الوصول للميكروفون — تحقّق من إذن المتصفّح');
        return;
      }
    }

    isRecordingRef.current = true;
    isPausedRef.current = false;
    setIsRecording(true);
    setIsPaused(false);
    setElapsedSec(0);
    interimRef.current = '';

    if (recognitionRef.current) {
      recognitionRef.current.lang = langRef.current;
      try {
        recognitionRef.current.start();
      } catch {
        /* بدأ سلفًا — تجاهل */
      }
    }
    notify('بدأ التسجيل');
  }, [startAudio]);

  /** يوقف التسجيل ويبني ملف الصوت. */
  const stop = useCallback(() => {
    isRecordingRef.current = false;
    isPausedRef.current = false;
    setIsRecording(false);
    setIsPaused(false);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* تجاهل */
      }
    }
    flushInterim();
    stopAudio();
    notify('حُفظ التسجيل');
  }, [stopAudio]);

  /** يعلّق التسجيل — الصوت والتفريغ معًا. */
  const pause = useCallback(() => {
    if (!isRecordingRef.current || isPausedRef.current) return;
    isPausedRef.current = true;
    setIsPaused(true);
    pauseAudio();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* تجاهل */
      }
    }
    flushInterim();
  }, [pauseAudio]);

  /** يستأنف بعد التعليق. */
  const resume = useCallback(() => {
    if (!isRecordingRef.current || !isPausedRef.current) return;
    isPausedRef.current = false;
    setIsPaused(false);
    resumeAudio();
    if (recognitionRef.current) {
      recognitionRef.current.lang = langRef.current;
      try {
        recognitionRef.current.start();
      } catch {
        /* بدأ سلفًا — تجاهل */
      }
    }
  }, [resumeAudio]);

  /** يمسح النصّ والصوت لبدء جلسةٍ نظيفة. */
  const reset = useCallback(() => {
    setSegments([]);
    setElapsedSec(0);
    resetAudio();
    interimRef.current = '';
  }, [resetAudio]);

  return {
    // الحالة
    isRecording,
    isPaused,
    elapsedSec,
    segments,
    speechSupported,
    audioSupported,
    audioBlob,
    audioUrl,
    // الأفعال
    start,
    stop,
    pause,
    resume,
    reset,
    setSegments, // للتحرير اليدويّ من المكوّن (حذف/تعديل مقطع)
    downloadAudio,
  };
}
