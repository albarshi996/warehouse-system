/**
 * دليلُ حساباتٍ مصغّر — نواةُ الشريحة الأولى (القبض والسداد وحدهما).
 *
 * كلُّ حسابٍ له طبيعةُ رصيدٍ (`normal`) تُفسّر الزيادة: المدينُ يزيد بالمدين،
 * والدائنُ يزيد بالدائن. والذممُ حساباتٌ فرعيّةٌ بالطرف — `AR:<code>` لكلّ عميل،
 * و`AP:<code>` لكلّ مورّد — فلا يُخلط دَينُ طرفٍ بآخر.
 *
 * مصغّرٌ عمدًا: لا تُضاف المبيعاتُ والمخزونُ والمصروفاتُ إلّا حين تفرضها شريحةٌ
 * تالية بواقعتها — لا استباقَ لحساباتٍ لا قيدَ لها بعد. منطق خالص.
 */

export const NORMAL = Object.freeze({ debit: 'debit', credit: 'credit' });

export const ACCOUNTS = Object.freeze({
  CASH: { code: 'CASH', nameAr: 'النقد', type: 'asset', normal: 'debit' },
  BANK: { code: 'BANK', nameAr: 'البنك', type: 'asset', normal: 'debit' },
  AR: { code: 'AR', nameAr: 'ذمم العملاء', type: 'asset', normal: 'debit', subledger: 'customer' },
  AP: { code: 'AP', nameAr: 'ذمم الموردين', type: 'liability', normal: 'credit', subledger: 'supplier' },
  // الطرفُ المقابل لحركات الدورة الكاملة. لا تُطابَق هذه بعد (لا مصدرَ خارجيّ
  // لها في هذه الشريحة) — لكنّها تجعل القيدَ مزدوجًا حقيقيًّا لا طرفًا معلّقًا.
  SALES: { code: 'SALES', nameAr: 'المبيعات', type: 'income', normal: 'credit' },
  SALES_RETURNS: { code: 'SALES_RETURNS', nameAr: 'مرتجعات المبيعات', type: 'contra_income', normal: 'debit' },
  INVENTORY: { code: 'INVENTORY', nameAr: 'المخزون', type: 'asset', normal: 'debit' },
  CASH_IN_TRANSIT: { code: 'CASH_IN_TRANSIT', nameAr: 'نقدٌ في عهدة المندوب', type: 'asset', normal: 'debit' },
});

const up = (v) => String(v ?? '').trim().toUpperCase();

/** معرّفُ حساب الذمّة الفرعيّ لطرفٍ بعينه (`AR` + `C-1` ← `AR:C-1`). */
export function subAccount(base, partyCode) {
  return `${String(base ?? '').trim()}:${up(partyCode)}`;
}

/** الحسابُ الأساس من معرّفٍ فرعيّ (`AR:C-1` ← `AR`). */
export function baseOf(account) {
  return String(account ?? '').split(':')[0];
}

/** تعريفُ الحساب من معرّفه (فرعيًّا كان أو أساسًا)، أو null إن كان مجهولًا. */
export function accountDef(account) {
  return ACCOUNTS[baseOf(account)] || null;
}
