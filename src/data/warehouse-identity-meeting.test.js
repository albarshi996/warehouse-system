/**
 * حارس عرض «الهوية التشغيلية للمستودعات» — جلسة السلاسل × التسويق.
 *
 * دعوى هذا العرض أمام التسويق دعوًى واحدة: «الترميز الذي تطلبه اللوحة **قائمٌ
 * في النظام**». فإن تغيّرت مقاطع كود الموقع أو حالاته أو أنواع تخزينه ولم
 * يتغيّر العرض، صرنا نَعِد التسويق بنظامٍ لا يطابق ما سيُطبع — وتُكتشف
 * المخالفة على الجدار بعد آلاف الملصقات لا قبلها.
 *
 * لذلك تُقرأ هذه القوائم من محرّك المواقع نفسه، لا تُكتب هنا نصًّا.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  acceptance,
  asks,
  closingOutcome,
  codeExample,
  codeLevels,
  decisionPoints,
  deliverables,
  designFamilies,
  gates,
  objectives,
  ownership,
  phases,
  portalShortcuts,
  scopeFacts,
  slideIndex,
  source,
  urgentPriorities,
  zones,
} from './warehouse-identity-meeting.js';
import * as MODULE from './warehouse-identity-meeting.js';
import { internalPaths } from '../services/auth/navCatalog.js';
import { ALWAYS_ALLOWED } from '../services/auth/pageAccess.js';
import { CODE_SEGMENTS, isValidLocationCode, parseLocationCode } from '../services/locations/locationCode.js';
import { LOCATION_STATUSES, STORAGE_TYPES } from '../services/locations/locationsModel.js';
import { MAP_LEGEND } from '../services/locations/mapGrid.js';

const knownPaths = new Set([...internalPaths(), ...ALWAYS_ALLOWED]);

test('كل اختصار يشير إلى صفحةٍ تعرفها البوابة', () => {
  for (const [key, item] of Object.entries(portalShortcuts)) {
    assert.ok(knownPaths.has(item.path), `الاختصار «${key}» يشير إلى مسارٍ مجهول: ${item.path}`);
  }
});

test('كل اختصار مكتمل: غرضٌ ونقراتٌ ودليل', () => {
  for (const [key, item] of Object.entries(portalShortcuts)) {
    assert.ok(item.label?.trim() && item.purpose?.trim(), `الاختصار «${key}» ناقص التعريف`);
    assert.ok(item.clicks?.length >= 3, `الاختصار «${key}» لا يشرح المسار داخل الشاشة`);
    assert.ok(item.evidence?.trim(), `الاختصار «${key}» بلا دليلٍ ناتج`);
  }
});

/**
 * الحارس الجوهريّ: مستويات الترميز المعروضة هي مقاطع كود الموقع نفسها،
 * ترتيبًا ومعرّفًا. فالتقرير يطلب ستّة مستويات، ودعوانا أنّها مبنيّة.
 */
test('مستويات الترميز الستّة هي مقاطع كود الموقع نفسها', () => {
  assert.deepEqual(codeLevels.map(([id]) => id), CODE_SEGMENTS);
  assert.equal(codeLevels.length, 6);
  for (const [id, labelAr, sample, why] of codeLevels) {
    assert.ok(labelAr?.trim() && sample?.trim() && why?.trim(), `المستوى «${id}» ناقص الوصف`);
  }
});

test('المثال المعروض كودٌ صالحٌ فعلًا في المحرّك ومقاطعه ستّة', () => {
  assert.ok(isValidLocationCode(codeExample.full), `الكود المعروض غير صالح: ${codeExample.full}`);
  const parts = parseLocationCode(codeExample.full);
  for (const segment of CODE_SEGMENTS) {
    assert.ok(String(parts?.[segment] ?? '').trim(), `المثال بلا مقطع «${segment}»`);
  }
  // المقاطع المعروضة في الجدول هي مقاطع المثال نفسها بالترتيب.
  assert.deepEqual(codeLevels.map(([id]) => parts[id]), codeExample.full.split('-'));
  assert.ok(codeExample.short?.trim() && codeExample.note?.trim() && codeExample.rule?.trim());
});

test('حالات الموقع وأنواع التخزين ومفتاح الخريطة تُقرأ من المحرّك لا تُكتب', () => {
  // العرض يعرضها كما هي — فلو أُضيفت حالةٌ أو أُعيدت تسميتها ظهر ذلك هنا.
  assert.equal(Object.keys(LOCATION_STATUSES).length, 6);
  assert.equal(Object.keys(STORAGE_TYPES).length, 7);
  assert.equal(MAP_LEGEND.length, 7);
  for (const status of Object.values(LOCATION_STATUSES)) {
    assert.ok(status.labelAr?.trim() && status.hint?.trim(), `الحالة «${status.id}» ناقصة الوصف`);
  }
  for (const type of Object.values(STORAGE_TYPES)) assert.ok(type.labelAr?.trim());
  for (const cell of MAP_LEGEND) assert.ok(cell.labelAr?.trim());
});

