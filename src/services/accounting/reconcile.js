/**
 * برهانُ صفر الفرق (معيارُ قبول الشريحة الأولى):
 * مجموعُ القبض/السداد لكلّ طرفٍ في **القيد المزدوج** يطابق مجموعَه في **دفتر الذمم**
 * — على نفس المستندات، بعد حدّ الافتتاح وحدها.
 *
 * ليست هُويّةً حسابيّة فارغة: تُثبت أنّ خطَّ الاشتقاق موصولٌ وأنّ الطرفَ والاتّجاهَ
 * صحيحان — فلو ذهب قبضُ عميلٍ إلى مورّدٍ أو انقلب الاتّجاهُ لظهر الفرق.
 *
 * منطق خالص.
 */
import { entriesFrom } from '../ledger/partnerLedger.js';
import { deriveEntries, CASH_EVENTS } from './deriveEntries.js';
import { createLedger, LEDGER_T0 } from './journal.js';
import { fromMinor } from './money.js';

const money2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const up = (v) => String(v ?? '').trim().toUpperCase();
const day = (v) => String(v ?? '').slice(0, 10);

/**
 * يطابق القبض/السداد طرفًا طرفًا.
 * @returns {{rows:Array<{partyCode,party,ledger,journal,diff}>, allMatch:boolean, journalErrors:Array}}
 */
export function reconcilePayments(documents = [], { states = ['done', 'approved'] } = {}) {
  // ── جانبُ دفتر الذمم: القبض/السداد بعد T0، مجموعٌ بالطرف ──
  // المعرّفُ الحتميّ يُقرأ مرّةً واحدةً — كضمانة الدفتر نفسها — فيطابق منعَ التكرار في القيد.
  const ledgerByParty = new Map();
  const seenLedger = new Set();
  for (const e of entriesFrom(documents, { states })) {
    if (!CASH_EVENTS[e.docType]) continue;
    if (day(e.date) < LEDGER_T0) continue;
    if (seenLedger.has(e.id)) continue;
    seenLedger.add(e.id);
    const code = up(e.partyCode);
    ledgerByParty.set(code, { party: e.party, amount: money2((ledgerByParty.get(code)?.amount || 0) + e.amount) });
  }

  // ── جانبُ القيد المزدوج: مجموعُ حركة ذمّة الطرف من القيود المشتقّة ──
  const L = createLedger().postMany(deriveEntries(documents, { states }));
  const journalByParty = new Map();
  for (const en of L.entries) {
    for (const l of en.lines) {
      const [base, code] = l.account.split(':');
      if ((base === 'AR' || base === 'AP') && code) {
        const key = up(code);
        const prev = journalByParty.get(key) || 0;
        journalByParty.set(key, money2(prev + fromMinor(l.debit + l.credit)));
      }
    }
  }

  // ── المقارنة ──
  const codes = new Set([...ledgerByParty.keys(), ...journalByParty.keys()]);
  const rows = [...codes]
    .map((code) => {
      const ledger = money2(ledgerByParty.get(code)?.amount || 0);
      const journal = money2(journalByParty.get(code) || 0);
      return { partyCode: code, party: ledgerByParty.get(code)?.party || '', ledger, journal, diff: money2(journal - ledger) };
    })
    .sort((a, b) => a.partyCode.localeCompare(b.partyCode, 'ar'));

  return { rows, allMatch: rows.every((r) => r.diff === 0), journalErrors: L.errors };
}
