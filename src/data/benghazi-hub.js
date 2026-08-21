/**
 * أحياء بنغازي — بذرة «مركز التجزئة» (`/dashboard/retail-hub`).
 *
 * كانت هذه المئة وواحد سجلًّا مكتوبةً داخل وسم `script` في الصفحة نفسها:
 * سبعمئةٍ وواحدٌ وثلاثون سطرًا هي **أربعةٌ وخمسون بالمئة** من منطق تلك الشاشة،
 * وليست منطقًا أصلًا بل بيانات. فنزلت إلى `src/data` حيث تسكن مصادرُ الحقيقة
 * الواحدة (`org-structure.json` وأخواتها) — يقرؤها اختبارٌ مجاور، ويستوردها
 * من يشاء بلا أن ينسخها.
 *
 * وهي **بذرةٌ لا سجلّ**: الشاشة تقرأ الحيّ من السحابة إن وُجد، وتقع على هذه
 * عند الفراغ. فتعديلُ مندوبٍ لا يُكتب هنا.
 *
 * المرجع الجغرافيّ: ميناء بنغازي 32.1175, 20.0622 — وسط البلد 32.1151, 20.0682.
 */
export const BENGHAZI_NEIGHBORHOODS = [
  // ══════════════════════════════════════════════════════════════════
  // القطاع 1: وسط البلد والقلب التجاري القديم
  // المرجع الجغرافي: ميناء بنغازي 32.1175, 20.0622 — وسط البلد 32.1151, 20.0682
  // ══════════════════════════════════════════════════════════════════
  {
    id: 1, neighborhood: 'وسط البلد', lat: 32.114800, lng: 20.068200, class: 'C',
    sector: 1, population: 65000, income: 'متوسط-جيد', flow: 'شلل تام',
    infra: 'قديمة', market_type: 'جملة', market_match: 'مطابق',
    segments_present: ['B','C'], gap: 'لا',
    notes: 'اختناقات شديدة ومزمنة. شوارع إيطالية ضيقة. Last-Mile عبر الفانات فقط. مخازن داخل الأزقة.'
  },
  {
    id: 2, neighborhood: 'جليانة', lat: 32.112, lng: 20.064, class: 'C',
    sector: 1, population: 45000, income: 'متوسط', flow: 'شلل تام',
    infra: 'قديمة', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['B','C'], gap: 'لا',
    notes: 'جزء من النسيج التجاري القديم. تحديات حادة في توصيل الميل الأخير.'
  },
  {
    id: 3, neighborhood: 'الصابري', lat: 32.1165, lng: 20.0705, class: 'C',
    sector: 1, population: 40000, income: 'متوسط', flow: 'عالٍ جداً',
    infra: 'قديمة', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['B','C'], gap: 'لا',
    notes: 'نسيج عمراني مكثف. تجارة تجزئة يومية. بنية تحتية تحت ضغط تشغيلي هائل.'
  },
  {
    id: 4, neighborhood: 'سيدي اخريبيش', lat: 32.1215, lng: 20.0655, class: 'C',
    sector: 1, population: 38000, income: 'متوسط', flow: 'عالٍ جداً',
    infra: 'قديمة', market_type: 'شعبي', market_match: 'جزئي',
    segments_present: ['C'], gap: 'جزئياً ⚠',
    notes: 'تفتقر لمواقف تحميل وتنزيل. اعتماد حصري على مركبات النقل الخفيف.'
  },
  {
    id: 5, neighborhood: 'منارة بنغازي', lat: 32.1195, lng: 20.0632, class: 'C',
    sector: 1, population: 10000, income: 'متوسط', flow: 'عالٍ جداً',
    infra: 'قديمة', market_type: 'مختلط', market_match: 'مطابق',
    segments_present: ['B','C'], gap: 'لا',
    notes: 'منطقة تجارية تاريخية مركزية. مرجعية للأسواق الشعبية القديمة.'
  },
  {
    id: 6, neighborhood: 'سوق الحوت', lat: 32.119835, lng: 20.062123, class: 'C',
    sector: 1, population: 5000, income: 'متوسط', flow: 'شلل تام',
    infra: 'قديمة', market_type: 'جملة', market_match: 'مطابق',
    segments_present: ['B','C'], gap: 'لا',
    notes: 'سوق الجملة التقليدي للأسماك والمأكولات البحرية. ازدحام شديد في الصباح الباكر.'
  },
  {
    id: 7, neighborhood: 'سوق الحوم', lat: 32.118000, lng: 20.064000, class: 'C',
    sector: 1, population: 6000, income: 'متوسط', flow: 'شلل تام',
    infra: 'قديمة', market_type: 'جملة', market_match: 'مطابق',
    segments_present: ['C'], gap: 'لا',
    notes: 'سوق اللحوم التقليدي. ازدحام صباحي شديد. محور تجاري لمنتجات البروتين.'
  },
  {
    id: 8, neighborhood: 'شارع الجزائر', lat: 32.114024, lng: 20.063551, class: 'C',
    sector: 1, population: 18000, income: 'متوسط', flow: 'عالٍ جداً',
    infra: 'قديمة', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['B','C'], gap: 'لا',
    notes: 'شارع تجاري شعبي قديم. ازدحام مستمر. معدل دوران بضائع مرتفع.'
  },
  {
    id: 9, neighborhood: 'شارع فلسطين', lat: 32.1135, lng: 20.0758, class: 'C',
    sector: 1, population: 16000, income: 'متوسط', flow: 'عالٍ جداً',
    infra: 'قديمة', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['B','C'], gap: 'لا',
    notes: 'شارع شعبي مكتظ. تجارة متنوعة. تحديات Last-Mile حادة.'
  },
  {
    id: 10, neighborhood: 'شارع 1 سبتمبر', lat: 32.109861, lng: 20.075713, class: 'C',
    sector: 1, population: 25000, income: 'متوسط', flow: 'عالٍ جداً',
    infra: 'قديمة', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['B','C'], gap: 'لا',
    notes: 'شارع رئيسي تاريخي في قلب المدينة. ازدحام مزمن. تجارة متنوعة.'
  },
  {
    id: 11, neighborhood: 'شارع جمال عبد الناصر', lat: 32.113809, lng: 20.065305, class: 'C',
    sector: 1, population: 20000, income: 'متوسط', flow: 'عالٍ جداً',
    infra: 'قديمة', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['B','C'], gap: 'لا',
    notes: 'شارع رئيسي تاريخي. محلات تجارية متنوعة. ازدحام مستمر.'
  },
  {
    id: 12, neighborhood: 'شارع 23 يوليو', lat: 32.111147, lng: 20.066232, class: 'C',
    sector: 1, population: 18000, income: 'متوسط', flow: 'عالٍ جداً',
    infra: 'قديمة', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['B','C'], gap: 'لا',
    notes: 'شارع تجاري رئيسي في وسط البلد. ازدحام حاد. تجارة يومية مكثفة.'
  },
  {
    id: 13, neighborhood: 'شارع عبد الجليل', lat: 32.110500, lng: 20.078000, class: 'C',
    sector: 1, population: 16000, income: 'متوسط', flow: 'عالٍ',
    infra: 'قديمة', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['C'], gap: 'لا',
    notes: 'شارع داخلي يربط وسط البلد بالأحياء الشعبية. تجارة يومية.'
  },
  {
    id: 14, neighborhood: 'شارع عبد الله باله', lat: 32.112500, lng: 20.079500, class: 'C',
    sector: 1, population: 14000, income: 'متوسط', flow: 'عالٍ',
    infra: 'قديمة', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['C'], gap: 'لا',
    notes: 'شارع داخلي يتفرع من شوارع وسط البلد الرئيسية. تجارة يومية.'
  },
  {
    id: 15, neighborhood: 'شارع الخطوط', lat: 32.1118, lng: 20.0728, class: 'B',
    sector: 1, population: 12000, income: 'متوسط-جيد', flow: 'عالٍ',
    infra: 'قديمة', market_type: 'مختلط', market_match: 'جزئي',
    segments_present: ['B','C'], gap: 'جزئياً ⚠',
    notes: 'يضم مكاتب ومتاجر. يغلب عليه الطابع التجاري. مواقف مزدحمة.'
  },
  {
    id: 16, neighborhood: 'شارع النفق', lat: 32.1108, lng: 20.0718, class: 'C',
    sector: 1, population: 15000, income: 'متوسط', flow: 'شلل تام',
    infra: 'قديمة', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['C'], gap: 'لا',
    notes: 'نقطة اختناق مزمنة في وسط البلد. أسواق شعبية عند مدخل النفق.'
  },
  {
    id: 17, neighborhood: 'شارع سالم سويكر', lat: 32.1095, lng: 20.0785, class: 'C',
    sector: 1, population: 14000, income: 'متوسط', flow: 'عالٍ',
    infra: 'قديمة', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['C'], gap: 'لا',
    notes: 'شارع داخلي شعبي. تجارة يومية. ازدحام خفيف مقارنة بالشوارع الرئيسية.'
  },
  {
    id: 18, neighborhood: 'شارع عشرين', lat: 32.105015, lng: 20.082743, class: 'C',
    sector: 1, population: 20000, income: 'متوسط', flow: 'عالٍ جداً',
    infra: 'قديمة', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['B','C'], gap: 'لا',
    notes: 'شارع قديم في وسط المدينة. تجارة يومية مكثفة. ضيق الشوارع يعيق التوزيع.'
  },
  {
    id: 19, neighborhood: 'الجلاء', lat: 32.119800, lng: 20.071800, class: 'C',
    sector: 1, population: 12000, income: 'متوسط', flow: 'عالٍ',
    infra: 'قديمة', market_type: 'مختلط', market_match: 'جزئي',
    segments_present: ['B','C'], gap: 'جزئياً ⚠',
    notes: 'منطقة مركزية قرب الشاطئ. حديقة عامة تجلب حركة يومية.'
  },
  {
    id: 20, neighborhood: 'حديقة الجلاء', lat: 32.121000, lng: 20.071200, class: 'C',
    sector: 1, population: 5000, income: 'متوسط', flow: 'عالٍ',
    infra: 'جيد', market_type: 'مختلط', market_match: 'جزئي',
    segments_present: ['B','C'], gap: 'جزئياً ⚠',
    notes: 'المحيط التجاري لحديقة الجلاء. أكشاك ومطاعم. حركة عائلية عالية في العطل.'
  },
  {
    id: 21, neighborhood: 'كتيبة فضيل بوعمر', lat: 32.112800, lng: 20.085500, class: 'C',
    sector: 1, population: 4000, income: 'متوسط', flow: 'متوسط',
    infra: 'متوسط', market_type: 'لا يوجد', market_match: 'غير مطابق',
    segments_present: ['C'], gap: 'نعم ⚠',
    notes: 'موقع مؤسسي. محيطه يحتاج تغطية تجارية للمنطقة السكنية القريبة.'
  },
  {
    id: 22, neighborhood: 'شارع القيروان', lat: 32.1155, lng: 20.0812, class: 'A',
    sector: 2, population: 18000, income: 'مرتفع', flow: 'عالٍ',
    infra: 'جيد', market_type: 'تجزئة', market_match: 'مطابق',
    segments_present: ['A','B'], gap: 'لا',
    notes: 'شارع تجاري رئيسي يربط أحياء الشمال. كثافة محلات متوسطة إلى عالية.'
  },

  // ══════════════════════════════════════════════════════════════════
  // القطاع 2: مناطق راقية (شمال وشمال شرق وسط البلد)
  // ══════════════════════════════════════════════════════════════════
  {
    id: 23, neighborhood: 'فينيسيا', lat: 32.120800, lng: 20.081800, class: 'A',
    sector: 2, population: 28000, income: 'مرتفع', flow: 'عالٍ',
    infra: 'ممتاز', market_type: 'مول', market_match: 'مطابق',
    segments_present: ['A','B'], gap: 'لا',
    notes: 'أعلى دخل فردي في المدينة. Basket Size كبير. شارع فينيسيا يشهد ازدحاماً تجارياً.'
  },
  {
    id: 24, neighborhood: 'طابلينو', lat: 32.122800, lng: 20.077800, class: 'A',
    sector: 2, population: 22000, income: 'مرتفع', flow: 'عالٍ',
    infra: 'ممتاز', market_type: 'تجزئة', market_match: 'مطابق',
    segments_present: ['A','B'], gap: 'لا',
    notes: 'تمدد أفقي. فيلات سكنية. طريق طابلينو يشهد ازدحاماً بسبب المدارس الخاصة.'
  },
  {
    id: 25, neighborhood: 'حي دبي', lat: 32.118200, lng: 20.084500, class: 'A',
    sector: 2, population: 18000, income: 'مرتفع', flow: 'متوسط',
    infra: 'ممتاز', market_type: 'تجزئة', market_match: 'مطابق',
    segments_present: ['A'], gap: 'لا',
    notes: 'مجمعات سكنية راقية. طلب عالٍ على العلامات التجارية العالمية.'
  },
  {
    id: 26, neighborhood: 'شارع دبي', lat: 32.118000, lng: 20.085000, class: 'A',
    sector: 2, population: 12000, income: 'مرتفع', flow: 'متوسط',
    infra: 'ممتاز', market_type: 'تجزئة', market_match: 'مطابق',
    segments_present: ['A','B'], gap: 'لا',
    notes: 'شارع راقٍ. محلات متخصصة وعلامات تجارية مرموقة. دخل مرتفع.'
  },
  {
    id: 27, neighborhood: 'الفويهات', lat: 32.1188, lng: 20.0832, class: 'A',
    sector: 2, population: 35000, income: 'مرتفع', flow: 'عالٍ',
    infra: 'ممتاز', market_type: 'مختلط', market_match: 'مطابق',
    segments_present: ['A','B'], gap: 'لا',
    notes: 'شوارع واسعة تستوعب سلاسل الإمداد. مناسب لتوزيع المنتجات الفاخرة.'
  },
  {
    id: 28, neighborhood: 'الحدائق', lat: 32.1225, lng: 20.0878, class: 'A',
    sector: 2, population: 20000, income: 'مرتفع', flow: 'متوسط',
    infra: 'ممتاز', market_type: 'تجزئة', market_match: 'مطابق',
    segments_present: ['A','B'], gap: 'لا',
    notes: 'حي سكني هادئ راقٍ. يستقطب فئات ذات دخل مرتفع. انسيابية ممتازة.'
  },
  {
    id: 29, neighborhood: 'بلعون', lat: 32.1252, lng: 20.0888, class: 'A',
    sector: 2, population: 15000, income: 'مرتفع', flow: 'منخفض',
    infra: 'ممتاز', market_type: 'تجزئة', market_match: 'جزئي',
    segments_present: ['A','B'], gap: 'جزئياً ⚠',
    notes: 'كثافة منخفضة. مستوى معيشي مرتفع. يحتاج لتغطية تجزئة أكبر.'
  },
  {
    id: 30, neighborhood: 'الرحبة', lat: 32.1242, lng: 20.0868, class: 'A',
    sector: 2, population: 14000, income: 'مرتفع', flow: 'منخفض',
    infra: 'ممتاز', market_type: 'تجزئة', market_match: 'جزئي',
    segments_present: ['A'], gap: 'جزئياً ⚠',
    notes: 'حي نخبوي. طلب على المنتجات الفاخرة والمستوردة.'
  },
  {
    id: 31, neighborhood: 'حي المهندسين', lat: 32.119500, lng: 20.089200, class: 'A',
    sector: 2, population: 12000, income: 'مرتفع', flow: 'منخفض',
    infra: 'ممتاز', market_type: 'تجزئة', market_match: 'جزئي',
    segments_present: ['A','B'], gap: 'جزئياً ⚠',
    notes: 'يسكنه كوادر مهنية. دخل مرتفع. يتطلب تغطية تجزئة مباشرة.'
  },
  {
    id: 32, neighborhood: 'نادي الشمال', lat: 32.1315, lng: 20.0832, class: 'A',
    sector: 2, population: 8000, income: 'مرتفع', flow: 'منخفض',
    infra: 'ممتاز', market_type: 'تجزئة', market_match: 'جزئي',
    segments_present: ['A'], gap: 'جزئياً ⚠',
    notes: 'محيط النادي الراقي. فئة دخل مرتفع. كثافة منخفضة. يتطلب تجزئة مباشرة.'
  },
  {
    id: 33, neighborhood: 'البوسكو', lat: 32.1232, lng: 20.0858, class: 'A',
    sector: 2, population: 8000, income: 'مرتفع', flow: 'منخفض',
    infra: 'ممتاز', market_type: 'مول', market_match: 'مطابق',
    segments_present: ['A'], gap: 'لا',
    notes: 'مجمع تجاري راقٍ. يخدم الشريحة المرتفعة الدخل. Basket Size كبير جداً.'
  },
  {
    id: 34, neighborhood: 'شارع الخليج العربي', lat: 32.1278, lng: 20.0748, class: 'A',
    sector: 2, population: 14000, income: 'مرتفع', flow: 'عالٍ',
    infra: 'ممتاز', market_type: 'تجزئة', market_match: 'مطابق',
    segments_present: ['A','B'], gap: 'لا',
    notes: 'شارع الواجهة البحرية التجارية. محلات فاخرة ومطاعم. وجهة تجارية مرموقة.'
  },
  {
    id: 35, neighborhood: 'شارع الخليج', lat: 32.1272, lng: 20.0742, class: 'A',
    sector: 2, population: 15000, income: 'مرتفع', flow: 'عالٍ',
    infra: 'ممتاز', market_type: 'تجزئة', market_match: 'مطابق',
    segments_present: ['A','B'], gap: 'لا',
    notes: 'شارع تجاري راقٍ. بنوك ومحلات فاخرة. ازدحام في ساعات الذروة التجارية.'
  },
  {
    id: 36, neighborhood: 'شارع الحجاز', lat: 32.1198, lng: 20.0852, class: 'A',
    sector: 2, population: 12000, income: 'مرتفع', flow: 'عالٍ',
    infra: 'جيد', market_type: 'تجزئة', market_match: 'مطابق',
    segments_present: ['A','B'], gap: 'لا',
    notes: 'شارع تجاري راقٍ. محلات متخصصة وعلامات تجارية. حركة مرورية مكثفة.'
  },
  {
    id: 37, neighborhood: 'الكويفية', lat: 32.1385, lng: 20.0778, class: 'D',
    sector: 5, population: 25000, income: 'متباين', flow: 'انسيابي',
    infra: 'قيد التطور', market_type: 'تجزئة', market_match: 'جزئي',
    segments_present: ['A','B'], gap: 'جزئياً ⚠',
    notes: 'أسرع مناطق التمدد الحضري شمالاً. انسيابية عالية. نقص في الأسواق المتكاملة.'
  },
  {
    id: 38, neighborhood: 'سيدي خليفة', lat: 32.1448, lng: 20.0912, class: 'D',
    sector: 5, population: 20000, income: 'متباين', flow: 'انسيابي',
    infra: 'قيد التطور', market_type: 'تجزئة', market_match: 'غير مطابق',
    segments_present: ['B'], gap: 'نعم ⚠',
    notes: 'تمدد سكاني شرقي شمالي. بنية خدمات قيد الاستكمال. فرصة تجارية مستقبلية.'
  },
  {
    id: 39, neighborhood: 'سيدي علي', lat: 32.1398, lng: 20.0858, class: 'D',
    sector: 5, population: 15000, income: 'متباين', flow: 'انسيابي',
    infra: 'قيد التطور', market_type: 'لا يوجد', market_match: 'غير مطابق',
    segments_present: ['B','C'], gap: 'نعم ⚠',
    notes: 'ضاحية شمالية شرقية. تمدד حضري. تفتقر لبنية تجارية متكاملة.'
  },

  // ══════════════════════════════════════════════════════════════════
  // القطاع 3: كثافة استهلاكية FMCG (شرق وجنوب شرق وسط البلد)
  // ══════════════════════════════════════════════════════════════════
  {
    id: 40, neighborhood: 'السلماني الشرقي', lat: 32.116200, lng: 20.088500, class: 'C',
    sector: 3, population: 55000, income: 'متوسط', flow: 'عالٍ جداً',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['B','C'], gap: 'لا',
    notes: 'أعلى كتلة سكانية. محرك الاستهلاك اليومي. حجم مبيعات ضخم (Volume). حساسية سعرية عالية.'
  },
  {
    id: 41, neighborhood: 'السلماني الغربي', lat: 32.114115, lng: 20.090861, class: 'C',
    sector: 3, population: 48000, income: 'متوسط', flow: 'عالٍ جداً',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['B','C'], gap: 'لا',
    notes: 'FMCG بامتياز. ارتدادات تجارية شبه معدومة. توزيع في ساعات الصباح الباكر فقط.'
  },
  {
    id: 42, neighborhood: 'الماجوري', lat: 32.095101, lng: 20.095943, class: 'C',
    sector: 3, population: 60000, income: 'متوسط', flow: 'عالٍ جداً',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['B','C'], gap: 'لا',
    notes: 'طريق الماجوري محور رئيسي مزدحم. الازدحام مستمر طوال اليوم ويشتد مساءً.'
  },
  {
    id: 43, neighborhood: 'البركة', lat: 32.099673, lng: 20.084530, class: 'C',
    sector: 3, population: 52000, income: 'متوسط', flow: 'عالٍ',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'جزئي',
    segments_present: ['C'], gap: 'جزئياً ⚠',
    notes: 'كثافة سكانية عالية. يعتمد على السلع الأساسية والتموينية. Last-Mile يتطلب فانات صغيرة.'
  },
  {
    id: 44, neighborhood: 'الكيش', lat: 32.1058, lng: 20.0968, class: 'C',
    sector: 3, population: 58000, income: 'متوسط', flow: 'عالٍ جداً',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['B','C'], gap: 'لا',
    notes: 'من أكثر المناطق استهلاكاً للسلع سريعة الدوران. يغذي قلب المدينة.'
  },
  {
    id: 45, neighborhood: 'بوهديمة', lat: 32.0985, lng: 20.1125, class: 'C',
    sector: 3, population: 45000, income: 'متوسط', flow: 'عالٍ',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'جزئي',
    segments_present: ['C'], gap: 'جزئياً ⚠',
    notes: 'طرق داخلية ضيقة. عمليات إنزال البضائع معقدة وتستلزم جدولة دقيقة.'
  },
  {
    id: 46, neighborhood: 'الليثي', lat: 32.091434, lng: 20.126259, class: 'C',
    sector: 3, population: 55000, income: 'متوسط', flow: 'عالٍ جداً',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['B','C'], gap: 'لا',
    notes: 'كتلة سكانية حرجة. سلع أساسية ويومية. الارتدادات أمام المحلات معدومة تقريباً.'
  },
  {
    id: 47, neighborhood: 'اليثي القديم', lat: 32.104200, lng: 20.105500, class: 'C',
    sector: 3, population: 32000, income: 'متوسط', flow: 'عالٍ',
    infra: 'قديمة', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['C'], gap: 'لا',
    notes: 'النواة التاريخية لحي اليثي. بنية قديمة. أسواق شعبية أصيلة.'
  },
  {
    id: 48, neighborhood: 'سيد حسين', lat: 32.102096, lng: 20.078849, class: 'C',
    sector: 3, population: 42000, income: 'متوسط', flow: 'عالٍ',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'جزئي',
    segments_present: ['C'], gap: 'جزئياً ⚠',
    notes: 'على الطريق الدائري (الرينق). ازدحام متواصل. فرصة لنقاط توزيع مصغرة.'
  },
  {
    id: 49, neighborhood: 'الزريريعية', lat: 32.112500, lng: 20.090200, class: 'C',
    sector: 3, population: 35000, income: 'متوسط', flow: 'عالٍ',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['B','C'], gap: 'لا',
    notes: 'جزء من منطقة الكثافة الاستهلاكية المركزية. نمط استهلاك يومي مكثف.'
  },
  {
    id: 50, neighborhood: 'الثامة', lat: 32.114200, lng: 20.091800, class: 'C',
    sector: 3, population: 30000, income: 'متوسط', flow: 'عالٍ',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['C'], gap: 'لا',
    notes: 'قريبة من سوق الجريد. حركة تجارية يومية مكثفة. يغلب عليها الطابع الشعبي.'
  },
  {
    id: 51, neighborhood: 'راس عبيدة', lat: 32.105897, lng: 20.090255, class: 'C',
    sector: 3, population: 40000, income: 'متوسط', flow: 'عالٍ',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'جزئي',
    segments_present: ['C'], gap: 'جزئياً ⚠',
    notes: 'كثافة سكانية مرتفعة. يحتاج تغطية أوسع للسلع الأساسية.'
  },
  {
    id: 52, neighborhood: 'الوحيشي', lat: 32.1065, lng: 20.1018, class: 'C',
    sector: 3, population: 36000, income: 'متوسط', flow: 'عالٍ',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'جزئي',
    segments_present: ['C'], gap: 'جزئياً ⚠',
    notes: 'توسع سكاني غير مخطط. بنية تحتية تحت ضغط. أرصفة مستغلة بالكامل.'
  },
  {
    id: 53, neighborhood: 'السرتي', lat: 32.111948, lng: 20.116716, class: 'C',
    sector: 3, population: 32000, income: 'متوسط', flow: 'عالٍ',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['C'], gap: 'لا',
    notes: 'تركز تجاري شعبي. استهلاك يومي للمواد الغذائية الأساسية.'
  },
  {
    id: 54, neighborhood: 'بن يونس', lat: 32.1082, lng: 20.0952, class: 'C',
    sector: 3, population: 28000, income: 'متوسط', flow: 'متوسط',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['C'], gap: 'لا',
    notes: 'منطقة سكنية شعبية متوسطة الكثافة. يتطلب توزيع بالفانات الصغيرة.'
  },
  {
    id: 55, neighborhood: 'الحميضة', lat: 32.096295, lng: 20.085010, class: 'C',
    sector: 3, population: 30000, income: 'متوسط', flow: 'عالٍ',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['B','C'], gap: 'لا',
    notes: 'منطقة سكنية شعبية. حركة تجارية يومية. يغلب عليها الطابع الاستهلاكي.'
  },
  {
    id: 56, neighborhood: 'الزيتون', lat: 32.083898, lng: 20.087184, class: 'C',
    sector: 3, population: 26000, income: 'متوسط', flow: 'عالٍ',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['C'], gap: 'لا',
    notes: 'حي سكني شعبي. استهلاك يومي مرتفع. قرب المحاور التجارية الشعبية.'
  },
  {
    id: 57, neighborhood: 'سيدي عبيد', lat: 32.100800, lng: 20.089500, class: 'C',
    sector: 3, population: 22000, income: 'متوسط', flow: 'متوسط',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'جزئي',
    segments_present: ['C'], gap: 'جزئياً ⚠',
    notes: 'منطقة سكنية شعبية. يحتاج تغطية أوسع للسلع الأساسية.'
  },
  {
    id: 58, neighborhood: 'سيدي يونس', lat: 32.1028, lng: 20.0918, class: 'C',
    sector: 3, population: 20000, income: 'متوسط', flow: 'متوسط',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'جزئي',
    segments_present: ['C'], gap: 'جزئياً ⚠',
    notes: 'حي سكني شعبي. طلب يومي على السلع الأساسية والغذائية.'
  },
  {
    id: 59, neighborhood: 'الهواري', lat: 32.101200, lng: 20.118800, class: 'A',
    sector: 2, population: 32000, income: 'مرتفع', flow: 'متوسط',
    infra: 'جيد', market_type: 'مختلط', market_match: 'مطابق',
    segments_present: ['A','B'], gap: 'لا',
    notes: 'حي راقٍ ممتد جنوب شرق. شوارع داخلية واسعة. ازدحام عند المدارس فقط.'
  },
  {
    id: 60, neighborhood: 'طريق الهواري', lat: 32.070663, lng: 20.100090, class: 'B',
    sector: 4, population: 10000, income: 'متوسط-جيد', flow: 'عالٍ جداً',
    infra: 'ممتاز', market_type: 'لوجستي', market_match: 'مطابق',
    segments_present: ['A','B'], gap: 'لا',
    notes: 'محور مروري رئيسي بين القلب التجاري والمناطق الراقية. طرق واسعة.'
  },
  {
    id: 61, neighborhood: 'طريق العروبة', lat: 32.115049, lng: 20.082538, class: 'B',
    sector: 4, population: 8000, income: 'متوسط-جيد', flow: 'عالٍ',
    infra: 'ممتاز', market_type: 'لوجستي', market_match: 'مطابق',
    segments_present: ['B'], gap: 'لا',
    notes: 'طريق رئيسي يربط وسط المدينة بالأحياء الجنوبية الغربية.'
  },
  {
    id: 62, neighborhood: 'حي لبنان', lat: 32.1075, lng: 20.1055, class: 'C',
    sector: 3, population: 28000, income: 'متوسط', flow: 'عالٍ',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'جزئي',
    segments_present: ['B','C'], gap: 'جزئياً ⚠',
    notes: 'حي سكني شعبي مكتظ. طرق داخلية ضيقة. يعتمد على السلع الأساسية اليومية.'
  },
  {
    id: 63, neighborhood: 'شارع لبنان', lat: 32.1065, lng: 20.1035, class: 'C',
    sector: 3, population: 18000, income: 'متوسط', flow: 'عالٍ',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'جزئي',
    segments_present: ['B','C'], gap: 'جزئياً ⚠',
    notes: 'شارع سكني شعبي. مكتظ. يعتمد على السلع الأساسية.'
  },
  {
    id: 64, neighborhood: 'شارع سوريا', lat: 32.123066, lng: 20.095368, class: 'C',
    sector: 3, population: 16000, income: 'متوسط', flow: 'عالٍ',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'جزئي',
    segments_present: ['C'], gap: 'جزئياً ⚠',
    notes: 'شارع سكني شعبي. طلب يومي على السلع الأساسية والغذائية.'
  },
  {
    id: 65, neighborhood: 'شارع الكويت', lat: 32.114186, lng: 20.123194, class: 'C',
    sector: 3, population: 20000, income: 'متوسط', flow: 'عالٍ جداً',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'مطابق',
    segments_present: ['B','C'], gap: 'لا',
    notes: 'شارع تجاري شعبي رئيسي. ازدحام مزمن. حركة تجارة متنوعة.'
  },
  {
    id: 66, neighborhood: 'شارع السودان', lat: 32.1055, lng: 20.0992, class: 'C',
    sector: 3, population: 22000, income: 'متوسط', flow: 'عالٍ',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'جزئي',
    segments_present: ['C'], gap: 'جزئياً ⚠',
    notes: 'شارع شعبي مزدحم. يغلب عليه الطابع الاستهلاكي اليومي.'
  },
  {
    id: 67, neighborhood: 'سيدي منصور', lat: 32.0998, lng: 20.1148, class: 'C',
    sector: 3, population: 24000, income: 'متوسط', flow: 'متوسط',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'جزئي',
    segments_present: ['C'], gap: 'جزئياً ⚠',
    notes: 'حي سكني شعبي. يحتاج تغطية تجزئة أفضل للسلع الأساسية.'
  },
  {
    id: 68, neighborhood: 'حي الشقاعبي', lat: 32.0975, lng: 20.1128, class: 'C',
    sector: 3, population: 22000, income: 'متوسط', flow: 'متوسط',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'جزئي',
    segments_present: ['C'], gap: 'جزئياً ⚠',
    notes: 'منطقة سكنية شعبية. كثافة استهلاكية معتدلة. يحتاج تغطية أوسع.'
  },

  // ══════════════════════════════════════════════════════════════════
  // القطاع 4: لوجستي وصناعي مختلط
  // ══════════════════════════════════════════════════════════════════
  {
    id: 69, neighborhood: 'بوعطني', lat: 32.078679, lng: 20.183923, class: 'B',
    sector: 4, population: 42000, income: 'متوسط-جيد', flow: 'عالٍ جداً',
    infra: 'ممتاز', market_type: 'لوجستي', market_match: 'مطابق',
    segments_present: ['A','B','C'], gap: 'لا',
    notes: 'شريان التوزيع الرئيسي. طرق واسعة للشاحنات الثقيلة. أفضل موقع للمستودعات المركزية (Hubs).'
  },
  {
    id: 70, neighborhood: 'حي السلام', lat: 32.0958, lng: 20.1455, class: 'B',
    sector: 4, population: 38000, income: 'متوسط-جيد', flow: 'عالٍ جداً',
    infra: 'ممتاز', market_type: 'لوجستي', market_match: 'مطابق',
    segments_present: ['B','C'], gap: 'لا',
    notes: 'مخازن رئيسية ومحطات وقود مركزية. طابع عمالي. ملاءم لإدارة دورة المخازن.'
  },
  {
    id: 71, neighborhood: 'شبنة', lat: 32.133936, lng: 20.127599, class: 'B',
    sector: 4, population: 28000, income: 'متوسط', flow: 'عالٍ',
    infra: 'جيد', market_type: 'مختلط', market_match: 'جزئي',
    segments_present: ['B','C'], gap: 'جزئياً ⚠',
    notes: 'طابع صناعي/سكني مختلط. طرق رئيسية جيدة لتحمل أوزان النقل الثقيل.'
  },
  {
    id: 72, neighborhood: 'قاريونس', lat: 32.080800, lng: 20.080800, class: 'B',
    sector: 4, population: 65000, income: 'متوسط-جيد', flow: 'عالٍ جداً',
    infra: 'ممتاز', market_type: 'مختلط', market_match: 'مطابق',
    segments_present: ['A','B','C'], gap: 'لا',
    notes: 'كثافة جامعية موسمية (طلاب). استهلاك مزدوج منزلي ومؤسسي. بنية تحتية ممتازة.'
  },
  {
    id: 73, neighborhood: 'جامعة بنغازي', lat: 32.093792, lng: 20.085807, class: 'B',
    sector: 4, population: 12000, income: 'متوسط-جيد', flow: 'عالٍ',
    infra: 'جيد', market_type: 'مختلط', market_match: 'مطابق',
    segments_present: ['B','C'], gap: 'لا',
    notes: 'حرم جامعي ومحيطه. كثافة طلابية موسمية عالية. طلب على المنتجات المحمولة الصغيرة.'
  },
  {
    id: 74, neighborhood: 'تيكا', lat: 32.075200, lng: 20.071500, class: 'C',
    sector: 3, population: 22000, income: 'متوسط', flow: 'متوسط',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'جزئي',
    segments_present: ['C'], gap: 'جزئياً ⚠',
    notes: 'منطقة سكنية متوسطة قرب قاريونس. تغطية تجارية محدودة.'
  },
  {
    id: 75, neighborhood: 'الحليس', lat: 32.086500, lng: 20.068500, class: 'C',
    sector: 3, population: 20000, income: 'متوسط', flow: 'متوسط',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'جزئي',
    segments_present: ['C'], gap: 'جزئياً ⚠',
    notes: 'حي سكني شعبي. كثافة استهلاكية يومية. بنية تحتية تحتاج تطوير.'
  },
  {
    id: 76, neighborhood: 'أم مبروكة', lat: 32.092500, lng: 20.075500, class: 'C',
    sector: 3, population: 25000, income: 'متوسط', flow: 'متوسط',
    infra: 'متوسط', market_type: 'شعبي', market_match: 'جزئي',
    segments_present: ['C'], gap: 'جزئياً ⚠',
    notes: 'منطقة سكنية غرب قاريونس. طلب على السلع الأساسية. قرب المحاور اللوجستية.'
  },
  {
    id: 77, neighborhood: 'المساكن', lat: 32.114851, lng: 20.149973, class: 'B',
    sector: 4, population: 32000, income: 'متوسط', flow: 'متوسط',
    infra: 'جيد', market_type: 'تجزئة', market_match: 'جزئي',
    segments_present: ['B','C'], gap: 'جزئياً ⚠',
    notes: 'سكن عمال. نمو عمراني نشط. قريب من المحاور اللوجستية الرئيسية.'
  },
  {
    id: 78, neighborhood: 'أرض قريش', lat: 32.084500, lng: 20.124800, class: 'B',
    sector: 4, population: 22000, income: 'متوسط', flow: 'متوسط',
    infra: 'جيد', market_type: 'تجزئة', market_match: 'جزئي',
    segments_present: ['B'], gap: 'جزئياً ⚠',
    notes: 'منطقة سكنية ذات طابع مختلط. صالحة كنقطة ارتكاز ثانوية للتوزيع.'
  },
  {
    id: 79, neighborhood: 'سيدي فرج', lat: 32.104800, lng: 20.039500, class: 'B',
    sector: 4, population: 45000, income: 'متوسط', flow: 'منخفض جداً',
    infra: 'متوسط', market_type: 'لا يوجد', market_match: 'غير مطابق',
    segments_present: ['C'], gap: 'نعم ⚠⚠',
    notes: 'غرب المدينة بعيداً عن مراكز التوزيع. سهولة وصول ضعيفة. فجوة استثمارية حرجة.'
  },
  {
    id: 80, neighborhood: 'أرض زواوة', lat: 32.103500, lng: 20.135800, class: 'B',
    sector: 4, population: 35000, income: 'متوسط', flow: 'متوسط',
    infra: 'جيد', market_type: 'مختلط', market_match: 'جزئي',
    segments_present: ['B','C'], gap: 'جزئياً ⚠',
    notes: 'منطقة ذات مساحات واسعة. مناسبة لإقامة مستودعات ومراكز توزيع ثانوية.'
  },
  {
    id: 81, neighborhood: 'أرض زواوة البحرية', lat: 32.105800, lng: 20.138000, class: 'B',
    sector: 4, population: 12000, income: 'متوسط', flow: 'متوسط',
    infra: 'جيد', market_type: 'مختلط', market_match: 'جزئي',
    segments_present: ['B'], gap: 'جزئياً ⚠',
    notes: 'منطقة مختلطة قرب الساحل. مساحات مفتوحة. صالحة لنقاط توزيع مرنة.'
  },
  {
    id: 82, neighborhood: 'عمارات 602', lat: 32.1055, lng: 20.1425, class: 'C',
    sector: 4, population: 28000, income: 'متوسط', flow: 'متوسط',
    infra: 'جيد', market_type: 'تجزئة', market_match: 'جزئي',
    segments_present: ['C'], gap: 'جزئياً ⚠',
    notes: 'مجمع سكني حكومي. كثافة متوسطة. استهلاك منتظم للسلع الأساسية.'
  },
  {
    id: 83, neighborhood: 'طريق النهر', lat: 32.088242, lng: 20.135936, class: 'B',
    sector: 4, population: 10000, income: 'متوسط', flow: 'عالٍ',
    infra: 'جيد', market_type: 'لوجستي', market_match: 'مطابق',
    segments_present: ['B'], gap: 'لا',
    notes: 'محور لوجستي يربط مناطق الجنوب بوسط المدينة. حركة شاحنات مستمرة.'
  },
  {
    id: 84, neighborhood: 'طريق المطار', lat: 32.097933, lng: 20.199927, class: 'B',
    sector: 4, population: 8000, income: 'متوسط-جيد', flow: 'عالٍ جداً',
    infra: 'ممتاز', market_type: 'لوجستي', market_match: 'مطابق',
    segments_present: ['B'], gap: 'لا',
    notes: 'الطريق الرئيسي للمطار. حركة مركبات ثقيلة مستمرة. مناسب لنقاط توزيع الجملة.'
  },
  {
    id: 85, neighborhood: 'مصنع الإسمنت', lat: 32.072500, lng: 20.184800, class: 'B',
    sector: 4, population: 5000, income: 'متوسط', flow: 'متوسط',
    infra: 'جيد', market_type: 'لوجستي', market_match: 'مطابق',
    segments_present: ['B'], gap: 'لا',
    notes: 'منطقة صناعية جنوب شرق. حركة شاحنات ثقيلة. بنية لوجستية قائمة.'
  },
  {
    id: 86, neighborhood: 'الحي الصناعي القوارشة', lat: 32.065500, lng: 20.118800, class: 'B',
    sector: 4, population: 6000, income: 'متوسط', flow: 'متوسط',
    infra: 'جيد', market_type: 'لوجستي', market_match: 'مطابق',
    segments_present: ['B'], gap: 'لا',
    notes: 'منطقة صناعية جنوب. مستودعات ومصانع. قاعدة توزيع مثالية للمنطقة الجنوبية.'
  },
  {
    id: 87, neighborhood: 'سواني القوارشة', lat: 32.065500, lng: 20.088800, class: 'D',
    sector: 5, population: 18000, income: 'متباين', flow: 'انسيابي',
    infra: 'قيد التطور', market_type: 'لا يوجد', market_match: 'غير مطابق',
    segments_present: ['C'], gap: 'نعم ⚠',
    notes: 'ضاحية جنوبية. بنية خدمات أولية. فرصة دخول تجاري منخفض التكلفة.'
  },
  {
    id: 88, neighborhood: 'طريق مصنع الببسي', lat: 32.079500, lng: 20.178800, class: 'B',
    sector: 4, population: 7000, income: 'متوسط', flow: 'عالٍ',
    infra: 'جيد', market_type: 'لوجستي', market_match: 'مطابق',
    segments_present: ['B'], gap: 'لا',
    notes: 'محور صناعي. مصنع الببسي ومرافقه. حركة شاحنات التوزيع مستمرة.'
  },
  {
    id: 89, neighborhood: 'شارع الببسي', lat: 32.078500, lng: 20.175800, class: 'B',
    sector: 4, population: 8000, income: 'متوسط', flow: 'عالٍ',
    infra: 'جيد', market_type: 'لوجستي', market_match: 'مطابق',
    segments_present: ['B'], gap: 'لا',
    notes: 'محور صناعي-لوجستي شرقي. مصانع ومستودعات. مناسب للتوزيع الصناعي الكبير.'
  },
  {
    id: 90, neighborhood: 'جهاز الاستثمار العسكري', lat: 32.086214, lng: 20.101409, class: 'B',
    sector: 4, population: 5000, income: 'متوسط-جيد', flow: 'متوسط',
    infra: 'جيد', market_type: 'لا يوجد', market_match: 'غير مطابق',
    segments_present: ['B'], gap: 'نعم ⚠',
    notes: 'موقع مؤسسي. المحيط السكني يحتاج تغطية تجارية.'
  },

  // ══════════════════════════════════════════════════════════════════
  // القطاع 5: ضواحي التوسع
  // ══════════════════════════════════════════════════════════════════
  // المحور الشرقي
  {
    id: 91, neighborhood: 'بودزيرة', lat: 32.102500, lng: 20.180800, class: 'D',
    sector: 5, population: 18000, income: 'متباين', flow: 'انسيابي',
    infra: 'قيد التطور', market_type: 'لا يوجد', market_match: 'غير مطابق',
    segments_present: ['B','C'], gap: 'نعم ⚠',
    notes: 'محور شرقي. خلو من الأسواق المتكاملة. تكاليف لوجستية منخفضة للدخول.'
  },
  {
    id: 92, neighborhood: 'بنينا', lat: 32.087376, lng: 20.254899, class: 'D',
    sector: 5, population: 28000, income: 'متباين', flow: 'متوسط',
    infra: 'جيد', market_type: 'تجزئة', market_match: 'جزئي',
    segments_present: ['B','C'], gap: 'جزئياً ⚠',
    notes: 'قرب مطار بنينا الدولي. مدخل رئيسي لبنغازي. ازدحام في ساعات الذروة عند المدخل.'
  },
  {
    id: 93, neighborhood: 'الرجمة', lat: 32.085500, lng: 20.235800, class: 'D',
    sector: 5, population: 20000, income: 'متوسط-جيد', flow: 'انسيابي',
    infra: 'جيد', market_type: 'تجزئة', market_match: 'جزئي',
    segments_present: ['B','C'], gap: 'جزئياً ⚠',
    notes: 'منطقة شرقية هادئة. تضم شرائح من ذوي الدخل الجيد. فرصة للتوسع التجاري.'
  },
  {
    id: 94, neighborhood: 'النواقية', lat: 32.0755, lng: 20.1758, class: 'D',
    sector: 5, population: 16000, income: 'متباين', flow: 'انسيابي',
    infra: 'قيد التطور', market_type: 'لا يوجد', market_match: 'غير مطابق',
    segments_present: ['C'], gap: 'نعم ⚠',
    notes: 'تمدد جنوبي شرقي. طرق سريعة ممتدة. نقص واضح في الخدمات التجارية.'
  },
  {
    id: 95, neighborhood: 'الأبيار', lat: 32.1748, lng: 20.5758, class: 'D',
    sector: 5, population: 25000, income: 'متباين', flow: 'انسيابي',
    infra: 'جيد', market_type: 'تجزئة', market_match: 'غير مطابق',
    segments_present: ['B','C'], gap: 'نعم ⚠',
    notes: 'مدينة على الطريق الساحلي شرق بنغازي. فرصة توسع على الخط الساحلي الشرقي.'
  },
  {
    id: 96, neighborhood: 'قمينس', lat: 32.064, lng: 20.5678, class: 'D',
    sector: 5, population: 18000, income: 'متباين', flow: 'انسيابي',
    infra: 'قيد التطور', market_type: 'لا يوجد', market_match: 'غير مطابق',
    segments_present: ['C'], gap: 'نعم ⚠',
    notes: 'بلدة شرق بنغازي على الطريق الساحلي. نمو سكاني. تفتقر لبنية تجارية متكاملة.'
  },
  // المحور الغربي
  {
    id: 97, neighborhood: 'قنفوذة', lat: 32.0285, lng: 20.0228, class: 'D',
    sector: 5, population: 30000, income: 'متباين', flow: 'انسيابي',
    infra: 'قيد التطور', market_type: 'لا يوجد', market_match: 'غير مطابق',
    segments_present: ['C'], gap: 'نعم ⚠',
    notes: 'ضاحية غربية جنوبية. معدلات نمو سكاني مرتفعة. تعتمد على الطرق السريعة.'
  },
  {
    id: 98, neighborhood: 'الفعكات', lat: 32.0385, lng: 20.0428, class: 'D',
    sector: 5, population: 22000, income: 'متباين', flow: 'انسيابي',
    infra: 'قيد التطور', market_type: 'لا يوجد', market_match: 'غير مطابق',
    segments_present: ['C'], gap: 'نعم ⚠',
    notes: 'تمدد عشوائي غرب جنوب. فرصة توغل تجاري بتكاليف تشغيل منخفضة.'
  },
  {
    id: 99, neighborhood: 'بوصنيب', lat: 32.0485, lng: 20.0558, class: 'D',
    sector: 5, population: 18000, income: 'متباين', flow: 'انسيابي',
    infra: 'قيد التطور', market_type: 'لا يوجد', market_match: 'غير مطابق',
    segments_present: ['C'], gap: 'نعم ⚠⚠',
    notes: 'ضاحية غربية. بنية خدمات غير مكتملة. سوق تجزئة ناشئ.'
  },
  {
    id: 100, neighborhood: 'المقزحة السكني', lat: 32.0695, lng: 20.1508, class: 'D',
    sector: 5, population: 12000, income: 'متباين', flow: 'انسيابي',
    infra: 'قيد التطور', market_type: 'لا يوجد', market_match: 'غير مطابق',
    segments_present: ['B'], gap: 'نعم ⚠⚠',
    notes: 'مشروع سكني ناشئ جنوبي. يحتاج بنية تجارية متكاملة. فرصة استثمارية واضحة.'
  },
  {
    id: 101, neighborhood: 'أبو هادي', lat: 31.9585, lng: 20.2188, class: 'D',
    sector: 5, population: 20000, income: 'متباين', flow: 'انسيابي',
    infra: 'قيد التطور', market_type: 'لا يوجد', market_match: 'غير مطابق',
    segments_present: ['C'], gap: 'نعم ⚠',
    notes: 'ضاحية جنوبية بعيدة. تمدد سكاني. تفتقر تماماً لبنية تجارية متكاملة.'
  },
];