test('أرقام التقرير المصدر مثبَّتةٌ ومتّسقة مع بطاقات النطاق', () => {
  assert.equal(source.sections, 26);
  assert.equal(source.models, 233);
  assert.equal(source.families, 12);
  assert.equal(source.sites, 4);
  assert.equal(source.urgentSites, 2);
  assert.ok(source.title?.trim() && source.issuer?.trim() && source.status?.trim());
  // بطاقات النطاق الأربع تعرض العددين ٤ و٢٣٣ — فلا يفترق الغلاف عن الشريحة.
  const numbers = scopeFacts.map(([value]) => Number(value));
  assert.ok(numbers.includes(source.sites), 'بطاقات النطاق لا تحمل عدد المواقع');
  assert.ok(numbers.includes(source.models), 'بطاقات النطاق لا تحمل عدد النماذج');
  assert.equal(scopeFacts.length, 4);
});

test('عائلات التصميم اثنتا عشرة، وكلٌّ موصولةٌ باختصارٍ قائم', () => {
  assert.equal(designFamilies.length, source.families);
  for (const [title, detail, key] of designFamilies) {
    assert.ok(title?.trim() && detail?.trim(), `العائلة «${title}» ناقصة الوصف`);
    assert.ok(portalShortcuts[key], `العائلة «${title}» تشير إلى اختصارٍ غير معرّف: ${key}`);
  }
});

test('قوائم التقرير كاملةٌ بأعدادها: المناطق والأهداف والأولويات والمخرجات والمطالب', () => {
  assert.equal(zones.length, 22);
  assert.equal(objectives.length, 11);
  assert.equal(urgentPriorities.length, 6);
  assert.equal(deliverables.length, 8);
  assert.equal(asks.length, 8);
  assert.equal(acceptance.length, 15);
  for (const list of [zones, objectives, deliverables, asks, acceptance]) {
    for (const line of list) assert.ok(String(line).trim(), 'بندٌ فارغ في إحدى قوائم التقرير');
  }
});

test('البوابة ستّ خطواتٍ والمراحل أربع — بلا نقصٍ في الشرح', () => {
  assert.equal(gates.length, 6);
  for (const [n, title, detail] of gates) assert.ok(n && title?.trim() && detail?.trim());

  assert.equal(phases.length, 4);
  for (const phase of phases) {
    assert.ok(phase.title?.trim() && phase.lead?.trim(), `المرحلة ${phase.n} ناقصة`);
    assert.ok(phase.items.length >= 4, `المرحلة ${phase.n} أقصر من أن تُعرض`);
  }
});

test('الحدّ بين الجهات الستّ مكتوبٌ بالكامل', () => {
  assert.equal(ownership.length, 6);
  for (const row of ownership) {
    assert.equal(row.length, 3);
    for (const cell of row) assert.ok(String(cell).trim(), `خانةٌ فارغة في «${row[0]}»`);
  }
});

test('نقاط القرار الثماني ومخرج الجلسة مكتملة', () => {
  assert.equal(decisionPoints.length, 8);
  for (const point of decisionPoints) {
    assert.ok(point.title?.trim() && point.ask?.trim() && point.owner?.trim());
  }
  assert.equal(closingOutcome.length, 4);
});

test('فهرس الشرائح: بلا تكرار (التسمية مفتاح React) وبعدد الشرائح المرسومة', () => {
  assert.equal(new Set(slideIndex).size, slideIndex.length);
  assert.equal(slideIndex.length, 20);
});

/**
 * حارسٌ صغيرٌ ثمنه غالٍ: النصوص هنا تُعرَض كما هي في JSX، فعلامات التوكيد
 * بنجمتين تظهر نجمتين على الشاشة أمام الحضور لا خطًّا عريضًا.
 */
test('لا نصَّ معروضًا يحمل علامات ترميزٍ نصّيّ (**)', () => {
  const seen = new Set();
  const walk = (value, path) => {
    if (typeof value === 'string') {
      assert.ok(!value.includes('**'), `نصٌّ يحمل نجمتين ويُعرض كما هو: ${path} — «${value.slice(0, 60)}»`);
      return;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
  };
  walk(MODULE, 'module');
});
