/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  التوجيهُ بالمجموعة — أيُّ مسارٍ يُقرأ من قاعدتنا، وأيُّه يبقى على Firebase
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★★ **الفجوةُ التي يسدّها (قِيست 2026-10-20):** `firestore.rules` فيها
 *     **٩٨ مجموعة**، والمرآةُ تنسخ **خمسًا**. والمفتاحُ في `_db/index.js`
 *     **أحاديّ**: يختار محوَّلًا واحدًا لكلّ شيء. فتحويلُ القراءة إلى
 *     PostgreSQL بالمفتاح وحدَه يعني أنّ ثلاثًا وتسعين مجموعةً تُطلب من
 *     جداولَ **لا وجودَ لها** — وتسقط البوّابةُ في أوّل شاشة.
 *
 *     ⇒ فالتوجيهُ **بالمجموعة لا بالمحوَّل**: ما نُسخ يُقرأ من قاعدتنا،
 *       وما لم يُنسخ يمرّ إلى Firebase في الطلب نفسِه. وهذا هو معنى
 *       «مرنٌ بين القاعدة التي نبنيها وقوقل» — لا قطيعةَ ولا يومَ تحويل.
 *
 * ═══ ولماذا مجموعتان فقط وليس الخمس؟ قياسٌ لا احتياط ═══
 *
 *   `Items_Master` (٤٢١٥ صفًّا) و`documents` (٣٢٤) هما **ثقلُ القراءة كلُّه**
 *   عمليًّا. وأمّا الثلاثُ الباقيات فخرجت بسببٍ مكتوب:
 *
 *   · `counters` — **لا تُقرأ من مرآة أبدًا.** العدّادُ يُقرأ ليُزاد، وقيمةٌ
 *     متأخّرةٌ دقيقةً تعني **رقمَ مستندٍ مكرَّرًا**. وهو عينُ العطب القائم:
 *     ١٨ مستندًا مرفوضًا اليوم لتكرار الرقم. ولا نزيده بيدنا.
 *     ⚠️ وفوق ذلك: خريطةُ المزامنة **لا تحفظ `firebase_id` للعدّادات**
 *       (مفتاحُها `type, year`) — فلا سبيلَ أصلًا لجلبِ عدّادٍ بمعرّفه.
 *
 *   · `users` — الأدوارُ والتعطيلُ **حكمُ صلاحيّة**. وحسابٌ يُوقَف الآن ويبقى
 *     دقيقةً «نشطًا» في المرآة بابٌ مفتوحٌ بلا داعٍ. والمكسبُ صفر: ١٧ صفًّا.
 *
 *   · `warehouses` — ستّةُ صفوف. لا مكسبَ، وكلُّ مسارٍ مضافٍ سطحُ خطرٍ مضاف.
 *
 *   وإضافةُ مجموعةٍ لاحقًا **سطرٌ في `MIRRORED`** — بعد أن تُنسخ وتُقاس.
 *
 * ═══ والقاعدةُ الحاكمة: المجهولُ يذهب إلى Firebase ═══
 *
 *   كلُّ ما ليس في الجدول صراحةً ⟵ Firebase. فمجموعةٌ تُضاف غدًا إلى
 *   البوّابة تعمل يومَ تُضاف، ولا تنتظر أحدًا. **والسكوتُ يميل إلى القائم.**
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * المجموعاتُ المقروءةُ من قاعدتنا — وكلُّ واحدةٍ بعمودِ معرّفها.
 *
 * ★★★ و`idColumn` ليس تفصيلًا: مفتاحُ `items` الأوّليُّ هو `sku`، **ومعرّفُ
 *     Firestore محفوظٌ في `firebase_id`**. فجلبُ صنفٍ بمعرّفه بحثًا في `sku`
 *     يُعيد **صفرَ صفوفٍ أو صفًّا خاطئًا** — ويبدو كأنّ الصنفَ حُذف.
 *     (و`documents` معرّفُها هو `id` نفسُه، فلا التباس.)
 */
export const MIRRORED = Object.freeze({
  Items_Master: Object.freeze({ table: 'items', idColumn: 'firebase_id' }),
  documents: Object.freeze({ table: 'documents', idColumn: 'id' }),
});

