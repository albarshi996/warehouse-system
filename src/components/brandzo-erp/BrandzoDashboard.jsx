import React, { useEffect, useMemo, useState } from 'react';
import { subscribeItems } from '../../services/itemService.js';
import { subscribeWarehouses } from '../../services/warehouseService.js';
import {
  subscribeInboundLog,
  subscribeOutboundLog,
  sumQuantities,
} from '../../services/logService.js';
import Icon from '../ui/Icon.jsx';

/**
 * Single KPI card. The `onClick` prop is optional — when provided, the
 * card behaves like a button (focusable, keyboard-activatable).
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
    red: 'hover:shadow-[0_0_20px_rgba(192,57,43,0.3)] border-brand-red/20',
    gold: 'hover:shadow-[0_0_20px_rgba(232,184,48,0.3)] border-brand-gold/20',
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
          <Icon name={icon} />
        </div>
        <span className="text-xs font-bold text-gray-500">{labelEn}</span>
      </div>
  
      <div className="text-sm font-medium text-gray-400">{labelAr}</div>
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

/**
 * Status pill for the inventory table. Computed from `balance` vs
 * `minStock` so it stays in sync with live data even when items are
 * created/edited from `/dashboard/products`.
 */
function StatusPill({ balance, minStock }) {
  const low = (Number(balance) || 0) <= (Number(minStock) || 0);
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold ${
        low ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
      }`}
    >
      {low ? 'منخفض' : 'متاح'}
    </span>
  );
}

/**
 * Empty-state row for the inventory table.
 */
function EmptyRow({ message }) {
  return (
    <tr>
      <td colSpan="5" className="px-6 py-10 text-center text-gray-500 italic">
        {message}
      </td>
    </tr>
  );
}

const BrandzoDashboard = () => {
  // ── Firestore subscriptions ─────────────────────────────────────────
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [inbound, setInbound] = useState([]);
  const [outbound, setOutbound] = useState([]);

  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const [loadingInbound, setLoadingInbound] = useState(true);
  const [loadingOutbound, setLoadingOutbound] = useState(true);

  const [error, setError] = useState('');
  const [showLowOnly, setShowLowOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const unsubItems = subscribeItems(
      (next) => {
        setItems(next);
        setLoadingItems(false);
      },
      (err) => {
        setError(err?.message ?? 'تعذر الاتصال بقاعدة البيانات');
        setLoadingItems(false);
      }
    );
    const unsubWarehouses = subscribeWarehouses(
      (next) => {
        setWarehouses(next);
        setLoadingWarehouses(false);
      },
      (err) => {
        setError(err?.message ?? 'تعذر الاتصال بقاعدة البيانات');
        setLoadingWarehouses(false);
      }
    );
    const unsubInbound = subscribeInboundLog(
      (next) => {
        setInbound(next);
        setLoadingInbound(false);
      },
      (err) => {
        if (err?.code === 'permission-denied' || err?.code === 'unavailable') {
          setError(err.message);
        }
        setLoadingInbound(false);
      }
    );
    const unsubOutbound = subscribeOutboundLog(
      (next) => {
        setOutbound(next);
        setLoadingOutbound(false);
      },
      () => {
        setLoadingOutbound(false);
      }
    );
    return () => {
      unsubItems();
      unsubWarehouses();
      unsubInbound();
      unsubOutbound();
    };
  }, []);

  // ── Derived KPIs ────────────────────────────────────────────────────
  const totalItems = items.length;
  const totalWarehouses = warehouses.length;
  const lowStockCount = useMemo(
    () => items.filter((it) => (Number(it.balance) || 0) <= (Number(it.minStock) || 0)).length,
    [items]
  );
  const totalInboundQty = useMemo(() => sumQuantities(inbound), [inbound]);
  const totalOutboundQty = useMemo(() => sumQuantities(outbound), [outbound]);
  
  const visibleItems = useMemo(() => {
    let filtered = items;
    if (showLowOnly) {
      filtered = filtered.filter((it) => (Number(it.balance) || 0) <= (Number(it.minStock) || 0));
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (it) =>
          it.sku?.toLowerCase().includes(term) ||
          it.nameAr?.toLowerCase().includes(term) ||
          it.nameEn?.toLowerCase().includes(term)
      );
    }
    return filtered;
  }, [items, showLowOnly, searchTerm]);

  const tableLoading = loadingItems;
  const tableEmpty = !tableLoading && visibleItems.length === 0;

  return (
    <div className="text-right" dir="rtl">
      {/* HIDDEN: System Overview */}
      {/*
      <header className="mb-6 sm:mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        ...
      </header>
      */}

      {error && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-lg font-bold text-sm bg-red-100 text-red-700 border border-red-200"
        >
          {error}
        </div>
      )}

      {/* HIDDEN: Inventory Overview */}
      {/*
      <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        ...
      </div>
      */}

      {/* What We Offer Section */}
      <section className="mt-10 mb-8">
        <div className="rounded-2xl bg-gradient-to-br from-brand-navy via-[#1a1a3e] to-[#0d0d2b] shadow-2xl border border-brand-red/20 p-6 sm:p-10 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-64 h-64 bg-brand-red/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-brand-yellow/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-2">
              ضبط الجودة
              <span className="block text-sm font-normal text-gray-400 mt-1">Brandzo Hub — Quality Gate</span>
            </h2>
            <div className="w-16 h-1 bg-brand-red mx-auto mb-8 rounded-full" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-5 hover:border-brand-red/40 transition-all">
                <div className="text-2xl mb-3">📋</div>
                <h3 className="font-bold text-brand-red mb-2">نماذج ذكية إجبارية</h3>
                <p className="text-sm text-gray-300">كل العمليات (إضافة مخزون، صرف، تحويل، ارتجاع، جرد) تمر أولاً عبر نماذجنا الذكية الإجبارية.</p>
              </div>
              <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-5 hover:border-brand-yellow/40 transition-all">
                <div className="text-2xl mb-3">⚡</div>
                <h3 className="font-bold text-brand-yellow mb-2">تحقق منطقي آلي</h3>
                <p className="text-sm text-gray-300">النظام يتحقق من المنطق التشغيلي (الصلاحيات، الحدود، الكميات، تواريخ الانتهاء 75%، التوصيات التلقائية).</p>
              </div>
              <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-5 hover:border-green-400/40 transition-all">
                <div className="text-2xl mb-3">✅</div>
                <h3 className="font-bold text-green-400 mb-2">وثيقة نظيفة موثقة</h3>
                <p className="text-sm text-gray-300">في حال المطابقة → يُصدر النظام وثيقة نظيفة وموثقة جاهزة وخالية من أي خطأ لتكون المرجع الوحيد للإدخال في الـ ERP.</p>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur border border-brand-yellow/20 rounded-xl p-5">
              <h3 className="font-bold text-brand-yellow mb-3 flex items-center gap-2">
                <span>🔒</span> الميزة الحاسمة: تكاملي ومستقل — بوابة حماية للـ ERP
              </h3>
              <p className="text-sm text-gray-300 leading-relaxed">
                Brandzo Hub لا يستبدل الـ ERP ولا يرتبط به برمجياً بشكل مباشر، بل يعمل كـ "بوابة عبور" وفلتر جودة صارم يسبقه.
                نعزل أخطاء التشغيل تماماً عن النظام المحاسبي؛ مُدخل البيانات يستلم بيانات دقيقة 100%.
                النظام يحتفظ بسجل تدقيق كامل ومستقل (Audit Trail) لضمان الامتثال.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* لوحة القوانين التشغيلية */}
      <section className="mt-8 mb-8">
        <div className="rounded-2xl bg-gradient-to-br from-[#0d0d2b] to-brand-navy shadow-2xl border border-white/10 p-6 sm:p-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-brand-yellow/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-2">
              القوانين التشغيلية
              <span className="block text-sm font-normal text-gray-400 mt-1">Operational Compliance Rules</span>
            </h2>
            <div className="w-16 h-1 bg-brand-yellow mx-auto mb-8 rounded-full" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { icon: '📌', color: 'text-brand-red', border: 'border-brand-red/30', title: 'إجبارية التوثيق', text: 'منع حركة المخزون نهائياً دون استيفاء كافة الحقول الإجبارية في نماذج الإدخال الذكية. لا حركة بدون توثيق رقمي كامل.' },
                { icon: '⏱️', color: 'text-orange-400', border: 'border-orange-400/30', title: 'عتبة الصلاحية', text: 'الرفض التلقائي عبر النظام لأي شحنة يقل عمرها الافتراضي المتبقي عن 75% عند الاستلام. امتثال صارم لا يقبل التفاوض.' },
                { icon: '🌡️', color: 'text-blue-400', border: 'border-blue-400/30', title: 'نقاط التحكم الحرجة (CCPs)', text: 'التحقق الآلي من درجات الحرارة المدخلة: 4°م للمبرد، -18°م للمجمد. منطق معتمد بمعايير HACCP.' },
                { icon: '🔄', color: 'text-green-400', border: 'border-green-400/30', title: 'أولوية الصرف — FEFO', text: 'توجيه عمليات الصرف آلياً بناءً على تواريخ الانتهاء الأقرب. تطبيق إلزامي لنظام FEFO — لا يمكن تجاوزه.' },
                { icon: '📊', color: 'text-purple-400', border: 'border-purple-400/30', title: 'دقة البيانات — ABC', text: 'توجيه مهام الجرد الدوري الذكي عبر تصنيف ABC لضمان تطابق الأرصدة. الهدف: دقة مخزون 98.5% فأكثر.' },
                { icon: '⚡', color: 'text-brand-yellow', border: 'border-brand-yellow/30', title: 'زمن الاستجابة', text: 'تسريع الدورة المستندية عبر أتمتة النماذج وتقليل وقت التدقيق اليدوي. وقت دورة تشغيلية يقل عن 4 ساعات.' },
              ].map((rule, i) => (
                <div key={i} className={`bg-white/5 backdrop-blur border ${rule.border} rounded-xl p-5 hover:bg-white/10 transition-all`}>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">{rule.icon}</span>
                    <div>
                      <h3 className={`font-bold ${rule.color} mb-1`}>{rule.title}</h3>
                      <p className="text-sm text-gray-300 leading-relaxed">{rule.text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Section A: هيكل النظام والمسارات */}
      <section className="py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6">

          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">
                هيكل النظام والمسارات
                <span className="block text-sm font-normal text-gray-400 mt-1">System Architecture & Routes</span>
              </h2>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-6 py-3 bg-brand-red text-white rounded-xl font-bold hover:bg-brand-red-dark transition-all shadow-md hover:shadow-lg active:scale-95"
            >
              طباعة
            </button>
          </div>

          {/* ١. طبقات النظام الأساسية — Architecture Cards */}
          <div className="rounded-2xl bg-gradient-to-br from-brand-navy via-[#1a1a3e] to-[#0d0d2b] shadow-2xl border border-brand-red/20 p-6 sm:p-10 relative overflow-hidden mb-8">
            <div className="absolute top-0 left-0 w-64 h-64 bg-brand-red/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-64 h-64 bg-brand-yellow/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <h3 className="text-lg sm:text-xl font-bold text-white text-center mb-2">
                طبقات النظام الأساسية
              </h3>
              <div className="w-12 h-1 bg-brand-red mx-auto mb-8 rounded-full" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white/5 backdrop-blur border border-brand-red/30 rounded-xl p-5 hover:border-brand-red/60 transition-all">
                  <div className="text-2xl mb-3">📥</div>
                  <h4 className="font-bold text-brand-red mb-2">طبقة الإدخال</h4>
                  <p className="text-sm text-gray-300">استلام البضاعة، فحص الجودة، إدخال البيانات عبر نماذج GRN وQC.</p>
                </div>
                <div className="bg-white/5 backdrop-blur border border-brand-yellow/30 rounded-xl p-5 hover:border-brand-yellow/60 transition-all">
                  <div className="text-2xl mb-3">⚙️</div>
                  <h4 className="font-bold text-brand-yellow mb-2">طبقة التحقق</h4>
                  <p className="text-sm text-gray-300">التحقق من الصلاحيات، الحدود، الكميات، تواريخ الصلاحية، التوصيات التلقائية.</p>
                </div>
                <div className="bg-white/5 backdrop-blur border border-green-400/30 rounded-xl p-5 hover:border-green-400/60 transition-all">
                  <div className="text-2xl mb-3">📤</div>
                  <h4 className="font-bold text-green-400 mb-2">طبقة الإخراج</h4>
                  <p className="text-sm text-gray-300">صرف المخزون، التحويلات، التقارير، التكامل مع ERP.</p>
                </div>
              </div>
            </div>
          </div>

          {/* ٢. المسارات والروابط */}
          <div className="rounded-2xl bg-gradient-to-br from-[#0d0d2b] to-brand-navy shadow-2xl border border-white/10 p-6 sm:p-10 relative overflow-hidden mb-8">
            <div className="absolute top-0 right-0 w-48 h-48 bg-brand-yellow/5 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <h3 className="text-lg sm:text-xl font-bold text-white text-center mb-2">
                المسارات والروابط
              </h3>
              <div className="w-12 h-1 bg-brand-yellow mx-auto mb-8 rounded-full" />
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-white/10">
                      <th className="border border-white/20 px-4 py-3 text-right font-bold text-brand-yellow">المسار</th>
                      <th className="border border-white/20 px-4 py-3 text-right font-bold text-brand-yellow">الرابط</th>
                      <th className="border border-white/20 px-4 py-3 text-right font-bold text-brand-yellow">الوظيفة</th>
                      <th className="border border-white/20 px-4 py-3 text-right font-bold text-brand-yellow">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: 'الصفحة الرئيسية', path: '/', fn: 'بوابة الدخول — المقترح الشامل للإدارة', status: '✅ مفعّل' },
                      { name: 'لوحة التحكم', path: '/dashboard/', fn: 'نظرة عامة — قوانين تشغيلية — KPIs', status: '✅ مفعّل' },
                      { name: 'مكتبة النماذج', path: '/dashboard/forms', fn: '21 نموذج تشغيلي قابل للطباعة', status: '✅ مفعّل' },
                      { name: 'إدارة الأصناف', path: '/dashboard/products', fn: 'بيانات الصنف الرئيسية — Item Master', status: '✅ مفعّل' },
                      { name: 'المستودعات', path: '/dashboard/warehouses', fn: 'إدارة مواقع التخزين', status: '✅ مفعّل' },
                      { name: 'استلام البضاعة', path: '/dashboard/grn', fn: 'دورة GRN — استلام وتوثيق الشحنات', status: '✅ مفعّل' },
                      { name: 'إدارة المهام', path: '/dashboard/tasks', fn: 'توزيع المهام اليومية وتتبعها', status: '✅ مفعّل' },
                      { name: 'التدفق الوثائقي', path: '/dashboard/workflows', fn: 'خريطة الدورة المستندية — Document Flow', status: '✅ مفعّل' },
                      { name: 'الدليل التشغيلي', path: '/Brandzo_Operational_Guide.html', fn: 'المرجع الكامل — 11+ بابًا تشغيليًا', status: '🔒 محمي بكلمة سر' },
                    ].map((row, i) => (
                      <tr key={i} className="hover:bg-white/5 transition-colors">
                        <td className="border border-white/10 px-4 py-2.5 text-white font-medium">{row.name}</td>
                        <td className="border border-white/10 px-4 py-2.5 text-gray-300 font-mono text-sm">{row.path}</td>
                        <td className="border border-white/10 px-4 py-2.5 text-gray-300">{row.fn}</td>
                        <td className="border border-white/10 px-4 py-2.5 text-gray-200">{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ٣. الدورة المستندية */}
          <div className="rounded-2xl bg-gradient-to-br from-brand-navy via-[#1a1a3e] to-[#0d0d2b] shadow-2xl border border-brand-red/20 p-6 sm:p-10 relative overflow-hidden mb-8">
            <div className="absolute bottom-0 left-0 w-56 h-56 bg-brand-red/5 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <h3 className="text-lg sm:text-xl font-bold text-white text-center mb-2">
                الدورة المستندية
                <span className="block text-sm font-normal text-gray-400 mt-1">Document Cycle</span>
              </h3>
              <div className="w-12 h-1 bg-brand-red mx-auto mb-8 rounded-full" />
              <ol className="space-y-3">
                {[
                  { num: 1, title: 'طلب شراء داخلي (PR)', desc: 'طلب رسمي داخلي قبل أمر الشراء.' },
                  { num: 2, title: 'أمر الشراء (PO)', desc: 'لا استلام بدون PO مسبق.' },
                  { num: 3, title: 'إشعار استلام البضاعة (GRN)', desc: 'توثيق الشحنة وربطها بالـ PO.' },
                  { num: 4, title: 'تقرير فحص الجودة (QC)', desc: 'فحص العمر الافتراضي 75%، درجات الحرارة، HACCP.' },
                  { num: 5, title: 'أمر التخزين (Putaway)', desc: 'توجيه الأصناف لمواقع التخزين وفق FEFO.' },
                  { num: 6, title: 'بطاقة مراقبة المخزون (Bin Card)', desc: 'تسجيل حركة الصنف داخل الموقع.' },
                  { num: 7, title: 'طلب صرف من المخزن (SR)', desc: 'طلب رسمي يُفعّل عملية السحب.' },
                  { num: 8, title: 'قائمة السحب (Picking)', desc: 'توجيه عمال المستودع وفق FEFO.' },
                  { num: 9, title: 'إذن التسليم (DN) + قائمة التعبئة', desc: 'إثبات التسليم مع توقيع المستلم.' },
                  { num: 10, title: 'تصريح الخروج (Gate Pass)', desc: 'توثيق خروج المركبات عبر بوابة الأمن.' },
                  { num: 11, title: 'الجرد الدوري (Cycle Count)', desc: 'مطابقة الرصيد الفعلي مع الدفتري، هدف 98.5%+.' },
                  { num: 12, title: 'سند تسوية (SAV)', desc: 'تصحيح الفروقات برمز سبب موثق مع اعتماد المشرف.' },
                ].map((item) => (
                  <li key={item.num} className="flex gap-3 items-start">
                    <span className="flex-shrink-0 w-8 h-8 bg-brand-red text-white rounded-full flex items-center justify-center font-bold text-sm">{item.num}</span>
                    <div className="bg-white/5 backdrop-blur border border-white/10 rounded-lg px-4 py-2.5 flex-1 hover:bg-white/10 transition-all">
                      <strong className="text-white">{item.title}</strong>
                      <span className="text-gray-300"> — {item.desc}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* ٤. القواعد الذهبية */}
          <div className="rounded-2xl bg-gradient-to-br from-[#0d0d2b] to-brand-navy shadow-2xl border border-brand-yellow/20 p-6 sm:p-10 relative overflow-hidden mb-8">
            <div className="absolute top-0 right-0 w-48 h-48 bg-brand-yellow/5 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <h3 className="text-lg sm:text-xl font-bold text-white text-center mb-2">
                القواعد الذهبية
                <span className="block text-sm font-normal text-gray-400 mt-1">Golden Rules</span>
              </h3>
              <div className="w-12 h-1 bg-brand-yellow mx-auto mb-8 rounded-full" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { icon: '🚫', color: 'text-brand-red', border: 'border-brand-red/30', bold: 'لا حركة مخزنية', text: 'بدون مستند موثق إلزامياً.' },
                  { icon: '📋', color: 'text-orange-400', border: 'border-orange-400/30', bold: 'لا استلام', text: 'بدون أمر شراء (PO) مسبق.' },
                  { icon: '🔒', color: 'text-brand-yellow', border: 'border-brand-yellow/30', bold: 'لا صرف', text: 'بدون طلب صرف معتمد (SR).' },
                  { icon: '⏱️', color: 'text-red-400', border: 'border-red-400/30', bold: 'الرفض التلقائي', text: 'لأي شحنة عمرها الافتراضي أقل من 75%.' },
                  { icon: '🔄', color: 'text-green-400', border: 'border-green-400/30', bold: 'التطبيق الإلزامي', text: 'لـ FEFO في جميع عمليات الصرف.' },
                  { icon: '🌡️', color: 'text-blue-400', border: 'border-blue-400/30', bold: 'التحقق من CCPs:', text: '4°م للمبرد، -18°م للمجمد (HACCP).' },
                  { icon: '📊', color: 'text-purple-400', border: 'border-purple-400/30', bold: 'دقة مخزون مستهدفة:', text: '98.5% أو أكثر.' },
                  { icon: '⚡', color: 'text-brand-yellow', border: 'border-brand-yellow/30', bold: 'وقت دورة تشغيلية:', text: 'أقل من 4 ساعات.' },
                ].map((rule, i) => (
                  <div key={i} className={`bg-white/5 backdrop-blur border ${rule.border} rounded-xl p-4 hover:bg-white/10 transition-all`}>
                    <div className="flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0">{rule.icon}</span>
                      <p className="text-sm text-gray-300 leading-relaxed">
                        <strong className={rule.color}>{rule.bold}</strong> {rule.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer Section A */}
          <div className="text-center text-sm text-gray-500 mt-8">
            Brandzo Hub © 2026 — الوثيقة التشغيلية والتقنية الشاملة لنظام إدارة المخازن — جميع الحقوق محفوظة
          </div>
        </div>
      </section>

      {/* Section B: التقرير الفني — مبررات اعتماد نظام ERP شامل */}
      <section className="py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6">

          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">
                التقرير الفني — نظام ERP المقترح
                <span className="block text-sm font-normal text-gray-400 mt-1">ERP Technical Report — موجه إلى الإدارة التنفيذية</span>
              </h2>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-6 py-3 bg-brand-red text-white rounded-xl font-bold hover:bg-brand-red-dark transition-all shadow-md hover:shadow-lg active:scale-95"
            >
              طباعة
            </button>
          </div>

          {/* ١. المقدمة */}
          <div className="rounded-2xl bg-gradient-to-br from-brand-navy via-[#1a1a3e] to-[#0d0d2b] shadow-2xl border border-brand-red/20 p-6 sm:p-10 relative overflow-hidden mb-8">
            <div className="absolute top-0 left-0 w-56 h-56 bg-brand-red/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <h3 className="text-lg sm:text-xl font-bold text-white text-center mb-2">
                ١. المقدمة والخلفية
              </h3>
              <div className="w-12 h-1 bg-brand-red mx-auto mb-6 rounded-full" />
              <p className="text-gray-300 leading-relaxed text-center max-w-3xl mx-auto">
                تعد منظومة تخطيط موارد المؤسسات (ERP) العصب الحيوي لأي منظمة تسعى لتحقيق التكامل بين عملياتها التشغيلية والمالية واللوجستية. في ظل التوسع المستمر لاحتياجات إدارة المخزون، المبيعات، المشتريات، والموارد البشرية في المنصة، تبرز الحاجة الماسة لاعتماد نظام عالمي يضمن الاستدامة.
              </p>
            </div>
          </div>

          {/* ٢. الدراسة المقارنة */}
          <div className="rounded-2xl bg-gradient-to-br from-[#0d0d2b] to-brand-navy shadow-2xl border border-white/10 p-6 sm:p-10 relative overflow-hidden mb-8">
            <div className="absolute bottom-0 right-0 w-48 h-48 bg-blue-400/5 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <h3 className="text-lg sm:text-xl font-bold text-white text-center mb-2">
                ٢. الدراسة المقارنة لأنظمة ERP المتاحة
              </h3>
              <div className="w-12 h-1 bg-brand-yellow mx-auto mb-8 rounded-full" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* SaaS */}
                <div className="bg-white/5 backdrop-blur border border-blue-400/30 rounded-xl p-5 hover:bg-white/10 transition-all">
                  <div className="text-2xl mb-3">☁️</div>
                  <h4 className="font-bold text-blue-400 mb-3">الأنظمة السحابية (SaaS)</h4>
                  <div className="space-y-3 text-sm text-gray-300">
                    <div>
                      <p className="font-semibold text-white">Oracle NetSuite</p>
                      <p>تكلفة شهرية مرتفعة (تبدأ من 999$ للأساس + 99$ للمستخدم). قوي مالياً لكن بمرونة تخصيص أقل.</p>
                    </div>
                    <div>
                      <p className="font-semibold text-white">Microsoft Dynamics 365</p>
                      <p>تكلفة 180-300$ للمستخدم/شهرياً. تكامل ممتاز مع بيئة مايكروسوفت لكن بهيكل تراخيص معقد.</p>
                    </div>
                  </div>
                </div>
                {/* Open Source */}
                <div className="bg-white/5 backdrop-blur border border-green-400/30 rounded-xl p-5 hover:bg-white/10 transition-all">
                  <div className="text-2xl mb-3">🔓</div>
                  <h4 className="font-bold text-green-400 mb-3">الأنظمة مفتوحة المصدر</h4>
                  <div className="space-y-3 text-sm text-gray-300">
                    <div>
                      <p className="font-semibold text-white">Odoo</p>
                      <p>تكلفة منخفضة (20-35$ للمستخدم/شهرياً). مرن جداً، ولكن قد يواجه تحديات استقرار مع التخصيصات المعقدة.</p>
                    </div>
                    <div>
                      <p className="font-semibold text-white">ERPNext</p>
                      <p>مجاني للاستضافة الذاتية، يشمل كافة الوحدات. اقتصادي جداً، ولكن بشبكة دعم مؤسسي أصغر.</p>
                    </div>
                  </div>
                </div>
                {/* SAP */}
                <div className="bg-white/5 backdrop-blur border border-brand-yellow/50 rounded-xl p-5 hover:bg-white/10 transition-all relative">
                  <div className="absolute top-3 left-3 bg-brand-yellow text-black text-xs font-bold px-2 py-0.5 rounded-full">مرشح 🌟</div>
                  <div className="text-2xl mb-3">🏆</div>
                  <h4 className="font-bold text-brand-yellow mb-3">SAP S/4HANA</h4>
                  <p className="text-sm text-gray-300">الأفضل عالمياً في الممارسات القياسية. قدرة هائلة على معالجة البيانات الضخمة في الوقت الفعلي. تكامل استثنائي للعمليات المعقدة. تعتمد التكلفة على الإيرادات وعدد المستخدمين (باقات RISE with SAP).</p>
                </div>
              </div>
            </div>
          </div>

          {/* ٣. الجدوى الاقتصادية */}
          <div className="rounded-2xl bg-gradient-to-br from-brand-navy via-[#1a1a3e] to-[#0d0d2b] shadow-2xl border border-green-400/20 p-6 sm:p-10 relative overflow-hidden mb-8">
            <div className="absolute top-0 right-0 w-48 h-48 bg-green-400/5 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <h3 className="text-lg sm:text-xl font-bold text-white text-center mb-2">
                ٣. الجدوى الاقتصادية لنظام SAP
              </h3>
              <div className="w-12 h-1 bg-green-400 mx-auto mb-8 rounded-full" />
              <p className="text-gray-300 text-center mb-6">رغم ارتفاع الاستثمار الأولي، يتحقق العائد على الاستثمار (ROI) من خلال:</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { icon: '⚙️', color: 'text-brand-yellow', text: 'أتمتة العمليات اليدوية وتقليل التكاليف التشغيلية' },
                  { icon: '🎯', color: 'text-green-400', text: 'الحد من الأخطاء البشرية وتسريع اتخاذ القرار بتقارير لحظية' },
                  { icon: '✅', color: 'text-blue-400', text: 'امتثال تنظيمي دقيق وتقليل مخاطر التدقيق' },
                ].map((item, i) => (
                  <div key={i} className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-all text-center">
                    <div className="text-3xl mb-3">{item.icon}</div>
                    <p className={`text-sm font-medium ${item.color}`}>{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ٤. خطة التنفيذ */}
          <div className="rounded-2xl bg-gradient-to-br from-[#0d0d2b] to-brand-navy shadow-2xl border border-white/10 p-6 sm:p-10 relative overflow-hidden mb-8">
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-400/5 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <h3 className="text-lg sm:text-xl font-bold text-white text-center mb-2">
                ٤. خطة التنفيذ المقترحة
              </h3>
              <div className="w-12 h-1 bg-purple-400 mx-auto mb-8 rounded-full" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { phase: 'المرحلة الأولى', period: '3-6 أشهر', color: 'text-green-400', border: 'border-green-400/30', icon: '🚀', desc: 'نشر الوحدات الأساسية (المالية، المخزون، المشتريات).' },
                  { phase: 'المرحلة الثانية', period: '6-12 شهراً', color: 'text-brand-yellow', border: 'border-brand-yellow/30', icon: '📈', desc: 'التوسع لتغطية المبيعات والموارد البشرية والتكامل مع الأنظمة الحالية (Brandzo).' },
                  { phase: 'المرحلة الثالثة', period: '12-18 شهراً', color: 'text-purple-400', border: 'border-purple-400/30', icon: '🤖', desc: 'تفعيل التحليلات التنبؤية وتحسين الأداء.' },
                ].map((p, i) => (
                  <div key={i} className={`bg-white/5 backdrop-blur border ${p.border} rounded-xl p-5 hover:bg-white/10 transition-all`}>
                    <div className="text-2xl mb-2">{p.icon}</div>
                    <h4 className={`font-bold ${p.color} mb-1`}>{p.phase}</h4>
                    <p className="text-xs text-gray-400 mb-3">{p.period}</p>
                    <p className="text-sm text-gray-300">{p.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ٥. الخلاصة والتوصية */}
          <div className="rounded-2xl bg-gradient-to-br from-brand-navy via-[#1a1a3e] to-[#0d0d2b] shadow-2xl border border-brand-yellow/30 p-6 sm:p-10 relative overflow-hidden mb-8">
            <div className="absolute top-0 left-0 w-64 h-64 bg-brand-yellow/5 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-start gap-3 bg-brand-yellow/10 border border-brand-yellow/30 rounded-xl p-5 mb-6">
                <span className="text-3xl flex-shrink-0">🏆</span>
                <div>
                  <h3 className="font-bold text-brand-yellow mb-2">٥. الخلاصة والتوصية</h3>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    يُوصى باعتماد <strong className="text-white">SAP S/4HANA</strong> كخيار استراتيجي طويل الأمد. هذا النظام سيمكن المنظمة من دمج عملياتها المخزنية المعقدة باحترافية، وتحقيق أعلى مستويات الرقابة والامتثال، مما يضمن الجاهزية للتوسع المستقبلي.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ٦. دليل التواصل مع مزودي الخدمة */}
          <div className="rounded-2xl bg-gradient-to-br from-[#0d0d2b] to-brand-navy shadow-2xl border border-white/10 p-6 sm:p-10 relative overflow-hidden mb-8">
            <div className="absolute bottom-0 right-0 w-48 h-48 bg-brand-red/5 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <h3 className="text-lg sm:text-xl font-bold text-white text-center mb-2">
                دليل التواصل مع مزودي خدمات ERP الإقليميين
                <span className="block text-sm font-normal text-gray-400 mt-1">MENA Region — مكاتب الشركات الأم</span>
              </h3>
              <div className="w-12 h-1 bg-brand-red mx-auto mb-8 rounded-full" />
              <div className="overflow-x-auto mb-6">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-white/10">
                      <th className="border border-white/20 px-4 py-3 text-right font-bold text-brand-red">مزود النظام</th>
                      <th className="border border-white/20 px-4 py-3 text-right font-bold text-brand-red">المكتب الإقليمي</th>
                      <th className="border border-white/20 px-4 py-3 text-right font-bold text-brand-red">هاتف التواصل</th>
                      <th className="border border-white/20 px-4 py-3 text-right font-bold text-brand-red">الموقع الإلكتروني</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { vendor: 'SAP', office: 'دبي (المقر الإقليمي)', phone: '+971 4 440 7222', site: 'sap.com/mena', url: 'https://www.sap.com/mena/index.html' },
                      { vendor: 'SAP', office: 'القاهرة (مصر)', phone: '+20 2 3306 2000', site: 'sap.com/africa', url: 'https://www.sap.com/africa/index.html' },
                      { vendor: 'Oracle', office: 'دبي (NetSuite)', phone: '+971 4 390 9000', site: 'oracle.com/middleeast', url: 'https://www.oracle.com/middleeast/' },
                      { vendor: 'Microsoft', office: 'القاهرة (Dynamics 365)', phone: '+20 2 3539 3300', site: 'microsoft.com/ar-eg', url: 'https://www.microsoft.com/ar-eg/' },
                      { vendor: 'Odoo', office: 'دبي (الشرق الأوسط)', phone: '+971 4 559 0300', site: 'odoo.com/contact', url: 'https://www.odoo.com/contactus' },
                    ].map((row, i) => (
                      <tr key={i} className="hover:bg-white/5 transition-colors">
                        <td className="border border-white/10 px-4 py-2.5 text-white font-bold">{row.vendor}</td>
                        <td className="border border-white/10 px-4 py-2.5 text-gray-300">{row.office}</td>
                        <td className="border border-white/10 px-4 py-2.5 text-brand-yellow font-mono">{row.phone}</td>
                        <td className="border border-white/10 px-4 py-2.5">
                          <a href={row.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline text-sm">{row.site}</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Partner Directories */}
              <div className="bg-white/5 backdrop-blur border border-brand-yellow/20 rounded-xl p-5">
                <h4 className="font-bold text-brand-yellow mb-3 flex items-center gap-2">
                  <span>🔍</span> أدوات البحث عن الشركاء المنفذين (Implementers)
                </h4>
                <p className="text-sm text-gray-300 mb-4 leading-relaxed">
                  نظراً لطبيعة المشاريع المؤسسية، يتم التنفيذ عبر شركاء معتمدين. يمكن الوصول للشركاء المخولين بالعمل في نطاق ليبيا وشمال أفريقيا عبر الأدلة الرسمية:
                </p>
                <div className="space-y-2">
                  {[
                    { label: 'شركاء SAP المعتمدين', url: 'https://www.sap.com/dmc/exp/2014-07-02-partner-directory/', color: 'text-blue-400' },
                    { label: 'شركاء مايكروسوفت المعتمدين', url: 'https://partner.microsoft.com/en-us/partnership/find-a-partner', color: 'text-blue-400' },
                    { label: 'شركاء Odoo المحليين', url: 'https://www.odoo.com/partners', color: 'text-blue-400' },
                  ].map((link, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-brand-red">•</span>
                      <span className="text-gray-300 text-sm">{link.label}:</span>
                      <a href={link.url} target="_blank" rel="noreferrer" className={`${link.color} hover:underline text-sm`}>{link.url}</a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Footer Section B */}
          <div className="text-center text-sm text-gray-500 mt-8">
            Brandzo Hub © 2026 — الوثيقة التشغيلية والتقنية الشاملة لنظام إدارة المخازن — جميع الحقوق محفوظة
          </div>
        </div>
      </section>

      {/* ============================================================
          Print Styles — يُضاف هذا في ملف CSS العام أو index.css
          ============================================================
          @media print {
            body { background: white !important; color: black !important; }
            section { page-break-inside: avoid; }
            button { display: none !important; }

            .rounded-2xl {
              background: white !important;
              border: 1px solid #e5e7eb !important;
              box-shadow: none !important;
              color: black !important;
            }
            .text-white, .text-gray-300, .text-gray-400 { color: #1a1a2e !important; }
            .text-brand-red  { color: #c0392b !important; }
            .text-brand-yellow { color: #b8860b !important; }
            .text-green-400  { color: #16a34a !important; }
            .text-blue-400   { color: #1d4ed8 !important; }
            .text-purple-400 { color: #7c3aed !important; }
            .bg-white\/5, .bg-white\/10 { background: #f9fafb !important; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #d1d5db !important; color: black !important; }
            th { background: #f3f4f6 !important; }
            .blur-3xl, [class*="blur"] { display: none !important; }
            a { color: #1d4ed8 !important; text-decoration: underline; }
          }
      ============================================================ */}

    </div>
  );
};

export default BrandzoDashboard;
