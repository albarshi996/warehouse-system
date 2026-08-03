import React, { useRef, useState } from 'react';
import { useAudioTranscriber, QUALITY_PRESETS, DEFAULT_PRESET, hasWebGPU } from './useAudioTranscriber.js';

/* أيقونات SVG خطّية محلّية (أسلوب Lucide، بلا إيموجي) — ما يحتاجه هذا المكوّن فقط. */
const GLYPHS = {
  upload: '<path d="M12 3v12"/><path d="M7 8l5-5 5 5"/><path d="M5 21h14"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  close: '<path d="M18 6L6 18"/><path d="M6 6l12 12"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>',
  warn: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
};
function Glyph({ name, size = 16 }) {
  const d = GLYPHS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  );
}

const STR = {
  ar: {
    title: 'تفريغ ملف صوتي مسجّل',
    subtitle: 'ارفع أيّ تسجيل (مهما طال) ليُفرَّغ كاملًا داخل جهازك',
    quality: 'الجودة',
    language: 'اللغة',
    lang_auto: 'تلقائي',
    lang_ar: 'العربية',
    lang_en: 'الإنجليزية',
    drop: 'أفلِت الملفات هنا أو انقر للاختيار',
    drop_hint: 'صيغ مدعومة: mp3, m4a, wav, ogg, webm, flac — عدّة ملفات معًا',
    note_download: 'يُنزَّل النموذج مرّة واحدة (~{mb} م.ب) ثمّ يُحفَظ في المتصفّح — قد يستغرق دقائق أوّل مرّة حسب سرعة النت، وبعدها فوريّ.',
    note_gpu_on: 'تسريع WebGPU مُفعَّل — تفريغ سريع.',
    note_gpu_off: 'بلا WebGPU — سيعمل على المعالج (أبطأ). استخدم Chrome/Edge للسرعة القصوى.',
    unsupported: 'متصفّحك لا يدعم التفريغ داخل الجهاز. استخدم Chrome أو Edge حديثًا.',
    st_queued: 'في الانتظار',
    st_decoding: 'تجهيز الصوت…',
    st_loading: 'تحميل النموذج',
    st_preparing: 'تهيئة النموذج… (لحظات، أوّل مرّة فقط)',
    st_transcribing: 'جاري التفريغ',
    st_done: 'تمّ — أُضيف للتفريغ أدناه',
    st_error: 'خطأ',
    clear_finished: 'مسح المنتهية',
    copy: 'نسخ نصّ الملف',
    remove: 'إزالة',
    copied: 'نُسخ',
  },
  en: {
    title: 'Transcribe an audio file',
    subtitle: 'Upload any recording (any length) — transcribed fully on your device',
    quality: 'Quality',
    language: 'Language',
    lang_auto: 'Auto',
    lang_ar: 'Arabic',
    lang_en: 'English',
    drop: 'Drop files here or click to choose',
    drop_hint: 'Supported: mp3, m4a, wav, ogg, webm, flac — multiple files at once',
    note_download: 'Model downloads once (~{mb} MB), then cached — may take a few minutes the first time depending on your connection, instant afterwards.',
    note_gpu_on: 'WebGPU acceleration on — fast transcription.',
    note_gpu_off: 'No WebGPU — runs on CPU (slower). Use Chrome/Edge for best speed.',
    unsupported: 'Your browser does not support on-device transcription. Use a recent Chrome or Edge.',
    st_queued: 'Queued',
    st_decoding: 'Preparing audio…',
    st_loading: 'Loading model',
    st_preparing: 'Preparing model… (a moment, first time only)',
    st_transcribing: 'Transcribing',
    st_done: 'Done — added to the transcript below',
    st_error: 'Error',
    clear_finished: 'Clear finished',
    copy: 'Copy file text',
    remove: 'Remove',
    copied: 'Copied',
  },
};

const fmtSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const AudioFileTranscriber = ({ lang = 'ar', onAppendTranscript }) => {
  const t = (k) => (STR[lang] || STR.ar)[k] || k;
  const [preset, setPresetState] = useState(DEFAULT_PRESET);
  const [ulang, setUlang] = useState('ar');
  const [dragOver, setDragOver] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const inputRef = useRef(null);

  const { supported, queue, addFiles, removeFile, clearFinished, setPreset, setLanguage } =
    useAudioTranscriber({ onResult: onAppendTranscript });

  const onPickPreset = (key) => {
    setPresetState(key);
    setPreset(key);
  };
  const onPickLang = (key) => {
    setUlang(key);
    setLanguage(key);
  };

  const onFiles = (fileList) => {
    if (fileList && fileList.length) addFiles(fileList);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files);
  };

  const copyFile = (item) => {
    navigator.clipboard
      .writeText(item.text || '')
      .then(() => {
        setCopiedId(item.id);
        setTimeout(() => setCopiedId((c) => (c === item.id ? null : c)), 1500);
      })
      .catch(() => {});
  };

  const statusText = (item) => {
    switch (item.status) {
      case 'queued':
        return t('st_queued');
      case 'decoding':
        return t('st_decoding');
      case 'loading':
        // بين 1٪ و99٪ = تنزيل فعليّ؛ عند 0٪ أو 100٪ = تهيئة النموذج (تجميعه على المعالج/الرسوميّات، بلا تنزيل)
        return item.modelPct > 0 && item.modelPct < 100
          ? `${t('st_loading')}… ${item.modelPct}%`
          : t('st_preparing');
      case 'transcribing':
        return `${t('st_transcribing')}… ${Math.round((item.progress || 0) * 100)}%`;
      case 'done':
        return t('st_done');
      case 'error':
        return `${t('st_error')}: ${item.error || ''}`;
      default:
        return '';
    }
  };

  const barPct = (item) => {
    if (item.status === 'loading') return item.modelPct || 0;
    if (item.status === 'transcribing') return Math.round((item.progress || 0) * 100);
    if (item.status === 'done') return 100;
    if (item.status === 'decoding') return 4;
    return 0;
  };

  const activePreset = QUALITY_PRESETS[preset] || QUALITY_PRESETS[DEFAULT_PRESET];
  const hasFinished = queue.some((f) => f.status === 'done' || f.status === 'error');

  return (
    <div className="o_ma_card">
      <div className="o_ma_card_head">
        <div className="ttl">
          <Glyph name="upload" size={16} /> <span>{t('title')}</span>
        </div>
      </div>
      <div className="o_ma_card_body">
        <p className="o_ma_up_sub">{t('subtitle')}</p>

        {!supported ? (
          <div className="o_ma_banner" style={{ marginBottom: 0 }}>
            <Glyph name="warn" size={16} />
            <span>{t('unsupported')}</span>
          </div>
        ) : (
          <>
            {/* أدوات التحكّم: الجودة + اللغة */}
            <div className="o_ma_up_controls">
              <label className="o_ma_up_field">
                <span>{t('quality')}</span>
                <select className="o_input" value={preset} onChange={(e) => onPickPreset(e.target.value)}>
                  {Object.values(QUALITY_PRESETS).map((p) => (
                    <option key={p.key} value={p.key}>
                      {lang === 'ar' ? p.labelAr : p.labelEn}
                    </option>
                  ))}
                </select>
              </label>
              <label className="o_ma_up_field">
                <span>{t('language')}</span>
                <select className="o_input" value={ulang} onChange={(e) => onPickLang(e.target.value)}>
                  <option value="ar">{t('lang_ar')}</option>
                  <option value="en">{t('lang_en')}</option>
                  <option value="auto">{t('lang_auto')}</option>
                </select>
              </label>
            </div>

            {/* منطقة الإفلات */}
            <div
              className={`o_ma_drop ${dragOver ? 'is-over' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <Glyph name="upload" size={26} />
              <div className="o_ma_drop_main">{t('drop')}</div>
              <div className="o_ma_drop_hint">{t('drop_hint')}</div>
              <input
                ref={inputRef}
                type="file"
                accept="audio/*,.m4a,.mp3,.wav,.ogg,.webm,.flac,.aac,.opus"
                multiple
                hidden
                onChange={(e) => {
                  onFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>

            {/* ملاحظات حالة المحرّك */}
            <div className="o_ma_up_notes">
              <div className="o_ma_up_note">
                <Glyph name="file" size={13} />
                <span>{t('note_download').replace('{mb}', String(activePreset.approxMB))}</span>
              </div>
              <div className="o_ma_up_note">
                <Glyph name="chip" size={13} />
                <span>{hasWebGPU ? t('note_gpu_on') : t('note_gpu_off')}</span>
              </div>
            </div>

            {/* طابور الملفات */}
            {queue.length > 0 && (
              <div className="o_ma_up_list">
                {queue.map((item) => (
                  <div key={item.id} className={`o_ma_up_item is-${item.status}`}>
                    <div className="o_ma_up_item_head">
                      <span className="ic">
                        <Glyph name={item.status === 'done' ? 'check' : 'file'} size={14} />
                      </span>
                      <span className="nm" title={item.name}>{item.name}</span>
                      <span className="sz" dir="ltr">{fmtSize(item.size)}</span>
                      {item.status === 'done' && (
                        <button className="o_ma_up_mini" title={t('copy')} onClick={() => copyFile(item)}>
                          <Glyph name="copy" size={13} />
                          {copiedId === item.id ? ` ${t('copied')}` : ''}
                        </button>
                      )}
                      {item.status !== 'transcribing' &&
                        item.status !== 'loading' &&
                        item.status !== 'decoding' && (
                          <button className="o_ma_up_mini" title={t('remove')} onClick={() => removeFile(item.id)}>
                            <Glyph name="trash" size={13} />
                          </button>
                        )}
                    </div>

                    <div className={`o_ma_up_bar ${item.status === 'error' ? 'is-error' : ''}`}>
                      <span style={{ width: `${barPct(item)}%` }} />
                    </div>

                    <div className={`o_ma_up_status ${item.status === 'error' ? 'is-error' : ''}`}>
                      {statusText(item)}
                    </div>

                    {/* النصّ المتدفّق أثناء التفريغ */}
                    {item.status === 'transcribing' && item.partial && (
                      <div className="o_ma_up_stream" dir="auto">{item.partial}</div>
                    )}
                    {/* معاينة النصّ بعد الانتهاء */}
                    {item.status === 'done' && item.text && (
                      <div className="o_ma_up_result" dir="auto">{item.text}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {hasFinished && (
              <button className="btn btn-secondary" style={{ marginTop: 10 }} onClick={clearFinished}>
                <Glyph name="trash" size={14} /> {t('clear_finished')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AudioFileTranscriber;
