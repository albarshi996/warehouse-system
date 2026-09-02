import Icon from '../../ui/Icon.jsx';
import {
  addressLabel,
  bindingProblems,
  codeFromAddress,
  codingProgress,
  currentStep,
} from '../../../services/locations/binCoding.js';

/**
 * ويزارد تكويد المواقع ‹LOC-708› — «الباركودُ يُربط بعنوانه، ولا يُفترض»
 * (طلب المالك 2026-09-02).
 *
 * ═══ ولماذا خطوةٌ واحدةٌ في الشاشة ═══
 * الموظّفُ يمشي في ممرٍّ بيدٍ فيها جهاز، وفوق رأسه رفوف. وشاشةٌ فيها أربعةُ
 * حقولٍ دفعةً تُربكه ويخطئ فيها. فسؤالٌ واحدٌ بأزرارٍ كبيرةٍ يُجاب بإبهامٍ
 * واحد — «الممرّ؟» ثمّ «الجهة؟» ثمّ «المستوى؟» ثمّ «الخانة؟».
 *
 * ═══ ولا منطقَ هنا ═══
 * الخطواتُ وخياراتُها وحكمُ التصادم كلُّها في `binCoding.js` الخالص المُختبَر،
 * وهذه الشاشةُ عرضٌ له.
 */
