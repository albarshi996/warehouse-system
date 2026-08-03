/**
 * عامل خيطيّ (Web Worker) لتفريغ الصوت داخل المتصفّح عبر Whisper (transformers.js v4).
 *
 * لماذا عامل منفصل؟ حتى يعمل النموذج (مئات آلاف المعاملات) دون تجميد واجهة
 * المستخدم. النموذج يُنزَّل مرّة واحدة من مستودع HuggingFace ثم يُحفَظ في كاش
 * المتصفّح (env.useBrowserCache)، فالتفريغ اللاحق بلا إنترنت للنموذج.
 *
 * التقطيع الداخليّ (chunk_length_s + stride_length_s) هو ما يجعله يُفرّغ أيّ
 * مدّة كاملةً دون بتر: الصوت يُقسَّم نوافذ ٣٠ ثانية متداخلة ثمّ تُدمَج.
 *
 * WebGPU لا يشترط عزل النطاق (COOP/COEP) — وهو غير متاح على GitHub Pages —
 * لذا نفضّله. وعند غيابه نسقط إلى WASM بخيطٍ واحد (numThreads=1) لتفادي اشتراط
 * SharedArrayBuffer الذي يحتاج العزل نفسه.
 */
import { pipeline, env, WhisperTextStreamer } from '@huggingface/transformers';

// لا نماذج محليّة — نجلب الأوزان من HuggingFace عند أول تشغيل (تُحفَظ بعدها).
env.allowLocalModels = false;
// خيط واحد للـWASM: يتفادى اشتراط SharedArrayBuffer (يحتاج عزل نطاق غير متاح على Pages).
if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1;

/** المفرّغ المُحمَّل حاليًّا + مفتاحه (نموذج|جهاز) لإعادة الاستخدام دون تحميلٍ متكرّر. */
let transcriber = null;
let loadedKey = '';

async function getTranscriber({ model, device, dtype }, onProgress) {
  const key = `${model}|${device}`;
  if (transcriber && loadedKey === key) return transcriber;
  if (transcriber) {
    try {
      await transcriber.dispose();
    } catch {
      /* تجاهل */
    }
    transcriber = null;
    loadedKey = '';
  }
  transcriber = await pipeline('automatic-speech-recognition', model, {
    device,
    dtype,
    progress_callback: onProgress,
  });
  loadedKey = key;
  return transcriber;
}

/**
 * مُبلّغ تقدّم إجماليّ لتحميل النموذج: يجمع تقدّم كل ملفّات النموذج (مُشفّر/مُفكّك/
 * مُرمِّز) في نسبة واحدة تصاعديّة لا ترجع للخلف — بدل قفز نسبة الملفّ الواحد.
 */
function makeProgressReporter(id) {
  const dl = new Map();
  let maxPct = 0;
  return (p) => {
    if (!p || p.status !== 'progress' || !p.file) return;
    dl.set(p.file, { loaded: p.loaded || 0, total: p.total || 0 });
    let loaded = 0;
    let total = 0;
    for (const v of dl.values()) {
      loaded += v.loaded;
      total += v.total;
    }
    if (total <= 0) return;
    const pct = Math.round((loaded / total) * 100);
    if (pct > maxPct) maxPct = pct; // تصاعديّ فقط (ظهور ملفّ جديد لا يُرجِع الشريط)
    self.postMessage({ type: 'model-progress', id, pct: maxPct });
  };
}

/** دقّة الطابع الزمنيّ لكل رمز (٢٠مِلّي ثانية لـWhisper) — تُحسَب من إعداد النموذج مع بديلٍ آمن. */
function resolveTimePrecision(tr) {
  try {
    const chunkLen = tr.processor.feature_extractor.config.chunk_length;
    const maxPos = tr.model.config.max_source_positions;
    if (chunkLen && maxPos) return chunkLen / maxPos;
  } catch {
    /* البديل أدناه */
  }
  return 0.02;
}

self.addEventListener('message', async (event) => {
  const msg = event.data || {};

  if (msg.type === 'load') {
    // تحميل النموذج مسبقًا (اختياريّ) لتقليل الانتظار عند أوّل ملف.
    try {
      await getTranscriber(msg.config, makeProgressReporter(undefined));
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'load-error', message: err?.message || String(err) });
    }
    return;
  }

  if (msg.type !== 'transcribe') return;

  const { id, audio, duration, language, config } = msg;
  try {
    const tr = await getTranscriber(config, makeProgressReporter(id));
    self.postMessage({ type: 'transcribing', id });

    const timePrecision = resolveTimePrecision(tr);
    let text = '';
    const streamer = new WhisperTextStreamer(tr.tokenizer, {
      time_precision: timePrecision,
      on_chunk_start: (startSec) => {
        if (duration > 0) {
          const ratio = Math.max(0, Math.min(0.99, startSec / duration));
          self.postMessage({ type: 'progress', id, ratio });
        }
      },
      callback_function: (piece) => {
        text += piece;
        self.postMessage({ type: 'partial', id, text });
      },
    });

    const output = await tr(audio, {
      // null = كشف اللغة تلقائيًّا؛ خلاف ذلك نثبّتها ('ar' / 'en').
      language: language === 'auto' ? null : language,
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
      force_full_sequences: false,
      streamer,
    });

    const finalText = ((output && output.text) || text || '').trim();
    self.postMessage({ type: 'done', id, text: finalText });
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err?.message || String(err) });
  }
});
