/**
 * شجرة مواقع التخزين — تبويبٌ داخل شاشة المستودعات لا صفحةٌ ثانية.
 *
 * لماذا هنا؟ المواقع تخصّ ماستر المستودعات، و«صفحةٌ فوق صفحة» قاعدةٌ رفضها
 * المالك: إعادةُ تأهيل شاشةٍ دمجٌ بمنطقٍ واحد على الرابط الأصليّ لا نسخةٌ
 * ثانية على مسارٍ آخر.
 *
 * الإشغال يُحسب من **الأرصدة الحيّة** لا من حقلٍ يدويّ — حقلٌ يُملأ باليد
 * يفترق عن الواقع أوّل حركة، فيقترح النظام رفًّا ممتلئًا ويمنع رفًّا فارغًا.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import Badge from '../../odoo/Badge.jsx';
import { getBasePath } from '../../../services/auth/authService.js';
import { listenLocations, saveLocation, archiveLocation, canEditLocations } from '../../../services/locations/locationsService.js';
import { listenBalances } from '../../../services/balances/balancesService.js';
import {
  HANDLING_TYPES,
  LOCATION_STATUSES,
  STORAGE_TYPES,
  buildLocationTree,
  declaredHandling,
  handlingLabel,
  locationProblems,
  occupancyOf,
} from '../../../services/locations/locationsModel.js';
import { shortLabelOf } from '../../../services/locations/locationCode.js';

const EMPTY = {
  code: '',
  nameAr: '',
  status: 'active',
  storageType: 'ambient',
  // ★ «مختلط» و«صفر» هما حالُ كلّ موقعٍ قائم: نموذجٌ فارغٌ لا يُقيّد شيئًا،
  // فالتقييدُ يُختار ولا يُفترض.
  handling: 'mixed',
  capacity: { qty: 0, pallets: 0 },
  mixItems: true,
  mixBatches: true,
};

export default function LocationTree({ role }) {
  const [locations, setLocations] = useState([]);
  const [balances, setBalances] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [term, setTerm] = useState('');
  const [printing, setPrinting] = useState(null);
  const canEdit = canEditLocations(role);

  useEffect(() => listenLocations(setLocations, () => setLocations([])), []);
  useEffect(() => listenBalances(setBalances, () => setBalances([])), []);

  const occupancy = useMemo(() => {
    const map = new Map();
    for (const loc of locations) map.set(loc.code, occupancyOf(loc, balances));
    return map;
  }, [locations, balances]);

  const filtered = useMemo(() => {
    const t = term.trim().toUpperCase();
    if (!t) return locations;
    return locations.filter(
      (l) => String(l.code || '').includes(t) || String(l.nameAr || '').toUpperCase().includes(t)
    );
  }, [locations, term]);

  const tree = useMemo(() => buildLocationTree(filtered), [filtered]);

  async function submit(e) {
    e.preventDefault();
    const problems = locationProblems(form);
    if (problems.length) {
      setMsg({ type: 'error', text: problems[0] });
      return;
    }
    try {
      await saveLocation(form, { name: role });
      setMsg({ type: 'success', text: `حُفظ الموقع ${form.code}` });
      setForm(EMPTY);
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'تعذّر الحفظ.' });
    }
  }

  async function archive(code) {
    try {
      await archiveLocation(code, { name: role });
      setMsg({ type: 'success', text: `أُرشف الموقع ${code} — لم يُحذف، وأثره التاريخيّ باقٍ.` });
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'تعذّرت الأرشفة.' });
    }
  }

  return (
    <div dir="rtl">
      <p style={{ fontSize: 'var(--o-font-size-sm)', color: 'var(--o-main-color-muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
        كود الموقع الكامل هو هويّته (<span style={{ direction: 'ltr', display: 'inline-block' }}>RH-A-R-01-01</span>)،
        <strong> ويراه العامل كما هو</strong> — نفسَ المطبوع على الملصق، فلا اسمان لشيءٍ واحد.
        الوصف والسعة والقواعد تُعدَّل؛ والكود لا يُغيَّر بعد أوّل حركة — يُؤرشَف ويُنشأ بديل.
      </p>

      {msg.text && (
        <div className={`o_alert ${msg.type === 'error' ? 'danger' : 'success'}`} style={{ marginBottom: '14px' }}>
          {msg.text}
        </div>
      )}

      {canEdit && (
        <form onSubmit={submit} className="o_ds_card o_ds_pad" style={{ marginBottom: '18px' }}>
          <h3 className="o_form_title" style={{ fontSize: '18px', marginTop: 0 }}>إضافة موقع أو تعديله</h3>
          <p style={{ fontSize: '12px', color: 'var(--o-main-color-muted)', margin: '0 0 12px', lineHeight: 1.7 }}>
            <strong>نوع المناولة ومواضع الطبالي اختياريّان.</strong> اتركهما على «مختلط» و«صفر» يقبل الموقعُ
            <strong> أيّ شيء</strong> — بالطبلية وبالصندوق وبالقطعة، وبلا سقفٍ لعدد الطبالي. وهو حالُ كلّ موقعٍ
            مسجَّلٍ اليوم؛ فالتقييد يُختار رفًّا رفًّا لمن قاس، ولا يُفترض على المستودع كلّه.
          </p>
          <div className="o_form_grid">
            <Field label="كود الموقع الكامل *">
              <input
                className="o_input"
                style={{ direction: 'ltr', textAlign: 'right' }}
                value={form.code}
                placeholder="MAIN-A01-R01"
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </Field>
            <Field label="الاسم">
              <input className="o_input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
            </Field>
            <Field label="الحالة">
              <select className="o_input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {Object.values(LOCATION_STATUSES).map((s) => (
                  <option key={s.id} value={s.id}>{s.labelAr}</option>
                ))}
              </select>
            </Field>
            <Field label="نوع التخزين">
              <select className="o_input" value={form.storageType} onChange={(e) => setForm({ ...form, storageType: e.target.value })}>
                {Object.values(STORAGE_TYPES).map((s) => (
                  <option key={s.id} value={s.id}>{s.labelAr}</option>
                ))}
              </select>
            </Field>
            {/*
              ★★★ نوعُ المناولة **بجانب** نوع التخزين لا داخله: ذاك يقول «أيّ
              حرارةٍ تصلح» وهذا يقول «كيف تُناوَل». ولو حُشرا في منسدلةٍ واحدة
              لَاستحال وصفُ «مجمَّدٍ يُخزَّن بالطبالي» — وهو أشيعُ ما في المستودع.
            */}
            <Field label="نوع المناولة">
              <select className="o_input" value={form.handling} onChange={(e) => setForm({ ...form, handling: e.target.value })}>
                {Object.values(HANDLING_TYPES).map((h) => (
                  <option key={h.id} value={h.id}>{h.labelAr}</option>
                ))}
              </select>
              <span style={{ fontSize: '11px', color: 'var(--o-main-color-muted)', lineHeight: 1.5 }}>
                {HANDLING_TYPES[form.handling]?.hint || ''}
              </span>
            </Field>
            <Field label="السعة (كمّية) — صفر يعني غير محدودة">
              <input
                type="number"
                className="o_input"
                value={form.capacity.qty}
                onChange={(e) => setForm({ ...form, capacity: { ...form.capacity, qty: e.target.value } })}
              />
            </Field>
            {/*
              ⚠️ ومواضعُ الطبالي غيرُ السعة الكمّيّة: تلك تعدّ ما في الرفّ وهذه
              تعدّ ما يقف فيه. ورفٌّ يسع ألفَ قطعةٍ قد لا يسع إلّا طبليّتين.
            */}
            <Field label="مواضع الطبالي — صفر يعني بلا سقف">
              <input
                type="number"
                className="o_input"
                value={form.capacity.pallets}
                onChange={(e) => setForm({ ...form, capacity: { ...form.capacity, pallets: e.target.value } })}
              />
            </Field>
            <Field label="سياسة الخلط">
              <div style={{ display: 'flex', gap: '14px', alignItems: 'center', paddingTop: '6px' }}>
                <label style={{ fontSize: '13px' }}>
                  <input type="checkbox" checked={form.mixItems} onChange={(e) => setForm({ ...form, mixItems: e.target.checked })} />{' '}
                  خلط الأصناف
                </label>
                <label style={{ fontSize: '13px' }}>
                  <input type="checkbox" checked={form.mixBatches} onChange={(e) => setForm({ ...form, mixBatches: e.target.checked })} />{' '}
                  خلط الدفعات
                </label>
              </div>
            </Field>
          </div>
          <div className="o_form_actions">
            <button type="submit" className="btn btn-primary"><Icon name="plus" size={15} /> حفظ الموقع</button>
            <button type="button" className="btn btn-secondary" onClick={() => setForm(EMPTY)}>مسح النموذج</button>
          </div>
        </form>
      )}

      <div className="o_ds_card o_ds_pad">
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
          <Icon name="search" size={15} />
          <input
            className="o_input"
            style={{ maxWidth: '320px' }}
            placeholder="ابحث بالكود أو الاسم"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <span style={{ fontSize: '12px', color: 'var(--o-main-color-muted)' }}>
            {locations.length} موقعًا مسجَّلًا
          </span>
        </div>

        {tree.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--o-main-color-muted)' }}>
            لا مواقع بعد. أضِف أوّل موقع، أو ابدأ بمنطقةٍ كاملة مثل <span style={{ direction: 'ltr' }}>MAIN-A01</span>.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {tree.map((node) => (
              <TreeNode
                key={node.code}
                node={node}
                depth={0}
                occupancy={occupancy}
                canEdit={canEdit}
                onEdit={setForm}
                onArchive={archive}
                onPrint={setPrinting}
              />
            ))}
          </ul>
        )}
      </div>

      {printing && <LabelSheet location={printing} onClose={() => setPrinting(null)} />}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="o_field">
      <label className="o_field_label">{label}</label>
      {children}
    </div>
  );
}

