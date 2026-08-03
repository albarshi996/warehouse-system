import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * تفريغ ملفات صوتية مرفوعة داخل المتصفّح عبر Whisper (transformers.js).
 *
 * يدير: عاملًا خيطيًّا واحدًا (whisper.worker.js) + طابور ملفات يُعالَج تِباعًا
 * (ملفٌ واحد في كل لحظة حتى لا تتزاحم الذاكرة/المعالج). كل ملف يمرّ:
 *   انتظار → فكّ ترميز → تحميل النموذج (أوّل مرّة) → تفريغ (٪ حيّ + نصّ متدفّق) → تمّ.
 *
 * الصوت لا يغادر الجهاز إطلاقًا؛ النموذج فقط يُنزَّل من HuggingFace أوّل مرّة.
 */

const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;

/**
 * أنماط الجودة. لكلٍّ نموذجٌ وإعدادٌ لـWebGPU وبديلٌ لـWASM (للمتصفّحات دون WebGPU).
 *
 * ⚠️ الأحجام حقيقيّة (من مستودع HuggingFace): تُستعمل صيغٌ مضغوطة (q4/q4f16)
 * لأن الصيغ الكاملة ضخمة جدًّا للمتصفّح — مُشفّر turbo بدقّة fp32 وحده 2.5غ.ب!
 * q4f16 لـturbo: مُشفّر 370م.ب + مُفكّك 193م.ب ≈ 560م.ب، بدقّة عالية تظلّ ممتازة للعربية.
 */
export const QUALITY_PRESETS = {
  turbo: {
    key: 'turbo',
    labelAr: 'دقّة قصوى (large-v3-turbo)',
    labelEn: 'Best (large-v3-turbo)',
    model: 'onnx-community/whisper-large-v3-turbo',
    webgpu: { device: 'webgpu', dtype: 'q4f16' },
    wasm: { device: 'wasm', dtype: 'q4' },
    approxMB: 560,
  },
  balanced: {
    key: 'balanced',
    labelAr: 'متوازن (small)',
    labelEn: 'Balanced (small)',
    model: 'onnx-community/whisper-small',
    webgpu: { device: 'webgpu', dtype: 'q4' },
    wasm: { device: 'wasm', dtype: 'q4' },
    approxMB: 300,
  },
  fast: {
    key: 'fast',
    labelAr: 'سريع/خفيف (base)',
    labelEn: 'Fast/light (base)',
    model: 'onnx-community/whisper-base',
    webgpu: { device: 'webgpu', dtype: 'q4' },
    wasm: { device: 'wasm', dtype: 'q4' },
    approxMB: 140,
  },
};

// الافتراضيّ «متوازن»: تجربة أوّل استخدام موثوقة (~300م.ب، عربيّة جيّدة) — والمالك
// يرقّي بنقرة إلى «دقّة قصوى» للأفضل. (كان turbo افتراضيًّا فتعثّر أوّل مستخدم بتنزيلٍ ثقيل.)
export const DEFAULT_PRESET = 'balanced';
export { hasWebGPU };

/** يحوّل مفتاح النمط + قدرة الجهاز إلى إعداد ملموس يُمرَّر للعامل. */
function resolveConfig(presetKey) {
  const p = QUALITY_PRESETS[presetKey] || QUALITY_PRESETS[DEFAULT_PRESET];
  const cap = hasWebGPU ? p.webgpu : p.wasm;
  return { model: p.model, device: cap.device, dtype: cap.dtype };
}

/** أحاديّ القناة: يجمع القنوات ويُتوسّطها في مصفوفة Float32 جديدة (قابلة للنقل للعامل). */
function downmix(buffer) {
  const length = buffer.length;
  const out = new Float32Array(length);
  const channels = buffer.numberOfChannels;
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) out[i] += data[i];
  }
  if (channels > 1) for (let i = 0; i < length; i++) out[i] /= channels;
  return out;
}

/** إعادة تشكيل إلى 16kHz أحاديّ عبر OfflineAudioContext (تُخفَّض القنوات تلقائيًّا للوجهة الأحاديّة). */
async function resampleTo16kMono(buffer) {
  const length = Math.max(1, Math.ceil(buffer.duration * 16000));
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const offline = new OfflineCtx(1, length, 16000);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}

/**
 * يفكّ ترميز الملف إلى Float32 أحاديّ بتردّد 16kHz (ما يتوقّعه Whisper).
 * نطلب سياق صوت 16kHz مباشرةً (Chrome/Edge يُعيدان الترميز أثناء الفكّ فتقلّ الذاكرة)؛
 * وإن رفض المتصفّح ذلك أعدنا التشكيل يدويًّا.
 */
async function decodeToMono16k(file) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('AudioContext غير مدعوم في هذا المتصفّح');

  const arrayBuffer = await file.arrayBuffer();
  let audioBuffer;
  try {
    const ctx = new AudioCtx({ sampleRate: 16000 });
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    ctx.close();
  } catch {
    // فشل السياق 16kHz أو استُهلك المخزّن — نعيد قراءة الملف ونفكّ بالتردّد الأصليّ.
    const ab2 = await file.arrayBuffer();
    const ctx = new AudioCtx();
    audioBuffer = await ctx.decodeAudioData(ab2);
    ctx.close();
  }

  const duration = audioBuffer.duration;
  const audio =
    audioBuffer.sampleRate === 16000 ? downmix(audioBuffer) : await resampleTo16kMono(audioBuffer);
  return { audio, duration };
}

