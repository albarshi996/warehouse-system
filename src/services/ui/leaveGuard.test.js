/**
 * لا مغادرةَ في منتصف كتابة: التحذيرُ يُربط ويُفكّ، والشاشاتُ الكاتبةُ على دفعاتٍ تمرّ به.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { LEAVE_MESSAGE, guardLeave, writeProgressLabel } from './leaveGuard.js';
import { useLeaveGuard } from './useLeaveGuard.js';

/** هدفٌ يسجّل المستمعين كما يفعل `window`. */
function fakeWindow() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) || []), fn]),
    removeEventListener: (type, fn) => listeners.set(type, (listeners.get(type) || []).filter((f) => f !== fn)),
    fire(type) {
      const e = { prevented: false, returnValue: undefined, preventDefault() { this.prevented = true; } };
      for (const fn of listeners.get(type) || []) fn(e);
      return e;
    },
  };
}

test('التحذيرُ يمنع المغادرة الصامتة ما دام مربوطًا — ويزول بفكّه', () => {
  const w = fakeWindow();
  const release = guardLeave(w);
  const e = w.fire('beforeunload');
  assert.equal(e.prevented, true);
  assert.equal(e.returnValue, LEAVE_MESSAGE);
  release();
  assert.equal(w.fire('beforeunload').prevented, false, 'بعد الفكّ تُغادَر الصفحة بلا سؤال');
});

test('بلا `window` (تصييرٌ على الخادم) لا يرمي ولا يفعل شيئًا', () => {
  assert.doesNotThrow(() => guardLeave(undefined)());
});

test('نصُّ التقدّم يقول ما كُتب من كم — ويطلب البقاء', () => {
  assert.equal(writeProgressLabel({ written: 500, total: 564 }), 'جارٍ الكتابة… 500 من 564 — لا تغادر الصفحة');
  assert.match(writeProgressLabel(), /0 من 0/);
});

/** نصُّ المصدر بلا تعليقات — فلا يجتاز الحارسَ سطرٌ معلَّق. */
const source = (rel) =>
  fs.readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

test('الخطّافُ يربط الحارسَ بـ`window` ما دامت الكتابةُ جارية، ويفكّه بانتهائها', () => {
  assert.equal(typeof useLeaveGuard, 'function');
  assert.match(source('./useLeaveGuard.js'), /useEffect\(\(\) => \(active \? guardLeave\(window\) : undefined\), \[active\]\);/);
});

test('★★★ الكاتبُ يُبلغ التقدّمَ بعد إقرار كلّ دفعة — لا قبله', () => {
  const src = source('../balances/balancesService.js');
  const body = src.slice(src.indexOf('export async function commitBalancesImport('));
  assert.match(body, /commitBalancesImport\(analysis, \{ onProgress \} = \{\}\)/);
  assert.match(body, /await batch\.commit\(\);\s*onProgress\?\.\(\{ written: Math\.min\(i \+ BATCH_LIMIT, toWrite\.length\), total: toWrite\.length \}\);/);
});

test('★★★ كلُّ شاشةٍ تكتب على دفعاتٍ تحرس المغادرة بحالة الكتابة نفسها', () => {
  const screens = {
    '../../components/brandzo-erp/items/BalancesImport.jsx': 'committing',
    '../../components/brandzo-erp/locations/BinAssignment.jsx': 'writing',
    '../../components/brandzo-erp/locations/PostedImport.jsx': 'writing',
    '../../components/brandzo-erp/locations/OrdersImport.jsx': 'writing',
  };
  for (const [rel, state] of Object.entries(screens)) {
    const src = source(rel);
    assert.match(src, new RegExp(`useLeaveGuard\\(${state}\\);`), `${rel}: لا حارسَ للمغادرة`);
    const setter = `set${state[0].toUpperCase()}${state.slice(1)}`;
    assert.match(src, new RegExp(`${setter}\\(true\\)`), `${rel}: الحالةُ لا تُرفع عند الكتابة`);
    assert.match(src, new RegExp(`finally \\{[^}]*${setter}\\(false\\)`), `${rel}: الحالةُ لا تُنزل في finally`);
  }
  for (const rel of ['../../components/brandzo-erp/items/BalancesImport.jsx', '../../components/brandzo-erp/locations/BinAssignment.jsx']) {
    assert.match(source(rel), /commitBalancesImport\(analysis, \{ onProgress:/, `${rel}: الكتابةُ بلا تقدّمٍ ظاهر`);
  }
});
