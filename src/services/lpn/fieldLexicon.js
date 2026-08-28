/**
 * معجمُ التنفيذ الميدانيّ — العربيّةُ والإنجليزيّةُ والفرنسيّة. منطق خالص.
 *
 * ═══ لماذا معجمٌ محدودٌ لا i18n للبوابة كلّها؟ ═══
 * قِيس الأمر لا خُمِّن (LPN-O08، 2026-08-27): البوّابة ٢٤٩ ملفَّ واجهةٍ ونحو
 * ٣٨٬٠٠٠ سطرٍ يحمل نصًّا عربيًّا و٢١١ ارتباطَ RTL في ١٤٢ ملفًّا — والعقبةُ
 * الحاكمة أنّ العربيّة **في نموذج البيانات**: `nameAr` حقلٌ إلزاميٌّ مخزَّنٌ
 * في Firestore لأسماء الأصناف، فترجمةُ الواجهة كاملةً تترك أكثرَ ما على
 * الشاشة عربيًّا لأنّه بياناتٌ كتبها موظّفون.
 *
 * فالمُجدي هو **التطبيق الميدانيّ وحده**: شاشاتٌ يستعملها عمّالٌ قد لا
 * يقرؤون العربيّة، ونصوصُها معدودةٌ ومحصورة. والباقي يبقى كما هو — إضافةٌ
 * لا تمسّ شيئًا يعمل.
 *
 * ═══ القاعدةُ الحاكمة: العربيّةُ أصلٌ واحتياط ═══
 * **لا فراغَ أبدًا.** مفتاحٌ ناقصٌ في الإنجليزيّة أو الفرنسيّة يعود عربيًّا،
 * ومفتاحٌ مجهولٌ يعود بنفسه ظاهرًا. فزرٌّ بلا نصٍّ عطبٌ صامت، ونصٌّ عربيٌّ
 * في شاشةٍ إنجليزيّة نقصٌ يُرى ويُصلَح.
 *
 * ⚠️ ولا يشمل هذا المعجمُ **رسائلَ الحكم** الآتية من المنطق الخالص
 * (`putawayTask` · `stagingLoading` · `countPallet` …) — تلك تبقى عربيّةً
 * حتى تُنقل بمفاتيح، وهو عملٌ مستقلٌّ لم يُدَّعَ إنجازُه.
 */

/** اللغاتُ المتاحة للتطبيق الميدانيّ. */
export const FIELD_LANGS = Object.freeze([
  { id: 'ar', label: 'العربية', dir: 'rtl' },
  { id: 'en', label: 'English', dir: 'ltr' },
  { id: 'fr', label: 'Français', dir: 'ltr' },
]);

export const DEFAULT_LANG = 'ar';

/** اتّجاهُ الكتابة للغة — والمجهولةُ تُعامَل معاملةَ الأصل. */
export function dirOf(lang) {
  return FIELD_LANGS.find((l) => l.id === lang)?.dir ?? 'rtl';
}

/** أهذه لغةٌ نعرفها؟ */
export function isFieldLang(lang) {
  return FIELD_LANGS.some((l) => l.id === lang);
}

/**
 * المعجم. المفتاحُ إنجليزيُّ الشكل ليقرأه أيُّ مطوّر، والقيمُ ثلاث.
 *
 * ★ والعربيّةُ مكتوبةٌ هنا كاملةً — لا تُترك فارغةً «لأنّها الأصل». فلو
 * نقصت لَعاد المفتاحُ نفسه إلى الشاشة، وهو أسوأ من نصٍّ مكرَّر.
 */
