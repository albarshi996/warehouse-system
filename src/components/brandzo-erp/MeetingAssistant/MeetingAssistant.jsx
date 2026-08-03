import React, { useState, useEffect, useRef } from 'react';
import styles from './MeetingAssistant.module.css';
import { useOverlayBack } from '../../../services/ui/useOverlayBack.js';
import { esc } from '../../../services/ui/escape.js';
import { useAudioRecorder } from './useAudioRecorder.js';
import AudioFileTranscriber from './AudioFileTranscriber.jsx';

const ARCHIVE_KEY = 'BrandzoMeetings';

/* أيقونات SVG خطّية محلّيّة (لمسة أودو، بلا إيموجي). مجموعة البوابة المشتركة
   تفتقر لأيقونات التحكّم بالوسائط، فنعرّفها هنا بأسلوب Lucide نفسه. */
const GLYPHS = {
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  download: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  translate: '<path d="M4 5h7"/><path d="M9 3v2c0 4-3 7-7 7"/><path d="M5 9c0 3 3 5 6 5"/><path d="M13 21l4-9 4 9"/><path d="M14.5 17h5"/>',
  sparkles: '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M19 15l.6 1.6L21 17l-1.4.6L19 19l-.6-1.4L17 17l1.4-.4z"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  close: '<path d="M18 6L6 18"/><path d="M6 6l12 12"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2"/><path d="M16 7l3 3"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/>',
  list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  present: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4"/><path d="M8 20h8"/>',
  clear: '<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
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

const i18n = {
  ar: {
    app_title: 'مساعد الاجتماعات الذكي',
    status_ready: 'جاهز',
    status_recording: 'جاري التسجيل...',
    status_paused: 'متوقف مؤقتاً',
    status_processing: 'جاري المعالجة...',
    status_translating: 'جاري الترجمة',
    btn_stop: 'إيقاف',
    btn_pause: 'تعليق',
    btn_resume: 'استئناف',
    btn_summarize: 'تلخيص ذكي',
    btn_translate: 'ترجمة للإنجليزية',
    btn_export_pdf: 'تصدير PDF',
    btn_download_audio: 'تنزيل التسجيل الصوتي',
    btn_clear: 'مسح الكل',
    btn_copy: 'نسخ الكل',
    transcript_title: 'تفريغ المحادثة',
    transcript_placeholder: 'ابدأ التسجيل أو اكتب في الملاحظات اليدوية بالأسفل…',
    manual_notes: 'ملاحظات يدوية',
    manual_notes_placeholder: 'اكتب ملاحظاتك هنا... تُضاف إلى التفريغ في التلخيص والترجمة والتصدير',
    summary_title: 'الملخص الذكي',
    key_points: 'النقاط الرئيسية',
    decisions: 'القرارات',
    action_items: 'المهام',
    translation_export: 'الترجمة والتصدير',
    translation_placeholder: 'الترجمة ستظهر هنا...',
    translation_note: 'مدعوم بخدمة ترجمة ذكاء اصطناعي مجانية',
    word_count: 'الكلمات:',
    badge_live: 'مباشر',
    mic_status: 'الميكروفون جاهز',
    unsupported_browser: 'المتصفح لا يدعم التعرف الصوتي — يمكنك الكتابة يدويًا',
    segment_edit_hint: 'انقر للتعديل',
    segment_delete: 'حذف المقطع',
    btn_save_session: 'حفظ الجلسة',
    btn_archive: 'الأرشيف',
    archive_title: 'أرشيف الاجتماعات',
    archive_empty: 'لا توجد اجتماعات محفوظة بعد',
    btn_load: 'تحميل',
    btn_delete: 'حذف',
    btn_confirm_delete: 'تأكيد الحذف',
    btn_cancel: 'إلغاء',
    btn_close: 'إغلاق',
    meeting_title_placeholder: 'عنوان الجلسة (اختياري)',
    toast_copied: 'تم النسخ',
    toast_pdf_exported: 'تم تصدير PDF',
    toast_translated: 'تمت الترجمة',
    toast_summarized: 'تم التلخيص',
    toast_cleared: 'تم المسح',
    toast_saved: 'تم الحفظ',
    toast_session_saved: 'تم حفظ الجلسة في الأرشيف',
    toast_session_loaded: 'تم تحميل الجلسة',
    toast_session_deleted: 'تم حذف الجلسة',
    toast_no_content: 'لا يوجد محتوى',
    toast_mic_error: 'تعذر الوصول للميكروفون',
    no_summary: 'لم يتم التلخيص بعد',
  },
  en: {
    app_title: 'AI Meeting Assistant',
    status_ready: 'Ready',
    status_recording: 'Recording...',
    status_paused: 'Paused',
    status_processing: 'Processing...',
    status_translating: 'Translating',
    btn_stop: 'Stop',
    btn_pause: 'Pause',
    btn_resume: 'Resume',
    btn_summarize: 'Smart Summary',
    btn_translate: 'Translate to English',
    btn_export_pdf: 'Export PDF',
    btn_download_audio: 'Download Audio',
    btn_clear: 'Clear All',
    btn_copy: 'Copy All',
    transcript_title: 'Transcript',
    transcript_placeholder: 'Start recording or type in the manual notes below…',
    manual_notes: 'Manual Notes',
    manual_notes_placeholder: 'Type your notes here... included with the transcript in summary, translation and export',
    summary_title: 'AI Summary',
    key_points: 'Key Points',
    decisions: 'Decisions',
    action_items: 'Action Items',
    translation_export: 'Translation & Export',
    translation_placeholder: 'English translation will appear here...',
    translation_note: 'Powered by free AI translation service',
    word_count: 'Words:',
    badge_live: 'Live',
    mic_status: 'Microphone ready',
    unsupported_browser: 'This browser does not support speech recognition — you can type notes manually',
    segment_edit_hint: 'Click to edit',
    segment_delete: 'Delete segment',
    btn_save_session: 'Save Session',
    btn_archive: 'Archive',
    archive_title: 'Meeting Archive',
    archive_empty: 'No saved meetings yet',
    btn_load: 'Load',
    btn_delete: 'Delete',
    btn_confirm_delete: 'Confirm delete',
    btn_cancel: 'Cancel',
    btn_close: 'Close',
    meeting_title_placeholder: 'Session title (optional)',
    toast_copied: 'Copied to clipboard',
    toast_pdf_exported: 'PDF exported successfully',
    toast_translated: 'Translation complete',
    toast_summarized: 'Summary generated',
    toast_cleared: 'Content cleared',
    toast_saved: 'Recording saved',
    toast_session_saved: 'Session saved to archive',
    toast_session_loaded: 'Session loaded',
    toast_session_deleted: 'Session deleted',
    toast_no_content: 'No content available',
    toast_mic_error: 'Microphone access denied',
    no_summary: 'No summary yet. Record then tap Summarize.',
  },
};

const translate = (uiLang, key) => i18n[uiLang]?.[key] || i18n.ar[key] || key;

const formatTime = (sec) =>
  `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

const MeetingAssistant = () => {
  // State
  const [lang, setLang] = useState('ar');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [transcriptSegments, setTranscriptSegments] = useState([]);
  const [manualNotes, setManualNotes] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [summaryData, setSummaryData] = useState(null);
  const [englishTranslation, setEnglishTranslation] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [toast, setToast] = useState({ msg: '', show: false });
  const [waveHeights, setWaveHeights] = useState(Array(10).fill(0).map((_, i) => 6 + (i % 3) * 5));
  const [selectedLang, setSelectedLang] = useState('ar-SA');
  const [statusDot, setStatusDot] = useState('ready');
  const [processingMsg, setProcessingMsg] = useState('');
  // Meeting archive
  const [meetingTitle, setMeetingTitle] = useState('');
  const [savedMeetings, setSavedMeetings] = useState([]);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  // زرّ الرجوع (وهو الزرّ الوحيد على الهاتف) يُغلق الدرج بدل مغادرة الصفحة.
  useOverlayBack(archiveOpen, () => { setArchiveOpen(false); setConfirmDeleteId(null); }, 'meeting-archive');
  // Slide mode for presentation
  const [slideMode, setSlideMode] = useState(false);
  // وضع العرض يملأ الشاشة — فالرجوع يُنهيه كما يُنهيه Escape تمامًا.
  useOverlayBack(slideMode, () => setSlideMode(false), 'meeting-slides');
  const [slideIndex, setSlideIndex] = useState(0);
  const [slideTitle] = useState('تقرير تخزين الكوزمتيك — استراتيجية استغلال مجمع التبريد الرحبة');
  const [agendaItems] = useState([
    {
      title: 'مقدمة: لماذا نستغل الرحبة الآن؟',
      content: 'عرض موجز للفرصة الاستراتيجية لاستغلال الرحبة ضمن نموذج Brandzo للكوزميتيك، خاصة مع قربها من مسارات التوزيع وشبكات البيع.'
    },
    {
      title: 'تفاصيل الطاقة الاستيعابية: 19 ثلاجة × 63 متر = 1,197 متر مربع',
      content: 'تأكيد مساحة التخزين المتاحة وقدرة الرحبة على استيعاب الدفعات الكبيرة مع ضمان التحكم الحراري المناسب.'
    },
    {
      title: 'مخطط التوزيع التفصيلي للثلاجة الواحدة (24 حامل لكل ثلاجة)',
      content: 'توزيع حاملات الرفوف داخل الوحدة لضمان سهولة الوصول وتقليل وقت الالتقاط والتخزين.'
    },
    {
      title: 'خطة توزيع الفئات (وجه، جسم، شعر، ميكاب، عطور)',
      content: 'فصل الفئات وفقاً لاحتياجات التخزين، وسهولة تحديد مكان المنتج، وسرعة تجهيز الطلبات.'
    },
    {
      title: 'الجدول الزمني للتنفيذ',
      content: 'خطة زمنية واضحة تبدأ بالإعداد، ثم تركيب الأنظمة، وعملية الاختبار، وصولاً إلى التشغيل التجريبي.'
    },
    {
      title: 'الموارد البشرية المطلوبة',
      content: 'تحديد الكوادر التشغيلية، فرق الجودة، المشرفين على التخزين، وفريق التوزيع المحلي.'
    },
    {
      title: 'التكاليف والعائد المتوقع',
      content: 'عرض تكلفة التجهيز والصيانة مقابل العائد المتوقع من خفض الهدر وتسريع دورة المنتجات الحساسة.'
    },
    {
      title: 'Q&A وقرارات التقرير',
      content: 'نقاط المناقشة النهائية، القرارات المقترحة، وخطة المتابعة التنفيذية.'
    },
  ]);

  // Refs — mirrors of mutable state so the one-time recognition handlers never read stale closures
  const recognitionRef = useRef(null);
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);
  const langRef = useRef('ar');
  const interimTranscriptRef = useRef('');
  const finalTranscriptRef = useRef('');
  const waveIntervalRef = useRef(null);
  const restartTimerRef = useRef(null);
  const toastTimerRef = useRef(null);
  const stopRecordingRef = useRef(() => {});
  const actionsRef = useRef({});
  const skipSaveRef = useRef(false);

  // تسجيل صوتيّ فعليّ بالتوازي مع التفريغ — يُنزَّل محليًّا (قرار المالك: بلا رفع سحابيّ).
  const audio = useAudioRecorder();

  const t = (key) => translate(lang, key);

  // Keep refs in sync with state (handlers also write them directly for immediacy)
  useEffect(() => {
    isRecordingRef.current = isRecording;
    isPausedRef.current = isPaused;
  }, [isRecording, isPaused]);

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  const showToast = (msg, duration = 2800) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, show: true });
    toastTimerRef.current = setTimeout(() => {
      setToast({ msg: '', show: false });
    }, duration);
  };

  // Stable segment appender — only touches refs and setState, safe inside mount-once handlers
  const appendSegment = (text) => {
    const speaker = langRef.current === 'ar' ? '🗣 المتحدث' : '🗣 Speaker';
    setTranscriptSegments((prev) => [
      ...prev,
      { speaker: `${speaker} ${prev.length + 1}`, text, ts: new Date().toISOString() },
    ]);
  };

  const flushInterim = () => {
    const pending = interimTranscriptRef.current.trim();
    if (pending) {
      finalTranscriptRef.current += pending + ' ';
      appendSegment(pending);
      interimTranscriptRef.current = '';
    }
  };

  // نتيجة تفريغ ملف صوتي مرفوع (Whisper داخل المتصفّح) — تُضاف مقطعًا بعنوان الملف،
  // فتدخل تلقائيًّا في التلخيص والترجمة وتصدير PDF والحفظ كبقيّة التفريغ.
  const addUploadedTranscript = (text, fileName) => {
    const clean = (text || '').trim();
    if (!clean) return;
    finalTranscriptRef.current += clean + ' ';
    const label = (langRef.current === 'ar' ? 'ملف: ' : 'File: ') + (fileName || (langRef.current === 'ar' ? 'تسجيل' : 'audio'));
    setTranscriptSegments((prev) => [
      ...prev,
      { speaker: label, text: clean, ts: new Date().toISOString() },
    ]);
  };

  // Initialize Speech Recognition ONCE — all mutable state is read via refs
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
          if (transcript) {
            finalTranscriptRef.current += transcript + ' ';
            appendSegment(transcript);
          }
        } else {
          interim += transcript;
        }
      }
      interimTranscriptRef.current = interim;
    };

    recognition.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        showToast(translate(langRef.current, 'toast_mic_error'));
        stopRecordingRef.current();
      }
      // 'no-speech' / 'network' etc. fall through — onend handles the restart
    };

    recognition.onend = () => {
      // Auto-restart after silence, reading LIVE state from refs (not a stale closure)
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
              // Give up silently — the next onend will retry
            }
          }
        }, 300);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      isRecordingRef.current = false;
      try {
        recognition.abort();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    };
  }, []);

  // Load meeting archive from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ARCHIVE_KEY);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) setSavedMeetings(list);
      }
    } catch {
      // Corrupt archive — start fresh
    }
  }, []);

  // Waveform animation
  useEffect(() => {
    if (!isRecording || isPaused) {
      setWaveHeights(Array(10).fill(0).map((_, i) => 6 + (i % 3) * 5));
      if (waveIntervalRef.current) {
        clearInterval(waveIntervalRef.current);
        waveIntervalRef.current = null;
      }
      return undefined;
    }

    waveIntervalRef.current = setInterval(() => {
      setWaveHeights(
        Array(10)
          .fill(0)
          .map(() => Math.random() * 24 + 4)
      );
    }, 140);

    return () => {
      if (waveIntervalRef.current) {
        clearInterval(waveIntervalRef.current);
        waveIntervalRef.current = null;
      }
    };
  }, [isRecording, isPaused]);

  // Recording timer — ticks only while actively recording (pauses while paused)
  useEffect(() => {
    if (!isRecording || isPaused) return undefined;
    const id = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isRecording, isPaused]);

  // Update word count (transcript segments + manual notes)
  useEffect(() => {
    const text = [
      transcriptSegments.map((s) => s.text).filter(Boolean).join(' '),
      manualNotes,
    ].join(' ');
    setWordCount(text.trim().split(/\s+/).filter((x) => x.length > 0).length);
  }, [transcriptSegments, manualNotes]);

  // Update status dot
  useEffect(() => {
    if (isRecording && !isPaused) {
      setStatusDot('recording');
    } else if (isRecording && isPaused) {
      setStatusDot('paused');
    } else {
      setStatusDot('ready');
    }
  }, [isRecording, isPaused]);

  const startRecording = () => {
    if (!speechSupported || !recognitionRef.current) {
      showToast(t('toast_mic_error'));
      return;
    }

    recognitionRef.current.lang = selectedLang;
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    setElapsedSec(0);

    isRecordingRef.current = true;
    isPausedRef.current = false;
    setIsRecording(true);
    setIsPaused(false);

    try {
      recognitionRef.current.start();
    } catch {
      // Already started — ignore
    }

    audio.startAudio(); // تسجيل صوتيّ موازٍ (fire-and-forget؛ يفشل بصمتٍ إن رُفض الميكروفون)

    showToast(lang === 'ar' ? 'بدأ التسجيل…' : 'Recording started…');
  };

  const stopRecording = () => {
    isRecordingRef.current = false;
    isPausedRef.current = false;
    setIsRecording(false);
    setIsPaused(false);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore
      }
    }

    flushInterim();
    audio.stopAudio(); // يبني ملف الصوت (يتاح تنزيله بعدها)
    showToast(t('toast_saved'), 3000);
  };

  // Keep the ref pointing at the latest closure (used by recognition.onerror)
  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  });

  const resumeRecognition = () => {
    isPausedRef.current = false;
    setIsPaused(false);
    audio.resumeAudio();
    if (recognitionRef.current) {
      recognitionRef.current.lang = selectedLang;
      try {
        recognitionRef.current.start();
      } catch {
        // Already started — ignore
      }
    }
  };

  const togglePause = () => {
    if (!isRecording) return;

    if (!isPaused) {
      isPausedRef.current = true;
      setIsPaused(true);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // Ignore
        }
      }
      flushInterim();
      audio.pauseAudio();
    } else {
      resumeRecognition();
    }
  };

  const toggleRecord = () => {
    if (!isRecording) {
      startRecording();
    } else if (isPaused) {
      resumeRecognition();
    } else {
      togglePause();
    }
  };

  const getSegmentsText = (segments) => (segments || []).map((s) => s.text).filter(Boolean).join(' ');

  const getText = () => {
    const segText = getSegmentsText(transcriptSegments);
    const notes = manualNotes.trim();
    return [segText, notes].filter(Boolean).join('\n');
  };

  // ── Transcript segment editing ──
  const beginEditSegment = (i) => {
    setEditingIndex(i);
    setEditingText(transcriptSegments[i]?.text || '');
  };

  const saveSegmentEdit = () => {
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      setEditingIndex(null);
      return;
    }
    if (editingIndex === null) return;
    const idx = editingIndex;
    const newText = editingText.trim();
    setTranscriptSegments((prev) =>
      newText
        ? prev.map((s, j) => (j === idx ? { ...s, text: newText } : s))
        : prev.filter((_, j) => j !== idx)
    );
    setEditingIndex(null);
  };

  const deleteSegment = (i) => {
    if (editingIndex === i) setEditingIndex(null);
    setTranscriptSegments((prev) => prev.filter((_, j) => j !== i));
  };

  const smartSummarize = (text) => {
    if (!text || text.trim().length < 10) return null;

    const sentences = text.split(/[.!?؟\n]+/).filter((s) => s.trim().length > 5);
    if (!sentences.length) return null;

    const arabicTest = /[\u0600-\u06FF]/.test(text);
    const decKW = arabicTest
      ? ['قرر', 'قرار', 'اتفق', 'اتفقنا', 'نقرر', 'نعتمد', 'اعتمد', 'نوافق', 'وافق', 'حسم', 'أقر']
      : ['decide', 'decision', 'agreed', 'approve', 'approved', 'resolve', 'resolved', 'confirm', 'finalized'];
    const actKW = arabicTest
      ? [
          'يجب',
          'علينا',
          'مطلوب',
          'سنقوم',
          'سأقوم',
          'سنعمل',
          'تكليف',
          'موعد',
          'تسليم',
          'مهمة',
          'إجراء',
          'خطة',
          'التالي',
          'الخطوة',
          'متابعة',
          'تنفيذ',
        ]
      : ['must', 'need to', 'should', 'will do', 'action', 'task', 'assign', 'deadline', 'due', 'follow up'];
    const impKW = arabicTest
      ? ['مهم', 'هام', 'أساسي', 'ضروري', 'عاجل', 'حرج', 'محوري', 'رئيسي', 'أولوية']
      : ['important', 'critical', 'essential', 'urgent', 'key', 'crucial', 'priority'];

    const dec = [];
    const act = [];
    const imp = [];

    sentences.forEach((s) => {
      const lo = s.toLowerCase();
      if (decKW.some((k) => lo.includes(k))) dec.push(s.trim());
      if (actKW.some((k) => lo.includes(k))) act.push(s.trim());
      if (impKW.some((k) => lo.includes(k))) imp.push(s.trim());
    });

    const allKey = [...new Set([...imp, ...dec, ...act])];
    if (dec.length === 0 && act.length === 0) {
      const sorted = [...sentences].sort((a, b) => b.length - a.length);
      allKey.push(...sorted.slice(0, Math.min(5, sorted.length)));
    }

    return {
      keyPoints: [...new Set(allKey)].slice(0, 6),
      decisions: dec.length ? [...new Set(dec)] : [sentences[0]?.trim() || '—'],
      actions: act.length ? [...new Set(act)] : [arabicTest ? 'مراجعة المحتوى' : 'Review content'],
    };
  };

  const doSummarize = () => {
    const txt = getText();
    if (!txt || txt.trim().length < 5) {
      showToast(t('toast_no_content'));
      return;
    }

    const data = smartSummarize(txt);
    setSummaryData(data);
    showToast(t('toast_summarized'), 3000);
  };

  // Split text into ≤maxLen chunks, preferring sentence boundaries
  const splitIntoChunks = (text, maxLen = 450) => {
    const sentences = text.match(/[^.!?؟\n]+[.!?؟\n]*/g) || [text];
    const chunks = [];
    let current = '';

    for (let sentence of sentences) {
      // Hard-split any single sentence longer than maxLen (on a space when possible)
      while (sentence.length > maxLen) {
        let cut = sentence.lastIndexOf(' ', maxLen);
        if (cut <= 0) cut = maxLen;
        if (current.trim()) {
          chunks.push(current.trim());
          current = '';
        }
        chunks.push(sentence.slice(0, cut).trim());
        sentence = sentence.slice(cut);
      }
      if ((current + sentence).length > maxLen && current.trim()) {
        chunks.push(current.trim());
        current = sentence;
      } else {
        current += sentence;
      }
    }
    if (current.trim()) chunks.push(current.trim());

    return chunks.filter(Boolean);
  };

  const doTranslate = async () => {
    const txt = getText();
    if (!txt || txt.trim().length < 5) {
      showToast(t('toast_no_content'));
      return;
    }

    const chunks = splitIntoChunks(txt);
    setStatusDot('processing');

    try {
      const results = [];
      for (let i = 0; i < chunks.length; i++) {
        setProcessingMsg(`${t('status_translating')} ${i + 1}/${chunks.length}…`);
        const res = await fetch(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunks[i])}&langpair=ar|en&de=meeting@assistant.ai`
        );
        const data = await res.json();
        const piece = data?.responseData?.translatedText;
        if (!piece) throw new Error('no translation');
        results.push(piece);
      }
      setEnglishTranslation(results.join(' '));
      showToast(t('toast_translated'), 3000);
    } catch {
      setEnglishTranslation('[Translation unavailable. Please try again.]');
      showToast(lang === 'ar' ? 'خدمة الترجمة غير متاحة' : 'Translation service unavailable');
    }

    setProcessingMsg('');
    setStatusDot(
      isRecordingRef.current && !isPausedRef.current
        ? 'recording'
        : isRecordingRef.current
          ? 'paused'
          : 'ready'
    );
  };

  // Shared PDF builder — works from live state or from an archived meeting
  const exportPDFData = async ({ segments, notes, summary, translation, title }) => {
    if (typeof window === 'undefined') return;

    const segText = getSegmentsText(segments);
    const notesTrim = (notes || '').trim();
    if (!segText.trim() && !notesTrim) {
      showToast(t('toast_no_content'));
      return;
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // كل الحقول أدناه تُحقن في innerHTML ثم تُمرَّر لـhtml2pdf — وبعضها من
    // مصادر غير موثوقة (التفريغ الصوتي، الملاحظات الحرّة، وردّ خدمة الترجمة
    // الخارجية). تُهرَّب كلها قبل الحقن (المحور ٤: إغلاق ثغرة `<img onerror>`).
    let sumHTML = '';
    if (summary) {
      const bullets = (arr) => (arr || []).map((x) => '• ' + esc(x)).join('<br>');
      sumHTML += `<p><strong>🔑 ${lang === 'ar' ? 'النقاط الرئيسية' : 'Key Points'}:</strong><br>${bullets(summary.keyPoints)}</p>`;
      sumHTML += `<p style="margin-top:10px;"><strong>✅ ${lang === 'ar' ? 'القرارات' : 'Decisions'}:</strong><br>${bullets(summary.decisions)}</p>`;
      sumHTML += `<p style="margin-top:10px;"><strong>📋 ${lang === 'ar' ? 'المهام' : 'Action Items'}:</strong><br>${bullets(summary.actions)}</p>`;
    } else {
      sumHTML = `<p>${lang === 'ar' ? 'لا يوجد ملخص' : 'No summary available'}</p>`;
    }

    const trans = translation || '';
    const titleTrim = (title || '').trim();
    const htmlContent = `
      <div style="font-family: 'Segoe UI', sans-serif; line-height: 1.7; direction: ${lang === 'ar' ? 'rtl' : 'ltr'}; padding: 48px;">
        <div style="border-bottom: 3px solid #4a90ff; padding-bottom: 20px; margin-bottom: 24px;">
          <h1 style="font-size: 1.6rem; color: #0a0a1f; margin-bottom: 4px;">📋 ${lang === 'ar' ? 'محضر اجتماع' : 'Meeting Minutes'}</h1>
          ${titleTrim ? `<p style="font-size: 1rem; color: #333; font-weight: bold;">${esc(titleTrim)}</p>` : ''}
          <p style="font-size: 0.8rem; color: #666;">AI Meeting Assistant</p>
          <p style="margin-top: 3px; color: #888; font-size: 0.75rem;">${dateStr}</p>
        </div>
        ${segText.trim() ? `<div style="background: #f7f9ff; border-radius: 9px; border-right: 5px solid #4a90ff; padding: 14px 16px; margin-bottom: 18px;">
          <h3 style="color: #4a90ff; margin-bottom: 8px;">📝 ${lang === 'ar' ? 'تفريغ المحادثة' : 'Transcript'}</h3>
          <p style="color: #333; font-size: 0.88rem; white-space: pre-wrap;">${esc(segText)}</p>
        </div>` : ''}
        ${notesTrim ? `<div style="background: #fffaf0; border-radius: 9px; border-right: 5px solid #f0a500; padding: 14px 16px; margin-bottom: 18px;">
          <h3 style="color: #b07d00; margin-bottom: 8px;">🖊️ ${lang === 'ar' ? 'ملاحظات يدوية' : 'Manual Notes'}</h3>
          <p style="color: #333; font-size: 0.88rem; white-space: pre-wrap;">${esc(notesTrim)}</p>
        </div>` : ''}
        <div style="background: #f7f9ff; border-radius: 9px; border-right: 5px solid #4a90ff; padding: 14px 16px; margin-bottom: 18px;">
          <h3 style="color: #4a90ff; margin-bottom: 8px;">🧠 ${lang === 'ar' ? 'الملخص' : 'Summary'}</h3>
          ${sumHTML}
        </div>
        ${trans && trans.length > 5 ? `<div style="background: #f0fbf8; border-radius: 9px; border-left: 5px solid #00a587; padding: 14px 16px; direction: ltr; text-align: left;"><h3 style="color: #00a587; margin-bottom: 8px;">🌍 English Translation</h3><p style="color: #333; font-size: 0.88rem; white-space: pre-wrap;">${esc(trans)}</p></div>` : ''}
      </div>
    `;

    const element = document.createElement('div');
    element.innerHTML = htmlContent;

    try {
      const module = await import('html2pdf.js');
      const html2pdf = module.default || module;

      const opt = {
        margin: 10,
        filename: 'meeting-minutes-' + now.toISOString().slice(0, 10) + '.pdf',
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      };

      await html2pdf()
        .set(opt)
        .from(element)
        .save();

      showToast(t('toast_pdf_exported'), 3000);
    } catch (error) {
      console.error('PDF export failed', error);
      showToast('PDF export failed');
    }
  };

  const exportPDF = () =>
    exportPDFData({
      segments: transcriptSegments,
      notes: manualNotes,
      summary: summaryData,
      translation: englishTranslation,
      title: meetingTitle,
    });

  // ── Meeting archive (localStorage) ──
  const persistArchive = (list) => {
    setSavedMeetings(list);
    try {
      localStorage.setItem(ARCHIVE_KEY, JSON.stringify(list));
    } catch {
      // Storage full — keep in-memory state anyway
    }
  };

  const meetingWordCount = (m) => {
    const text = [getSegmentsText(m.segments), m.manualNotes || ''].join(' ');
    return text.trim().split(/\s+/).filter((x) => x.length > 0).length;
  };

  const saveSession = () => {
    const txt = getText();
    if (!txt || txt.trim().length < 3) {
      showToast(t('toast_no_content'));
      return;
    }

    const segText = getSegmentsText(transcriptSegments).trim();
    const source = segText || manualNotes.trim();
    const defaultTitle = source
      ? source.split(/\s+/).slice(0, 6).join(' ')
      : new Date().toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US');

    const meeting = {
      id: 'm-' + Date.now(),
      title: meetingTitle.trim() || defaultTitle,
      date: new Date().toISOString(),
      segments: transcriptSegments,
      manualNotes,
      summaryData,
      englishTranslation,
    };

    persistArchive([meeting, ...savedMeetings]);
    showToast(t('toast_session_saved'), 3000);
  };

  const loadMeeting = (m) => {
    setTranscriptSegments(Array.isArray(m.segments) ? m.segments : []);
    setManualNotes(m.manualNotes || '');
    setSummaryData(m.summaryData || null);
    setEnglishTranslation(m.englishTranslation || '');
    setMeetingTitle(m.title || '');
    setEditingIndex(null);
    finalTranscriptRef.current = getSegmentsText(m.segments) + ' ';
    interimTranscriptRef.current = '';
    setArchiveOpen(false);
    setConfirmDeleteId(null);
    showToast(t('toast_session_loaded'), 2500);
  };

  const deleteMeeting = (id) => {
    persistArchive(savedMeetings.filter((m) => m.id !== id));
    setConfirmDeleteId(null);
    showToast(t('toast_session_deleted'), 2500);
  };

  const exportMeetingPDF = (m) =>
    exportPDFData({
      segments: m.segments,
      notes: m.manualNotes,
      summary: m.summaryData,
      translation: m.englishTranslation,
      title: m.title,
    });

  const clearAll = () => {
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    setTranscriptSegments([]);
    setManualNotes('');
    setMeetingTitle('');
    setEditingIndex(null);
    setEnglishTranslation('');
    setSummaryData(null);
    setWordCount(0);
    audio.resetAudio();
    showToast(t('toast_cleared'));
  };

  // ينزّل ملف التسجيل الصوتي محليًّا (webm) — لا يُرفع للسحابة.
  const downloadMeetingAudio = () => {
    const base = (meetingTitle.trim() || (lang === 'ar' ? 'تسجيل-اجتماع' : 'meeting-audio'))
      .replace(/\s+/g, '-')
      .slice(0, 40);
    if (!audio.downloadAudio(base)) {
      showToast(lang === 'ar' ? 'لا يوجد تسجيل صوتي بعد' : 'No audio recorded yet');
    }
  };

  const copyAll = () => {
    const txt = getText();
    if (!txt || txt.trim().length < 3) {
      showToast(t('toast_no_content'));
      return;
    }

    let copy = txt;
    if (englishTranslation && englishTranslation.length > 5) {
      copy += '\n\n--- English Translation ---\n' + englishTranslation;
    }

    navigator.clipboard
      .writeText(copy)
      .then(() => showToast(t('toast_copied'), 3000))
      .catch(() => showToast(lang === 'ar' ? 'فشل النسخ' : 'Copy failed'));
  };

  const toggleLang = () => {
    setLang(lang === 'ar' ? 'en' : 'ar');
    showToast(lang === 'ar' ? '🌐 Switched to English' : '🌐 تم التبديل للعربية');
  };

  // Keep the latest action closures available to the mount-once keyboard listener
  useEffect(() => {
    actionsRef.current = { doSummarize, exportPDF, doTranslate, toggleRecord };
  });

  // Keyboard shortcuts — registered once, dispatching through actionsRef (no stale closures)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && !e.shiftKey && e.key === 's') {
        e.preventDefault();
        actionsRef.current.doSummarize();
      }
      if (e.ctrlKey && !e.shiftKey && e.key === 'p') {
        e.preventDefault();
        actionsRef.current.exportPDF();
      }
      if (e.ctrlKey && !e.shiftKey && e.key === 't') {
        e.preventDefault();
        actionsRef.current.doTranslate();
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        actionsRef.current.toggleRecord();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Slide mode keyboard navigation
  useEffect(() => {
    if (!slideMode) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setSlideIndex((s) => Math.min(s + 1, agendaItems.length - 1));
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setSlideIndex((s) => Math.max(s - 1, 0));
      if (e.key === 'Escape') setSlideMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slideMode, agendaItems.length]);

  const recordGlyph = isRecording && !isPaused ? 'pause' : isRecording && isPaused ? 'play' : 'mic';
  const statusDotColor = {
    ready: 'var(--o-gray-500)',
    recording: 'var(--o-danger)',
    paused: 'var(--o-warning)',
    processing: 'var(--o-info)',
  }[statusDot];
  const statusDotBlink = statusDot !== 'ready' ? styles.dotBlink : '';

  return (
    <div className={`o_theme o_ma ${lang === 'ar' ? 'dir-rtl' : 'dir-ltr'}`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Slide Mode Overlay */}
      {slideMode && (
        <div className="o_ma_overlay" dir="rtl">
          <div className="o_ma_drawer wide">
            <div className="o_ma_card_body">
              <div className="o_ma_slide_kicker">القالب المسبق</div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="o_ma_slide_title">{slideTitle}</h2>
                  <p className="o_ma_slide_sub">عرض شرائح لتقديم خطة استغلال الرحبة لتخزين الكوزميتيك.</p>
                </div>
                <button onClick={() => setSlideMode(false)} className="o_ma_iconbtn" title={t('btn_close')}>
                  <Glyph name="close" size={16} />
                </button>
              </div>
              <div className="o_ma_slide_content">
                {agendaItems[slideIndex]?.content || <p className="o_ma_muted">لا توجد تفاصيل محددة لهذه الشريحة حالياً.</p>}
              </div>
              <div className="o_ma_slide_nav">
                <div className="o_ma_count">الشريحة {slideIndex + 1} من {agendaItems.length}</div>
                <div className="flex gap-2">
                  <button onClick={() => setSlideIndex((s) => Math.max(0, s - 1))} className="btn btn-secondary">السابق</button>
                  <button onClick={() => setSlideIndex((s) => Math.min(agendaItems.length - 1, s + 1))} className="btn btn-primary">التالي</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Archive Drawer */}
      {archiveOpen && (
        <div
          className="o_ma_overlay"
          onClick={() => { setArchiveOpen(false); setConfirmDeleteId(null); }}
        >
          <div className="o_ma_drawer" onClick={(e) => e.stopPropagation()}>
            <div className="o_ma_drawer_head">
              <div className="ttl">
                <Glyph name="folder" size={16} /> <span>{t('archive_title')}</span>
                <span className="o_ma_count">({savedMeetings.length})</span>
              </div>
              <button
                onClick={() => { setArchiveOpen(false); setConfirmDeleteId(null); }}
                className="o_ma_iconbtn"
                title={t('btn_close')}
              >
                <Glyph name="close" size={16} />
              </button>
            </div>
            <div className="o_ma_drawer_body">
              {savedMeetings.length === 0 && (
                <div className="o_ma_muted" style={{ textAlign: 'center', padding: '28px 0' }}>{t('archive_empty')}</div>
              )}
              {savedMeetings.map((m) => (
                <div key={m.id} className="o_ma_arch_item">
                  <div className="ttl">{m.title}</div>
                  <div className="meta" dir="ltr">
                    {new Date(m.date).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {' · '}
                    {t('word_count')} {meetingWordCount(m)}
                  </div>
                  <div className="o_ma_arch_actions">
                    <button onClick={() => loadMeeting(m)} className="btn btn-secondary btn-sm">
                      <Glyph name="download" size={14} /> {t('btn_load')}
                    </button>
                    <button onClick={() => exportMeetingPDF(m)} className="btn btn-secondary btn-sm">
                      <Glyph name="doc" size={14} /> {t('btn_export_pdf')}
                    </button>
                    {confirmDeleteId === m.id ? (
                      <>
                        <button onClick={() => deleteMeeting(m.id)} className="btn btn-primary btn-sm" style={{ background: 'var(--o-danger)', borderColor: 'var(--o-danger)' }}>
                          {t('btn_confirm_delete')}
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)} className="btn btn-secondary btn-sm">
                          {t('btn_cancel')}
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(m.id)} className="btn is-danger btn-sm">
                        <Glyph name="trash" size={14} /> {t('btn_delete')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav className="o_ma_nav">
        <div className="o_ma_brand">
          <div className="o_ma_logo"><Glyph name="mic" size={18} /></div>
          <div>
            <div className="t">{t('app_title')}</div>
            <div className="s">AI Meeting Assistant</div>
          </div>
        </div>
        <div className="o_ma_navactions">
          <div className="o_ma_status">
            <span className={`dot ${statusDotBlink}`} style={{ background: statusDotColor }} />
            <span>
              {statusDot === 'ready' && t('status_ready')}
              {statusDot === 'recording' && t('status_recording')}
              {statusDot === 'paused' && t('status_paused')}
              {statusDot === 'processing' && (processingMsg || t('status_processing'))}
            </span>
            {isRecording && (
              <span className="time" dir="ltr">{formatTime(elapsedSec)}</span>
            )}
          </div>
          <button onClick={clearAll} className="o_ma_iconbtn" title={t('btn_clear')}>
            <Glyph name="clear" size={16} />
          </button>
          <button
            onClick={() => setSlideMode(true)}
            className="btn btn-secondary"
            title="تحميل القالب المسبق"
          >
            <Glyph name="download" size={15} /> <span className="hidden sm:inline">تحميل القالب</span>
          </button>
          <button
            onClick={() => {
              if (!slideMode) setSlideIndex(0);
              setSlideMode((prev) => !prev);
            }}
            className={`btn ${slideMode ? 'btn-primary' : 'btn-secondary'}`}
            title={slideMode ? 'إيقاف وضع العرض' : 'تشغيل وضع العرض'}
          >
            <Glyph name="present" size={15} /> <span className="hidden sm:inline">{slideMode ? 'إيقاف العرض' : 'عرض'}</span>
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div className="o_ma_main">
        {/* Unsupported browser banner */}
        {!speechSupported && (
          <div className="o_ma_banner">
            <Glyph name="mic" size={16} />
            <span>{t('unsupported_browser')}</span>
          </div>
        )}

        {/* Recording Ring */}
        <div className="o_ma_recwrap">
          <div className={`o_ma_ring ${isRecording && !isPaused ? styles.ringLive : ''}`}>
            <div className={`ring ${styles.ringOuter}`} />
            <div className={`ring ${styles.ringMiddle}`} style={{ margin: '-10px' }} />
            <div className={`ring ${styles.ringInner}`} style={{ margin: '-20px' }} />

            <button
              onClick={toggleRecord}
              disabled={!speechSupported}
              className={`o_ma_rec ${isRecording ? 'is-recording' : ''}`}
            >
              <Glyph name={recordGlyph} size={28} />
            </button>
          </div>

          {/* Waveform bars */}
          <div className={`o_ma_wave ${isRecording && !isPaused ? 'is-live' : ''}`}>
            {waveHeights.map((height, i) => (
              <i key={i} style={{ height: `${height}px` }} />
            ))}
          </div>

          {/* Control buttons */}
          <div className="o_ma_row">
            <button onClick={stopRecording} disabled={!isRecording} className="btn is-danger grow">
              <Glyph name="stop" size={15} /> {t('btn_stop')}
            </button>
            <button onClick={togglePause} disabled={!isRecording} className="btn btn-secondary grow">
              <Glyph name={isPaused ? 'play' : 'pause'} size={15} /> {isPaused ? t('btn_resume') : t('btn_pause')}
            </button>
            <select
              value={selectedLang}
              onChange={(e) => setSelectedLang(e.target.value)}
              className="o_input grow"
              style={{ flexBasis: 0 }}
            >
              <option value="ar-SA">العربية</option>
              <option value="ar-EG">العربية (مصري)</option>
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
            </select>
          </div>

          {/* Action buttons */}
          <div className="o_ma_row">
            <button onClick={toggleLang} className="btn btn-secondary">
              <Glyph name="translate" size={15} /> {lang === 'ar' ? 'AR' : 'EN'}
            </button>
            <button onClick={doSummarize} className="btn btn-primary grow">
              <Glyph name="sparkles" size={15} /> {t('btn_summarize')}
            </button>
            <button onClick={copyAll} className="btn btn-secondary" title={t('btn_copy')}>
              <Glyph name="copy" size={15} />
            </button>
          </div>

          {/* Session save / archive bar */}
          <div className="o_ma_row">
            <input
              type="text"
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              placeholder={t('meeting_title_placeholder')}
              className="o_input grow min0"
            />
            <button onClick={saveSession} className="btn btn-secondary">
              <Glyph name="save" size={15} /> {t('btn_save_session')}
            </button>
            <button onClick={() => setArchiveOpen(true)} className="btn btn-secondary">
              <Glyph name="folder" size={15} /> {t('btn_archive')}
              <span className="o_ma_count">({savedMeetings.length})</span>
            </button>
          </div>
        </div>

        {/* Audio File Transcriber — رفع ملف صوتي وتفريغه كاملًا داخل المتصفّح (Whisper) */}
        <AudioFileTranscriber lang={lang} onAppendTranscript={addUploadedTranscript} />

        {/* Transcript Card */}
        <div className="o_ma_card">
          <div className="o_ma_card_head">
            <div className="ttl"><Glyph name="doc" size={16} /> <span>{t('transcript_title')}</span></div>
            {isRecording && !isPaused && (
              <div className="o_ma_live"><span className="dot" /> {t('badge_live')}</div>
            )}
          </div>
          <div className="o_ma_card_body">
            {/* Segments list — click a segment to edit, delete via trash icon */}
            <div className="o_ma_panel o_ma_scroll o_ma_text">
              {transcriptSegments.length === 0 && (
                <div className="o_ma_muted">{t('transcript_placeholder')}</div>
              )}
              {transcriptSegments.map((seg, i) => (
                <div key={`${seg.ts}-${i}`} className="o_ma_seg">
                  <div className="body">
                    <span className="spk">{seg.speaker}</span>{' '}
                    {editingIndex === i ? (
                      <textarea
                        value={editingText}
                        autoFocus
                        rows={2}
                        onChange={(e) => setEditingText(e.target.value)}
                        onBlur={saveSegmentEdit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            e.target.blur();
                          }
                          if (e.key === 'Escape') {
                            skipSaveRef.current = true;
                            e.target.blur();
                          }
                        }}
                        className="o_input"
                        style={{ marginTop: 4 }}
                      />
                    ) : (
                      <span
                        onClick={() => beginEditSegment(i)}
                        title={t('segment_edit_hint')}
                        className="txt"
                      >
                        {seg.text}
                      </span>
                    )}
                  </div>
                  <button onClick={() => deleteSegment(i)} title={t('segment_delete')} className="del">
                    <Glyph name="close" size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* Manual notes — included in summary / translation / PDF / copy */}
            <div style={{ marginTop: 12 }}>
              <label className="o_ma_panel_label" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--o-font-size-xs)', fontWeight: 'var(--o-font-weight-bold)', color: 'var(--o-main-color-muted)', marginBottom: 6 }}>
                <Glyph name="edit" size={14} /> {t('manual_notes')}
              </label>
              <textarea
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder={t('manual_notes_placeholder')}
                rows={3}
                className="o_input"
              />
            </div>

            <div className="o_ma_count">
              {t('word_count')} <strong>{wordCount}</strong>
            </div>
          </div>
        </div>

        {/* Summary Card */}
        <div className="o_ma_card">
          <div className="o_ma_card_head">
            <div className="ttl"><Glyph name="sparkles" size={16} /> <span>{t('summary_title')}</span></div>
          </div>
          <div className="o_ma_card_body">
            <div className="o_ma_panel">
              <div className="lbl"><Glyph name="key" size={14} /> {t('key_points')}</div>
              <div className="o_ma_text">
                {summaryData?.keyPoints?.length > 0
                  ? summaryData.keyPoints.map((p, i) => <div key={i}>• {p}</div>)
                  : <div className="o_ma_muted">{t('no_summary')}</div>}
              </div>
            </div>
            <div className="o_ma_panel">
              <div className="lbl"><Glyph name="check" size={14} /> {t('decisions')}</div>
              <div className="o_ma_text">
                {summaryData?.decisions?.length > 0
                  ? summaryData.decisions.map((d, i) => <div key={i}>• {d}</div>)
                  : <div>—</div>}
              </div>
            </div>
            <div className="o_ma_panel">
              <div className="lbl"><Glyph name="list" size={14} /> {t('action_items')}</div>
              <div className="o_ma_text">
                {summaryData?.actions?.length > 0
                  ? summaryData.actions.map((a, i) => <div key={i}>• {a}</div>)
                  : <div>—</div>}
              </div>
            </div>
          </div>
        </div>

        {/* Translation & Export Card */}
        <div className="o_ma_card">
          <div className="o_ma_card_head">
            <div className="ttl"><Glyph name="globe" size={16} /> <span>{t('translation_export')}</span></div>
          </div>
          <div className="o_ma_card_body">
            <div className="o_ma_row" style={{ marginTop: 0 }}>
              <button onClick={doTranslate} className="btn btn-secondary grow">
                <Glyph name="translate" size={15} /> {t('btn_translate')}
              </button>
              <button onClick={exportPDF} className="btn btn-secondary grow">
                <Glyph name="doc" size={15} /> {t('btn_export_pdf')}
              </button>
            </div>
            {/* تنزيل التسجيل الصوتي محليًّا (webm) — يظهر مفعّلًا بعد إيقاف تسجيلٍ فيه صوت */}
            <button
              onClick={downloadMeetingAudio}
              disabled={!audio.audioBlob}
              className="btn btn-secondary"
              style={{ width: '100%', marginTop: 10 }}
            >
              <Glyph name="download" size={15} /> {t('btn_download_audio')}
            </button>
            <div
              className="o_ma_panel o_ma_scroll o_ma_text"
              dir="ltr"
              style={{ textAlign: 'left', marginTop: 12 }}
            >
              {englishTranslation || <span className="o_ma_muted">{t('translation_placeholder')}</span>}
            </div>
            <p className="o_ma_count">{t('translation_note')}</p>
          </div>
        </div>

        {/* Signature Card */}
        <div className="o_ma_card">
          <div className="o_ma_sig">
            <div className="av"><Glyph name="user" size={20} /></div>
            <div className="flex-1">
              <div className="n">AI Meeting Assistant</div>
              <div className="r">Official Recorder</div>
              <div className="d" dir="ltr">
                {new Date().toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="o_ma_bottom">
        <button
          onClick={toggleRecord}
          disabled={!speechSupported}
          className={`o_ma_rec ${isRecording ? 'is-recording' : ''}`}
        >
          <Glyph name={recordGlyph} size={20} />
        </button>
        <button onClick={stopRecording} disabled={!isRecording} className="btn is-danger grow">
          <Glyph name="stop" size={14} /> {t('btn_stop')}
        </button>
        <button onClick={exportPDF} className="btn btn-secondary grow">
          <Glyph name="doc" size={14} /> PDF
        </button>
        <button onClick={doSummarize} className="btn btn-primary grow">
          <Glyph name="sparkles" size={14} /> {t('btn_summarize')}
        </button>
      </div>

      {/* Toast Notification */}
      {toast.show && (
        <div className="o_ma_toast">
          {toast.msg}
        </div>
      )}
    </div>
  );
};

export default MeetingAssistant;
