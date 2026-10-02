/**
 * انحرافُ أدوارِ الاعتماد بين `firestore.rules` والمخطّطات (ف‑٢ · 2026-10-02).
 *
 * ═══ الفجوةُ التي يسدّها ═══
 * قواعدُ Firestore **لا تستورد JavaScript**. فأدوارُ الاعتماد والإنجاز مكتوبةٌ
 * **مرّتين**: في `schemas/*.js` وفي `approveRoles(docType)`/`completeRoles(docType)`
 * داخل القواعد. والازدواجُ مُعلَنٌ في الملفَّين مع الأمر «عدّلهما معًا» —
 * **وأمرٌ مكتوبٌ ليس حارسًا.**
 *
 * ★★★ وخطرُ الانحراف أنّه **صامتٌ في اتّجاهين، وأحدُهما كارثة**:
 *
 *   · **الواجهةُ تمنع والخادمُ يسمح** (دورٌ في القواعد وليس في المخطّط):
 *     الزرُّ مخفيٌّ فيظنّ الجميعُ البابَ مغلقًا — وهو مفتوحٌ لمن يستدعي
 *     `updateDoc` من الطرفيّة. **فصلُ المهامّ يسقط بلا أن يعلم أحد.**
 *
 *   · **الواجهةُ تسمح والخادمُ يمنع** (دورٌ في المخطّط وليس في القواعد):
 *     الموظّفُ يضغط «اعتماد» فيرتدّ بخطأ صلاحيّةٍ لا يفهمه، ويتعطّل العمل.
 *     مزعجٌ، لكنّه **يُرى** — وهذا أهونُ الاتّجاهين.
 *
 * وهذا ما أوصى به دليلُ المراجعة التقنيّة (§٨ ف‑٢) للفريق المراجِع — فبُني.
 *
 * ═══ ولماذا تحليلٌ نصّيّ؟ ═══
 * ⚠️ لأنّ `firestore.rules` **ليست JavaScript** ولا تُستورَد. فالقراءةُ نصّيّةٌ
 * بالضرورة. والمحلِّلُ هنا **محافظٌ عمدًا**: ما لا يفهمه يُبلّغ عنه
 * (`unparsed`) ولا يتجاهله — فحارسٌ يصمت عمّا لم يقرأ أسوأُ من غيابه.
 *
 * منطق خالص: بلا Firestore وبلا DOM. يقرأ **نصًّا** يُمرَّر إليه، فلا يلمس
 * القرص أيضًا — والقارئُ هو الاختبار.
 */

const text = (v) => String(v ?? '').trim();

/**
 * يستخرج خريطةَ `نوع ← أدوار` من دالّةٍ في نصّ القواعد.
 *
 * الشكلُ المقروء — سلسلةُ شرطيّاتٍ ثلاثيّة:
 *   function approveRoles(docType) {
 *     return docType == 'GRN'  ? ['qc_inspector', 'warehouse_manager']
 *          : docType == 'PR'   ? [...]
 *          : [];
 *   }
 *
 * @param {string} rules نصُّ `firestore.rules`
 * @param {string} fnName اسمُ الدالّة (`approveRoles` أو `completeRoles`)
 * @returns {{map: Record<string,string[]>, fallback: string[]|null, found: boolean}}
 */
export function parseRolesFunction(rules, fnName) {
  const src = String(rules ?? '');
  const start = src.indexOf(`function ${fnName}(`);
  if (start === -1) return { map: {}, fallback: null, found: false };

  // نقصُّ عند أوّل `}` يُغلق جسمَ الدالّة — بعدّ الأقواس لا بأوّل `}` نصادفه،
  // فجسمُ الدالّة يحوي `{` في التعليقات أحيانًا.
  let depth = 0;
  let end = -1;
  let seenOpen = false;
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === '{') { depth += 1; seenOpen = true; }
    else if (src[i] === '}') {
      depth -= 1;
      if (seenOpen && depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return { map: {}, fallback: null, found: false };

  // التعليقاتُ تُنزَع: بعضُها يذكر أسماءَ أدوارٍ في شرحٍ لا في قاعدة.
  const body = src
    .slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  const map = {};
  // `docType == 'XXX' ? [ … ]`
  const re = /docType\s*==\s*'([A-Z0-9_]+)'\s*\?\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(body))) {
    map[m[1]] = rolesIn(m[2]);
  }

  // الافتراضُ الأخير `: [ … ];` — وهو ما يحكم نوعًا غيرَ مذكور.
  const tail = body.slice(body.lastIndexOf('?'));
  const fb = /:\s*\[([^\]]*)\]\s*;/.exec(tail);

  return { map, fallback: fb ? rolesIn(fb[1]) : null, found: true };
}

