#!/usr/bin/env node
/**
 * يولّد جدول الحقول الزمنيّة للمراجعة — `npm run timefields`.
 *
 * المصدر الواحد هو `src/services/documents/timeFields.js`؛ هذا الملفّ يعرضه
 * للمالك ليراجع الـ٦٢ قرارًا بعينه. لا يُحرَّر الناتج بيد — يُعاد توليده.
 * والحارس الحقيقيّ ضدّ الانحراف هو `timeFields.test.js` لا هذا الجدول.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import SCHEMAS from '../src/services/documents/schemas/index.js';
import {
  TIME_CLASSES,
  TIME_FIELD_MAP,
  TYPES_WITHOUT_EVENT_STAMP,
  timeFieldsOf,
  timeFieldStats,
  timeFieldDrift,
} from '../src/services/documents/timeFields.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/plan/الحقول-الزمنية.md');

const drift = timeFieldDrift(SCHEMAS);
if (!drift.ok) {
  console.info('\x1b[31m✘\x1b[0m انحرافٌ بين المخطّطات والسجلّ — شغّل الاختبار أوّلًا.');
  process.exit(1);
}

const { counts, total, types } = timeFieldStats();
const labelOf = (id) => TIME_CLASSES[id].label;

const rows = [];
for (const [type, schema] of Object.entries(SCHEMAS)) {
  for (const f of timeFieldsOf(schema)) {
    const cls = TIME_FIELD_MAP[type][f.key];
    rows.push(
      `| \`${type}\` | \`${f.key}\` | ${f.label.replace(/\|/g, '·')} | ${f.where.endsWith('[]') ? 'بند' : 'رأس'} | **${labelOf(cls)}** |`
    );
  }
}

const legend = Object.values(TIME_CLASSES)
  .map(
    (c) =>
      `| **${c.label}** | ${c.serverStamped ? 'من الخادم' : 'من المستخدم'} | ${c.editable ? 'قابل للتحرير' : '**غير قابل للتحرير**'} | ${c.futureAllowed ? 'يُقبل' : '**يُرفض**'} |`
  )
  .join('\n');

const exceptions = Object.entries(TYPES_WITHOUT_EVENT_STAMP)
  .map(([t, e]) => `- **\`${t}\`** — ${e.reason}\n  - البديل الحاليّ: \`${e.fallback}\`\n  - العلاج: ${e.fix}`)
  .join('\n');

fs.writeFileSync(
  OUT,
  `# الحقول الزمنيّة في المستندات الـ${types} — جدول المراجعة

> **ملفّ مولَّد آليًّا — لا يُحرَّر بيد.** مصدره [\`src/services/documents/timeFields.js\`](../../src/services/documents/timeFields.js).
> يُعاد توليده بـ\`npm run timefields\`. والحارس ضدّ الانحراف هو \`timeFields.test.js\`.

**المهمّة:** \`م٢-أ\` من [خطة إصلاحات المرحلة الأولى](../خطة-إصلاحات-المرحلة-الأولى.md) — تمهيدًا لسدّ **ف‑٨**.

**الحصيلة:** ${total} حقلًا زمنيًّا في ${types} مستندًا —
${counts.event} ختمَ واقعة · ${counts.attribute} سمةَ بيانات · ${counts.planned} تاريخًا مخطّطًا · ${counts.reference} تاريخًا منقولًا.

## سلوك كلّ صنف

| الصنف | المصدر | التحرير | تاريخٌ في المستقبل |
|---|---|---|---|
${legend}

الصنفان الأخيران (**سمة بيانات** و**تاريخ منقول**) **زيادةٌ على الثلاثة في الخطة**، اقتضاها المسح:
صلاحيّة الدفعة في المستقبل بطبيعتها، فلو عُدّت ختمَ واقعةٍ لرفض الحارسُ كلَّ استلامٍ لبضاعةٍ صالحة.

## ⚠️ استثناءات تحتاج قرارك

${exceptions}

## الجدول الكامل

| المستند | الحقل | التسمية | الموضع | الصنف |
|---|---|---|---|---|
${rows.join('\n')}
`,
  'utf8'
);

console.info(`\x1b[32m✔\x1b[0m ${path.relative(ROOT, OUT)} — ${total} حقلًا في ${types} مستندًا`);
