import React, { useState } from 'react';

const faqData = [
  {
    q: "متى أستخدم GRN وليس Delivery Note؟",
    a: "GRN (إشعار استلام البضاعة) يُستخدم عند استلام بضاعة من المورّد الخارجي وتسجيلها في المخزون. أما Delivery Note فيُستخدم عند إرسال بضاعة إلى العميل أو جهة داخلية. الفرق الجوهري: GRN = دخول، Delivery Note = خروج."
  },
  {
    q: "ما الفرق بين Stock Adjustment وCredit Note؟",
    a: "Stock Adjustment يُعدّل الكميات الفعلية في المخزون بسبب جرد أو تلف أو خطأ إدخال — لا يؤثر مالياً على المورّد. Credit Note هو مستند مالي يُصدر للمورّد عند إرجاع بضاعة أو خصم من مستحقاته."
  },
  {
    q: "ما الفرق بين Putaway List وBin Card؟",
    a: "Putaway List هي قائمة عمل مؤقتة تُنشأ لحظة الاستلام وتحدد أين تُوضع كل صنف. Bin Card هو سجل دائم لكل موقع تخزين يتتبع الحركات الداخلة والخارجة منه تاريخياً."
  },
  {
    q: "متى أحتاج Gate Pass؟",
    a: "Gate Pass مطلوب لأي خروج مادي من المستودع سواء كان بضاعة للعميل، أصول للصيانة، أو نماذج للإرجاع. هو الإذن الرسمي لبوابة الأمن ويوثق مسؤولية النقل."
  },
  {
    q: "كيف أتعامل مع الدفعة المُرتجعة جزئياً؟",
    a: "أنشئ Return Note للكميات المُرتجعة فقط، ثم QC Report لفرز السليم من التالف، ثم Stock Adjustment للتالف، ثم Credit Note للمورّد بقيمة المُرتجع. لا تُعدّل الـ GRN الأصلي."
  },
  {
    q: "ما ترتيب المستندات في دورة الشراء الكاملة؟",
    a: "Purchase Requisition ← اعتماد المدير ← Purchase Order ← GRN عند الاستلام ← QC Report ← Putaway List ← Bin Card. في حالة مرتجع: Return Note ← Credit Note."
  },
  {
    q: "كيف يتم ربط فاتورة المورد بأمر الشراء في أودو؟",
    a: "يتم ذلك عبر خاصية Auto-complete في نموذج فاتورة المورد (Vendor Bill)، حيث تختار أمر الشراء (PO) المقابل، فيقوم النظام بجلب البيانات ومطابقتها آلياً."
  },
  {
    q: "ما هي مراحل اعتماد طلب الإجازة؟",
    a: "تبدأ بتقديم الطلب من الموظف، ثم موافقة المدير المباشر، وأخيراً اعتماد مسؤول الموارد البشرية (HR) لتحديث الرصيد آلياً."
  }
];

const FAQ = () => {
  const [activeIndex, setActiveIndex] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const toggleAccordion = (index) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const filteredFaq = faqData.filter(
    item =>
      item.q.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.a.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <section className="mt-12 p-6 sm:p-10 rounded-2xl bg-gradient-to-br from-[#1a1a3e] to-brand-navy border border-white/10 shadow-2xl">
      <h2 className="text-xl font-bold text-white text-center mb-6">
        الأسئلة الشائعة (FAQ)
        <span className="block text-sm font-normal text-gray-400 mt-1">Frequently Asked Questions</span>
      </h2>
      <div className="w-16 h-1 bg-brand-red mx-auto mb-8 rounded-full"></div>

      {/* Search Input */}
      <div className="mb-8 relative max-w-md mx-auto">
        <input
          type="text"
          placeholder="ابحث عن سؤال أو معلومة..."
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-right outline-none focus:border-brand-yellow transition-all"
          dir="rtl"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* FAQ Accordion */}
      <div className="space-y-4" dir="rtl">
        {filteredFaq.length > 0 ? (
          filteredFaq.map((item, index) => (
            <div key={index} className="border border-white/5 rounded-xl overflow-hidden">
              <button
                onClick={() => toggleAccordion(index)}
                className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 transition-all text-right"
              >
                <span className="text-lg font-bold text-brand-yellow">{item.q}</span>
                <span className="text-brand-yellow text-xl ml-4">
                  {activeIndex === index ? '−' : '+'}
                </span>
              </button>

              <div
                className={`transition-all duration-300 ease-in-out overflow-hidden ${
                  activeIndex === index ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="p-4 bg-white/5 text-gray-300 leading-relaxed border-t border-white/5">
                  {item.a}
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-center text-gray-500 py-10">لم يتم العثور على نتائج للبحث...</p>
        )}
      </div>
    </section>
  );
};

export default FAQ;
