/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  حارسُ محلِّل القواعد — المسارُ الهرميّ، و«الملحقة-فقط» المشتقّةُ لا المكتوبة
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★ يُثبّت عطبَ 2026-09-02: قراءةُ الأسماء **مسطّحةً** سألت عن `scans` في
 *    الجذر وهي تحت `operations/{id}`، فعادت `permission-denied` ستَّ عشرة
 *    مرّةً وبدت مشكلةَ صلاحيّاتٍ وهي مشكلةُ مسار — وأسقطت `documents` صامتًا.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pathsFromRules, appendOnlyFromRules } from './rules-paths.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const RULES = readFileSync(join(HERE, '..', '..', 'firestore.rules'), 'utf8');

test('★★ المجموعةُ الفرعيّةُ تُقرأ بمسارها الكامل لا باسمها المسطّح', () => {
  const paths = pathsFromRules(RULES);

  assert.ok(paths.includes('operations/scans'), 'scans تحت operations لا في الجذر');
  assert.ok(!paths.includes('scans'), 'لا يجوز أن يظهر الاسمُ مسطّحًا');
  assert.ok(paths.includes('documents'), 'documents قلبُ النظام — سقوطُه صامتٌ كان العطب');
  assert.ok(paths.includes('documents/audit'));
});

test('الآباءُ قبل الأبناء — الفرعيّةُ تحتاج معرّفاتِ آبائها', () => {
  const paths = pathsFromRules(RULES);
  for (const p of paths) {
    if (!p.includes('/')) continue;
    const parent = p.split('/').slice(0, -1).join('/');
    assert.ok(
      paths.indexOf(parent) >= 0 && paths.indexOf(parent) < paths.indexOf(p),
      `«${parent}» يجب أن يسبق «${p}»`
    );
  }
});

test('العددُ مُثبَّت — نقصانُه يعني مسارًا يسقط من المزامنة بلا إعلان', () => {
  assert.equal(pathsFromRules(RULES).length, 98);
});

test('★★★ «الملحقة-فقط» تُشتقّ من منعِ التعديل والحذف معًا', () => {
  const appendOnly = appendOnlyFromRules(RULES);

  for (const p of ['documents/audit', 'operations/scans', 'documents/attachments']) {
    assert.ok(appendOnly.has(p), `«${p}» يمنع التعديلَ والحذفَ ⇒ ملحقةٌ-فقط`);
  }

  // ونقضًا: `documents` نفسُها تُعدَّل، فليست ملحقةً-فقط.
  assert.ok(!appendOnly.has('documents'));
  assert.ok(!appendOnly.has('Items_Master'));
});

test('منعُ الحذفِ وحدَه لا يجعلها ملحقةً-فقط', () => {
  const rules = `
    service cloud.firestore {
      match /databases/{db}/documents {
        match /halfGuarded/{id} {
          allow delete: if false;
        }
        match /fullGuarded/{id} {
          allow update, delete: if false;
        }
      }
    }
  `;
  const appendOnly = appendOnlyFromRules(rules);
  assert.ok(!appendOnly.has('halfGuarded'), 'التعديلُ ما زال مسموحًا ⇒ الختمُ لا يُوثق به');
  assert.ok(appendOnly.has('fullGuarded'));
});
