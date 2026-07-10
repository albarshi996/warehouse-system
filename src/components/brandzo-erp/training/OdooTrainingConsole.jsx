import React, { useEffect, useReducer, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import {
  STAGES,
  MODULES,
  FORMS,
  STATUS_META,
  GOLDEN_RULES,
  createInitialState,
} from './trainingCycleData.js';

/**
 * Odoo Training Simulator — وضع التدريب.
 *
 * A fully offline, state-driven walkthrough of the Brandzo Hub document cycle:
 *   • 12-stage state machine — each stage must be completed to unlock the next.
 *   • The 21 official forms open (as their real mock HTML) at their stages.
 *   • The four golden rules are HARD guards that block the trainee and explain
 *     the violation (QC-before-Done, FEFO, Gate Pass, 3-Way Match).
 *
 * No network, no Firestore, no Odoo — reload or "إعادة ضبط" to reset.
 * All logic is mirrored from trainingCycleData.js (the operational reference).
 */

/* ───────────────────────── styling maps ───────────────────────── */
const TONE = {
  pending: { chip: 'bg-brand-yellow/15 text-brand-yellow border-brand-yellow/40', dot: 'bg-brand-yellow' },
  done:    { chip: 'bg-green-500/15 text-green-400 border-green-500/40',           dot: 'bg-green-500' },
  reject:  { chip: 'bg-brand-red/15 text-brand-red border-brand-red/50',           dot: 'bg-brand-red' },
  locked:  { chip: 'bg-white/5 text-gray-500 border-white/10',                     dot: 'bg-gray-600' },
};

const MOD_ACCENT = {
  red:   { text: 'text-brand-red',    ring: 'border-brand-red/50',    soft: 'bg-brand-red/10' },
  gold:  { text: 'text-brand-yellow', ring: 'border-brand-yellow/50', soft: 'bg-brand-yellow/10' },
  teal:  { text: 'text-teal-300',     ring: 'border-teal-400/50',     soft: 'bg-teal-400/10' },
  green: { text: 'text-green-400',    ring: 'border-green-500/50',    soft: 'bg-green-500/10' },
};

const fmt = (n) => `${Number(n).toLocaleString('en-US')} ﷼`;

/* ───────────────────────── state machine ──────────────────────── */
function checkGuard(rule, o) {
  switch (rule) {
    case 'qc':
      return o.qcResult === 'passed'
        ? null
        : 'لا يمكن ترحيل الاستلام (GRN) إلى «Done» قبل اعتماد فحص الجودة (QC = Passed). القاعدة الذهبية: لا Done قبل توقيع مفتش الجودة.';
    case 'fefo':
      return o.pickedLot && o.pickedLot === o.fefoLot
        ? null
        : `قاعدة FEFO: يجب سحب أقرب تاريخ صلاحية أولاً (${o.fefoLot}). اختر الدفعة الصحيحة قبل إتمام السحب.`;
    case 'gatepass':
      return o.gatePassApproved
        ? null
        : 'قاعدة الشحن: لا تخرج المركبة من البوابة دون «تصريح خروج (Gate Pass)» معتمد ومربوط بإذن التسليم. اعتمد التصريح أولاً.';
    case 'match':
      if (o.billAmount == null) return 'أدخل مبلغ فاتورة المورد أولاً لإجراء المطابقة الثلاثية.';
      return o.billMatched
        ? null
        : `المطابقة الثلاثية (3-Way Match) فشلت: فاتورة المورد (${fmt(o.billAmount)}) لا تطابق قيمة أمر الشراء (${fmt(
            o.poTotal
          )}) وكمية GRN المستلمة (${o.receivedQty}). يوقف النظام الدفع تلقائياً.`;
    default:
      return null;
  }
}

/** Side effects when a stage enters a given status. */
function applyEnter(order, stageId, status) {
  if (stageId === 'grn' && status === 'done') {
    return { ...order, receivedQty: order.orderedQty }; // fully received & accepted
  }
  return order;
}

/** Mark the current stage done, unlock + focus the next one. */
function completeStage(state, stageDef) {
  const pos = STAGES.findIndex((s) => s.id === stageDef.id);
  const next = STAGES[pos + 1];
  const log = [...state.log, { id: stageDef.id, num: stageDef.num, titleAr: stageDef.titleAr }];

  if (!next) {
    return {
      ...state,
      log,
      alert: { kind: 'success', text: '🎉 اكتملت الدورة المستندية الكاملة (12 مرحلة) وأُغلقت الفترة المالية بنجاح.' },
    };
  }

  let order = state.order;
  if (next.id === 'dispatch') order = { ...order, deliveryNoteNo: 'DO-2026-0155' };

  const stages = { ...state.stages, [next.id]: { ...state.stages[next.id], status: next.flow[0] } };
  return {
    ...state,
    order,
    stages,
    currentStage: next.id,
    activeModule: next.module,
    log,
    alert: {
      kind: 'success',
      text: `تمت المرحلة ${stageDef.num} (${stageDef.titleAr}). فُتحت المرحلة ${next.num} — ${next.titleAr}.`,
    },
  };
}

function advance(state) {
  const stageDef = STAGES.find((s) => s.id === state.currentStage);
  const cur = state.stages[state.currentStage];
  const flow = stageDef.flow;
  const idx = flow.indexOf(cur.status);
  const last = flow.length - 1;
  const isAtLast = idx === last;
  const target = isAtLast ? cur.status : flow[idx + 1];

  // Golden-rule guard on entering the target status.
  if (stageDef.guard && stageDef.guard.at === target) {
    const err = checkGuard(stageDef.guard.rule, state.order);
    if (err) return { ...state, alert: { kind: 'error', text: err } };
  }

  // Move one step within the flow (not completing yet).
  if (!isAtLast && flow[idx + 1] !== flow[last]) {
    return {
      ...state,
      order: applyEnter(state.order, stageDef.id, target),
      stages: { ...state.stages, [stageDef.id]: { ...cur, status: target } },
      alert: null,
    };
  }

  // Completing the stage (reached the terminal status).
  const order = applyEnter(state.order, stageDef.id, flow[last]);
  const stages = { ...state.stages, [stageDef.id]: { ...cur, status: flow[last], done: true } };
  return completeStage({ ...state, order, stages }, stageDef);
}

function reducer(state, action) {
  switch (action.type) {
    case 'RESET':
      return createInitialState();
    case 'DISMISS_ALERT':
      return { ...state, alert: null };
    case 'SELECT_MODULE':
      return { ...state, activeModule: action.module };
    case 'SET_QC': {
      const qcResult = action.result;
      const alert =
        qcResult === 'failed'
          ? {
              kind: 'warn',
              text: 'فشل فحص الجودة — تُحرَّك البضاعة إلى موقع الحجر (Quarantine) ويُخطَر المورد. لا يمكن إتمام GRN إلا باعتماد QC = Passed.',
            }
          : { kind: 'success', text: 'اجتاز فحص الجودة (QC = Passed) — يمكنك الآن ترحيل الاستلام إلى Done.' };
      return { ...state, order: { ...state.order, qcResult }, alert };
    }
    case 'PICK_LOT': {
      const pickedLot = action.lot;
      const wrong = pickedLot !== state.order.fefoLot;
      const alert = wrong
        ? {
            kind: 'warn',
            text: `⚠️ مخالفة FEFO محتملة: اخترت ${pickedLot} بينما أقرب صلاحية هي ${state.order.fefoLot}. لن يسمح النظام بإتمام السحب إلا بالدفعة الأقرب انتهاءً.`,
          }
        : { kind: 'success', text: `اختيار صحيح — ${pickedLot} هي الدفعة الأقرب انتهاءً (FEFO).` };
      return { ...state, order: { ...state.order, pickedLot }, alert };
    }
    case 'APPROVE_GATEPASS':
      return {
        ...state,
        order: { ...state.order, gatePassApproved: true, gatePassNo: 'GP-2026-0155' },
        alert: {
          kind: 'success',
          text: 'تم اعتماد تصريح الخروج (Gate Pass: GP-2026-0155) وربطه بإذن التسليم — يمكن الآن إخراج المركبة.',
        },
      };
    case 'SET_BILL': {
      const billAmount = action.value === '' ? null : Number(action.value);
      const billMatched =
        billAmount != null &&
        billAmount === state.order.poTotal &&
        state.order.receivedQty === state.order.orderedQty;
      return { ...state, order: { ...state.order, billAmount, billMatched } };
    }
    case 'SET_COUNT': {
      const countedQty = action.value === '' ? null : Number(action.value);
      const adjustmentQty = countedQty == null ? null : countedQty - state.order.systemQty;
      return { ...state, order: { ...state.order, countedQty, adjustmentQty } };
    }
    case 'ADVANCE':
      return advance(state);
    default:
      return state;
  }
}

/* ───────────────────────── small components ────────────────────── */
function FlowTrack({ stage, st }) {
  const curIdx = stage.flow.indexOf(st.status);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {stage.flow.map((s, i) => {
        const meta = STATUS_META[s];
        const done = st.done || i < curIdx;
        const current = !st.done && i === curIdx;
        const tone = done ? 'done' : current ? meta.tone : 'locked';
        const t = TONE[tone];
        return (
          <React.Fragment key={s}>
            {i > 0 && <span className="text-gray-600 text-xs select-none">←</span>}
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${t.chip} ${
                current ? 'ring-2 ring-white/30' : ''
              }`}
            >
              {done && <span aria-hidden>✓</span>}
              {meta.labelAr}
              <span className="opacity-50 font-mono text-[9px]">{meta.labelEn}</span>
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function GoldenRulesStrip() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      {GOLDEN_RULES.map((r) => (
        <div
          key={r.rule}
          className="flex items-start gap-2 rounded-xl border border-brand-red/30 bg-brand-red/5 px-3 py-2"
          title={r.textAr}
        >
          <span className="text-lg leading-none mt-0.5">{r.icon}</span>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-brand-yellow leading-tight">{r.titleAr}</div>
            <div className="text-[10px] text-gray-400 leading-snug line-clamp-2">{r.textAr}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ModuleSidebar({ state, moduleFilter, setModuleFilter, onOpenMatrix }) {
  const currentModules = STAGES.find((s) => s.id === state.currentStage)?.modules || [];
  return (
    <aside className="w-full lg:w-60 shrink-0 space-y-3">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <div className="flex items-center gap-2 mb-3 px-1">
          <Icon name="grid" size={16} className="text-brand-yellow" />
          <h3 className="text-sm font-bold text-gray-100">وحدات أودو</h3>
        </div>
        <ul className="space-y-1.5">
          {MODULES.map((m) => {
            const a = MOD_ACCENT[m.accent];
            const count = STAGES.filter((s) => s.modules.includes(m.id)).length;
            const isCurrent = currentModules.includes(m.id);
            const isFilter = moduleFilter === m.id;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setModuleFilter(isFilter ? null : m.id)}
                  aria-pressed={isFilter}
                  className={`w-full flex items-center gap-2.5 rounded-xl border px-3 py-2 text-right transition-all ${
                    isFilter ? `${a.ring} ${a.soft}` : 'border-white/10 hover:border-white/25 bg-white/[0.02]'
                  }`}
                >
                  <Icon name={m.icon} size={18} className={a.text} />
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm font-bold ${a.text}`}>{m.labelAr}</span>
                    <span className="block text-[10px] text-gray-500 font-mono">{m.labelEn}</span>
                  </span>
                  {isCurrent && (
                    <span className="text-[9px] font-bold text-brand-yellow bg-brand-yellow/15 rounded px-1.5 py-0.5 animate-pulse">
                      الآن
                    </span>
                  )}
                  <span className="text-[10px] text-gray-500 tabular-nums">{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {moduleFilter && (
          <button
            type="button"
            onClick={() => setModuleFilter(null)}
            className="mt-2 w-full text-[11px] text-gray-400 hover:text-white border border-white/10 rounded-lg py-1.5"
          >
            إظهار كل المراحل
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onOpenMatrix}
        className="w-full flex items-center justify-center gap-2 rounded-2xl border border-brand-yellow/40 bg-brand-yellow/10 text-brand-yellow px-3 py-2.5 text-sm font-bold hover:bg-brand-yellow/20 transition-colors"
      >
        <Icon name="clipboardList" size={16} /> مصفوفة الـ21 نموذج
      </button>
    </aside>
  );
}

function PipelineStepper({ state, viewId, setViewId, moduleFilter }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-2 overflow-x-auto pb-2 lg:flex-wrap lg:overflow-visible">
        {STAGES.map((stage, i) => {
          const st = state.stages[stage.id];
          const isCurrent = state.currentStage === stage.id;
          const isView = viewId === stage.id;
          const locked = st.status === 'locked';
          const dimmed = moduleFilter && !stage.modules.includes(moduleFilter);
          const tone = st.done ? 'done' : locked ? 'locked' : 'pending';
          const t = TONE[tone];
          return (
            <React.Fragment key={stage.id}>
              {i > 0 && <span className="text-gray-700 shrink-0 select-none">←</span>}
              <button
                type="button"
                disabled={locked}
                onClick={() => !locked && setViewId(stage.id)}
                aria-current={isView}
                className={`relative shrink-0 w-[112px] rounded-xl border px-2 py-2 text-center transition-all ${
                  isView ? 'border-brand-yellow ring-2 ring-brand-yellow/40 bg-white/[0.06]' : t.chip
                } ${locked ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer hover:-translate-y-0.5'} ${
                  dimmed ? 'opacity-30 grayscale' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-lg leading-none">{stage.icon}</span>
                  <span className="text-[10px] font-mono font-bold text-gray-400">{stage.num}</span>
                </div>
                <div className="text-[11px] font-bold leading-tight text-gray-100 line-clamp-2 min-h-[28px]">
                  {stage.titleAr}
                </div>
                <div className="mt-1 flex items-center justify-center gap-1">
                  {st.done ? (
                    <span className="text-[10px] font-bold text-green-400">✓ مكتمل</span>
                  ) : locked ? (
                    <span className="text-[10px] text-gray-500">🔒 مقفل</span>
                  ) : (
                    <span className="text-[10px] font-bold text-brand-yellow">● نشط</span>
                  )}
                </div>
                {isCurrent && !st.done && (
                  <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-brand-yellow rounded-full ring-2 ring-brand-navy animate-pulse" />
                )}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

/* Per-stage interactive controls (only shown for the active, not-yet-done stage). */
function StageControls({ stage, state, dispatch }) {
  const o = state.order;

  if (stage.id === 'grn') {
    return (
      <div className="rounded-xl border border-teal-400/30 bg-teal-400/5 p-4 space-y-3">
        <div className="flex items-center gap-2 text-teal-300 font-bold text-sm">
          <span>🔬</span> بوابة الجودة (QC) — القاعدة: لا Done قبل الاعتماد
        </div>
        <p className="text-xs text-gray-400">
          الكمية المستلمة: <b className="text-gray-200">{o.orderedQty}</b> {o.product.uom} · رقم الدفعة يُدخل عند
          المسح. الحالة الحالية للاستلام تنتظر قرار مفتش الجودة.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => dispatch({ type: 'SET_QC', result: 'passed' })}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
              o.qcResult === 'passed'
                ? 'bg-green-600 text-white'
                : 'border border-green-500/50 text-green-400 hover:bg-green-500/10'
            }`}
          >
            ✓ اعتماد الجودة (Passed)
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'SET_QC', result: 'failed' })}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
              o.qcResult === 'failed'
                ? 'bg-brand-red text-white'
                : 'border border-brand-red/50 text-brand-red hover:bg-brand-red/10'
            }`}
          >
            ✕ رفض (Failed → حجر)
          </button>
          {o.qcResult && (
            <span className="self-center text-xs text-gray-400">
              النتيجة: <b className={o.qcResult === 'passed' ? 'text-green-400' : 'text-brand-red'}>
                {STATUS_META[o.qcResult].labelAr}
              </b>
            </span>
          )}
        </div>
      </div>
    );
  }

  if (stage.id === 'picking') {
    const lots = [...o.lots].sort((a, b) => a.expiry.localeCompare(b.expiry));
    return (
      <div className="rounded-xl border border-brand-yellow/30 bg-brand-yellow/5 p-4 space-y-3">
        <div className="flex items-center gap-2 text-brand-yellow font-bold text-sm">
          <span>⏳</span> اختيار الدفعة (FEFO) — الأقرب انتهاءً يخرج أولاً
        </div>
        <div className="space-y-2">
          {lots.map((lot, i) => {
            const picked = o.pickedLot === lot.lot;
            const isFefo = lot.lot === o.fefoLot;
            return (
              <button
                key={lot.lot}
                type="button"
                onClick={() => dispatch({ type: 'PICK_LOT', lot: lot.lot })}
                className={`w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-right transition-all ${
                  picked
                    ? isFefo
                      ? 'border-green-500 bg-green-500/10'
                      : 'border-brand-red bg-brand-red/10'
                    : 'border-white/10 hover:border-white/30 bg-white/[0.02]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      picked ? (isFefo ? 'border-green-500' : 'border-brand-red') : 'border-gray-500'
                    }`}
                  >
                    {picked && <span className={`w-2 h-2 rounded-full ${isFefo ? 'bg-green-500' : 'bg-brand-red'}`} />}
                  </span>
                  <span className="font-mono font-bold text-gray-100">{lot.lot}</span>
                  {i === 0 && (
                    <span className="text-[9px] font-bold text-green-400 bg-green-500/15 rounded px-1.5 py-0.5">
                      FEFO ✓
                    </span>
                  )}
                </span>
                <span className="text-xs text-gray-400">
                  الكمية {lot.qty} · انتهاء <b className="text-gray-200">{lot.expiry}</b>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (stage.id === 'dispatch') {
    return (
      <div className="rounded-xl border border-brand-red/30 bg-brand-red/5 p-4 space-y-3">
        <div className="flex items-center gap-2 text-brand-red font-bold text-sm">
          <span>🚧</span> تصريح خروج البوابة (Gate Pass) — إلزامي قبل الشحن
        </div>
        <div className="text-xs text-gray-400 space-y-1">
          <div>
            إذن التسليم: <b className="text-gray-200 font-mono">{o.deliveryNoteNo || '—'}</b>
          </div>
          <div>
            حالة التصريح:{' '}
            {o.gatePassApproved ? (
              <b className="text-green-400 font-mono">{o.gatePassNo} — معتمد ✓</b>
            ) : (
              <b className="text-brand-red">غير معتمد</b>
            )}
          </div>
        </div>
        <button
          type="button"
          disabled={o.gatePassApproved}
          onClick={() => dispatch({ type: 'APPROVE_GATEPASS' })}
          className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
            o.gatePassApproved
              ? 'bg-green-600/20 text-green-400 cursor-default'
              : 'bg-brand-red text-white hover:bg-brand-red-dark'
          }`}
        >
          {o.gatePassApproved ? '✓ التصريح معتمد' : 'اعتماد تصريح الخروج وربطه بإذن التسليم'}
        </button>
      </div>
    );
  }

  if (stage.id === 'cyclecount') {
    return (
      <div className="rounded-xl border border-white/15 bg-white/[0.03] p-4 space-y-3">
        <div className="flex items-center gap-2 text-gray-100 font-bold text-sm">
          <span>🔢</span> إدخال العدّ الفعلي — الأرصدة مُجمَّدة
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="text-xs text-gray-400">
            رصيد النظام
            <div className="text-xl font-bold text-gray-100 tabular-nums">{o.systemQty}</div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">العدّ الفعلي</label>
            <input
              type="number"
              value={o.countedQty ?? ''}
              onChange={(e) => dispatch({ type: 'SET_COUNT', value: e.target.value })}
              placeholder="أدخل العدد"
              className="w-32 bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-brand-yellow"
            />
          </div>
          {o.countedQty != null && (
            <div className="text-xs text-gray-400">
              الفارق
              <div
                className={`text-xl font-bold tabular-nums ${
                  o.adjustmentQty === 0 ? 'text-green-400' : 'text-brand-yellow'
                }`}
              >
                {o.adjustmentQty > 0 ? `+${o.adjustmentQty}` : o.adjustmentQty}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (stage.id === 'adjustment') {
    const diff = o.adjustmentQty;
    return (
      <div className="rounded-xl border border-white/15 bg-white/[0.03] p-4 space-y-2">
        <div className="flex items-center gap-2 text-gray-100 font-bold text-sm">
          <span>⚖️</span> سند تسوية المخزون — يُنشئ قيداً محاسبياً تلقائياً
        </div>
        {diff == null ? (
          <p className="text-xs text-brand-yellow">أكمل الجرد الدوري (المرحلة 09) أولاً لتحديد الفارق.</p>
        ) : (
          <p className="text-sm text-gray-300">
            الفارق المعتمد للتسوية:{' '}
            <b className={diff === 0 ? 'text-green-400' : 'text-brand-yellow'}>
              {diff > 0 ? `+${diff}` : diff} {o.product.uom}
            </b>{' '}
            {diff === 0 ? '(لا فروقات — تطابق تام)' : '— يحتاج اعتماد المدير المالي.'}
          </p>
        )}
      </div>
    );
  }

  if (stage.id === 'match') {
    const expected = o.poTotal;
    const cols = [
      { k: 'PO', labelAr: 'أمر الشراء', val: `${o.orderedQty} × ${o.unitPrice}`, sub: fmt(o.poTotal) },
      { k: 'GRN', labelAr: 'المستلم فعلياً', val: `${o.receivedQty ?? '—'} ${o.product.uom}`, sub: 'كمية الاستلام' },
      { k: 'Bill', labelAr: 'فاتورة المورد', val: 'أدخل المبلغ', sub: 'من المورد الخارجي' },
    ];
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 space-y-3">
        <div className="flex items-center gap-2 text-green-400 font-bold text-sm">
          <span>⚖️</span> المطابقة الثلاثية (3-Way Match): PO + GRN + Bill
        </div>
        <div className="grid grid-cols-3 gap-2">
          {cols.map((c) => (
            <div key={c.k} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-center">
              <div className="text-[10px] font-mono font-bold text-gray-400">{c.k}</div>
              <div className="text-[11px] text-gray-300">{c.labelAr}</div>
              {c.k === 'Bill' ? (
                <input
                  type="number"
                  value={o.billAmount ?? ''}
                  onChange={(e) => dispatch({ type: 'SET_BILL', value: e.target.value })}
                  placeholder="0"
                  className="mt-1 w-full bg-white/5 border border-white/20 rounded px-2 py-1 text-center text-gray-100 text-sm focus:outline-none focus:border-green-400"
                />
              ) : (
                <div className="mt-1 text-sm font-bold text-gray-100">{c.val}</div>
              )}
              <div className="text-[10px] text-gray-500 mt-0.5">{c.sub}</div>
            </div>
          ))}
        </div>
        {o.billAmount != null && (
          <div
            className={`text-xs font-bold rounded-lg px-3 py-2 ${
              o.billMatched ? 'bg-green-500/15 text-green-400' : 'bg-brand-red/15 text-brand-red'
            }`}
          >
            {o.billMatched
              ? `✓ تطابق تام — المبلغ ${fmt(o.billAmount)} يساوي قيمة PO وكمية GRN. يمكن الترحيل والدفع.`
              : `✕ عدم تطابق — المتوقع ${fmt(expected)}. النظام يوقف الدفع تلقائياً حتى المطابقة.`}
          </div>
        )}
      </div>
    );
  }

  return null;
}

function StageDetail({ stage, state, dispatch, onOpenForm, allDone }) {
  const st = state.stages[stage.id];
  const isActive = stage.id === state.currentStage && !st.done;
  const a = MOD_ACCENT[MODULES.find((m) => m.id === stage.module)?.accent] || MOD_ACCENT.gold;
  const stageForms = FORMS.filter((f) => f.stageId === stage.id);

  const flow = stage.flow;
  const idx = flow.indexOf(st.status);
  const nextLabel =
    idx === flow.length - 1
      ? 'إتمام المرحلة ▸ فتح التالية'
      : flow[idx + 1] === flow[flow.length - 1]
        ? `${STATUS_META[flow[idx + 1]].labelAr} ▸ إتمام المرحلة`
        : `التالي: ${STATUS_META[flow[idx + 1]].labelAr}`;

  return (
    <div className={`rounded-2xl border ${a.ring} bg-white/[0.03] p-5 space-y-4`}>
      {/* head */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <span className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${a.soft}`}>
            {stage.icon}
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-gray-100">
                {stage.num} · {stage.titleAr}
              </h3>
              {stage.modules.map((m) => {
                const acc = MOD_ACCENT[MODULES.find((x) => x.id === m)?.accent];
                return (
                  <span key={m} className={`text-[10px] font-bold rounded px-1.5 py-0.5 border ${acc.ring} ${acc.text}`}>
                    {MODULES.find((x) => x.id === m)?.labelAr}
                  </span>
                );
              })}
            </div>
            <div className="text-xs text-gray-400 font-mono">{stage.titleEn}</div>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${
            TONE[st.done ? 'done' : st.status === 'locked' ? 'locked' : STATUS_META[st.status].tone].chip
          }`}
        >
          {STATUS_META[st.done ? flow[flow.length - 1] : st.status].labelAr}
        </span>
      </div>

      <p className="text-sm text-gray-300 leading-relaxed">{stage.descAr}</p>

      {/* status flow */}
      <div>
        <div className="text-[11px] font-bold text-gray-500 mb-1.5">دورة حياة الحالة (من المرجع)</div>
        <FlowTrack stage={stage} st={st} />
      </div>

      {/* odoo path */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-500">المسار في أودو:</span>
        <code className="font-mono text-brand-yellow bg-black/30 rounded px-2 py-0.5">{stage.odooPath}</code>
      </div>

      {/* interactive controls */}
      {isActive && <StageControls stage={stage} state={state} dispatch={dispatch} />}

      {/* linked forms */}
      {stageForms.length > 0 && (
        <div>
          <div className="text-[11px] font-bold text-gray-500 mb-1.5">النماذج الرسمية في هذه المرحلة</div>
          <div className="flex flex-wrap gap-2">
            {stageForms.map((f) => (
              <button
                key={f.n}
                type="button"
                onClick={() => onOpenForm(f)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-gray-200 hover:border-brand-yellow hover:text-brand-yellow transition-colors"
              >
                <span className="font-mono text-[10px] text-gray-500">#{f.n}</span>
                {f.titleAr}
                <Icon name="externalLink" size={12} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* action button */}
      {isActive ? (
        <button
          type="button"
          onClick={() => dispatch({ type: 'ADVANCE' })}
          className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-brand-red text-white px-6 py-2.5 font-bold shadow hover:bg-brand-red-dark active:scale-95 transition-all`}
        >
          {nextLabel} <span aria-hidden>◀</span>
        </button>
      ) : st.done ? (
        <div className="inline-flex items-center gap-2 text-green-400 font-bold text-sm">
          <span>✓</span> مرحلة مكتملة — يمكنك مراجعتها أو الانتقال للمرحلة النشطة.
        </div>
      ) : (
        <div className="inline-flex items-center gap-2 text-gray-500 font-bold text-sm">
          <span>🔒</span> مقفلة — أكمل المراحل السابقة لفتحها.
        </div>
      )}

      {allDone && stage.id === 'close' && (
        <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-4 text-center">
          <div className="text-2xl mb-1">🎉</div>
          <div className="text-green-400 font-bold">اكتملت الدورة المستندية الكاملة (12/12)</div>
          <div className="text-xs text-gray-400 mt-1">أُغلقت الفترة المالية. اضغط «إعادة ضبط» لتكرار التدريب.</div>
        </div>
      )}
    </div>
  );
}

/* Modal to preview one of the 21 forms (its real mock HTML) in an iframe. */
function FormModal({ form, formHref, onClose }) {
  if (!form) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="bg-brand-navy border border-white/15 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-xs text-gray-500">#{form.n}</span>
            <h4 className="font-bold text-gray-100 truncate">{form.titleAr}</h4>
            <span className="text-[11px] text-gray-500 font-mono hidden sm:inline">{form.titleEn}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {form.file && (
              <a
                href={formHref(form.file)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-brand-yellow hover:underline"
              >
                <Icon name="externalLink" size={13} /> فتح في تبويب
              </a>
            )}
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10" aria-label="إغلاق">
              <Icon name="close" size={18} className="text-gray-300" />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 bg-white">
          {form.file ? (
            <iframe src={formHref(form.file)} title={form.titleAr} className="w-full h-full border-0" loading="lazy" />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-600">
              <div className="text-4xl mb-3">📡</div>
              <p className="font-bold">نموذج إلكتروني</p>
              <p className="text-sm mt-1">
                {form.titleAr} يُتبادل إلكترونياً مع المورد ({form.odooPath}) — لا يوجد له نموذج مطبوع.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* Modal listing the full 21-form matrix. */
function MatrixModal({ open, onClose, onOpenForm }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="bg-brand-navy border border-white/15 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.03]">
          <h4 className="font-bold text-gray-100">مصفوفة الـ21 نموذج الرسمي — الربط مع أودو</h4>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10" aria-label="إغلاق">
            <Icon name="close" size={18} className="text-gray-300" />
          </button>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-white/[0.04] text-gray-400 sticky top-0">
              <tr>
                <th className="px-3 py-2 font-bold">#</th>
                <th className="px-3 py-2 font-bold">النموذج</th>
                <th className="px-3 py-2 font-bold hidden sm:table-cell">الوحدة</th>
                <th className="px-3 py-2 font-bold hidden md:table-cell">المسار في أودو</th>
                <th className="px-3 py-2 font-bold">الحالة</th>
                <th className="px-3 py-2 font-bold text-center">عرض</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {FORMS.map((f) => {
                const meta = STATUS_META[f.finalStatus] || STATUS_META.done;
                return (
                  <tr key={f.n} className="hover:bg-white/[0.03]">
                    <td className="px-3 py-2 font-mono text-gray-500">{f.n}</td>
                    <td className="px-3 py-2">
                      <div className="font-bold text-gray-100">{f.titleAr}</div>
                      <div className="text-[10px] text-gray-500 font-mono">{f.titleEn}</div>
                    </td>
                    <td className="px-3 py-2 hidden sm:table-cell text-gray-300">{f.module}</td>
                    <td className="px-3 py-2 hidden md:table-cell font-mono text-[10px] text-gray-400">{f.odooPath}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${TONE[meta.tone].chip}`}>
                        {meta.labelAr}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => onOpenForm(f)}
                        className="text-brand-yellow hover:underline font-bold"
                        aria-label={`عرض ${f.titleAr}`}
                      >
                        <Icon name="externalLink" size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── main component ─────────────────────── */
export default function OdooTrainingConsole() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const [viewId, setViewId] = useState('pr');
  const [moduleFilter, setModuleFilter] = useState(null);
  const [openForm, setOpenForm] = useState(null);
  const [showMatrix, setShowMatrix] = useState(false);

  // Keep the detail panel on the active stage as the cycle advances.
  useEffect(() => {
    setViewId(state.currentStage);
  }, [state.currentStage]);

  // Escape closes any open modal.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpenForm(null);
        setShowMatrix(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const formHref = (file) => `${BASE}/forms/${encodeURI(file)}`;

  const doneCount = Object.values(state.stages).filter((s) => s.done).length;
  const allDone = doneCount === STAGES.length;
  const viewStage = STAGES.find((s) => s.id === viewId);
  const o = state.order;

  const alertTone =
    state.alert?.kind === 'error'
      ? 'bg-brand-red/15 border-brand-red/50 text-brand-red'
      : state.alert?.kind === 'warn'
        ? 'bg-brand-yellow/15 border-brand-yellow/50 text-brand-yellow'
        : 'bg-green-500/15 border-green-500/50 text-green-400';

  return (
    <div className="text-right" dir="rtl">
      {/* header */}
      <header className="mb-5 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-100">وضع التدريب — محاكي دورة مستندات Odoo</h2>
          <p className="text-gray-400 mt-1 text-sm max-w-2xl leading-relaxed">
            محاكاة تفاعلية لدورة Brandzo Hub المستندية الكاملة (12 مرحلة، 21 نموذجاً رسمياً). أكمل كل مرحلة لفتح
            التالية — والنظام يمنعك عند مخالفة أي قاعدة ذهبية. بيانات وهمية بالكامل، بلا اتصال حقيقي بـ Odoo.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-yellow/15 text-brand-yellow border border-brand-yellow/40 px-3 py-1.5 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-brand-yellow animate-pulse" />
            TRAINING
          </span>
          <button
            type="button"
            onClick={() => dispatch({ type: 'RESET' })}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 text-gray-300 px-3 py-1.5 text-sm font-bold hover:bg-white/5"
          >
            إعادة ضبط
          </button>
        </div>
      </header>

      {/* order context */}
      <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <span className="text-gray-500">المنتج التجريبي:</span>
        <span className="font-mono font-bold text-brand-red">{o.product.sku}</span>
        <span className="font-bold text-gray-100">{o.product.nameAr}</span>
        <span className="text-gray-400">{o.product.category}</span>
        <span className="text-gray-500">·</span>
        <span className="text-gray-400">
          المورد: <b className="text-gray-200">{o.supplier}</b>
        </span>
        <span className="text-gray-400">
          PO: <b className="font-mono text-gray-200">{o.poNumber}</b>
        </span>
        <span className="text-gray-400">
          الكمية: <b className="text-gray-200">{o.orderedQty}</b> {o.product.uom}
        </span>
        <span className="text-gray-400">
          القيمة: <b className="text-gray-200">{fmt(o.poTotal)}</b>
        </span>
      </div>

      {/* golden rules */}
      <div className="mb-4">
        <GoldenRulesStrip />
      </div>

      {/* progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
          <span>تقدّم الدورة</span>
          <span dir="ltr" className="font-bold text-gray-200 tabular-nums inline-block">
            {doneCount} / {STAGES.length}
          </span>
        </div>
        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full bg-gradient-to-l from-green-500 via-brand-yellow to-brand-red transition-all duration-500"
            style={{ width: `${(doneCount / STAGES.length) * 100}%` }}
          />
        </div>
      </div>

      {/* alert */}
      {state.alert && (
        <div className={`mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 ${alertTone}`}>
          <Icon name="alertTriangle" size={18} className="mt-0.5 shrink-0" />
          <p className="text-sm font-bold flex-1 leading-relaxed">{state.alert.text}</p>
          <button
            type="button"
            onClick={() => dispatch({ type: 'DISMISS_ALERT' })}
            className="shrink-0 opacity-70 hover:opacity-100"
            aria-label="إغلاق التنبيه"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      {/* body */}
      <div className="flex flex-col lg:flex-row gap-5">
        <ModuleSidebar
          state={state}
          moduleFilter={moduleFilter}
          setModuleFilter={setModuleFilter}
          onOpenMatrix={() => setShowMatrix(true)}
        />
        <div className="flex-1 min-w-0 space-y-5">
          <PipelineStepper state={state} viewId={viewId} setViewId={setViewId} moduleFilter={moduleFilter} />
          <StageDetail
            stage={viewStage}
            state={state}
            dispatch={dispatch}
            onOpenForm={setOpenForm}
            allDone={allDone}
          />
        </div>
      </div>

      <FormModal form={openForm} formHref={formHref} onClose={() => setOpenForm(null)} />
      <MatrixModal
        open={showMatrix}
        onClose={() => setShowMatrix(false)}
        onOpenForm={(f) => {
          setShowMatrix(false);
          setOpenForm(f);
        }}
      />
    </div>
  );
}
