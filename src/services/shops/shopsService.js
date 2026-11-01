/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  سجلُّ المحلّات — كِيانُ المحلّ على بابِ البيانات (المرحلة ص)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * كلُّ محلٍّ شركةٌ مستقلّةٌ معزولةٌ تمامًا (قرار المالك 2026-10-31): لا موردين ولا
 * أصنافَ ولا خزينةَ مشترَكة. هذا السجلُّ ينشئ المحلّاتِ ويسردُها على مجموعة
 * `shops`، ورمزُ المحلِّ هو معرّفُه (فريدٌ بالمعرّف) فلا يتكرّر.
 *
 * ★★ **التفرّدُ بالمعرّف لا بقاعدةٍ تُقارن** (درس reference-firestore-uniqueness-by-id):
 *    المعرّفُ هو الرمزُ (كبيرُ الأحرف)، والإنشاءُ **ملحقٌ-فقط بالقفز لا بالدهس** —
 *    معاملةٌ تقرأ ثمّ تكتب إن غاب، وتتخطّى إن وُجد، مُسلسَلةً عند الباب (كاتبٌ واحد).
 *
 * ★ **بابٌ محقونٌ لا مستورَد:** يأخذ `db` حقنًا (كـ`createLocalLedger`) فيُبرهَن على
 *   مخزنٍ في الذاكرة و`node:sqlite` بلا جرِّ Firebase إلى Node. والجزيرةُ تمرّر بابَ
 *   `_db/index.js` الحيّ. لا RLS في المحلّيّ، فالعزلُ في القراءة لا في القاعدة.
 */

/** مجموعةُ المحلّات — المعرّفُ هو رمزُ المحلّ (كبيرُ الأحرف)، فريدٌ بالمعرّف. */
export const SHOPS_COLLECTION = 'shops';

/** رمزُ محلٍّ مُطبَّعٌ (معرّفٌ): مُشذَّبٌ كبيرُ الأحرف، أو `''` إن فرغ. */
export function normalizeShopCode(code) {
  return String(code ?? '').trim().toUpperCase();
}

/**
 * سجلُّ محلّاتٍ فوق بابِ بياناتٍ بعقد Firestore.
 * @param {object} db باب البيانات (`createLocalDb` في الاختبار أو باب `_db` الحيّ).
 */
export function createShops(db) {
  if (!db || typeof db.runTransaction !== 'function' || typeof db.doc !== 'function') {
    throw new Error('createShops يحتاج بابَ بياناتٍ يحقّق عقدَ Firestore');
  }

  const shopRef = (id) => db.doc(db.db, SHOPS_COLLECTION, String(id));

  // طابورُ تسلسلٍ: كاتبٌ واحدٌ عند الباب فلا يتداخل «المعرّفُ قائمٌ؟» لإنشاءين متزامنين.
  let writeTail = Promise.resolve();
  function serialize(work) {
    const run = writeTail.then(work, work);
    writeTail = run.then(() => undefined, () => undefined);
    return run;
  }

  /**
   * ينشئ محلًّا (أو يتخطّى إن كان رمزُه قائمًا — لا دهسَ). لا يرمي أبدًا.
   * @param {{code:string,nameAr:string,active?:boolean}} input
   * @returns {Promise<{ok:true,id:string,created:boolean,skipped:boolean}|{ok:false,reason:string,message?:string}>}
   */
  async function create({ code, nameAr, active = true } = {}) {
    const id = normalizeShopCode(code);
    if (!id) return { ok: false, reason: 'bad-code' };
    const name = String(nameAr ?? '').trim();
    if (!name) return { ok: false, reason: 'bad-name' };

    return serialize(async () => {
      try {
        const outcome = await db.runTransaction(db.db, async (tx) => {
          const snap = await tx.get(shopRef(id));
          if (snap.exists()) return 'skip'; // تفرّدٌ بالمعرّف: القفزُ لا الدهس
          tx.set(shopRef(id), {
            code: id,
            nameAr: name,
            active: active !== false,
            createdAt: db.serverTimestamp(),
          });
          return 'created';
        });
        return { ok: true, id, created: outcome === 'created', skipped: outcome === 'skip' };
      } catch (e) {
        return { ok: false, reason: 'store', message: e.message };
      }
    });
  }

  /** يفعّل/يعطّل محلًّا قائمًا (دمجٌ لا دهس). المعطَّلُ لا يظهر في المبدّل. */
  async function setActive(code, active) {
    const id = normalizeShopCode(code);
    if (!id) return { ok: false, reason: 'bad-code' };
    return serialize(async () => {
      try {
        const snap = await db.getDoc(shopRef(id));
        if (!snap.exists()) return { ok: false, reason: 'not-found' };
        const d = snap.data() || {};
        // إعادةُ كتابةٍ كاملةٍ من اللقطة (بلا اعتمادٍ على دلالة merge)؛ المحلُّ كِيانٌ
        // رئيسٌ لا مجموعةٌ ملحقةٌ-فقط، فالتحديثُ مباحٌ (بخلاف القيد/الحركة).
        await db.setDoc(shopRef(id), {
          code: id,
          nameAr: d.nameAr || '',
          active: active !== false,
          createdAt: d.createdAt ?? null,
        });
        return { ok: true, id, active: active !== false };
      } catch (e) {
        return { ok: false, reason: 'store', message: e.message };
      }
    });
  }

  /** كلُّ المحلّات مرتّبةً بالمعرّف. */
  async function list() {
    const snap = await db.getDocs(db.collection(db.db, SHOPS_COLLECTION));
    return snap.docs
      .map((s) => {
        const d = s.data() || {};
        return { code: d.code || s.id, nameAr: d.nameAr || '', active: d.active !== false };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  /** المحلّاتُ الفعّالةُ وحدَها (للمبدّل). */
  async function listActive() {
    return (await list()).filter((s) => s.active);
  }

  /** محلٌّ واحدٌ بالرمز، أو `null`. */
  async function get(code) {
    const id = normalizeShopCode(code);
    if (!id) return null;
    const snap = await db.getDoc(shopRef(id));
    if (!snap.exists()) return null;
    const d = snap.data() || {};
    return { code: d.code || id, nameAr: d.nameAr || '', active: d.active !== false };
  }

  return { create, setActive, list, listActive, get };
}
