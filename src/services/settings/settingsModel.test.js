/**
 * اختبارات سياسات التشغيل (م١-ج).
 *
 * الحارس الجوهريّ هنا ليس «هل تعمل الدالّة؟» بل **«هل بقيت السياسة خارج الكود؟»**:
 * الافتراضات تطابق نصّ الخطة، وكلّ حارسٍ يقرأ من الإعدادات لا من قيمةٍ مخبوزة،
 * وغيابُ المستند أو فسادُه لا يعطّل مستودعًا ولا يفتحه على مصراعيه.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SETTINGS,
  SETTING_CHOICES,
  normalizeSettings,
  settingsIssues,
  internalItemInSaleVerdict,
  manualPriceVerdict,
  creditVerdict,
  backdateVerdict,
  canOverride,
} from './settingsModel.js';
import { ROLES } from '../auth/roles.js';

/* ═══════════ ١. الافتراضات = نصّ الخطة ═══════════ */

test('★ الافتراضات تطابق القسم ١‑أ من الخطة حرفيًّا', () => {
  assert.deepEqual(DEFAULT_SETTINGS, {
    items: { internalInSales: 'block', overrideRole: 'warehouse_manager' },
    pricing: { manualOverride: 'tagged', overrideRole: 'sales_supervisor' },
    credit: { enforce: 'block', warnAtPct: 90, unlockRole: 'finance_manager' },
    dating: { backdateDays: 7, requireReason: true, approveRole: 'warehouse_manager' },
  });
});

test('★ كلّ دورٍ مذكورٍ في الافتراضات موجودٌ فعلًا في كتالوج الأدوار', () => {
  // دورٌ افتراضيٌّ غير موجود = قيدٌ لا يفكّه أحد، ولا يظهر العطب إلّا عند أوّل محاولة فكّ.
  for (const role of ['warehouse_manager', 'sales_supervisor', 'finance_manager']) {
    assert.ok(ROLES[role], `الدور ${role} مفقود من ROLES`);
  }
});

/* ═══════════ ٢. الغياب والفساد ═══════════ */

test('★ غياب المستند لا يعطّل ولا يفتح — تُستعمل الافتراضات', () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({}), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings('نصّ فاسد'), DEFAULT_SETTINGS);
});

test('★ القيمة الفاسدة تسقط إلى افتراضها ولا تُسقط الشاشة', () => {
  const s = normalizeSettings({
    items: { internalInSales: 'خيار مخترع', overrideRole: 'دور محذوف' },
    credit: { enforce: 'block', warnAtPct: 5 }, // خارج المدى ٥٠–١٠٠
    dating: { backdateDays: 999 }, // خارج المدى ٠–٩٠
  });
  assert.equal(s.items.internalInSales, 'block');
  assert.equal(s.items.overrideRole, 'warehouse_manager');
  assert.equal(s.credit.warnAtPct, 90);
  assert.equal(s.dating.backdateDays, 7);
});

test('settingsIssues: يُظهر ما سقط ولماذا بدل أن يختفي بصمت', () => {
  const issues = settingsIssues({ credit: { warnAtPct: 5 }, items: { overrideRole: 'لا أحد' } });
  assert.equal(issues.length, 2);
  const pct = issues.find((i) => i.path === 'credit.warnAtPct');
  assert.equal(pct.given, 5);
  assert.equal(pct.used, 90);
  assert.match(pct.why, /المدى/);
});

test('القيم الصالحة تُحترم كما هي', () => {
  const s = normalizeSettings({
    items: { internalInSales: 'warn', overrideRole: 'admin' },
    pricing: { manualOverride: 'block', overrideRole: 'finance_manager' },
    credit: { enforce: 'warn', warnAtPct: 75, unlockRole: 'admin' },
    dating: { backdateDays: 0, requireReason: false, approveRole: 'admin' },
  });
  assert.equal(s.items.internalInSales, 'warn');
  assert.equal(s.pricing.manualOverride, 'block');
  assert.equal(s.credit.warnAtPct, 75);
  assert.equal(s.dating.backdateDays, 0, 'صفرٌ قيمةٌ مقصودة: لا تأريخ للماضي إطلاقًا');
  assert.equal(s.dating.requireReason, false);
});

