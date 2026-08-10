/**
 * الدفع مرّةً واحدة — القرار الذي يمنع ازدواج البيانات في أودو.
 *
 * ═══ العطب الذي يُصلحه ═══
 * كان الجسر يستدعي `odoo.create` بلا فحص، ثمّ يكتب مرآته بمعرّفٍ حتميّ
 * و`merge:true`. فالنتيجة أنّ الدفع مرّتين يُنشئ **سجلَّين في أودو** ومرآةً
 * واحدة — والمرآة تُظهر كلّ شيءٍ سليمًا بينما أودو يحمل نسخةً شبحًا. ولا
 * يُكتشف هذا إلّا في تقريرٍ ماليٍّ بعد شهور، حين يتضاعف الإيراد بلا سبب.
 *
 * وليست الحالة نادرة: شبكةٌ تنقطع بعد الإنشاء وقبل كتابة المرآة، أو موظّفٌ
 * يضغط الزرّ مرّتين، أو إعادة مزامنةٍ بعد فشلٍ ظاهر. كلّها تُنتج ازدواجًا.
 *
 * ═══ ثلاث طبقاتٍ للحماية، لا واحدة ═══
 * ① **المرآة** — إن حملت `odooId` فالسجلّ منشأ: نُحدّثه ولا نُنشئه.
 * ② **البحث بالأثر الراجع** — إن ضاعت المرآة، نسأل أودو: «هل عندك سجلٌّ
 *    مصدرُه هذا الرقم؟». فالحقيقة عند أودو لا عند مرآتنا.
 * ③ **الإنشاء** — آخر الخيارات لا أوّلها.
 * والطبقة الثانية هي الفرق بين نظامٍ يتعافى ونظامٍ يُضاعف بصمت: مرآةٌ محذوفةٌ
 * أو قاعدةٌ أُعيد بناؤها لا يجوز أن تعني نسخةً ثانية في أودو.
 *
 * منطق خالص: بلا Firestore وبلا شبكة — القرار هنا، والتنفيذ في الجسر.
 */

const str = (v) => String(v ?? '').trim();

/** معرّف المرآة الحتميّ — نوعٌ ومعرّف مستند. */
export function mirrorIdFor(sourceType, sourceId) {
  const t = str(sourceType).toUpperCase();
  const i = str(sourceId);
  return t && i ? `${t}_${i}` : '';
}

/**
 * القرار: أنُنشئ أم نُحدّث؟
 *
 * @param {object} args
 * @param {object|null} args.mirror مستند المرآة إن وُجد
 * @param {Array} [args.existing] سجلّات أودو التي طابقت الأثر الراجع
 * @param {string} [args.sourceNumber] رقم مستند البوابة (للرسائل)
 * @returns {{action:'update'|'adopt'|'create', odooId:number|null, reason:string}}
 */
export function resolveSyncAction({ mirror, existing = [], sourceNumber = '' } = {}) {
  const mirrored = Number(mirror?.odooId);
  if (Number.isFinite(mirrored) && mirrored > 0) {
    return {
      action: 'update',
      odooId: mirrored,
      reason: `السجلّ منشأٌ سلفًا في أودو (#${mirrored}) — يُحدَّث ولا يُنشأ ثانيةً.`,
    };
  }

  const found = (existing || [])
    .map((r) => Number(r?.id))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  if (found.length) {
    return {
      action: 'adopt',
      odooId: found[0],
      reason:
        found.length > 1
          ? `وُجدت ${found.length} نسخٍ في أودو بالمصدر «${sourceNumber}» — تُتبنّى الأقدم (#${found[0]}) ويُبلَّغ عن الباقي.`
          : `وُجد سجلٌّ في أودو بالمصدر «${sourceNumber}» (#${found[0]}) — يُتبنّى بدل إنشاء نسخةٍ ثانية.`,
    };
  }

  return { action: 'create', odooId: null, reason: 'لا سجلّ سابق — يُنشأ مسوّدةً.' };
}

/**
 * النسخ الزائدة التي وُجدت في أودو بنفس الأثر الراجع.
 * لا نحذفها تلقائيًّا — الحذف قرارٌ بشريّ. لكنّها تُبلَّغ كي لا تبقى صامتة.
 */
export function duplicateIds(existing = [], adoptedId) {
  return (existing || [])
    .map((r) => Number(r?.id))
    .filter((n) => Number.isFinite(n) && n > 0 && n !== Number(adoptedId));
}

/**
 * شرط البحث بالأثر الراجع. يُبنى هنا لا في الجسر كي يُختبَر، ولأنّ اسم الحقل
 * (`x_source_number`) هو العقد بين مخطِّطاتنا وأودو — يُغيَّر في موضعٍ واحد.
 */
export function sourceDomain(sourceNumber) {
  const n = str(sourceNumber);
  return n ? [['x_source_number', '=', n]] : null;
}

/** هل يصلح هذا المستند للدفع أصلًا؟ حارسٌ يسبق أيّ اتّصال. */
export function canPush(doc) {
  if (!doc?.id) return { ok: false, reason: 'مستند بلا معرّف.' };
  if (!str(doc.number)) {
    return { ok: false, reason: 'مستند بلا رقمٍ رسميّ — لا أثر راجع يمنع الازدواج. اعتمده أوّلًا.' };
  }
  if (doc.state === 'draft' || doc.state === 'rejected') {
    return { ok: false, reason: 'المسوّدة والمرفوض لا يُدفعان — الدفع للمعتمَد فما فوق.' };
  }
  return { ok: true, reason: '' };
}
