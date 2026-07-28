import React, { useState, useEffect } from 'react';

/**
 * قمرة أودو الحقيقيّ (Real Odoo Cockpit) — المستوى ١ من الربط.
 *
 * تحوّل «تعلّم أودو» من محاكاة إلى تدريب واقعيّ: أزرار روابط عميقة تفتح
 * شاشات أودو 19 الفعليّة (المُقلَع عبر Docker) لكل نوع مستند — بيع، شراء،
 * استلام، تحويل، مرتجع، فاتورة + شاشات الحوكمة المخصّصة (brandzo_warehouse).
 *
 * لا اتصال ولا أسرار في المتصفّح — مجرّد روابط <a> تفتح تبويباً جديداً على
 * خادم أودو (افتراضياً http://localhost:8069، وقابل للتعديل ليشير لخادم عامّ لاحقاً).
 * كل المعرّفات (action xmlids) مؤكَّدة الوجود في القاعدة الحيّة.
 */

const DEFAULT_BASE = 'http://localhost:8069';
const STORAGE_KEY = 'bz_odoo_base_url';
const PURPLE = '#714B67';

const GROUPS = [
  {
    title: 'دورة البيع',
    icon: '🧾',
    color: '#0d9488',
    docs: [
      { ar: 'طلب بيع', en: 'Sales Order', action: 'sale.action_orders' },
      { ar: 'عرض سعر', en: 'Quotation', action: 'sale.action_quotations_with_onboarding' },
    ],
  },
  {
    title: 'دورة الشراء',
    icon: '📥',
    color: '#7c3aed',
    docs: [
      { ar: 'طلب شراء داخليّ (PR)', en: 'Purchase Requisition', action: 'purchase_requisition.action_purchase_requisition' },
      { ar: 'أمر شراء (PO)', en: 'Purchase Order', action: 'purchase.purchase_form_action' },
    ],
  },
  {
    title: 'المخزون',
    icon: '📦',
    color: '#2563eb',
    docs: [
      { ar: 'استلام', en: 'Receipt', action: 'stock.action_picking_tree_incoming' },
      { ar: 'تسليم / نقل', en: 'Delivery', action: 'stock.action_picking_tree_outgoing' },
      { ar: 'تحويل داخليّ', en: 'Internal Transfer', action: 'stock.action_picking_tree_internal' },
    ],
  },
  {
    title: 'الحوكمة — حرّاسنا الذهبيّة',
    icon: '🛡️',
    color: PURPLE,
    docs: [
      { ar: 'تصاريح البوابة', en: 'Gate Pass', action: 'brandzo_warehouse.action_bz_gate_pass' },
      { ar: 'المرتجعات', en: 'Returns', action: 'brandzo_warehouse.action_bz_returns' },
      { ar: 'الجرد الدوريّ', en: 'Cycle Count', action: 'brandzo_warehouse.action_bz_cycle_count' },
      { ar: 'المطابقة الثلاثيّة', en: '3-Way Match', action: 'brandzo_warehouse.action_bz_bill_match' },
      { ar: 'الإغلاق الماليّ', en: 'Period Close', action: 'brandzo_warehouse.action_bz_period_close' },
    ],
  },
  {
    title: 'المالية',
    icon: '💰',
    color: '#d97706',
    docs: [
      { ar: 'فاتورة مورّد', en: 'Vendor Bill', action: 'account.action_move_in_invoice_type' },
      { ar: 'فاتورة عميل', en: 'Customer Invoice', action: 'account.action_move_out_invoice_type' },
    ],
  },
];

function normalize(url) {
  return (url || '').trim().replace(/\/+$/, '');
}

