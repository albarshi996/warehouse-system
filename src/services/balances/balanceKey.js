/**
 * مفاتيح الأرصدة ومنطق FEFO — منطق خالص بلا Firebase، قابل للاختبار وحده.
 *
 * الرصيد مفتاحه مركّب: **(الصنف × المخزن × التشغيلة)**. الصنف الواحد له رصيد
 * مستقلّ في كل مخزن (E5/E2/E3)، ولكل تشغيلة صلاحيتها — وعلى الصلاحية يقوم
 * حارس FEFO (القاعدة الذهبية الثالثة). هذا الملف يبني المفتاح ويرتّب FEFO.
 */

/** يُنظّف جزءًا من المفتاح: يُزيل ما يكسر معرّف مستند Firestore («/» و«.»). */
function safe(part) {
  return String(part ?? '')
    .trim()
    .replace(/[/.#$[\]]/g, '-')
    .replace(/\s+/g, '_')
    .toUpperCase();
}

/** الصلاحية جزءًا من المفتاح: يومًا واحدًا `YYYY-MM-DD`، والفاسد يُهمَل. */
function safeExpiry(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10);
}

/**
 * المعرّف الفريد للرصيد — يجعل إعادة الاستيراد **تحديثًا لا تكرارًا**.
 *
 * الهويّة: **(الصنف × المخزن × التشغيلة × الموقع × الصلاحية × الحالة)**.
 *
 * هوية الصنف: الكود إن وُجد، وإلا الباركود **توافقًا رجعيًّا فقط** — أرصدةٌ
 * كُتبت قبل اعتماد «الكود هو الهويّة» (SAP-1 · §9.1 ‹182›). العقد الحاكم في
 * `items/itemIdentity.js`: صنفٌ جديد بلا كود يُرفض عند الإنشاء، فلا تتكاثر
 * مفاتيح الباركود؛ والقائم منها يبقى عاملًا (`via:'barcode-legacy'`).
 * التشغيلة الفارغة تصير `NOBATCH` كي لا ينهار المفتاح على «--».
 *
 * ═══ ★★ الترحيل صفرُ الأثر — شرطُ قبولٍ لا ميزة (LOC-108 · ف‑١٨) ═══
 *
 * رصيدٌ **بلا موقعٍ ولا صلاحيةٍ وبحالة `OK`** يُنتج المفتاح القديم **حرفيًّا**.
 * فكلّ رصيدٍ مكتوبٍ اليوم يبقى على معرّفه، ولا يتيتم صفٌّ واحد، ولا يحتاج
 * المستودع «يوم ترحيلٍ» يتوقّف فيه العمل. والأبعاد الثلاثة تدخل المفتاح
 * **حين تُعرف وحدها** — أي حين يبدأ العمل بها فعلًا.
 *
 * ولماذا الموقع في المفتاح أصلًا؟ لأنّ الدفعة الواحدة تتوزّع على رفّين،
 * وبلا الموقع ينهاران في صفٍّ واحد فلا يُعرف كم في هذا الرفّ. وكذلك
 * الصلاحية: دفعةٌ بصلاحيتين كانت تُدهس إحداهما بلا إنذار.
 *
 * ⚠️ الشرط الذي جعل هذا آمنًا (LOC-105): أسطر **السحب** صارت تحمل مواقعها،
 * فما دخل الرفّ يخرج منه بالمفتاح نفسه.
 *
 * @returns {string|null} المعرّف، أو null إن غاب المخزن أو هوية الصنف معًا.
 */
export function balanceId({ sku, barcode, warehouse, batch, bin, expiry, status }) {
  const item = safe(sku) || safe(barcode);
  const wh = safe(warehouse);
  if (!item || !wh) return null;
  const lot = safe(batch) || 'NOBATCH';
  const base = `${item}__${wh}__${lot}`;

  const loc = safe(bin);
  const exp = safeExpiry(expiry);
  const st = safe(status);
  const plainStatus = !st || st === 'OK';

  // ★★ لا موقع ولا صلاحية وحالةٌ افتراضية ⇒ المفتاح القديم حرفيًّا.
  if (!loc && !exp && plainStatus) return base;

  return `${base}__${loc || 'NOLOC'}__${exp || 'NOEXP'}__${st || 'OK'}`;
}

/**
 * تعارض بيانات: **دفعةٌ واحدة بصلاحيتين** في المخزن نفسه.
 *
 * قبل اليوم كان هذا يُدهس بصمت — يكتب آخرُ قيدٍ صلاحيتَه فوق سابقتها فتضيع
 * الأولى ولا يعلم أحد. والآن يفترقان في المفتاح فلا يُدهس شيء؛ لكنّ الافتراق
 * **ليس علاجًا**: دفعةٌ واحدة لا يجوز أن تحمل صلاحيتين، فإمّا خطأُ إدخالٍ
 * وإمّا خلطُ دفعتين تحت رقمٍ واحد. وكلاهما يحتاج إنسانًا يحسمه لا صفًّا ثانيًا.
 *
 * @returns {Array<{item:string, warehouse:string, batch:string, expiries:string[], rows:Array}>}
 */
export function batchExpiryConflicts(balances) {
  const groups = new Map();
  for (const b of balances || []) {
    const item = safe(b?.sku) || safe(b?.barcode);
    const wh = safe(b?.warehouse);
    const lot = safe(b?.batch);
    // دفعةٌ فارغة ليست دفعةً واحدة — `NOBATCH` وعاءٌ يجمع ما لا رقم له،
    // فاختلافُ صلاحياته طبيعيّ لا تعارض.
    if (!item || !wh || !lot) continue;
    const key = `${item}__${wh}__${lot}`;
    if (!groups.has(key)) groups.set(key, { item, warehouse: wh, batch: lot, rows: [] });
    groups.get(key).rows.push(b);
  }

  const out = [];
  for (const g of groups.values()) {
    const expiries = [...new Set(g.rows.map((r) => safeExpiry(r.expiry)).filter(Boolean))];
    if (expiries.length > 1) out.push({ ...g, expiries: expiries.sort() });
  }
  return out;
}

/**
 * ترتيب FEFO: الأقرب انتهاءً أولًا. الرصيد بلا صلاحية يُدفع للآخر (لا نُقدّم
 * مجهول الصلاحية على معلومها). يُعيد نسخة مرتّبة — لا يعدّل الأصل.
 */
export function fefoSort(balances) {
  return [...(balances || [])].sort((a, b) => {
    const ea = expiryValue(a.expiry);
    const eb = expiryValue(b.expiry);
    return ea - eb;
  });
}

/** يحوّل تاريخ الصلاحية إلى رقم للترتيب؛ الفارغ/غير الصالح = ما لا نهاية. */
function expiryValue(raw) {
  if (!raw) return Infinity;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? Infinity : t;
}

/**
 * حالة الصلاحية بالنسبة لتاريخ مرجعي (افتراضه يُمرَّر — لا نقرأ الساعة هنا
 * كي يبقى المنطق خالصًا قابلًا للاختبار).
 *   منتهٍ | قريب (خلال nearDays) | سليم | غير محدَّد
 */
export function expiryStatus(expiry, nowMs, nearDays = 30) {
  if (!expiry) return 'unknown';
  const t = Date.parse(expiry);
  if (Number.isNaN(t)) return 'unknown';
  if (t < nowMs) return 'expired';
  if (t - nowMs <= nearDays * 86400000) return 'near';
  return 'ok';
}

/** إجمالي الكمية عبر مجموعة أرصدة. */
export function totalQty(balances) {
  return (balances || []).reduce((s, b) => s + (Number(b.qty) || 0), 0);
}

/** قيمة المخزون = Σ(كمية × تكلفة التشغيلة) — أساس تقييم S12. */
export function stockValue(balances) {
  return (balances || []).reduce((s, b) => s + (Number(b.qty) || 0) * (Number(b.unitCost) || 0), 0);
}