export default function BinCodingWizard({
  barcode = '',
  warehouse,
  warehouses = [],
  onWarehouseChange,
  steps = [],
  address = {},
  onPick,
  onBack,
  onConfirm,
  onCancel,
  locations = [],
  suggested = '',
  busy = '',
  manual = false,
  capturedBarcode = '',
  onBarcodeChange,
  scanButton = null,
}) {
  const at = currentStep(address, steps);
  const done = at < 0 && steps.length > 0;
  const prefix = String(warehouse?.binPrefix || warehouse?.code || '').toUpperCase();
  const code = done ? codeFromAddress(prefix, address, steps) : '';
  /**
   * ★★ الملصقُ الفاعل: في مسار «امسح أوّلًا» هو الممسوح، وفي مسار «ابدأ
   * بالعنوان» هو ما التُقط في الخطوة الأخيرة. وقد لا يوجد — فتُفتح الخانةُ
   * بلا ربط، وهذا مشروع.
   */
  const label = manual ? capturedBarcode : barcode;
  const problems = done && label ? bindingProblems({ barcode: label, code, locations }) : [];
  const progress = codingProgress(locations, prefix);
  const num = (n) => new Intl.NumberFormat('en-US').format(Number(n) || 0);

  return (
    <section className="o_ds o_ds_card o_ds_pad space-y-4 border border-accent/40">
      {/* ═══ الترويسة: ما نكوّده، وأين وصل التكويد ═══ */}
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="mapPin" size={16} className="text-accent" />
        <h3 className="font-bold text-ink text-sm">
          {manual ? 'اختر الموقع يدويًّا' : 'موقعٌ جديد — حدّد عنوانه'}
        </h3>
        {progress.total > 0 && (
          <span className="text-[11px] text-muted">
            كُوِّد {num(progress.bound)} من {num(progress.total)} · بقي {num(progress.remaining)}
          </span>
        )}
      </div>

      {!manual && (
        <div className="text-xs text-ink-2">
          الباركود المقروء:{' '}
          <span className="font-mono font-bold text-ink" style={{ direction: 'ltr', display: 'inline-block' }}>{barcode}</span>
          {' — '}لم يُربط بموقعٍ بعد.
        </div>
      )}

      {/* المستودع: يُسأل حين لا يدلّ عليه الباركود. */}
      {warehouses.length > 1 && (
        <label className="block max-w-xs">
          <span className="block text-[11px] font-bold text-ink-2 mb-1">المستودع</span>
          <select
            value={warehouse?.id || ''}
            onChange={(e) => onWarehouseChange?.(e.target.value)}
            className="w-full bg-surface border border-line rounded-lg text-ink text-sm px-2.5 py-2"
          >
            {warehouses.map((w) => (
              <option key={w.id || w.code} value={w.id || w.code}>{w.nameAr || w.name || w.code}</option>
            ))}
          </select>
        </label>
      )}

      {steps.length === 0 ? (
        <div className="text-xs text-brand-red">
          هذا المستودع بلا قالب ترقيم — عرّفه في بانية مواقع التخزين قبل التكويد.
        </div>
      ) : (
        <>
          {/* ═══ مسارُ ما اختير — يُضغط للرجوع إليه ═══ */}
          {Object.keys(address).length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              {steps.map((s, i) => {
                const v = address[s.key];
                if (!v) return null;
                const opt = s.options.find((o) => o.value === v);
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => onBack?.(i)}
                    className="btn-secondary text-[11px]"
                    title={`ارجع إلى «${s.label}»`}
                  >
                    {s.label} <strong>{opt?.text ?? v}</strong>
                  </button>
                );
              })}
              {suggested === 'barcode' && (
                <span className="text-[11px] text-muted">مقترَحٌ من الباركود — غيّرْه إن لم يطابق</span>
              )}
              {suggested === 'sequence' && (
                <span className="text-[11px] text-muted">التالي بعد آخر ما ربطتَه — راجعْه قبل التأكيد</span>
              )}
            </div>
          )}

          {/* ═══ السؤالُ الواحد ═══ */}
          {!done && (
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] text-muted">خطوة {num(at + 1)} من {num(steps.length)}</span>
                <span className="text-base font-bold text-ink">{steps[at].label}؟</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {steps[at].options.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => onPick?.(steps[at].key, o.value)}
                    className="btn-secondary"
                    style={{ minWidth: '64px', padding: '10px 14px', fontSize: '15px' }}
                  >
                    {o.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ═══ الخطوةُ الأخيرة في مسار «ابدأ بالعنوان»: ألصق الباركود ═══ */}
          {done && manual && (
            <div className="space-y-2 pt-1 border-t border-line">
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] text-muted">خطوة {num(steps.length + 1)} من {num(steps.length + 1)}</span>
                <span className="text-base font-bold text-ink">باركود الملصق؟</span>
              </div>
              <p className="text-[11px] text-muted">
                امسح الملصق الجاهز أو اكتب رقمه — أو اترك الحقل فارغًا وافتح الخانة بلا ربط.
              </p>
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  value={capturedBarcode}
                  onChange={(e) => onBarcodeChange?.(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                  placeholder="امسح أو اكتب"
                  autoComplete="off"
                  style={{ direction: 'ltr', textAlign: 'right' }}
                  className="bg-surface border border-line rounded-lg text-ink text-sm px-2.5 py-2 font-mono flex-1 min-w-[180px]"
                />
                {scanButton}
                {capturedBarcode && (
                  <button type="button" onClick={() => onBarcodeChange?.('')} className="btn-secondary text-[11px]">
                    امسح الحقل
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ═══ التأكيد ═══ */}
          {done && (
            <div className="space-y-2 pt-1 border-t border-line">
              <div className="text-sm text-ink-2">
                {label ? 'سيرتبط هذا الباركود نهائيًّا بـ:' : 'ستفتح الموقع:'}
              </div>
              <div className="text-sm font-bold text-ink">
                {warehouse?.nameAr || warehouse?.name || prefix} · {addressLabel(address, steps)}
              </div>
              <div className="font-mono text-[11px] text-muted" style={{ direction: 'ltr' }}>{code}</div>
              {label && (
                <div className="text-xs text-ink-2">
                  الملصق:{' '}
                  <span className="font-mono font-bold text-ink" style={{ direction: 'ltr', display: 'inline-block' }}>{label}</span>
                </div>
              )}

              {problems.length > 0 ? (
                <ul className="text-xs text-brand-red space-y-1 list-none p-0">
                  {problems.map((p, i) => <li key={i}>• {p}</li>)}
                </ul>
              ) : null}

              <div className="flex flex-wrap gap-2 items-center">
                <button
                  type="button"
                  onClick={() => onConfirm?.(code)}
                  disabled={Boolean(busy) || problems.length > 0}
                  className="btn-primary text-xs"
                >
                  {busy || (label ? 'اربط وافتح الخانة' : 'افتح بلا ربط')}
                </button>
                <button type="button" onClick={() => onBack?.(steps.length - 1)} className="btn-secondary text-xs">
                  غيّر {steps[steps.length - 1].label}
                </button>
                <button type="button" onClick={onCancel} className="btn-secondary text-xs">إلغاء</button>
              </div>
            </div>
          )}

          {!done && (
            <div className="flex gap-2">
              {at > 0 && (
                <button type="button" onClick={() => onBack?.(at - 1)} className="btn-secondary text-xs">رجوع</button>
              )}
              <button type="button" onClick={onCancel} className="btn-secondary text-xs">إلغاء</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