test('★ كلّ خيارٍ معروضٍ في الشاشة يُقبل فعلًا في التطبيع', () => {
  // خيارٌ يُعرض ولا يُقبل = مالكٌ يختار فلا يتغيّر شيء، بلا رسالة.
  for (const [path, choices] of Object.entries(SETTING_CHOICES)) {
    const [group, key] = path.split('.');
    for (const { value } of choices) {
      const s = normalizeSettings({ [group]: { [key]: value } });
      assert.equal(s[group][key], value, `${path} = ${value} رُفض رغم عرضه`);
    }
  }
});

/* ═══════════ ٣. القرار ٤ — الصنف الداخليّ ═══════════ */

test('★ الصنف الداخليّ يُمنع في أمر بيع، ويفكّه صاحب الصلاحية وحده', () => {
  const blocked = internalItemInSaleVerdict(null, 'storekeeper');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.needsOverride, true);

  assert.equal(internalItemInSaleVerdict(null, 'warehouse_manager').allowed, true, 'الدور الافتراضيّ يفكّ');
  assert.equal(internalItemInSaleVerdict(null, 'admin').allowed, true, 'والأدمن دائمًا');
});

test('★ تغيير الإعداد يغيّر السلوك بلا لمس كود', () => {
  const permissive = { items: { internalInSales: 'allow' } };
  assert.equal(internalItemInSaleVerdict(permissive, 'storekeeper').allowed, true);

  const warnOnly = { items: { internalInSales: 'warn' } };
  const v = internalItemInSaleVerdict(warnOnly, 'storekeeper');
  assert.equal(v.allowed, true);
  assert.match(v.message, /تنبيه/);
});

test('★ تغيير دور فكّ المنع يُنقل الصلاحية فعلًا', () => {
  const moved = { items: { internalInSales: 'block', overrideRole: 'finance_manager' } };
  assert.equal(internalItemInSaleVerdict(moved, 'warehouse_manager').allowed, false, 'الدور القديم لم يعد يفكّ');
  assert.equal(internalItemInSaleVerdict(moved, 'finance_manager').allowed, true);
});

/* ═══════════ ٤. القرار ٥ — السعر اليدويّ ═══════════ */

test('★ السعر اليدويّ مسموحٌ بوسمٍ وصلاحية', () => {
  const v = manualPriceVerdict(null, 'sales_supervisor');
  assert.equal(v.allowed, true);
  assert.equal(v.mustTag, true, 'الوسم شرطٌ لا خيار — به يُبنى تقرير الانحراف');

  const denied = manualPriceVerdict(null, 'sales_rep');
  assert.equal(denied.allowed, false);
  assert.equal(denied.mustTag, false);
});

test('السعر اليدويّ يُمنع كلّيًّا عند تشديد السياسة', () => {
  const v = manualPriceVerdict({ pricing: { manualOverride: 'block' } }, 'admin');
  assert.equal(v.allowed, false, 'حتّى الأدمن — المنع الكلّيّ قرارٌ لا استثناء له');
});

/* ═══════════ ٥. القرار ٦ — حدّ الائتمان ═══════════ */

test('★ إنذارٌ عند ٩٠٪ ومنعٌ عند التجاوز', () => {
  assert.equal(creditVerdict(null, { balance: 500, limit: 1000 }).verdict, 'ok');

  const warn = creditVerdict(null, { balance: 900, limit: 1000 });
  assert.equal(warn.verdict, 'warn');
  assert.equal(warn.usedPct, 90);

  const block = creditVerdict(null, { balance: 900, limit: 1000, addition: 200 });
  assert.equal(block.verdict, 'block');
  assert.equal(block.usedPct, 110);
  assert.equal(block.unlockRole, 'finance_manager');
});

test('★ البيعة التي تعبر السقف تُمنع — لا الرصيد القائم وحده', () => {
  // العطب الشائع: يُفحص الرصيد قبل الإضافة فيمرّ بيعٌ يتجاوز السقف بعده.
  const v = creditVerdict(null, { balance: 800, limit: 1000, addition: 300 });
  assert.equal(v.verdict, 'block', '٨٠٠+٣٠٠ يتجاوز ١٠٠٠');
});

test('★ سقفٌ غير مُدخَل لا يمنع أحدًا (القسم ٦)', () => {
  assert.equal(creditVerdict(null, { balance: 9999, limit: 0 }).verdict, 'ok');
  assert.equal(creditVerdict(null, { balance: 9999 }).verdict, 'ok');
});

