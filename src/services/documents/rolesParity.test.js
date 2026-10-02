/**
 * 🔒 حارسُ انحراف أدوار الاعتماد — ف‑٢ مُمَكْنَنًا.
 *
 * الازدواجُ بين `firestore.rules` والمخطّطات **مقصودٌ ومُعلَن** (القواعدُ لا
 * تستورد JS)، والأمرُ المكتوب «عدّلهما معًا» موجودٌ في الملفَّين — **وأمرٌ
 * مكتوبٌ ليس حارسًا**. فهذا يقرأ الاثنين ويقارن.
 *
 * ★★★ والاتّجاهُ الخطر: دورٌ في القواعد وليس في المخطّط ⇒ **الخادمُ يسمح
 * والواجهةُ لا تعرف**. الزرُّ مخفيٌّ فيُظنّ البابُ مغلقًا، وهو مفتوحٌ لمن
 * يستدعي `updateDoc` من الطرفيّة. وفصلُ المهامّ — حارسُ الجودة وحارسُ
 * البوّابة وحارسُ التسوية — يسقط **بلا أن يعلم أحد**.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseRolesFunction,
  compareGate,
  compareAllGates,
  driftReport,
  hasDrift,
} from './rolesParity.js';
import SCHEMAS from './schemas/index.js';

const RULES_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'firestore.rules');
const RULES = fs.readFileSync(RULES_PATH, 'utf8');

/* ═══════════════ الحارسُ الحيّ ═══════════════ */

test('🔒 لا انحرافَ بين firestore.rules ومخطّطات المستندات — في بوّابتَي الاعتماد والإنجاز', () => {
  const results = compareAllGates(RULES, SCHEMAS);
  const report = driftReport(results);
  assert.deepEqual(
    report,
    [],
    'انحرفت أدوارُ الاعتماد/الإنجاز بين القواعد والمخطّطات — عدّلهما معًا:\n' + report.join('\n')
  );
  assert.equal(hasDrift(results), false);
});

test('★★★ والحارسُ قرأ القواعدَ فعلًا — لا مطابقةَ فراغٍ بفراغ', () => {
  // نقضٌ مضادّ: لو عجز المحلِّلُ عن القراءة لكانت الخريطةُ فارغةً، ولكان
  // الاختبارُ أعلاه أخضرَ **وهو لا يحرس شيئًا**. فيُثبَت أنّه قرأ.
  const types = Object.keys(SCHEMAS).length;
  for (const fn of ['approveRoles', 'completeRoles']) {
    const p = parseRolesFunction(RULES, fn);
    assert.equal(p.found, true, `${fn} لم تُقرأ من القواعد`);
    assert.equal(
      Object.keys(p.map).length,
      types,
      `${fn}: قُرئ ${Object.keys(p.map).length} نوعًا والمخطّطاتُ ${types} — المحلِّلُ لا يرى الكلّ`
    );
    assert.deepEqual(p.fallback, [], `${fn}: الافتراضُ ليس «لا أحد» — نوعٌ غيرُ مذكورٍ سيُمنح صلاحيّة`);
  }
  // وعيّنةٌ محسوسة: حارسُ الجودة على الاستلام.
  assert.deepEqual(parseRolesFunction(RULES, 'approveRoles').map.GRN, ['qc_inspector', 'warehouse_manager']);
});

/* ═══════════════ النقض — الحارسُ يُطلق فعلًا ═══════════════ */

test('★★★ دورٌ زائدٌ في القواعد يُطلق الحارسَ ويُسمَّى الاتّجاهُ الخطر', () => {
  const tampered = RULES.replace(
    "docType == 'GRN'     ? ['qc_inspector', 'warehouse_manager']",
    "docType == 'GRN'     ? ['qc_inspector', 'warehouse_manager', 'storekeeper']"
  );
  assert.notEqual(tampered, RULES, 'لم يقع التلاعبُ — تغيّر شكلُ السطر، راجع النمط');

  const report = driftReport(compareAllGates(tampered, SCHEMAS));
  assert.ok(report.length > 0, 'الحارسُ لم يُطلق على دورٍ زائدٍ في الخادم');
  const line = report.find((l) => l.includes('GRN'));
  assert.match(line, /storekeeper/, 'لم يُسمَّ الدورُ المنحرف');
  assert.match(line, /⛔/, 'لم يُميَّز الاتّجاهُ الخطر عن المزعج');
  assert.match(line, /الخادمُ يسمح/, 'لم يُوصَف الاتّجاه');
});

