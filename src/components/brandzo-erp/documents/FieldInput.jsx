/**
 * حقل واحد يُرسم من وصفه في المخطّط — لا كود خاصّ بأي نموذج.
 *
 * الأنواع: text · number · date · datetime · select · textarea · boolean
 *          computed (محسوب — لا يُكتب) · identity (من الهوية — لا يُكتب)
 */
import { fieldValue } from '../../../services/documents/schemaUtils.js';

const BASE =
  'w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white ' +
  'placeholder:text-gray-500 focus:outline-none focus:border-brand-gold/60 disabled:opacity-60';

const READONLY = 'w-full bg-brand-gold/10 border border-brand-gold/30 rounded-lg px-3 py-2 text-sm text-brand-gold font-bold';

export default function FieldInput({ field, doc, onChange, disabled, violation }) {
  const value = fieldValue(field, doc);

  // المحسوب والمشتقّ من الهوية: يُعرضان ولا يُكتبان — وهذا نصف قيمة المحرّك.
  if (field.kind === 'computed' || field.kind === 'identity') {
    return (
      <Wrap field={field}>
        <div className={READONLY}>
          {value === '' || value == null ? '—' : String(value)}
          {field.kind === 'computed' && <span className="text-[10px] text-brand-gold/60 mr-2">محسوب</span>}
        </div>
      </Wrap>
    );
  }

  if (field.kind === 'boolean') {
    return (
      <label className="flex items-center gap-2 cursor-pointer py-2">
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(e) => onChange(field.key, e.target.checked)}
          className="w-4 h-4 accent-brand-gold"
        />
        <span className="text-sm text-gray-200">{field.label}</span>
      </label>
    );
  }

  if (field.kind === 'select') {
    return (
      <Wrap field={field}>
        <select
          className={BASE}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(field.key, e.target.value)}
        >
          <option value="">— اختر —</option>
          {(field.options || []).map((o) => (
            <option key={o} value={o} className="bg-brand-navy">
              {o}
            </option>
          ))}
        </select>
      </Wrap>
    );
  }

  if (field.kind === 'textarea') {
    return (
      <Wrap field={field}>
        <textarea
          className={`${BASE} min-h-[72px] resize-y`}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      </Wrap>
    );
  }

  const type =
    field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : field.kind === 'datetime' ? 'datetime-local' : 'text';

  return (
    <Wrap field={field} violation={violation}>
      <input
        type={type}
        step={field.step}
        className={`${BASE} ${violation ? 'border-brand-red ring-1 ring-brand-red/50' : ''}`}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(field.key, e.target.value)}
      />
    </Wrap>
  );
}

function Wrap({ field, violation, children }) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-300 mb-1.5">
        {field.label}
        {field.required && <span className="text-brand-red mr-1">*</span>}
      </label>
      {children}
      {violation && <p className="text-[11px] text-red-300 mt-1">⚠️ {violation}</p>}
      {!violation && field.hint && <p className="text-[11px] text-gray-500 mt-1">{field.hint}</p>}
    </div>
  );
}
