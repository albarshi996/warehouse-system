import React, { useState, useEffect, useRef } from 'react';
import styles from './MeetingAssistant.module.css';

const i18n = {
  ar: {
    app_title: 'مساعد الاجتماعات الذكي',
    status_ready: 'جاهز',
    status_recording: 'جاري التسجيل...',
    status_paused: 'متوقف مؤقتاً',
    status_processing: 'جاري المعالجة...',
    btn_stop: 'إيقاف',
    btn_pause: 'تعليق',
    btn_resume: 'استئناف',
    btn_summarize: 'تلخيص ذكي',
    btn_translate: 'ترجمة للإنجليزية',
    btn_export_pdf: 'تصدير PDF',
    btn_clear: 'مسح الكل',
    btn_copy: 'نسخ الكل',
    transcript_title: 'تفريغ المحادثة',
    transcript_placeholder: 'اكتب ملاحظاتك هنا أو ابدأ التسجيل... ✍️',
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
    toast_copied: '✅ تم النسخ',
    toast_pdf_exported: '✅ تم تصدير PDF',
    toast_translated: '✅ تمت الترجمة',
    toast_summarized: '✅ تم التلخيص',
    toast_cleared: '🗑️ تم المسح',
    toast_saved: '💾 تم الحفظ',
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
    btn_stop: 'Stop',
    btn_pause: 'Pause',
    btn_resume: 'Resume',
    btn_summarize: 'Smart Summary',
    btn_translate: 'Translate to English',
    btn_export_pdf: 'Export PDF',
    btn_clear: 'Clear All',
    btn_copy: 'Copy All',
    transcript_title: 'Transcript',
    transcript_placeholder: 'Type your notes or start recording... ✍️',
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
    toast_copied: '✅ Copied to clipboard',
    toast_pdf_exported: '✅ PDF exported successfully',
    toast_translated: '✅ Translation complete',
    toast_summarized: '✅ Summary generated',
    toast_cleared: '🗑️ Content cleared',
    toast_saved: '💾 Recording saved',
    toast_no_content: '⚠️ No content available',
    toast_mic_error: '⚠️ Microphone access denied',
    no_summary: 'No summary yet. Record then tap Summarize.',
  },
};