function TreeNode({ node, depth, occupancy, canEdit, onEdit, onArchive, onPrint }) {
  const loc = node.location;
  const occ = occupancy.get(node.code);
  const status = loc ? LOCATION_STATUSES[loc.status] : null;

  return (
    <li style={{ borderTop: depth === 0 ? 'none' : '1px solid var(--o-border-color)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', paddingRight: `${depth * 18}px` }}>
        <Icon name={node.children.length ? 'layers' : 'mapPin'} size={14} />
        <span style={{ direction: 'ltr', fontWeight: depth === 0 ? 700 : 500, fontSize: '13px' }}>{node.code}</span>

        {node.virtual ? (
          <Badge tone="muted">غير مسجَّل</Badge>
        ) : (
          <>
            {loc.nameAr && <span style={{ fontSize: '12px', color: 'var(--o-main-color-muted)' }}>{loc.nameAr}</span>}
            <span style={{ fontSize: '11px', color: 'var(--o-main-color-muted)', direction: 'ltr' }}>
              {shortLabelOf(node.code)}
            </span>
            {status && status.id !== 'active' && <Badge tone={status.id === 'archived' ? 'muted' : 'warning'}>{status.labelAr}</Badge>}
            {/* ★ لا شارةَ لـ«مختلط»: هو حالُ الأغلبية، وشارةٌ على كلّ سطرٍ ضجيجٌ
                يُخفي الاستثناء الذي وُضعت الشارةُ لأجله. */}
            {declaredHandling(loc) && <Badge variant="progress">{handlingLabel(declaredHandling(loc))}</Badge>}
            {occ && (
              <span style={{ fontSize: '11px', color: 'var(--o-main-color-muted)' }}>
                {occ.usedQty > 0 ? `مشغول: ${occ.usedQty}` : 'فارغ'}
                {occ.capacityQty !== null ? ` / ${occ.capacityQty} (${occ.pct}٪)` : ' — سعة غير محدودة'}
                {occ.capacityPallets !== null ? ` · ${occ.capacityPallets} موضع طبلية` : ''}
              </span>
            )}
            <span style={{ flex: 1 }} />
            <button type="button" className="btn btn-link" onClick={() => onPrint(loc)} title="طباعة ملصق الموقع">
              <Icon name="printer" size={14} />
            </button>
            {canEdit && (
              <>
                {/* ⚠️ السعةُ تُعاد بناؤها حقلًا حقلًا لا بالنشر: مقياسٌ يسقط هنا
                    يُكتب صفرًا عند الحفظ فيمحو سقفًا قِيس. */}
                <button
                  type="button"
                  className="btn btn-link"
                  onClick={() => onEdit({
                    ...EMPTY,
                    ...loc,
                    handling: loc.handling || EMPTY.handling,
                    capacity: { qty: loc.capacity?.qty ?? 0, pallets: loc.capacity?.pallets ?? 0 },
                  })}
                >
                  تعديل
                </button>
                {loc.status !== 'archived' && (
                  <button type="button" className="btn btn-link" onClick={() => onArchive(loc.code)} title="أرشفة — لا حذف">
                    <Icon name="archive" size={14} />
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>

      {node.children.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {node.children.map((c) => (
            <TreeNode
              key={c.code}
              node={c}
              depth={depth + 1}
              occupancy={occupancy}
              canEdit={canEdit}
              onEdit={onEdit}
              onArchive={onArchive}
              onPrint={onPrint}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * ملصق الموقع — CODE128 بالمكتبة المستضافة ذاتيًّا `public/lib/JsBarcode.all.min.js`
 * (نفس نمط `DocumentPrint`). لا CDN ولا اعتماد جديد، والماسحات الحالية تقرؤه اليوم.
 * والكود مطبوعٌ نصًّا تحته: إن تعذّر تحميل المكتبة يبقى الملصق مقروءًا بالعين.
 */
function LabelSheet({ location, onClose }) {
  const ref = useRef(null);
  const basePath = getBasePath();

  useEffect(() => {
    let cancelled = false;
    async function draw() {
      try {
        if (!window.JsBarcode) {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = `${basePath}/lib/JsBarcode.all.min.js`;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
          });
        }
        if (cancelled || !ref.current || !window.JsBarcode) return;
        window.JsBarcode(ref.current, location.code, {
          format: 'CODE128',
          width: 2,
          height: 60,
          displayValue: true,
          fontSize: 14,
          margin: 8,
        });
      } catch {
        // تعذّر تحميل المكتبة — الكود مطبوعٌ نصًّا على أي حال.
      }
    }
    draw();
    return () => {
      cancelled = true;
    };
  }, [location.code, basePath]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
      onClick={onClose}
    >
      <div className="o_ds_card o_ds_pad" style={{ background: 'var(--o-view-background-color)', maxWidth: '420px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <div id="bz-location-label" style={{ textAlign: 'center', padding: '12px' }}>
          <div style={{ fontSize: '26px', fontWeight: 800, direction: 'ltr', letterSpacing: '1px' }}>
            {shortLabelOf(location.code)}
          </div>
          <svg ref={ref} />
          <div style={{ fontSize: '11px', direction: 'ltr', color: 'var(--o-main-color-muted)' }}>{location.code}</div>
          {location.nameAr && <div style={{ fontSize: '12px', marginTop: '4px' }}>{location.nameAr}</div>}
        </div>
        <div className="o_form_actions" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <Icon name="printer" size={15} /> طباعة
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>إغلاق</button>
        </div>
      </div>
    </div>
  );
}