test('★★ ودورٌ ناقصٌ في القواعد يُطلق أيضًا — لكنْ بنبرةٍ أدنى', () => {
  const tampered = RULES.replace(
    "docType == 'GRN'     ? ['qc_inspector', 'warehouse_manager']",
    "docType == 'GRN'     ? ['qc_inspector']"
  );
  const report = driftReport(compareAllGates(tampered, SCHEMAS));
  const line = report.find((l) => l.includes('GRN'));
  assert.match(line, /warehouse_manager/);
  assert.match(line, /⚠️/, 'الاتّجاهُ المزعجُ عُومل كالخطر');
  assert.match(line, /الواجهةُ تسمح/);
});

test('★★ ونوعٌ يُحذف من القواعد يسقط على «لا أحد» ويُبلَّغ', () => {
  const tampered = RULES.replace(/docType == 'GRN'\s*\?\s*\[[^\]]*\]\s*\n\s*:/, '');
  const report = driftReport(compareAllGates(tampered, SCHEMAS));
  assert.ok(report.some((l) => l.includes('GRN')), 'نوعٌ غاب من القواعد ولم يُبلَّغ عنه');
});

test('★ ونوعٌ في القواعد بلا مخطّطٍ يُبلَّغ — بقيّةُ نوعٍ حُذف', () => {
  const r = compareGate(RULES, { GRN: SCHEMAS.GRN }, 'approve');
  assert.ok(r.onlyInRules.length > 0, 'أنواعُ القواعد الزائدةُ لم تُكشف');
  const report = driftReport([r]);
  assert.ok(report.some((l) => /لا مخطّطَ له/.test(l)));
});

/* ═══════════════ المحلِّلُ نفسُه ═══════════════ */

test('★★ المحلِّلُ يُبلّغ عمّا لم يقرأ ولا يصمت', () => {
  const missing = parseRolesFunction(RULES, 'noSuchFunction');
  assert.equal(missing.found, false);
  const r = compareGate('rules bila dala', SCHEMAS, 'approve');
  assert.equal(r.parsed, false);
  assert.match(r.problem, /لم تُقرأ/);
  // ويسقط الحارسُ — فحارسٌ يصمت عمّا لم يقرأ أسوأُ من غيابه.
  assert.ok(driftReport([r]).length > 0);
});

test('المحلِّلُ ينزع التعليقاتِ — فأسماءُ الأدوار في شرحٍ ليست قاعدة', () => {
  const src = `
    function approveRoles(docType) {
      // تعليقٌ يذكر 'finance_manager' و 'treasury' شرحًا لا قاعدة
      /* وكذلك 'gate_officer' في كتلةٍ */
      return docType == 'XX' ? ['qc_inspector']
           : [];
    }
  `;
  const p = parseRolesFunction(src, 'approveRoles');
  assert.deepEqual(p.map, { XX: ['qc_inspector'] });
  assert.deepEqual(p.fallback, []);
});

test('المحلِّلُ يقصّ جسمَ الدالّة بعدّ الأقواس لا بأوّل قوسٍ مغلق', () => {
  const src = `
    function approveRoles(docType) {
      return docType == 'AA' ? ['a']
           : [];
    }
    function completeRoles(docType) {
      return docType == 'BB' ? ['b']
           : [];
    }
  `;
  // لو قُصّ عند أوّل `}` لَتسرّب نوعُ الدالّة الثانية إلى الأولى.
  assert.deepEqual(parseRolesFunction(src, 'approveRoles').map, { AA: ['a'] });
  assert.deepEqual(parseRolesFunction(src, 'completeRoles').map, { BB: ['b'] });
});

test('الترتيبُ لا يُحدث انحرافًا — المقارنةُ مجموعاتٌ لا قوائم', () => {
  const schemas = { G: { type: 'G', roles: { approve: ['b', 'a'] } } };
  const src = "function approveRoles(docType) { return docType == 'G' ? ['a', 'b'] : []; }";
  assert.deepEqual(compareGate(src, schemas, 'approve').drift, []);
});

test('والتكرارُ لا يُحدث انحرافًا', () => {
  const schemas = { G: { type: 'G', roles: { approve: ['a', 'a', 'b'] } } };
  const src = "function approveRoles(docType) { return docType == 'G' ? ['b', 'a'] : []; }";
  assert.deepEqual(compareGate(src, schemas, 'approve').drift, []);
});

test('المقارنةُ تقبل الفارغ بلا انفجار', () => {
  assert.equal(compareGate(RULES, {}, 'approve').drift.length, 0);
  assert.equal(compareGate(RULES, null, 'approve').drift.length, 0);
  assert.deepEqual(driftReport(null), []);
  assert.equal(hasDrift(null), false);
});