let _seq = 0;
const nextId = () => `af-${Date.now()}-${_seq++}`;

export function useAudioTranscriber({ onResult } = {}) {
  const [supported] = useState(
    () => typeof Worker !== 'undefined' && typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext)
  );
  const [queue, setQueue] = useState([]); // [{id,name,size,status,progress,partial,text,error,modelPct}]
  const [busy, setBusy] = useState(false);

  const workerRef = useRef(null);
  const queueRef = useRef([]);
  const runningRef = useRef(false);
  const currentIdRef = useRef(null);
  const presetRef = useRef(DEFAULT_PRESET);
  const langRef = useRef('ar');
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  // مرآة للحالة كي يقرأها المُشغّل (مُغلَّف مرّة) دون إغلاقات قديمة.
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const patch = useCallback((id, changes) => {
    setQueue((prev) => prev.map((f) => (f.id === id ? { ...f, ...changes } : f)));
  }, []);

  // إنشاء العامل مرّة واحدة (متصفّح فقط) + معالجة رسائله.
  useEffect(() => {
    if (!supported) return undefined;
    let worker;
    try {
      worker = new Worker(new URL('./whisper.worker.js', import.meta.url), { type: 'module' });
    } catch {
      return undefined;
    }
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const m = e.data || {};
      const id = m.id || currentIdRef.current;
      if (!id) return;
      if (m.type === 'model-progress') {
        if (typeof m.pct === 'number') {
          patch(id, { status: 'loading', modelPct: m.pct });
        }
      } else if (m.type === 'transcribing') {
        patch(id, { status: 'transcribing', modelPct: 100 });
      } else if (m.type === 'progress') {
        patch(id, { status: 'transcribing', progress: m.ratio });
      } else if (m.type === 'partial') {
        patch(id, { partial: m.text });
      } else if (m.type === 'done') {
        patch(id, { status: 'done', progress: 1, text: m.text, partial: '' });
        if (m.text && onResultRef.current) {
          const item = queueRef.current.find((f) => f.id === id);
          onResultRef.current(m.text, item ? item.name : '');
        }
        finishRef.current();
      } else if (m.type === 'error') {
        patch(id, { status: 'error', error: m.message || 'خطأ غير معروف' });
        finishRef.current();
      }
    };
    worker.onerror = (err) => {
      const id = currentIdRef.current;
      if (id) patch(id, { status: 'error', error: err?.message || 'فشل العامل' });
      finishRef.current();
    };

    return () => {
      try {
        worker.terminate();
      } catch {
        /* تجاهل */
      }
      workerRef.current = null;
    };
  }, [supported, patch]);

  // يعالج الملف التالي في الطابور (فكّ ترميز → إرسال للعامل). واحدٌ في كل لحظة.
  const pump = useCallback(async () => {
    if (runningRef.current) return;
    const next = queueRef.current.find((f) => f.status === 'queued');
    if (!next) {
      setBusy(false);
      return;
    }
    runningRef.current = true;
    currentIdRef.current = next.id;
    setBusy(true);

    const config = resolveConfig(presetRef.current);
    try {
      patch(next.id, { status: 'decoding' });
      const { audio, duration } = await decodeToMono16k(next.file);
      patch(next.id, { status: 'loading', duration });
      workerRef.current.postMessage(
        { type: 'transcribe', id: next.id, audio, duration, language: langRef.current, config },
        [audio.buffer]
      );
    } catch (err) {
      patch(next.id, { status: 'error', error: err?.message || 'تعذّر فكّ ترميز الملف' });
      runningRef.current = false;
      currentIdRef.current = null;
      // انتقل للتالي
      setTimeout(() => pump(), 0);
    }
  }, [patch]);

  // يُستدعى من معالج رسائل العامل عند انتهاء ملف (تمّ/خطأ) لتحرير المُشغّل والانتقال.
  const finishCurrent = useCallback(() => {
    runningRef.current = false;
    currentIdRef.current = null;
    setTimeout(() => pump(), 0);
  }, [pump]);
  // نُبقي مرجعًا حيًّا يستعمله معالج الرسائل (المُغلَّف مرّة).
  const finishRef = useRef(finishCurrent);
  useEffect(() => {
    finishRef.current = finishCurrent;
  }, [finishCurrent]);

  const addFiles = useCallback(
    (fileList) => {
      const items = Array.from(fileList || [])
        .filter((f) => f && f.size > 0)
        .map((file) => ({
          id: nextId(),
          file,
          name: file.name,
          size: file.size,
          status: 'queued',
          progress: 0,
          modelPct: 0,
          partial: '',
          text: '',
          error: '',
          duration: 0,
        }));
      if (!items.length) return;
      setQueue((prev) => [...prev, ...items]);
      // ندع الحالة تُطبَّق ثمّ نُشغّل المضخّة.
      setTimeout(() => pump(), 0);
    },
    [pump]
  );

  const removeFile = useCallback((id) => {
    // لا نُزيل الملفّ الجاري تفريغه؛ غيره فقط.
    if (id === currentIdRef.current) return;
    setQueue((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearFinished = useCallback(() => {
    setQueue((prev) => prev.filter((f) => f.status !== 'done' && f.status !== 'error'));
  }, []);

  const setPreset = useCallback((key) => {
    presetRef.current = key;
  }, []);
  const setLanguage = useCallback((lang) => {
    langRef.current = lang;
  }, []);

  return {
    supported,
    hasWebGPU,
    queue,
    busy,
    addFiles,
    removeFile,
    clearFinished,
    setPreset,
    setLanguage,
  };
}