/** أسماءُ الأدوار داخل قائمةٍ نصّيّة. */
function rolesIn(listSrc) {
  return [...String(listSrc).matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

/** مقارنةُ مجموعتين بلا نظرٍ إلى الترتيب. */
function sameSet(a, b) {
  const A = [...new Set(a || [])].sort();
  const B = [...new Set(b || [])].sort();
  return A.length === B.length && A.every((v, i) => v === B[i]);
}

/**
 * يقارن بوّابةً واحدة (`approve` أو `complete`) بين القواعد والمخطّطات.
 *
 * @param {string} rules نصُّ القواعد
 * @param {Record<string,object>} schemas
 * @param {'approve'|'complete'} gate
 */
export function compareGate(rules, schemas, gate) {
  const fnName = gate === 'approve' ? 'approveRoles' : 'completeRoles';
  const { map, fallback, found } = parseRolesFunction(rules, fnName);

  if (!found) {
    return {
      gate,
      parsed: false,
      drift: [],
      onlyInRules: [],
      onlyInSchemas: [],
      problem: `لم تُقرأ الدالّة «${fnName}» من firestore.rules — تغيّر شكلُها أو حُذفت.`,
    };
  }

  const drift = [];
  const onlyInSchemas = [];
  const schemaTypes = new Set();

  for (const s of Object.values(schemas || {})) {
    const type = text(s?.type);
    if (!type) continue;
    schemaTypes.add(type);
    const inSchema = s?.roles?.[gate] || [];
    const inRules = map[type];

    if (inRules === undefined) {
      // النوعُ يسقط على الافتراض — وهو `[]` عادةً أي **لا أحد**. فإن أعلن
      // المخطّطُ أدوارًا، فالواجهةُ تسمح والخادمُ يمنع.
      onlyInSchemas.push({ type, schema: inSchema, rulesFallback: fallback || [] });
      continue;
    }
    if (!sameSet(inRules, inSchema)) {
      drift.push({
        type,
        rules: [...inRules].sort(),
        schema: [...inSchema].sort(),
        // الأخطرُ: دورٌ يملكه الخادمُ ولا تعرفه الواجهة.
        extraInRules: inRules.filter((r) => !inSchema.includes(r)).sort(),
        extraInSchema: inSchema.filter((r) => !inRules.includes(r)).sort(),
      });
    }
  }

  // أنواعٌ في القواعد بلا مخطّطٍ أصلًا — بقايا نوعٍ حُذف، أو نوعٌ قادم.
  const onlyInRules = Object.keys(map)
    .filter((t) => !schemaTypes.has(t))
    .map((t) => ({ type: t, rules: [...map[t]].sort() }));

  return { gate, parsed: true, drift, onlyInRules, onlyInSchemas, problem: '' };
}

/** المقارنةُ على البوّابتين معًا. */
export function compareAllGates(rules, schemas) {
  return [compareGate(rules, schemas, 'approve'), compareGate(rules, schemas, 'complete')];
}

/**
 * تقريرٌ عربيٌّ يُطبَع عند السقوط — **يسمّي النوعَ والدورَ والاتّجاه**.
 *
 * ★★ ولا يُقال «٣ أنواعٍ منحرفة»: من قرأ ذلك لا يعرف أيَّها ولا يُصلح شيئًا.
 * (درسُ `groupBlocked` نفسُه في الإجراء الجماعيّ.)
 */
export function driftReport(results) {
  const lines = [];
  for (const r of results || []) {
    const label = r.gate === 'approve' ? 'الاعتماد' : 'الإنجاز';
    if (!r.parsed) {
      lines.push(`⛔ ${label}: ${r.problem}`);
      continue;
    }
    for (const d of r.drift) {
      if (d.extraInRules.length) {
        lines.push(
          `⛔ ${label} · ${d.type}: الخادمُ يسمح لـ[${d.extraInRules.join(' · ')}] والواجهةُ لا تعرفهم — ` +
            'بابٌ مفتوحٌ لا يراه أحد (فصلُ المهامّ يسقط صامتًا).'
        );
      }
      if (d.extraInSchema.length) {
        lines.push(
          `⚠️ ${label} · ${d.type}: الواجهةُ تسمح لـ[${d.extraInSchema.join(' · ')}] والخادمُ يمنعهم — ` +
            'الموظّفُ يضغط فيرتدّ بخطأٍ لا يفهمه.'
        );
      }
    }
    for (const o of r.onlyInSchemas) {
      lines.push(
        `⚠️ ${label} · ${o.type}: غيرُ مذكورٍ في القواعد فيسقط على [${o.rulesFallback.join(' · ') || 'لا أحد'}]، ` +
          `والمخطّطُ يعلن [${o.schema.join(' · ') || 'لا أحد'}].`
      );
    }
    for (const o of r.onlyInRules) {
      lines.push(`⚠️ ${label} · ${o.type}: في القواعد [${o.rules.join(' · ')}] ولا مخطّطَ له — بقيّةُ نوعٍ حُذف؟`);
    }
  }
  return lines;
}

/** هل ثمّة انحرافٌ يستحقّ إسقاطَ البناء؟ */
export function hasDrift(results) {
  return driftReport(results).length > 0;
}