const LEX = Object.freeze({
  // ── مشتركٌ بين الشاشات ──
  lang: { ar: 'اللغة', en: 'Language', fr: 'Langue' },
  back_to_list: { ar: 'رجوعٌ للقائمة', en: 'Back to list', fr: 'Retour à la liste' },
  scan_or_type: { ar: 'امسح الباركود أو اكتبه', en: 'Scan or type the barcode', fr: 'Scannez ou saisissez le code' },
  identity_not_read: { ar: 'لم تُقرأ هويّتك بعد — أعد تحميل الصفحة.', en: 'Your profile has not loaded yet — reload the page.', fr: "Votre profil n'est pas encore chargé — rechargez la page." },
  connection_problem: { ar: 'تحقّق من الاتّصال.', en: 'Check your connection.', fr: 'Vérifiez votre connexion.' },
  cap_reached: { ar: 'بلغ سقفُ القائمة — المعروض ليس كلّ ما ينتظر.', en: 'List limit reached — this is not everything pending.', fr: "Limite atteinte — ceci n'est pas tout ce qui est en attente." },

  // ── الاستلام الميدانيّ ──
  mode_receiving: { ar: 'الاستلام', en: 'Receiving', fr: 'Réception' },
  mode_putaway: { ar: 'التخزين', en: 'Put-away', fr: 'Rangement' },
  open_pos: { ar: 'أوامر الشراء المفتوحة', en: 'Open purchase orders', fr: 'Commandes ouvertes' },
  new_pallet: { ar: 'طبلية جديدة', en: 'New pallet', fr: 'Nouvelle palette' },
  end_session: { ar: 'إنهاء الجلسة', en: 'End session', fr: 'Terminer la session' },

  // ── التخزين ──
  awaiting_putaway: { ar: 'بانتظار التخزين', en: 'Awaiting put-away', fr: 'En attente de rangement' },
  awaiting_putaway_hint: { ar: 'طبالٍ طُبعت ملصقاتُها ولم تبلغ رفًّا بعد.', en: 'Labelled pallets that have not reached a bin yet.', fr: "Palettes étiquetées qui n'ont pas encore atteint un emplacement." },
  scan_bin: { ar: 'امسح باركود الرفّ أو اكتبه', en: 'Scan or type the bin barcode', fr: "Scannez ou saisissez le code de l'emplacement" },
  suggested: { ar: 'المقترح', en: 'Suggested', fr: 'Suggéré' },
  suggestion_is_advice: { ar: 'الاقتراحُ اقتراحٌ لا أمر — امسح الرفّ الذي وضعتها فيه فعلًا.', en: 'The suggestion is advice, not an order — scan the bin you actually used.', fr: "La suggestion est un conseil, pas un ordre — scannez l'emplacement réellement utilisé." },
  confirm_putaway: { ar: 'أثبِت التخزين', en: 'Confirm put-away', fr: 'Confirmer le rangement' },
  no_pallet_waiting: { ar: 'لا طبليةَ تنتظر رفًّا. اعتمِد حمولةً من الحوكمة واطبع ملصقها.', en: 'No pallet is waiting for a bin. Approve a load in governance and print its label.', fr: "Aucune palette n'attend d'emplacement. Approuvez une charge et imprimez son étiquette." },

  // ── التحضير والتجهيز ──
  mode_picking: { ar: 'التحضير', en: 'Picking', fr: 'Préparation' },
  mode_staging: { ar: 'التجهيز', en: 'Staging', fr: 'Préparation quai' },
  awaiting_staging: { ar: 'تنتظر منطقةَ تجهيز', en: 'Awaiting a staging area', fr: 'En attente de zone de préparation' },
  awaiting_staging_hint: { ar: 'طبالي صرفٍ أُقفلت ولم تُربط بمنطقةٍ بعد.', en: 'Closed issue pallets not yet assigned to an area.', fr: "Palettes de sortie fermées, pas encore affectées à une zone." },
  scan_staging_area: { ar: 'امسح باركود منطقة التجهيز أو اكتبه', en: 'Scan or type the staging area barcode', fr: 'Scannez ou saisissez le code de la zone' },
  assign_to_area: { ar: 'اربِط بالمنطقة', en: 'Assign to area', fr: 'Affecter à la zone' },
  no_pallet_staging: { ar: 'لا طبليةَ تنتظر. أقفِل مهمّةَ تحضيرٍ فتظهر هنا.', en: 'Nothing waiting. Close a picking task and it appears here.', fr: 'Rien en attente. Clôturez une tâche de préparation.' },
  destination: { ar: 'وجهتها', en: 'Destination', fr: 'Destination' },
  no_destination: { ar: 'بلا وجهةٍ معلنة', en: 'No declared destination', fr: 'Aucune destination déclarée' },
  open_pick_tasks: { ar: 'مهامّ التحضير المفتوحة', en: 'Open picking tasks', fr: 'Tâches de préparation ouvertes' },

  // ── التحميل ──
  mode_loading: { ar: 'التحميل', en: 'Loading', fr: 'Chargement' },
  pick_route: { ar: 'اختر الوجهة', en: 'Choose a route', fr: 'Choisissez une destination' },
  route_hint: { ar: 'الوجهاتُ التي عليها حمولةٌ الآن.', en: 'Routes that currently have a load.', fr: 'Destinations ayant actuellement une charge.' },
  no_routes: { ar: 'لا وجهةَ عليها حمولة. جهّز طبالي أوّلًا.', en: 'No route has a load. Stage pallets first.', fr: 'Aucune destination chargée. Préparez des palettes.' },
  waiting_to_load: { ar: 'تنتظر التحميل', en: 'awaiting loading', fr: 'en attente de chargement' },
  already_loaded: { ar: 'محمّلة', en: 'loaded', fr: 'chargées' },
  loaded_of_expected: { ar: 'محمّلةٌ من المتوقّع', en: 'loaded of expected', fr: 'chargées sur prévu' },
  still_missing: { ar: 'لمّا تُحمّل', en: 'not yet loaded', fr: 'pas encore chargées' },
  extra_loaded: { ar: 'زائدة', en: 'extra', fr: 'en trop' },
  scan_pallet_to_load: { ar: 'امسح ملصق الطبلية التي تُحمّل', en: 'Scan the pallet being loaded', fr: 'Scannez la palette chargée' },
  seal_number: { ar: 'رقم الختم (إن وجد)', en: 'Seal number (if any)', fr: 'Numéro de scellé (le cas échéant)' },
  close_reason: { ar: 'سببُ الإغلاق ناقصًا — يُقيّد باسمك', en: 'Reason for closing short — recorded under your name', fr: 'Motif de clôture incomplète — enregistré à votre nom' },
  close_and_depart: { ar: 'أغلق التحميل واعتمد الخروج', en: 'Close loading and approve departure', fr: 'Clôturer et approuver le départ' },

  // ── استلام الوجهة ──
  mode_inbound: { ar: 'الاستلام الوارد', en: 'Inbound', fr: 'Réception transfert' },
  arriving_shipments: { ar: 'شحناتٌ في الطريق', en: 'Shipments in transit', fr: 'Expéditions en route' },
  arriving_hint: { ar: 'ما غادر بهويّته ولم يُستلَم بعد.', en: 'What left with its identity and has not been received yet.', fr: "Ce qui est parti et n'a pas encore été reçu." },
  no_arriving: { ar: 'لا شحنةَ في الطريق.', en: 'No shipment in transit.', fr: 'Aucune expédition en route.' },
  on_truck: { ar: 'على الشاحنة', en: 'on the truck', fr: 'sur le camion' },
  received_count: { ar: 'مُستلَمة', en: 'received', fr: 'reçues' },
  received_of_expected: { ar: 'مُستلَمةٌ من المتوقّع', en: 'received of expected', fr: 'reçues sur prévu' },
  not_arrived: { ar: 'لمّا تصل', en: 'not arrived', fr: 'pas encore arrivées' },
  seal_intact: { ar: 'الختم سليم', en: 'Seal intact', fr: 'Scellé intact' },
  seal_broken: { ar: 'الختم مكسور', en: 'Seal broken', fr: 'Scellé rompu' },
  arrived_opened: { ar: 'وصلت مفتوحة', en: 'Arrived opened', fr: 'Arrivée ouverte' },
  scan_arriving_pallet: { ar: 'امسح ملصق الطبلية الواصلة', en: 'Scan the arriving pallet label', fr: "Scannez l'étiquette de la palette reçue" },
  open_discrepancies: { ar: 'فرقًا بلا قرار', en: 'discrepancies without a decision', fr: 'écarts sans décision' },
  discrepancy_rule: {
    ar: 'أيّ فرقٍ يبقى مفتوحًا حتّى صدور قرار — ولا يُغلق أمرُ النقل حتّى تُحسم الفروق. والحسمُ من الحوكمة بمسؤوليّةٍ مسمّاة.',
    en: 'Any discrepancy stays open until a decision is issued — the transfer order does not close until they are resolved, and resolution comes from governance with named liability.',
    fr: "Tout écart reste ouvert jusqu'à décision — l'ordre de transfert ne se clôture pas avant résolution, prononcée par la gouvernance avec responsabilité nommée.",
  },

  // ── جرد الطبالي ──
  count_title: { ar: 'جرد الطبالي', en: 'Pallet stocktake', fr: 'Inventaire des palettes' },
  current_bin: { ar: 'الموقع الحاليّ', en: 'Current bin', fr: 'Emplacement actuel' },
  scan_bin_first: { ar: 'امسح باركود الرفّ', en: 'Scan the bin barcode', fr: "Scannez le code de l'emplacement" },
  scan_pallet_label: { ar: 'امسح ملصق الطبلية', en: 'Scan the pallet label', fr: "Scannez l'étiquette de la palette" },
  record_sighting: { ar: 'سجّل المشاهدة', en: 'Record sighting', fr: 'Enregistrer la constatation' },
  pallets_seen: { ar: 'طبليةً شوهدت', en: 'pallets seen', fr: 'palettes vues' },
  sealed_count: { ar: 'مغلقةً سليمة', en: 'sealed intact', fr: 'scellées intactes' },
  carries: { ar: 'تحمل', en: 'Carries', fr: 'Contient' },
  count_camera_hint: { ar: 'امسح الرفّ أوّلًا، ثمّ الطبالي فيه واحدةً تلو أخرى.', en: 'Scan the bin first, then its pallets one by one.', fr: "Scannez d'abord l'emplacement, puis les palettes une à une." },
  sighting_not_quantity: {
    ar: 'الطبليةُ المغلقةُ سليمةُ الختم تُشهَد ولا تُعدّ — وهذه شهادةُ رؤيةٍ لا كمّيّة، فلا تُغيّر رصيدًا.',
    en: 'A sealed, intact pallet is witnessed, not counted — this is a sighting, not a quantity, so no balance changes.',
    fr: "Une palette scellée intacte est constatée, non comptée — c'est une constatation, pas une quantité; aucun solde ne change.",
  },
});

/**
 * الترجمة — بالعربيّة احتياطًا دائمًا.
 *
 * @param {string} lang
 * @param {string} key
 * @returns {string} نصٌّ غيرُ فارغٍ أبدًا.
 */
export function t(lang, key) {
  const entry = LEX[key];
  // مفتاحٌ مجهول: يعود ظاهرًا ليُرى ويُصلَح — لا فراغًا يُشبه زرًّا معطّلًا.
  if (!entry) return String(key ?? '');
  return entry[lang] || entry[DEFAULT_LANG] || String(key);
}

/** كلُّ المفاتيح — للاختبار وللمراجعة. */
export function lexiconKeys() {
  return Object.keys(LEX);
}

/** المفاتيحُ الناقصةُ في لغةٍ ما — يقيسها الاختبار ولا يظنّها. */
export function missingIn(lang) {
  return Object.entries(LEX)
    .filter(([, v]) => !String(v[lang] ?? '').trim())
    .map(([k]) => k);
}