const MeetingAssistant = () => {
  // State
  const [lang, setLang] = useState('ar');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [transcriptSegments, setTranscriptSegments] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [englishTranslation, setEnglishTranslation] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [toast, setToast] = useState({ msg: '', show: false });
  const [waveHeights, setWaveHeights] = useState(Array(10).fill(0).map((_, i) => 6 + (i % 3) * 5));
  const [selectedLang, setSelectedLang] = useState('ar-SA');
  const [statusDot, setStatusDot] = useState('ready');

  // Refs
  const recognitionRef = useRef(null);
  const interimTranscriptRef = useRef('');
  const finalTranscriptRef = useRef('');
  const waveIntervalRef = useRef(null);
  const transcriptAreaRef = useRef(null);
  const translationAreaRef = useRef(null);
  const toastTimerRef = useRef(null);
  const pdfTemplateRef = useRef(null);

  const t = (key) => i18n[lang]?.[key] || i18n.ar[key] || key;

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = selectedLang;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e) => {
      if (isPaused) return;

      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript.trim();
        if (e.results[i].isFinal) {
          if (transcript) {
            finalTranscriptRef.current += transcript + ' ';
            const speaker = lang === 'ar' ? '🗣 المتحدث' : '🗣 Speaker';
            setTranscriptSegments((prev) => [
              ...prev,
              {
                speaker: speaker + ' ' + (prev.length + 1),
                text: transcript,
                ts: new Date().toISOString(),
              },
            ]);
          }
        } else {
          interim += transcript;
        }
      }
      interimTranscriptRef.current = interim;
    };

    recognition.onerror = (e) => {
      if (e.error === 'not-allowed') {
        showToast(t('toast_mic_error'));
        stopRecording();
      }
    };

    recognition.onend = () => {
      if (isRecording && !isPaused && recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (ex) {
          // Ignore
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (ex) {
          // Ignore
        }
      }
    };
  }, [isPaused, selectedLang, lang]);

  // Waveform animation
  useEffect(() => {
    if (!isRecording || isPaused) {
      setWaveHeights(Array(10).fill(0).map((_, i) => 6 + (i % 3) * 5));
      if (waveIntervalRef.current) {
        clearInterval(waveIntervalRef.current);
        waveIntervalRef.current = null;
      }
      return;
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
      }
    };
  }, [isRecording, isPaused]);

  // Update word count
  useEffect(() => {
    const text = transcriptSegments.map((s) => s.text).filter(Boolean).join(' ');
    setWordCount(text.trim().split(/\s+/).filter((x) => x.length > 0).length);
  }, [transcriptSegments]);

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

  const showToast = (msg, duration = 2800) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, show: true });
    toastTimerRef.current = setTimeout(() => {
      setToast({ msg: '', show: false });
    }, duration);
  };

  const startRecording = () => {
    if (!recognitionRef.current) {
      showToast(t('toast_mic_error'));
      return;
    }

    recognitionRef.current.lang = selectedLang;
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';

    setIsRecording(true);
    setIsPaused(false);

    try {
      recognitionRef.current.start();
    } catch (ex) {
      // Ignore
    }

    showToast('🎙️ ' + (lang === 'ar' ? 'بدأ التسجيل...' : 'Recording started...'));
  };

  const stopRecording = () => {
    setIsRecording(false);
    setIsPaused(false);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (ex) {
        // Ignore
      }
    }

    if (interimTranscriptRef.current.trim()) {
      finalTranscriptRef.current += interimTranscriptRef.current + ' ';
      const speaker = lang === 'ar' ? '🗣 المتحدث' : '🗣 Speaker';
      setTranscriptSegments((prev) => [
        ...prev,
        {
          speaker: speaker + ' ' + (prev.length + 1),
          text: interimTranscriptRef.current.trim(),
          ts: new Date().toISOString(),
        },
      ]);
      interimTranscriptRef.current = '';
    }

    showToast(t('toast_saved'), 3000);
  };

  const togglePause = () => {
    if (!isRecording) return;

    const newPaused = !isPaused;
    setIsPaused(newPaused);

    if (newPaused) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (ex) {
          // Ignore
        }
      }

      if (interimTranscriptRef.current.trim()) {
        finalTranscriptRef.current += interimTranscriptRef.current + ' ';
        const speaker = lang === 'ar' ? '🗣 المتحدث' : '🗣 Speaker';
        setTranscriptSegments((prev) => [
          ...prev,
          {
            speaker: speaker + ' ' + (prev.length + 1),
            text: interimTranscriptRef.current.trim(),
            ts: new Date().toISOString(),
          },
        ]);
        interimTranscriptRef.current = '';
      }
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.lang = selectedLang;
        try {
          recognitionRef.current.start();
        } catch (ex) {
          // Ignore
        }
      }
    }
  };

  const toggleRecord = () => {
    if (!isRecording) {
      startRecording();
    } else if (isPaused) {
      setIsPaused(false);
      if (recognitionRef.current) {
        recognitionRef.current.lang = selectedLang;
        try {
          recognitionRef.current.start();
        } catch (ex) {
          // Ignore
        }
      }
    } else {
      togglePause();
    }
  };

  const getText = () => {
    return transcriptSegments.map((s) => s.text).filter(Boolean).join(' ');
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

  const doTranslate = async () => {
    const txt = getText();
    if (!txt || txt.trim().length < 5) {
      showToast(t('toast_no_content'));
      return;
    }

    setStatusDot('processing');

    try {
      const res = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(txt.substring(0, 500))}&langpair=ar|en&de=meeting@assistant.ai`
      );
      const data = await res.json();

      if (data?.responseData?.translatedText) {
        setEnglishTranslation(data.responseData.translatedText);
        showToast(t('toast_translated'), 3000);
      } else {
        throw new Error('no translation');
      }
    } catch (err) {
      setEnglishTranslation('[Translation unavailable. Please try again.]');
      showToast('⚠️ ' + (lang === 'ar' ? 'خدمة الترجمة غير متاحة' : 'Translation service unavailable'));
    }

    setStatusDot(isRecording && !isPaused ? 'recording' : isRecording && isPaused ? 'paused' : 'ready');
  };

  const exportPDF = async () => {
    if (typeof window === 'undefined') {
      return;
    }

    const txt = getText();
    if (!txt || txt.trim().length < 3) {
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
    if (summaryData) {
      sumHTML += `<p><strong>🔑 ${lang === 'ar' ? 'النقاط الرئيسية' : 'Key Points'}:</strong><br>${summaryData.keyPoints.map((p) => '• ' + p).join('<br>')}</p>`;
      sumHTML += `<p style="margin-top:10px;"><strong>✅ ${lang === 'ar' ? 'القرارات' : 'Decisions'}:</strong><br>${summaryData.decisions.map((d) => '• ' + d).join('<br>')}</p>`;
      sumHTML += `<p style="margin-top:10px;"><strong>📋 ${lang === 'ar' ? 'المهام' : 'Action Items'}:</strong><br>${summaryData.actions.map((a) => '• ' + a).join('<br>')}</p>`;
    } else {
      sumHTML = `<p>${lang === 'ar' ? 'لا يوجد ملخص' : 'No summary available'}</p>`;
    }

    const trans = englishTranslation || '';
    const htmlContent = `
      <div style="font-family: 'Segoe UI', sans-serif; line-height: 1.7; direction: ${lang === 'ar' ? 'rtl' : 'ltr'}; padding: 48px;">
        <div style="border-bottom: 3px solid #4a90ff; padding-bottom: 20px; margin-bottom: 24px;">
          <h1 style="font-size: 1.6rem; color: #0a0a1f; margin-bottom: 4px;">📋 ${lang === 'ar' ? 'محضر اجتماع' : 'Meeting Minutes'}</h1>
          <p style="font-size: 0.8rem; color: #666;">AI Meeting Assistant</p>
          <p style="margin-top: 3px; color: #888; font-size: 0.75rem;">${dateStr}</p>
        </div>
        <div style="background: #f7f9ff; border-radius: 9px; border-right: 5px solid #4a90ff; padding: 14px 16px; margin-bottom: 18px;">
          <h3 style="color: #4a90ff; margin-bottom: 8px;">📝 ${lang === 'ar' ? 'تفريغ المحادثة' : 'Transcript'}</h3>
          <p style="color: #333; font-size: 0.88rem; white-space: pre-wrap;">${txt}</p>
        </div>
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

  const clearAll = () => {
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    setTranscriptSegments([]);
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        doSummarize();
      }
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        exportPDF();
      }
      if (e.ctrlKey && e.key === 't') {
        e.preventDefault();
        doTranslate();
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        toggleRecord();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecording, isPaused, transcriptSegments]);

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

      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 h-16 bg-black/80 border-b border-white/10 backdrop-blur-xl z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-lg flex-shrink-0">
            🎙️
          </div>
          <div className="flex flex-col">
            <div className="text-sm font-bold leading-tight">{t('app_title')}</div>
            <div className="text-xs text-gray-500 font-mono">AI Meeting Assistant</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-2 text-xs text-gray-300">
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDotClasses[statusDot]}`} />
            <span>
              {statusDot === 'ready' && t('status_ready')}
              {statusDot === 'recording' && t('status_recording')}
              {statusDot === 'paused' && t('status_paused')}
              {statusDot === 'processing' && t('status_processing')}
            </span>
          </div>
          <button
            onClick={clearAll}
            className="w-8 h-8 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 flex items-center justify-center text-sm transition"
            title={t('btn_clear')}
          >
            🗑️
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div className="relative z-10 flex-1 flex flex-col pt-16 pb-20 px-4">
        {/* Recording Ring */}
        <div className="flex flex-col items-center gap-5 py-6">
          <div className={`relative w-32 h-32 flex items-center justify-center ${isRecording && !isPaused ? styles.ringLive : ''}`}>
            <div className={`absolute rounded-full border-2 border-red-500/20 inset-0 ${styles.ringOuter}`} />
            <div className={`absolute rounded-full border-2 border-red-500/10 inset-0 -m-2.5 ${styles.ringMiddle}`} />
            <div className={`absolute rounded-full border-2 border-red-500/5 inset-0 -m-5 ${styles.ringInner}`} />

            <button
              onClick={toggleRecord}
              className={`w-20 h-20 rounded-full border-2 border-transparent flex items-center justify-center text-2xl font-bold transition-all transform active:scale-95 z-10 relative ${
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
              className="py-2 px-3 rounded-lg border border-white/10 bg-white/5 text-gray-300 font-semibold text-sm hover:bg-white/10 transition whitespace-nowrap"
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
              className="py-2 px-3 rounded-lg border border-white/10 bg-white/5 text-gray-300 font-semibold text-sm hover:bg-white/10 transition"
            >
              📋
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
            <div
              ref={transcriptAreaRef}
              contentEditable
              className="w-full min-h-40 max-h-60 overflow-y-auto bg-black/25 border border-white/10 rounded-lg p-3 text-sm leading-relaxed text-gray-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 resize-none"
              placeholder={t('transcript_placeholder')}
            >
              {transcriptSegments.map((seg, i) => (
                <div key={i}>
                  <span className="text-teal-400 text-xs font-bold">{seg.speaker}</span>
                  <span className="text-gray-200"> {seg.text}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs text-gray-500 font-mono">
              {t('word_count')} <strong className="text-gray-300">{wordCount}</strong>
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
              <div className="text-sm text-gray-300 space-y-1">
                {summaryData?.keyPoints?.length > 0
                  ? summaryData.keyPoints.map((p, i) => <div key={i}>• {p}</div>)
                  : <div className="text-gray-500 italic">{t('no_summary')}</div>}
              </div>
            </div>
            <div className="bg-black/20 border border-white/10 rounded-lg p-3">
              <div className="text-xs font-bold text-blue-400 mb-2">✅ {t('decisions')}</div>
              <div className="text-sm text-gray-300 space-y-1">
                {summaryData?.decisions?.length > 0
                  ? summaryData.decisions.map((d, i) => <div key={i}>✅ {d}</div>)
                  : <div className="text-gray-500">—</div>}
              </div>
            </div>
            <div className="bg-black/20 border border-white/10 rounded-lg p-3">
              <div className="text-xs font-bold text-amber-400 mb-2">📋 {t('action_items')}</div>
              <div className="text-sm text-gray-300 space-y-1">
                {summaryData?.actions?.length > 0
                  ? summaryData.actions.map((a, i) => <div key={i}>📌 {a}</div>)
                  : <div className="text-gray-500">—</div>}
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
              ref={translationAreaRef}
              className="w-full min-h-24 max-h-40 overflow-y-auto bg-black/25 border border-white/10 rounded-lg p-3 text-sm leading-relaxed text-gray-300 font-sans"
              dir="ltr"
              style={{ textAlign: 'left' }}
            >
              {englishTranslation || <span className="text-gray-500 italic">{t('translation_placeholder')}</span>}
            </div>
            <p className="text-xs text-gray-500 font-mono">{t('translation_note')}</p>
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
            <div className="text-xs text-gray-500 font-mono" dir="ltr">
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
          className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold transition-all transform active:scale-95 flex-shrink-0 ${
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

      {/* Hidden PDF Template */}
      <div ref={pdfTemplateRef} style={{ position: 'absolute', left: '-9999px', top: 0 }} />
    </div>
  );
};

export default MeetingAssistant;
