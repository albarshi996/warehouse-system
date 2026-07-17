import React, { useState, useEffect, useRef } from 'react';
import styles from './MeetingAssistant.module.css';

const ARCHIVE_KEY = 'BrandzoMeetings';

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
    btn_clear: 'مسح الكل',
    btn_copy: 'نسخ الكل',
    transcript_title: 'تفريغ المحادثة',
    transcript_placeholder: 'ابدأ التسجيل أو اكتب في الملاحظات اليدوية بالأسفل... ✍️',
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
    badge_live: '● مباشر',
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
    toast_copied: '✅ تم النسخ',
    toast_pdf_exported: '✅ تم تصدير PDF',
    toast_translated: '✅ تمت الترجمة',
    toast_summarized: '✅ تم التلخيص',
    toast_cleared: '🗑️ تم المسح',
    toast_saved: '💾 تم الحفظ',
    toast_session_saved: '💾 تم حفظ الجلسة في الأرشيف',
    toast_session_loaded: '📂 تم تحميل الجلسة',
    toast_session_deleted: '🗑️ تم حذف الجلسة',
    toast_no_content: '⚠️ لا يوجد محتوى',
    toast_mic_error: '⚠️ تعذر الوصول للميكروفون',
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
    btn_clear: 'Clear All',
    btn_copy: 'Copy All',
    transcript_title: 'Transcript',
    transcript_placeholder: 'Start recording or type in the manual notes below... ✍️',
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
    badge_live: '● Live',
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
    toast_copied: '✅ Copied to clipboard',
    toast_pdf_exported: '✅ PDF exported successfully',
    toast_translated: '✅ Translation complete',
    toast_summarized: '✅ Summary generated',
    toast_cleared: '🗑️ Content cleared',
    toast_saved: '💾 Recording saved',
    toast_session_saved: '💾 Session saved to archive',
    toast_session_loaded: '📂 Session loaded',
    toast_session_deleted: '🗑️ Session deleted',
    toast_no_content: '⚠️ No content available',
    toast_mic_error: '⚠️ Microphone access denied',
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
  // Slide mode for presentation
  const [slideMode, setSlideMode] = useState(false);
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

    showToast('🎙️ ' + (lang === 'ar' ? 'بدأ التسجيل...' : 'Recording started...'));
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
    showToast(t('toast_saved'), 3000);
  };

  // Keep the ref pointing at the latest closure (used by recognition.onerror)
  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  });

  const resumeRecognition = () => {
    isPausedRef.current = false;
    setIsPaused(false);
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
      showToast('⚠️ ' + (lang === 'ar' ? 'خدمة الترجمة غير متاحة' : 'Translation service unavailable'));
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

    let sumHTML = '';
    if (summary) {
      sumHTML += `<p><strong>🔑 ${lang === 'ar' ? 'النقاط الرئيسية' : 'Key Points'}:</strong><br>${summary.keyPoints.map((p) => '• ' + p).join('<br>')}</p>`;
      sumHTML += `<p style="margin-top:10px;"><strong>✅ ${lang === 'ar' ? 'القرارات' : 'Decisions'}:</strong><br>${summary.decisions.map((d) => '• ' + d).join('<br>')}</p>`;
      sumHTML += `<p style="margin-top:10px;"><strong>📋 ${lang === 'ar' ? 'المهام' : 'Action Items'}:</strong><br>${summary.actions.map((a) => '• ' + a).join('<br>')}</p>`;
    } else {
      sumHTML = `<p>${lang === 'ar' ? 'لا يوجد ملخص' : 'No summary available'}</p>`;
    }

    const trans = translation || '';
    const titleTrim = (title || '').trim();
    const htmlContent = `
      <div style="font-family: 'Segoe UI', sans-serif; line-height: 1.7; direction: ${lang === 'ar' ? 'rtl' : 'ltr'}; padding: 48px;">
        <div style="border-bottom: 3px solid #4a90ff; padding-bottom: 20px; margin-bottom: 24px;">
          <h1 style="font-size: 1.6rem; color: #0a0a1f; margin-bottom: 4px;">📋 ${lang === 'ar' ? 'محضر اجتماع' : 'Meeting Minutes'}</h1>
          ${titleTrim ? `<p style="font-size: 1rem; color: #333; font-weight: bold;">${titleTrim}</p>` : ''}
          <p style="font-size: 0.8rem; color: #666;">AI Meeting Assistant</p>
          <p style="margin-top: 3px; color: #888; font-size: 0.75rem;">${dateStr}</p>
        </div>
        ${segText.trim() ? `<div style="background: #f7f9ff; border-radius: 9px; border-right: 5px solid #4a90ff; padding: 14px 16px; margin-bottom: 18px;">
          <h3 style="color: #4a90ff; margin-bottom: 8px;">📝 ${lang === 'ar' ? 'تفريغ المحادثة' : 'Transcript'}</h3>
          <p style="color: #333; font-size: 0.88rem; white-space: pre-wrap;">${segText}</p>
        </div>` : ''}
        ${notesTrim ? `<div style="background: #fffaf0; border-radius: 9px; border-right: 5px solid #f0a500; padding: 14px 16px; margin-bottom: 18px;">
          <h3 style="color: #b07d00; margin-bottom: 8px;">🖊️ ${lang === 'ar' ? 'ملاحظات يدوية' : 'Manual Notes'}</h3>
          <p style="color: #333; font-size: 0.88rem; white-space: pre-wrap;">${notesTrim}</p>
        </div>` : ''}
        <div style="background: #f7f9ff; border-radius: 9px; border-right: 5px solid #4a90ff; padding: 14px 16px; margin-bottom: 18px;">
          <h3 style="color: #4a90ff; margin-bottom: 8px;">🧠 ${lang === 'ar' ? 'الملخص' : 'Summary'}</h3>
          ${sumHTML}
        </div>
        ${trans && trans.length > 5 ? `<div style="background: #f0fbf8; border-radius: 9px; border-left: 5px solid #00a587; padding: 14px 16px; direction: ltr; text-align: left;"><h3 style="color: #00a587; margin-bottom: 8px;">🌍 English Translation</h3><p style="color: #333; font-size: 0.88rem; white-space: pre-wrap;">${trans}</p></div>` : ''}
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
      showToast('⚠️ PDF export failed');
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
    showToast(t('toast_cleared'));
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
      .catch(() => showToast('⚠️ ' + (lang === 'ar' ? 'فشل النسخ' : 'Copy failed')));
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

  const recordBtnText = isRecording && !isPaused ? '⏸️' : isRecording && isPaused ? '▶️' : '🎙️';
  const statusDotClasses = {
    ready: 'bg-gray-500',
    recording: `${styles.dotBlink} bg-red-500`,
    paused: `${styles.dotBlink} bg-amber-400`,
    processing: `${styles.dotBlink} bg-blue-500`,
  };

  return (
    <div className={`min-h-screen bg-slate-950 text-gray-100 flex flex-col ${lang === 'ar' ? 'dir-rtl' : 'dir-ltr'}`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Background mesh */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-gradient-radial from-blue-500/10 via-transparent to-transparent blur-3xl" />
        <div className="absolute inset-0 bg-gradient-radial from-teal-500/5 via-transparent to-transparent blur-3xl" />
      </div>

      {/* Slide Mode Overlay */}
      {slideMode && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-6" dir="rtl">
          <div className="max-w-4xl w-full bg-white rounded-xl p-8 text-right" style={{direction:'rtl'}}>
            <div className="flex flex-col gap-2">
              <div className="text-xs uppercase tracking-[0.22em] text-brand-red">القالب المسبق</div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-brand-navy">{slideTitle}</h2>
                  <p className="mt-2 text-sm text-gray-200">عرض شرائح لتقديم خطة استغلال الرحبة لتخزين الكوزميتيك.</p>
                </div>
                <button onClick={()=> setSlideMode(false)} className="px-3 py-1 rounded bg-gray-200">إغلاق</button>
              </div>
            </div>
            <div className="mt-6 text-gray-700" style={{minHeight:180}}>
              {agendaItems[slideIndex]?.content || <p className="text-gray-200">لا توجد تفاصيل محددة لهذه الشريحة حالياً.</p>}
            </div>
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-gray-200">الشريحة {slideIndex + 1} من {agendaItems.length}</div>
              <div className="flex gap-2">
                <button onClick={()=> setSlideIndex(s => Math.max(0, s-1))} className="px-3 py-1 rounded bg-white border">السابق</button>
                <button onClick={()=> setSlideIndex(s => Math.min(agendaItems.length-1, s+1))} className="px-3 py-1 rounded bg-brand-red text-white">التالي</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Archive Drawer */}
      {archiveOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center"
          onClick={() => { setArchiveOpen(false); setConfirmDeleteId(null); }}
        >
          <div
            className="w-full max-w-lg max-h-[75vh] bg-slate-900 border border-white/10 rounded-t-xl sm:rounded-xl overflow-hidden flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2 text-sm font-bold">
                📂 <span>{t('archive_title')}</span>
                <span className="text-xs text-gray-400 font-mono">({savedMeetings.length})</span>
              </div>
              <button
                onClick={() => { setArchiveOpen(false); setConfirmDeleteId(null); }}
                className="w-7 h-7 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 flex items-center justify-center text-xs transition"
                title={t('btn_close')}
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {savedMeetings.length === 0 && (
                <div className="text-gray-400 italic text-sm text-center py-8">{t('archive_empty')}</div>
              )}
              {savedMeetings.map((m) => (
                <div key={m.id} className="bg-white/3 border border-white/10 rounded-lg p-3">
                  <div className="font-bold text-sm text-gray-100 truncate">{m.title}</div>
                  <div className="text-xs text-gray-400 font-mono mt-0.5" dir="ltr">
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
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      onClick={() => loadMeeting(m)}
                      className="py-1 px-3 rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-400 font-semibold text-xs hover:bg-teal-500/20 transition"
                    >
                      📥 {t('btn_load')}
                    </button>
                    <button
                      onClick={() => exportMeetingPDF(m)}
                      className="py-1 px-3 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400 font-semibold text-xs hover:bg-blue-500/20 transition"
                    >
                      📄 {t('btn_export_pdf')}
                    </button>
                    {confirmDeleteId === m.id ? (
                      <>
                        <button
                          onClick={() => deleteMeeting(m.id)}
                          className="py-1 px-3 rounded-lg bg-red-500 text-white font-semibold text-xs hover:bg-red-600 transition"
                        >
                          {t('btn_confirm_delete')}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="py-1 px-3 rounded-lg border border-white/10 bg-white/5 text-gray-200 font-semibold text-xs hover:bg-white/10 transition"
                        >
                          {t('btn_cancel')}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(m.id)}
                        className="py-1 px-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 font-semibold text-xs hover:bg-red-500/20 transition"
                      >
                        🗑️ {t('btn_delete')}
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
      <nav className="fixed top-0 left-0 right-0 h-16 bg-black/80 border-b border-white/10 backdrop-blur-xl z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-lg flex-shrink-0">
            🎙️
          </div>
          <div className="flex flex-col">
            <div className="text-sm font-bold leading-tight">{t('app_title')}</div>
            <div className="text-xs text-gray-200 font-mono">AI Meeting Assistant</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-2 text-xs text-gray-100">
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDotClasses[statusDot]}`} />
            <span>
              {statusDot === 'ready' && t('status_ready')}
              {statusDot === 'recording' && t('status_recording')}
              {statusDot === 'paused' && t('status_paused')}
              {statusDot === 'processing' && (processingMsg || t('status_processing'))}
            </span>
            {isRecording && (
              <span className="font-mono text-gray-300 border-s border-white/10 ps-2" dir="ltr">
                {formatTime(elapsedSec)}
              </span>
            )}
          </div>
          <button
            onClick={clearAll}
            className="w-8 h-8 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 flex items-center justify-center text-sm transition"
            title={t('btn_clear')}
          >
            🗑️
          </button>
          <button
            onClick={() => setSlideMode(true)}
            className="ml-2 px-3 py-1 rounded-lg bg-brand-gold text-brand-navy text-sm font-semibold hover:opacity-90 transition"
            title="تحميل القالب المسبق"
          >
            📥 تحميل القالب
          </button>
          <button
            onClick={() => {
              if (!slideMode) setSlideIndex(0);
              setSlideMode((prev) => !prev);
            }}
            className={`ml-2 px-3 py-1 rounded-lg text-sm font-semibold transition ${slideMode ? 'bg-brand-red text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
            title={slideMode ? 'إيقاف وضع العرض' : 'تشغيل وضع العرض'}
          >
            📽️ {slideMode ? 'إيقاف العرض' : 'عرض'}
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div className="relative z-10 flex-1 flex flex-col pt-16 pb-20 px-4">
        {/* Unsupported browser banner */}
        {!speechSupported && (
          <div className="mt-3 px-4 py-3 rounded-xl border border-amber-400/40 bg-amber-500/10 text-amber-300 text-sm flex items-center gap-2">
            <span className="flex-shrink-0">⚠️</span>
            <span>{t('unsupported_browser')}</span>
          </div>
        )}

        {/* Recording Ring */}
        <div className="flex flex-col items-center gap-5 py-6">
          <div className={`relative w-32 h-32 flex items-center justify-center ${isRecording && !isPaused ? styles.ringLive : ''}`}>
            <div className={`absolute rounded-full border-2 border-red-500/20 inset-0 ${styles.ringOuter}`} />
            <div className={`absolute rounded-full border-2 border-red-500/10 inset-0 -m-2.5 ${styles.ringMiddle}`} />
            <div className={`absolute rounded-full border-2 border-red-500/5 inset-0 -m-5 ${styles.ringInner}`} />

            <button
              onClick={toggleRecord}
              disabled={!speechSupported}
              className={`w-20 h-20 rounded-full border-2 border-transparent flex items-center justify-center text-2xl font-bold transition-all transform active:scale-95 z-10 relative disabled:opacity-40 disabled:cursor-not-allowed ${
                isRecording
                  ? 'bg-slate-800 border-red-500 shadow-lg shadow-red-500/30'
                  : 'bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/40'
              }`}
            >
              {recordBtnText}
            </button>
          </div>

          {/* Waveform bars */}
          <div className="flex items-center justify-center gap-1 h-8">
            {waveHeights.map((height, i) => (
              <div
                key={i}
                className={`w-1 rounded-sm transition-all duration-100 ${isRecording && !isPaused ? 'bg-red-500' : 'bg-gray-700'}`}
                style={{ height: `${height}px` }}
              />
            ))}
          </div>

          {/* Control buttons */}
          <div className="w-full flex gap-2 px-0">
            <button
              onClick={stopRecording}
              disabled={!isRecording}
              className="flex-1 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 disabled:opacity-30 disabled:cursor-not-allowed font-semibold text-sm hover:bg-red-500/20 transition"
            >
              ⏹️ {t('btn_stop')}
            </button>
            <button
              onClick={togglePause}
              disabled={!isRecording}
              className="flex-1 py-2 rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-400 disabled:opacity-30 disabled:cursor-not-allowed font-semibold text-sm hover:bg-teal-500/20 transition"
            >
              {isPaused ? '▶️' : '⏸️'} {isPaused ? t('btn_resume') : t('btn_pause')}
            </button>
            <select
              value={selectedLang}
              onChange={(e) => setSelectedLang(e.target.value)}
              className="flex-1 py-2 rounded-lg border border-white/10 bg-white/5 text-gray-200 font-semibold text-sm hover:bg-white/10 transition appearance-none px-2"
            >
              <option value="ar-SA">🇸🇦 العربية</option>
              <option value="ar-EG">🇪🇬 مصري</option>
              <option value="en-US">🇺🇸 English</option>
              <option value="en-GB">🇬🇧 English UK</option>
            </select>
          </div>

          {/* Action buttons */}
          <div className="w-full flex gap-2">
            <button
              onClick={toggleLang}
              className="py-2 px-3 rounded-lg border border-white/10 bg-white/5 text-gray-100 font-semibold text-sm hover:bg-white/10 transition whitespace-nowrap"
            >
              🌐 {lang === 'ar' ? 'AR' : 'EN'}
            </button>
            <button
              onClick={doSummarize}
              className="flex-1 py-2 rounded-lg border border-blue-500/30 bg-blue-500 text-white font-semibold text-sm hover:bg-blue-600 transition"
            >
              ✨ {t('btn_summarize')}
            </button>
            <button
              onClick={copyAll}
              className="py-2 px-3 rounded-lg border border-white/10 bg-white/5 text-gray-100 font-semibold text-sm hover:bg-white/10 transition"
            >
              📋
            </button>
          </div>

          {/* Session save / archive bar */}
          <div className="w-full flex gap-2">
            <input
              type="text"
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              placeholder={t('meeting_title_placeholder')}
              className="flex-1 min-w-0 py-2 px-3 rounded-lg border border-white/10 bg-white/5 text-sm text-gray-100 outline-none focus:border-amber-400/50 focus:ring-2 focus:ring-amber-400/10 transition"
            />
            <button
              onClick={saveSession}
              className="py-2 px-3 rounded-lg border border-amber-400/30 bg-amber-500/10 text-amber-300 font-semibold text-sm hover:bg-amber-500/20 transition whitespace-nowrap"
            >
              💾 {t('btn_save_session')}
            </button>
            <button
              onClick={() => setArchiveOpen(true)}
              className="py-2 px-3 rounded-lg border border-white/10 bg-white/5 text-gray-100 font-semibold text-sm hover:bg-white/10 transition whitespace-nowrap"
            >
              📂 {t('btn_archive')}
              <span className="text-xs text-gray-400 font-mono ms-1">({savedMeetings.length})</span>
            </button>
          </div>
        </div>

        {/* Transcript Card */}
        <div className="bg-white/3 border border-white/10 rounded-xl overflow-hidden mb-3">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2 text-sm font-bold">
              📝 <span>{t('transcript_title')}</span>
            </div>
            {isRecording && !isPaused && <div className="text-xs text-red-400 font-bold animate-pulse">● {t('badge_live')}</div>}
          </div>
          <div className="px-4 py-3">
            {/* Segments list — click a segment to edit, ✕ to delete */}
            <div className="w-full min-h-40 max-h-60 overflow-y-auto bg-black/25 border border-white/10 rounded-lg p-3 text-sm leading-relaxed text-gray-200 space-y-2">
              {transcriptSegments.length === 0 && (
                <div className="text-gray-400 italic">{t('transcript_placeholder')}</div>
              )}
              {transcriptSegments.map((seg, i) => (
                <div key={`${seg.ts}-${i}`} className="group flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-teal-400 text-xs font-bold">{seg.speaker}</span>{' '}
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
                        className="w-full mt-1 bg-black/40 border border-blue-500/50 rounded-lg p-2 text-sm leading-relaxed text-gray-100 outline-none focus:ring-2 focus:ring-blue-500/10 resize-y"
                      />
                    ) : (
                      <span
                        onClick={() => beginEditSegment(i)}
                        title={t('segment_edit_hint')}
                        className="text-gray-200 cursor-text hover:bg-white/5 rounded px-0.5 transition"
                      >
                        {seg.text}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => deleteSegment(i)}
                    title={t('segment_delete')}
                    className="opacity-40 group-hover:opacity-100 hover:text-red-400 text-gray-400 text-xs px-1 py-0.5 flex-shrink-0 transition"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* Manual notes — included in summary / translation / PDF / copy */}
            <div className="mt-3">
              <label className="block text-xs font-bold text-amber-400 mb-1.5">🖊️ {t('manual_notes')}</label>
              <textarea
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder={t('manual_notes_placeholder')}
                rows={3}
                className="w-full bg-black/25 border border-white/10 rounded-lg p-3 text-sm leading-relaxed text-gray-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 resize-y"
              />
            </div>

            <div className="mt-2 text-xs text-gray-200 font-mono">
              {t('word_count')} <strong className="text-gray-100">{wordCount}</strong>
            </div>
          </div>
        </div>

        {/* Summary Card */}
        <div className="bg-white/3 border border-white/10 rounded-xl overflow-hidden mb-3">
          <div className="px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2 text-sm font-bold">
              🧠 <span>{t('summary_title')}</span>
            </div>
          </div>
          <div className="px-4 py-3 space-y-2">
            <div className="bg-black/20 border border-white/10 rounded-lg p-3">
              <div className="text-xs font-bold text-teal-400 mb-2">🔑 {t('key_points')}</div>
              <div className="text-sm text-gray-100 space-y-1">
                {summaryData?.keyPoints?.length > 0
                  ? summaryData.keyPoints.map((p, i) => <div key={i}>• {p}</div>)
                  : <div className="text-gray-200 italic">{t('no_summary')}</div>}
              </div>
            </div>
            <div className="bg-black/20 border border-white/10 rounded-lg p-3">
              <div className="text-xs font-bold text-blue-400 mb-2">✅ {t('decisions')}</div>
              <div className="text-sm text-gray-100 space-y-1">
                {summaryData?.decisions?.length > 0
                  ? summaryData.decisions.map((d, i) => <div key={i}>✅ {d}</div>)
                  : <div className="text-gray-200">—</div>}
              </div>
            </div>
            <div className="bg-black/20 border border-white/10 rounded-lg p-3">
              <div className="text-xs font-bold text-amber-400 mb-2">📋 {t('action_items')}</div>
              <div className="text-sm text-gray-100 space-y-1">
                {summaryData?.actions?.length > 0
                  ? summaryData.actions.map((a, i) => <div key={i}>📌 {a}</div>)
                  : <div className="text-gray-200">—</div>}
              </div>
            </div>
          </div>
        </div>

        {/* Translation & Export Card */}
        <div className="bg-white/3 border border-white/10 rounded-xl overflow-hidden mb-3">
          <div className="px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2 text-sm font-bold">
              🌍 <span>{t('translation_export')}</span>
            </div>
          </div>
          <div className="px-4 py-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={doTranslate}
                className="py-2 rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-400 font-semibold text-sm hover:bg-teal-500/20 transition"
              >
                🔄 {t('btn_translate')}
              </button>
              <button
                onClick={exportPDF}
                className="py-2 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400 font-semibold text-sm hover:bg-blue-500/20 transition"
              >
                📄 {t('btn_export_pdf')}
              </button>
            </div>
            <div
              className="w-full min-h-24 max-h-40 overflow-y-auto bg-black/25 border border-white/10 rounded-lg p-3 text-sm leading-relaxed text-gray-100 font-sans"
              dir="ltr"
              style={{ textAlign: 'left' }}
            >
              {englishTranslation || <span className="text-gray-200 italic">{t('translation_placeholder')}</span>}
            </div>
            <p className="text-xs text-gray-200 font-mono">{t('translation_note')}</p>
          </div>
        </div>

        {/* Signature Card */}
        <div className="relative bg-white/3 border border-amber-400/20 rounded-xl overflow-hidden p-4 flex items-center gap-3">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500 to-transparent" />
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-lg flex-shrink-0">
            👤
          </div>
          <div className="flex-1">
            <div className="font-bold text-sm">AI Meeting Assistant</div>
            <div className="text-xs text-amber-500 font-mono">Official Recorder</div>
            <div className="text-xs text-gray-200 font-mono" dir="ltr">
              {new Date().toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 h-20 bg-black/80 border-t border-white/10 backdrop-blur-xl z-40 flex items-center justify-between px-4 gap-2">
        <button
          onClick={toggleRecord}
          disabled={!speechSupported}
          className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold transition-all transform active:scale-95 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
            isRecording
              ? 'bg-slate-800 border-2 border-red-500 shadow-lg shadow-red-500/30'
              : 'bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/40'
          }`}
        >
          {recordBtnText}
        </button>
        <button
          onClick={stopRecording}
          disabled={!isRecording}
          className="flex-1 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 disabled:opacity-30 disabled:cursor-not-allowed font-semibold text-xs hover:bg-red-500/20 transition"
        >
          ⏹️ {t('btn_stop')}
        </button>
        <button
          onClick={exportPDF}
          className="flex-1 py-2 rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-400 font-semibold text-xs hover:bg-teal-500/20 transition"
        >
          📄 PDF
        </button>
        <button
          onClick={doSummarize}
          className="flex-1 py-2 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400 font-semibold text-xs hover:bg-blue-500/20 transition"
        >
          ✨ {t('btn_summarize')}
        </button>
      </div>

      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-slate-800 border border-white/15 text-gray-100 px-5 py-2 rounded-full text-sm font-semibold z-50 shadow-lg max-w-xs text-center">
          {toast.msg}
        </div>
      )}
    </div>
  );
};

export default MeetingAssistant;