/** أسبابُ الذهاب إلى Firebase — تُقرأ في التشخيص ولا تُخمَّن. */
export const REASON = Object.freeze({
  MIRRORED_OK: 'mirrored',
  NOT_MIRRORED: 'not-mirrored',
  NESTED: 'nested-path',
  BAD_PATH: 'bad-path',
  DISABLED: 'hybrid-disabled',
  STALE: 'mirror-stale',
  DOWN: 'mirror-unreachable',
});

/**
 * يقصّ مسارَ Firestore إلى أجزائه ويرفض الفارغ.
 * @param {string} path
 * @returns {string[]}
 */
function segments(path) {
  if (typeof path !== 'string') return [];
  return path.split('/').filter((s) => s.length > 0);
}

/**
 * اسمُ المجموعة في رأس المسار — و`null` لما ليس مسارًا صالحًا.
 *
 * ★ والمسارُ المتداخل (`documents/X/lines/Y`) **يُردّ إلى Firebase دائمًا**:
 *   المرآةُ تحفظ السطورَ داخل `jsonb` في صفّ المستند، فلا مجموعةَ فرعيّةَ
 *   لها جدولٌ تُقرأ منه. وردُّه أسلمُ من محاولةِ تخمينٍ ذكيّة.
 *
 * @param {string} path
 * @returns {{ head: string|null, depth: number }}
 */
export function headOf(path) {
  const segs = segments(path);
  if (segs.length === 0) return { head: null, depth: 0 };
  return { head: segs[0], depth: segs.length };
}

/**
 * الحكمُ على مسارٍ واحد.
 *
 * @param {string} path مسارُ Firestore: مجموعةٌ (`documents`) أو مستندٌ
 *   (`documents/abc`).
 * @param {object} [state] حالةُ المرآة لحظةَ السؤال.
 * @param {boolean} [state.enabled=true] المفتاحُ العامّ للهجين.
 * @param {boolean} [state.healthy=true] هل بلغنا القاعدةَ آخرَ مرّة؟
 * @param {Set<string>|null} [state.fresh=null] المساراتُ الطازجةُ الآن.
 *   و`null` تعني «لم نقس الطزاجة بعد» — ولا تُعامَل معاملةَ البائت.
 * @returns {{ source: 'postgres'|'firestore', reason: string,
 *   table?: string, idColumn?: string, head: string|null, depth: number }}
 */
export function routeFor(path, state) {
  const { head, depth } = headOf(path);
  const out = (source, reason, extra) => ({ source, reason, head, depth, ...(extra || {}) });

  if (!head) return out('firestore', REASON.BAD_PATH);
  if (depth > 2) return out('firestore', REASON.NESTED);

  const entry = MIRRORED[head];
  if (!entry) return out('firestore', REASON.NOT_MIRRORED);

  const s = state || {};
  if (s.enabled === false) return out('firestore', REASON.DISABLED);
  if (s.healthy === false) return out('firestore', REASON.DOWN);

  // ★★★ الطزاجةُ تُفحص **بالمسار لا بالمجموع**: المزامنةُ قد تنجح في
  //     `documents` وتتعثّر في `Items_Master`، فحكمٌ واحدٌ للاثنين يكذب
  //     في أحدهما حتمًا. و`null` تعني «لم يُقَس» فلا تُسقط المسار.
  if (s.fresh instanceof Set && !s.fresh.has(head)) return out('firestore', REASON.STALE);

  return out('postgres', REASON.MIRRORED_OK, { table: entry.table, idColumn: entry.idColumn });
}

/**
 * هل هذا المسارُ منسوخٌ أصلًا؟ سؤالٌ عن الجدول لا عن الحالة.
 * @param {string} path
 * @returns {boolean}
 */
export function isMirrored(path) {
  const { head, depth } = headOf(path);
  return Boolean(head) && depth <= 2 && Boolean(MIRRORED[head]);
}

/** المساراتُ المنسوخة — تُقرأ في التشخيص وفي فحص الطزاجة. */
export function mirroredPaths() {
  return Object.keys(MIRRORED);
}
