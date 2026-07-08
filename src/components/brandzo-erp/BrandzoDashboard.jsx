import React, { useState } from 'react';

/**
 * Single KPI card for dashboard metrics
 */
function KpiCard({
  icon,
  badgeClass,
  valueClass,
  labelEn,
  labelAr,
  value,
  loading,
  active,
  onClick,
  neonColor,
}) {
  const isInteractive = typeof onClick === 'function';
  const Comp = isInteractive ? 'button' : 'div';

  const neonStyles = {
    red: 'hover:shadow-[0_0_20px_rgba(196, 30, 58,0.3)] border-brand-red/20',
    gold: 'hover:shadow-[0_0_20px_rgba(218, 170, 60,0.3)] border-brand-gold/20',
    blue: 'hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] border-blue-200',
    green: 'hover:shadow-[0_0_20px_rgba(34,197,94,0.3)] border-green-200',
    indigo: 'hover:shadow-[0_0_20px_rgba(79,70,229,0.3)] border-indigo-200',
  };

  return (
    <Comp
      type={isInteractive ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={isInteractive ? Boolean(active) : undefined}
      className={[
        'rounded-xl border p-6 text-right transition-all backdrop-blur-md bg-white/5',
        neonStyles[neonColor] || 'border-gray-200 shadow-sm',
        isInteractive
          ? 'cursor-pointer hover:-translate-y-1 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-red'
          : '',
        active ? 'border-brand-red ring-2 ring-brand-red shadow-lg scale-[1.02]' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2 rounded-lg ${badgeClass}`}>
          <span className="text-2xl">{icon}</span>
        </div>
        <span className="text-xs font-bold text-gray-200">{labelEn}</span>
      </div>
  
      <div className="text-sm font-medium text-gray-200">{labelAr}</div>
      <div className={`mt-1 text-3xl font-bold ${valueClass}`}>
        {loading ? (
          <span className="inline-block h-7 w-12 bg-gray-200 rounded animate-pulse" />
        ) : (
          value
        )}
      </div>
    </Comp>
  );
}

const BrandzoDashboard = () => {
  const [error, setError] = useState('');

  return (
    <div className="text-right" dir="rtl">
      {error && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-lg font-bold text-sm bg-red-100 text-red-700 border border-red-200"
        >
          {error}
        </div>
      )}

      {/* Odoo Implementation Roadmap Section */}
      <section className="mt-10 mb-8">
        <div className="rounded-2xl bg-gradient-to-br from-green-900/20 via-blue-900/20 to-green-900/20 shadow-2xl border border-green-500/30 p-6 sm:p-10 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-64 h-64 bg-green-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-2">
              خارطة طريق أودو
              <span className="block text-sm font-normal text-gray-200 mt-1">Odoo 17 Enterprise Implementation Roadmap</span>
            </h2>
            <div className="w-16 h-1 bg-green-400 mx-auto mb-8 rounded-full" />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[
                { 
                  phase: 'المرحلة 1', 
                  title: 'التقييم والتخطيط', 
                  duration: '2-3 أسابيع',
                  color: 'text-blue-400',
                  bgColor: 'bg-blue-500/10',
                  borderColor: 'border-blue-500/30',
                  items: ['تحليل المتطلبات', 'تخطيط الموارد', 'اختيار الشريك', 'تحديد التكلفة']
                },
                { 
                  phase: 'المرحلة 2', 
                  title: 'الإعداد الأساسي', 
                  duration: '3-4 أسابيع',
                  color: 'text-green-400',
                  bgColor: 'bg-green-500/10',
                  borderColor: 'border-green-500/30',
                  items: ['تثبيت النظام', 'إعدادات الأمان', 'هيكل الشركة', 'الوحدات الأساسية']
                },
                { 
                  phase: 'المرحلة 3', 
                  title: 'نقل البيانات', 
                  duration: '4-6 أسابيع',
                  color: 'text-yellow-400',
                  bgColor: 'bg-yellow-500/10',
                  borderColor: 'border-yellow-500/30',
                  items: ['تنظيف البيانات', 'تخطيط النقل', 'النقل الفعلي', 'التحقق من الصحة']
                },
                { 
                  phase: 'المرحلة 4', 
                  title: 'التدريب والإطلاق', 
                  duration: '2-3 أسابيع',
                  color: 'text-purple-400',
                  bgColor: 'bg-purple-500/10',
                  borderColor: 'border-purple-500/30',
                  items: ['تدريب المستخدمين', 'اختبار شامل', 'الإطلاق التدريجي', 'الدعم الفني']
                }
              ].map((phase, i) => (
                <div key={i} className={`${phase.bgColor} backdrop-blur border ${phase.borderColor} rounded-xl p-5 hover:bg-white/10 transition-all`}>
                  <div className={`font-bold ${phase.color} mb-2`}>{phase.phase}</div>
                  <h3 className="font-bold text-white mb-2">{phase.title}</h3>
                  <div className="text-xs text-gray-200 mb-3">{phase.duration}</div>
                  <ul className="space-y-1">
                    {phase.items.map((item, j) => (
                      <li key={j} className="text-xs text-gray-100 flex items-start gap-1">
                        <span className="text-green-400 mt-1">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="bg-white/5 backdrop-blur border border-green-500/30 rounded-xl p-5">
              <h3 className="font-bold text-green-400 mb-3 flex items-center gap-2">
                <span>📋</span> التكلفة تُحدد بعد التنسيق مع إدارة تقنية المعلومات
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-400">التراخيص</div>
                  <div className="text-gray-200 text-sm">التكلفة تُحدد بعد التنسيق مع IT</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-green-400">التنفيذ</div>
                  <div className="text-gray-200 text-sm">التكلفة تُحدد بعد التنسيق مع IT</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-yellow-400">التدريب والدعم</div>
                  <div className="text-gray-200 text-sm">التكلفة تُحدد بعد التنسيق مع IT</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What We Offer Section */}
      <section className="mt-10 mb-8">
        <div className="rounded-2xl bg-gradient-to-br from-brand-navy via-[#1a1a3e] to-[#0d0d2b] shadow-2xl border border-brand-red/20 p-6 sm:p-10 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-64 h-64 bg-brand-red/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-brand-yellow/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-2">
              ضبط الجودة والتكامل مع أودو
              <span className="block text-sm font-normal text-gray-200 mt-1">Brandzo Hub — Quality Gate & Odoo Integration</span>
            </h2>
            <div className="w-16 h-1 bg-brand-red mx-auto mb-8 rounded-full" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-5 hover:border-brand-red/40 transition-all">
                <div className="text-2xl mb-3">📋</div>
                <h3 className="font-bold text-brand-red mb-2">نماذج ذكية إجبارية</h3>
                <p className="text-sm text-gray-100">كل العمليات (إضافة مخزون، صرف، تحويل، ارتجاع، جرد) تمر أولاً عبر نماذجنا الذكية الإجبارية.</p>
                <div className="mt-3 text-xs text-green-400">✓ متوافق مع وحدات أودو</div>
              </div>
              <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-5 hover:border-brand-yellow/40 transition-all">
                <div className="text-2xl mb-3">⚡</div>
                <h3 className="font-bold text-brand-yellow mb-2">تحقق منطقي آلي</h3>
                <p className="text-sm text-gray-100">النظام يتحقق من المنطق التشغيلي (الصلاحيات، الحدود، الكميات، تواريخ الانتهاء 75%، التوصيات التلقائية).</p>
                <div className="mt-3 text-xs text-green-400">✓ جاهز للربط مع أودو</div>
              </div>
              <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-5 hover:border-green-400/40 transition-all">
                <div className="text-2xl mb-3">✅</div>
                <h3 className="font-bold text-green-400 mb-2">وثيقة نظيفة موثقة</h3>
                <p className="text-sm text-gray-100">في حال المطابقة → يُصدر النظام وثيقة نظيفة وموثقة جاهزة وخالية من أي خطأ لتكون المرجع الوحيد للإدخال في الـ ERP.</p>
                <div className="mt-3 text-xs text-green-400">✓ تكامل سلس مع أودو</div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur border border-brand-yellow/20 rounded-xl p-5">
              <h3 className="font-bold text-brand-yellow mb-3 flex items-center gap-2">
                <span>🔗</span> التكامل مع أودو: بوابة ذكية للبيانات النظيفة
              </h3>
              <p className="text-sm text-gray-100 leading-relaxed">
                Brandzo Hub يعمل كطبقة وسيطة ذكية بين العمليات اليومية وأودو، يضمن أن البيانات الدقيقة فقط هي التي تصل إلى النظام المحاسبي.
                النظام يحول النماذج الورقية إلى بيانات رقمية منظمة، يتحقق من صحتها، ثم يجهزها للإدخال المباشر في وحدات أودو المقابلة (المخزون، المشتريات، المبيعات، إلخ).
              </p>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="font-bold text-blue-400 mb-1">الوحدات المتكاملة</div>
                  <div className="text-xs text-gray-100">المخزون، المشتريات، المبيعات، الموارد البشرية، الصيانة</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="font-bold text-green-400 mb-1">معدل الدقة</div>
                  <div className="text-xs text-gray-100">98.5%+ مطابقة للبيانات قبل الإدخال في أودو</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Odoo Module Comparison Section */}
      <section className="mt-10 mb-8">
        <div className="rounded-2xl bg-gradient-to-br from-purple-900/20 via-indigo-900/20 to-purple-900/20 shadow-2xl border border-purple-500/30 p-6 sm:p-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-2">
              مقارنة وحدات أودو
              <span className="block text-sm font-normal text-gray-200 mt-1">Odoo Modules Comparison & Recommendations</span>
            </h2>
            <div className="w-16 h-1 bg-purple-400 mx-auto mb-8 rounded-full" />

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead>
                  <tr className="border-b border-purple-500/30">
                    <th className="px-4 py-3 text-purple-400 font-bold">الوحدة</th>
                    <th className="px-4 py-3 text-purple-400 font-bold">الوظيفة</th>
                    <th className="px-4 py-3 text-purple-400 font-bold">الأهمية</th>
                    <th className="px-4 py-3 text-purple-400 font-bold">التكلفة/السنة</th>
                    <th className="px-4 py-3 text-purple-400 font-bold">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { module: 'المخزون', function: 'إدارة المخزون، التخزين، الجرد', importance: 'أساسي', cost: 'يُحدد بعد التنسيق', status: 'مطلوب' },
                    { module: 'المشتريات', function: 'طلبات الشراء، الموردين، العقود', importance: 'أساسي', cost: 'يُحدد بعد التنسيق', status: 'مطلوب' },
                    { module: 'المبيعات', function: 'العملاء، عروض الأسعار، الفواتير', importance: 'أساسي', cost: 'يُحدد بعد التنسيق', status: 'مطلوب' },
                    { module: 'المحاسبة', function: 'الحسابات، التقارير المالية', importance: 'أساسي', cost: 'يُحدد بعد التنسيق', status: 'مطلوب' },
                    { module: 'الموارد البشرية', function: 'الموظفين، الرواتب، الإجازات', importance: 'مهم', cost: 'يُحدد بعد التنسيق', status: 'موصى به' },
                    { module: 'الصيانة', function: 'صيانة المعدات، الجدولة', importance: 'مهم', cost: 'يُحدد بعد التنسيق', status: 'موصى به' },
                    { module: 'المشاريع', function: 'إدارة المشاريع، المهام', importance: 'اختياري', cost: 'يُحدد بعد التنسيق', status: 'لاحق' },
                    { module: 'الموقع الإلكتروني', function: 'متجر إلكتروني، صفحات الشركة', importance: 'اختياري', cost: 'يُحدد بعد التنسيق', status: 'لاحق' }
                  ].map((item, i) => (
                    <tr key={i} className="border-b border-purple-500/20 hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 font-bold text-white">{item.module}</td>
                      <td className="px-4 py-3 text-gray-100">{item.function}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                          item.importance === 'أساسي' ? 'bg-red-500/20 text-red-400' :
                          item.importance === 'مهم' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-gray-500/20 text-gray-200'
                        }`}>
                          {item.importance}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-100">{item.cost}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                          item.status === 'مطلوب' ? 'bg-green-500/20 text-green-400' :
                          item.status === 'موصى به' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-gray-500/20 text-gray-200'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white/5 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-red-400 mb-1">8</div>
                <div className="text-xs text-gray-200">وحدات أساسية</div>
              </div>
              <div className="bg-white/5 rounded-lg p-4 text-center">
                <div className="text-sm font-bold text-yellow-400 mb-1 leading-tight">يُحدد بعد<br/>التنسيق مع IT</div>
                <div className="text-xs text-gray-200">متوسط التكلفة/المستخدم/السنة</div>
              </div>
              <div className="bg-white/5 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-400 mb-1">12-16</div>
                <div className="text-xs text-gray-200">أسبوع للتنفيذ الكامل</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Operational Rules Section */}
      <section className="mt-8 mb-8">
        <div className="rounded-2xl bg-gradient-to-br from-[#0d0d2b] to-brand-navy shadow-2xl border border-white/10 p-6 sm:p-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-brand-yellow/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-2">
              القوانين التشغيلية والتكامل مع أودو
              <span className="block text-sm font-normal text-gray-200 mt-1">Operational Compliance Rules & Odoo Integration</span>
            </h2>
            <div className="w-16 h-1 bg-brand-yellow mx-auto mb-8 rounded-full" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { icon: '📌', color: 'text-brand-red', border: 'border-brand-red/30', title: 'إجبارية التوثيق', text: 'منع حركة المخزون نهائياً دون استيفاء كافة الحقول الإجبارية في نماذج الإدخال الذكية. لا حركة بدون توثيق رقمي كامل.', odoo: 'متوافق مع وحدة المخزون' },
                { icon: '⏱️', color: 'text-orange-400', border: 'border-orange-400/30', title: 'عتبة الصلاحية', text: 'الرفض التلقائي عبر النظام لأي شحنة يقل عمرها الافتراضي المتبقي عن 75% عند الاستلام. امتثال صارم لا يقبل التفاوض.', odoo: 'متكامل مع إدارة تاريخ الصلاحية' },
                { icon: '🌡️', color: 'text-blue-400', border: 'border-blue-400/30', title: 'نقاط التحكم الحرجة (CCPs)', text: 'التحقق الآلي من درجات الحرارة المدخلة: 4°م للمبرد، -18°م للمجمد. منطق معتمد بمعايير HACCP.', odoo: 'مرتبط بجودة المخزون' },
                { icon: '🔄', color: 'text-green-400', border: 'border-green-400/30', title: 'أولوية الصرف — FEFO', text: 'توجيه عمليات الصرف آلياً بناءً على تواريخ الانتهاء الأقرب. تطبيق إلزامي لنظام FEFO — لا يمكن تجاوزه.', odoo: 'معيار في وحدة المخزون' },
                { icon: '📊', color: 'text-purple-400', border: 'border-purple-400/30', title: 'دقة البيانات — ABC', text: 'توجيه مهام الجرد الدوري الذكي عبر تصنيف ABC لضمان تطابق الأرصدة. الهدف: دقة مخزون 98.5% فأكثر.', odoo: 'متوافق مع تقارير أودو' },
                { icon: '⚡', color: 'text-brand-yellow', border: 'border-brand-yellow/30', title: 'زمن الاستجابة', text: 'تسريع الدورة المستندية عبر أتمتة النماذج وتقليل وقت التدقيق اليدوي. وقت دورة تشغيلية يقل عن 4 ساعات.', odoo: 'مزامنة فورية مع أودو' }
              ].map((rule, i) => (
                <div key={i} className={`bg-white/5 backdrop-blur border ${rule.border} rounded-xl p-5 hover:bg-white/10 transition-all`}>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">{rule.icon}</span>
                    <div className="flex-1">
                      <h3 className={`font-bold ${rule.color} mb-1`}>{rule.title}</h3>
                      <p className="text-sm text-gray-100 leading-relaxed mb-2">{rule.text}</p>
                      <div className="text-xs text-green-400 bg-green-500/10 rounded px-2 py-1 inline-block">
                        ✓ {rule.odoo}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="text-center text-sm text-gray-200 mt-8">
        Brandzo Hub © 2026 — الوثيقة التشغيلية والتقنية الشاملة لنظام إدارة المخازن — جميع الحقوق محفوظة
      </div>
    </div>
  );
};

export default BrandzoDashboard;