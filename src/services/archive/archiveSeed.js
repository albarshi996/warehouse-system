/**
 * بذرة الأرشيف الدوريّ — التقارير والمحاضر الرسمية النهائية المنسوخة إلى
 * `public/archive/` لتُفتح حيًّا من أيّ جهاز (لا ملفّاتٌ متناثرة على سطح المكتب).
 *
 * كلّ مُدخَل: { id, category, refNumber, title, date, period, format, path, primary?, note? }
 *   - category : 'report' (تقرير) | 'minutes' (محضر اجتماع)
 *   - refNumber: الرقم الإشاريّ الرسميّ المعتمد (BFP-SCM-PR-YYYY-###)
 *   - path     : المسار نسبةً إلى BASE_URL (تُضاف البادئة في المكوّن)
 *   - format   : 'html' يُفتح ويُطبع حيًّا · 'pdf' يُفتح في عارض المتصفّح
 *   - primary  : true = **المصدر الأوّل المعتمد** لأحدث دورة (شارة مميّزة)
 *
 * ⚠️ ملاحظتان للمالك:
 *  · التقرير الأسبوعيّ W31 أُسنِد له الرقم التالي في التسلسل (…-006) ليكون
 *    «مصدر ١» المعتمد؛ عدّله إن كان الرقم مستخدَمًا.
 *  · التواريخ أفضلُ تقديرٍ من سياق الملفّات — حرّرها من لوحة التحرير عند اللزوم.
 */
export const ARCHIVE_SEED = [
  // ── التقارير ─────────────────────────────────────────────────────────
  {
    id: 'seed-weekly-w31',
    category: 'report',
    refNumber: 'BFP-SCM-PR-2026-006',
    title: 'التقرير اللوجستيّ والمخزنيّ الشامل — الأسبوع W31',
    date: '2026-08-02',
    period: 'الأسبوع W31 · 2026',
    format: 'html',
    path: '/archive/weekly-w31.html',
    primary: true,
    note: 'التقرير الدوريّ الشامل — سبعة محاور. المصدر الأوّل المعتمد لأحدث دورة.',
  },
  {
    id: 'seed-status-002',
    category: 'report',
    refNumber: 'BFP-SCM-PR-2026-002',
    title: 'تقرير حالة المشروع والأولويات',
    date: '2026-07-15',
    period: 'يوليو 2026',
    format: 'html',
    path: '/archive/report-status-002.html',
  },
  {
    id: 'seed-checklist-003',
    category: 'report',
    refNumber: 'BFP-SCM-PR-2026-003',
    title: 'قائمة فحص البوابة',
    date: '2026-07-16',
    period: 'يوليو 2026',
    format: 'html',
    path: '/archive/report-checklist-003.html',
  },
  {
    id: 'seed-daily-155-005',
    category: 'report',
    refNumber: 'BFP-SCM-PR-2026-005',
    title: 'تقرير المتابعة اليومية — مشروع تحوير المستودعات (155)',
    date: '2026-07-21',
    period: 'يوليو 2026',
    format: 'html',
    path: '/archive/report-daily-155-005.html',
  },
  {
    id: 'seed-situation-155',
    category: 'report',
    refNumber: '',
    title: 'تقرير موقف — تأخّر رد الفريق الهندسي (155)',
    date: '2026-07-21',
    period: 'يوليو 2026',
    format: 'html',
    path: '/archive/report-situation-155.html',
  },
  {
    id: 'seed-letter-tunis',
    category: 'report',
    refNumber: '',
    title: 'مراسلة — خطة الاجتماعات التحضيرية (دورة تونس)',
    date: '2026-07-25',
    period: 'يوليو 2026',
    format: 'html',
    path: '/archive/letter-tunis-round.html',
  },

  // ── محاضر الاجتماعات ─────────────────────────────────────────────────
  {
    id: 'seed-minutes-portal-004',
    category: 'minutes',
    refNumber: 'BFP-SCM-PR-2026-004',
    title: 'محضر اجتماع — عرض مشروع البوابة التفاعلية على الإدارة المالية',
    date: '2026-08-02',
    period: 'أغسطس 2026',
    format: 'html',
    path: '/archive/minutes-portal-004.html',
  },
  {
    id: 'seed-minutes-brandzo',
    category: 'minutes',
    refNumber: '',
    title: 'محضر اجتماع — مشروع تحوير مستودعات 155 (Brandzo)',
    date: '2026-07-14',
    period: 'يوليو 2026',
    format: 'pdf',
    path: '/archive/minutes-brandzo.pdf',
  },
];
