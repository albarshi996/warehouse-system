import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * تسجيل الصوت وحده (`MediaRecorder`) — بلا تفريغ نصّيّ.
 *
 * استُخرج ليُشارَك بين مُسجّل الاجتماع الجماعي (`useMeetingRecorder`، يجمعه مع
 * التفريغ) و«مساعد الاجتماعات» (يبقي تفريغه القائم كما هو). فمنطق التسجيل
 * الصوتيّ في مكانٍ واحد لا يتكرّر.
 *
 * الصوت يُقسَّم زمنيًّا (`timeslice`) فلا تتراكم ساعةُ اجتماعٍ دفعةً واحدة
 * وينهار المتصفّح، ثم يُجمَع Blob واحدًا عند الإيقاف. صيغته `webm/opus`:
 * خفيفة ومدعومة على Chrome/Edge/Firefox؛ وSafari يسقط إلى `mp4`. الصوت
 * يُنزَّل محليًّا فقط (قرار المالك) ولا يُرفع لأيّ سحابة.
 */

/** أفضل صيغة تسجيل يدعمها المتصفّح — الأخفّ أولًا. */
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

/** امتداد الملف الموافق للصيغة المسجَّلة. */
export function extForMime(type) {
  if (!type) return 'webm';
  if (type.includes('mp4')) return 'm4a';
  if (type.includes('ogg')) return 'ogg';
  return 'webm';
}

export function useAudioRecorder({ timesliceMs = 15000 } = {}) {
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioSupported, setAudioSupported] = useState(true);

  const recRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const mimeRef = useRef('');
  const blobRef = useRef(null);

  useEffect(() => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setAudioSupported(false);
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  /** يبدأ التسجيل الصوتيّ ويُعيد true عند النجاح (false إن رُفض الميكروفون). */
  const startAudio = useCallback(async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      mimeRef.current = mimeType;
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeRef.current || 'audio/webm' });
        chunksRef.current = [];
        blobRef.current = blob;
        setAudioBlob(blob);
        setAudioUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
      };
      recRef.current = rec;
      rec.start(timesliceMs);
      return true;
    } catch {
      return false;
    }
  }, [timesliceMs]);

  const stopAudio = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        /* تجاهل */
      }
    }
    recRef.current = null;
  }, []);

  const pauseAudio = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state === 'recording') {
      try {
        rec.pause();
      } catch {
        /* تجاهل */
      }
    }
  }, []);

  const resumeAudio = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state === 'paused') {
      try {
        rec.resume();
      } catch {
        /* تجاهل */
      }
    }
  }, []);

  const resetAudio = useCallback(() => {
    blobRef.current = null;
    setAudioBlob(null);
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  /** ينزّل الملف الصوتيّ محليًّا بالصيغة المسجَّلة (webm غالبًا). */
  const downloadAudio = useCallback((filename) => {
    const blob = blobRef.current;
    if (!blob) return false;
    const ext = extForMime(blob.type);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename || 'meeting-audio'}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  }, []);

  return {
    audioBlob,
    audioUrl,
    audioSupported,
    startAudio,
    stopAudio,
    pauseAudio,
    resumeAudio,
    resetAudio,
    downloadAudio,
  };
}