export default function RealOdooCockpit() {
  const [base, setBase] = useState(DEFAULT_BASE);
  const [draft, setDraft] = useState(DEFAULT_BASE);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) { setBase(saved); setDraft(saved); }
    } catch { /* ignore */ }
  }, []);

  const cleanBase = normalize(base) || DEFAULT_BASE;
  const isLocal = /localhost|127\.0\.0\.1/.test(cleanBase);
  const linkFor = (action) => `${cleanBase}/odoo/action-${action}`;

  const save = () => {
    const v = normalize(draft) || DEFAULT_BASE;
    setBase(v);
    try { localStorage.setItem(STORAGE_KEY, v); } catch { /* ignore */ }
    setEditing(false);
  };

  return (
    <div
      dir="rtl"
      className="mb-4 rounded-xl border shadow-lg overflow-hidden"
      style={{ borderColor: PURPLE, background: '#ffffff', fontFamily: "'Cairo','Segoe UI',system-ui,sans-serif" }}
    >
      {/* الرأس */}
      <div className="px-4 py-3 flex flex-wrap items-center gap-3" style={{ background: PURPLE }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-2xl">🚀</span>
          <div className="min-w-0">
            <div className="text-white font-bold text-[15px] leading-tight">قمرة أودو الحقيقيّ</div>
            <div className="text-white/70 text-[11px] leading-tight">تدرّب على المستندات في نظام Odoo 19 الفعليّ — لا محاكاة</div>
          </div>
        </div>

        <div className="flex items-center gap-2 me-auto flex-wrap">
          {/* حالة الخادم */}
          <span
            className="text-[11px] font-semibold rounded-full px-2.5 py-1 text-white inline-flex items-center gap-1.5"
            style={{ background: 'rgba(255,255,255,0.18)' }}
            title="عنوان خادم أودو"
          >
            <span className="w-2 h-2 rounded-full" style={{ background: '#4ade80' }}></span>
            {isLocal ? 'محليّ' : 'خادم'} · {cleanBase.replace(/^https?:\/\//, '')}
          </span>

          {/* زر تعديل العنوان */}
          <button
            type="button"
            onClick={() => { setDraft(cleanBase); setEditing((v) => !v); }}
            className="text-[11px] font-semibold rounded px-2 py-1 text-white border border-white/30 hover:bg-white/10"
            title="تغيير عنوان خادم أودو"
          >
            ⚙︎ العنوان
          </button>

          {/* فتح أودو مباشرة */}
          <a
            href={`${cleanBase}/odoo`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] font-bold rounded px-3 py-1.5 inline-flex items-center gap-1"
            style={{ background: '#fff', color: PURPLE }}
          >
            افتح أودو ↗
          </a>
        </div>
      </div>

      {/* محرّر العنوان */}
      {editing && (
        <div className="px-4 py-2.5 flex flex-wrap items-center gap-2 border-b" style={{ background: '#faf7f9', borderColor: '#eee' }}>
          <span className="text-[12px] text-gray-600 font-semibold">عنوان خادم أودو:</span>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            placeholder="http://localhost:8069"
            dir="ltr"
            className="text-[12px] rounded border px-2 py-1 flex-1 min-w-[220px]"
            style={{ borderColor: '#ccc' }}
          />
          <button type="button" onClick={save} className="text-[12px] font-bold text-white rounded px-3 py-1" style={{ background: PURPLE }}>حفظ</button>
          <button type="button" onClick={() => { setDraft(DEFAULT_BASE); }} className="text-[11px] text-gray-500 rounded px-2 py-1 border" style={{ borderColor: '#ddd' }}>محليّ</button>
        </div>
      )}

      {/* البطاقات */}
      <div className="p-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GROUPS.map((g) => (
          <div key={g.title} className="rounded-lg border" style={{ borderColor: '#ececec' }}>
            <div className="px-3 py-2 flex items-center gap-2 border-b" style={{ borderColor: '#f0f0f0' }}>
              <span className="text-base">{g.icon}</span>
              <span className="text-[12.5px] font-bold" style={{ color: g.color }}>{g.title}</span>
            </div>
            <div className="p-2 grid gap-1.5">
              {g.docs.map((d) => (
                <a
                  key={d.action}
                  href={linkFor(d.action)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between gap-2 rounded-md px-2.5 py-2 border transition-colors hover:shadow-sm"
                  style={{ borderColor: '#eee', background: '#fff' }}
                  title={`افتح «${d.ar}» في أودو الحقيقيّ`}
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-gray-800 truncate">{d.ar}</span>
                    <span className="block text-[10.5px] text-gray-400" dir="ltr">{d.en}</span>
                  </span>
                  <span
                    className="shrink-0 text-[11px] font-bold rounded px-2 py-1 text-white opacity-90 group-hover:opacity-100"
                    style={{ background: g.color }}
                  >
                    فتح ↗
                  </span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* تذييل إرشاديّ */}
      <div className="px-4 py-2.5 text-[11px] leading-relaxed border-t" style={{ background: '#faf7f9', borderColor: '#eee', color: '#6b5563' }}>
        💡 كل زرّ يفتح الشاشة الفعليّة في أودو 19 (تبويب جديد). الدخول أوّل مرّة:
        <b> admin</b> / <b>admin</b>. يعمل على الجهاز الذي يُشغّل أودو (
        <span dir="ltr">{cleanBase}</span>) — لربطه بخادم عامّ لاحقاً، عدّل العنوان من زرّ «⚙︎ العنوان».
      </div>
    </div>
  );
}