test('عتبة الإنذار تُقرأ من الإعدادات', () => {
  const early = { credit: { enforce: 'block', warnAtPct: 60 } };
  assert.equal(creditVerdict(early, { balance: 700, limit: 1000 }).verdict, 'warn');
  assert.equal(creditVerdict(null, { balance: 700, limit: 1000 }).verdict, 'ok', 'وبالافتراض ٩٠٪ يمرّ');
});

test('تعطيل الائتمان يُلغي المنع والإنذار معًا', () => {
  const off = { credit: { enforce: 'off' } };
  assert.equal(creditVerdict(off, { balance: 5000, limit: 1000 }).verdict, 'ok');

  const warnOnly = { credit: { enforce: 'warn' } };
  assert.equal(creditVerdict(warnOnly, { balance: 5000, limit: 1000 }).verdict, 'warn', 'إنذارٌ بلا منع');
});

/* ═══════════ ٦. القرار ٧ — التأريخ ═══════════ */

test('★ لا واقعة في المستقبل', () => {
  const v = backdateVerdict(null, '2026-08-15', '2026-08-10');
  assert.equal(v.verdict, 'future');
  assert.equal(v.daysBack, -5);
});

test('★ سبعة أيّام تمرّ، وما وراءها يحتاج اعتمادًا وسببًا', () => {
  assert.equal(backdateVerdict(null, '2026-08-10', '2026-08-10').verdict, 'ok', 'اليوم');
  assert.equal(backdateVerdict(null, '2026-08-03', '2026-08-10').verdict, 'ok', 'اليوم السابع بالضبط يمرّ');

  const far = backdateVerdict(null, '2026-08-02', '2026-08-10');
  assert.equal(far.verdict, 'needsApproval', 'الثامن لا');
  assert.equal(far.daysBack, 8);
  assert.equal(far.approveRole, 'warehouse_manager');
  assert.equal(far.requireReason, true);
});

test('★ المدى يُقرأ من الإعدادات — صفرٌ يعني لا تأريخ للماضي إطلاقًا', () => {
  const strict = { dating: { backdateDays: 0 } };
  assert.equal(backdateVerdict(strict, '2026-08-10', '2026-08-10').verdict, 'ok', 'اليوم نفسه يمرّ');
  assert.equal(backdateVerdict(strict, '2026-08-09', '2026-08-10').verdict, 'needsApproval');

  const loose = { dating: { backdateDays: 30 } };
  assert.equal(backdateVerdict(loose, '2026-07-20', '2026-08-10').verdict, 'ok');
});

test('تاريخٌ فاسد لا يرمي — يمرّ وتتولّاه حرّاس المخطّط', () => {
  assert.equal(backdateVerdict(null, '', '2026-08-10').verdict, 'ok');
  assert.equal(backdateVerdict(null, 'ليس تاريخًا', '2026-08-10').verdict, 'ok');
});

test('★ الحكم لا يقرأ ساعة النظام — يُمرَّر اليوم صراحةً', () => {
  // ولولا ذلك لصار الاختبار متقلّبًا بتقلّب يوم تشغيله، ولانحرف الحارس عن ختم الخادم.
  const a = backdateVerdict(null, '2026-01-01', '2026-01-05');
  const b = backdateVerdict(null, '2026-01-01', '2026-01-05');
  assert.deepEqual(a, b);
  assert.equal(a.daysBack, 4);
});

/* ═══════════ ٧. فكّ القيد ═══════════ */

test('canOverride: لكلّ مجالٍ دوره، والأدمن يفكّ كلّ شيء', () => {
  assert.equal(canOverride(null, 'items', 'warehouse_manager'), true);
  assert.equal(canOverride(null, 'pricing', 'warehouse_manager'), false);
  assert.equal(canOverride(null, 'pricing', 'sales_supervisor'), true);
  assert.equal(canOverride(null, 'credit', 'finance_manager'), true);
  assert.equal(canOverride(null, 'dating', 'warehouse_manager'), true);
  for (const area of ['items', 'pricing', 'credit', 'dating']) {
    assert.equal(canOverride(null, area, 'admin'), true);
  }
  assert.equal(canOverride(null, 'items', 'viewer'), false);
});
