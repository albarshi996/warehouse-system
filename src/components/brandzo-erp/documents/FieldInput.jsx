/**
 * حقل واحد يُرسم من وصفه في المخطّط — لا كود خاصّ بأي نموذج.
 *
 * الأنواع: text · number · date · datetime · select · textarea · boolean
 *          computed (محسوب — لا يُكتب) · identity (من الهوية — لا يُكتب)
 */
import { fieldValue } from '../../../services/documents/schemaUtils.js';
import DocRefField from './DocRefField.jsx';

const BASE =
  'w-full bg-chip border border-line rounded-lg px-3 py-2 text-sm text-ink ' +
  'placeholder:text-gray-500 focus:outline-none focus:border-accent/60 disabled:opacity-60';

const READONLY = 'w-full bg-accent/10 border border-accent/30 rounded-lg px-3 py-2 text-sm text-accent font-bold';

export default function FieldInput({ field, doc, onChange, disabled, violation, onResolveParent, onRequestCreate }) {
  const value = fieldValue(field, doc);

  // مرجع مستنديّ: تعرّفٌ تلقائيّ وربطٌ بالرقم (المحور ٦) — مكوّن مخصّص.
  if (field.kind === 'docref') {
    return (
      <DocRefField
        field={field}
        doc={doc}
        value={value}
        onChange={onChange}
        disabled={disabled}
        onResolveParent={onResolveParent}
        onRequestCreate={onRequestCreate}
      />
    );
  }

  // المحسوب والمشتقّ من الهوية: يُعرضان ولا يُكتبان — وهذا نصف قيمة المحرّك.
  if (field.kind === 'computed' || field.kind === 'identity') {
    return (
      <Wrap field={field}>
        <div className={READONLY}>
          {value === '' || value == null ? '—' : String(value)}
          {field.kind === 'computed' && <span className="text-[10px] text-accent/60 mr-2">محسوب</span>}
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
          className="w-4 h-4 accent-accent"
        />
        <span className="text-sm text-ink-2">{field.label}</span>
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
            <option key={o} value={o} className="bg-surface">
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
      <label className="block text-xs font-bold text-ink-2 mb-1.5">
        {field.label}
        {field.required && <span className="text-brand-red mr-1">*</span>}
      </label>
      {children}
      {violation && <p className="text-[11px] text-red-300 mt-1">⚠️ {violation}</p>}
      {!violation && field.hint && <p className="text-[11px] text-gray-500 mt-1">{field.hint}</p>}
    </div>
  );
}
