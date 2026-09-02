import React, { useState, useEffect } from 'react';
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../../config/firebase.js';
import Icon from '../../ui/Icon.jsx';
import ListView from '../../odoo/ListView.jsx';
import LocationTree from './LocationTree.jsx';
import LocationMap from './LocationMap.jsx';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import Badge from '../../odoo/Badge.jsx';
import { int } from '../../odoo/format.js';
import { FACILITY_TYPES, DEFAULT_FACILITY_TYPE, facilityTypeOf, facilityWarnings } from '../../../services/locations/facilityModel.js';
import { canEditLocations, listenLocations, saveLocationsBulk } from '../../../services/locations/locationsService.js';
import { toLocationInputs } from '../../../services/locations/locationScheme.js';
import {
  driftedWarehouses,
  generationPlan,
  schemeFromTemplate,
  templateById,
} from '../../../services/locations/binTemplate.js';
import { saveWarehouseNumbering } from '../../../services/locations/warehouseService.js';
import BIN_SCHEMES from '../../../data/warehouse-schemes.json';

/**
 * شاشة ماستر المستودعات — قائمة حيّة + إضافة/تعديل/حذف + تصدير/استيراد JSON،
 * مع تراجُع محلّيّ (localStorage) عند انقطاع الاتصال بالسحابة.
 *
 * المرحلة ٤ (2026-07-31): أُعيد كساء العرض بمكوّنات أودو داخل `.o_theme`
 * (ControlPanel + ListView + Badge + o_input + o_alert + o_kpi) — **المنطق
 * (الاشتراك، الكتابة، التصدير/الاستيراد، الوضع المحلّيّ) لم يُمسّ**، غُيّر ما
 * يُرسَم فقط. الأرقام لاتينية (R2) عبر format، والأيقونات عبر مكوّن Icon (R1).
 */

const STORAGE_KEY = 'brandzo_warehouses_local';

const LIST_COLS = [
  { key: 'code', label: 'الكود' },
  { key: 'name', label: 'الاسم' },
  { key: 'manager', label: 'المدير' },
  { key: 'facilityType', label: 'النوع' },
  { key: 'status', label: 'الحالة' },
  // ‹LOC-704› عمودُ المواقع: «كم خانةً لهذا المستودع وكم ينقصه» — الرقمُ في
  // مكانه لا في شاشةٍ أخرى، فمن يعرّف مستودعًا يرى فورًا أنّه بلا مواقع.
  { key: 'bins', label: 'المواقع' },
  { key: 'actions', label: 'الإجراءات' },
];

const TEMPLATES = BIN_SCHEMES?.templates || [];
const ASSIGNMENTS = BIN_SCHEMES?.assignments || [];

const WarehouseManager = () => {
  // ‹LOC-102› تبويبان على الرابط نفسه: المنشآت ومواقع التخزين داخلها.
  // لا صفحة فوق صفحة — المواقع تخصّ ماستر المستودعات.
  const [tab, setTab] = useState('warehouses');
  const [role, setRole] = useState('');
  const [profile, setProfile] = useState(null);
  const [binCodes, setBinCodes] = useState([]);
  const [genBusy, setGenBusy] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [formData, setFormData] = useState({ code: '', name: '', manager: '', facilityType: DEFAULT_FACILITY_TYPE });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
  const [offlineMode, setOfflineMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // الدور يحكم تحرير المواقع (المديران) — والقراءة لأيّ مصادَق.
  useEffect(
    () =>
      subscribeAuth(async (user) => {
        if (!user) { setProfile(null); return setRole(''); }
        const me = await fetchUserProfile(user).catch(() => null);
        setProfile(me);
        setRole(me?.role || '');
      }),
    []
  );

  // Dispatch connection status
  const dispatchStatus = (isOnline) => {
    window.dispatchEvent(new CustomEvent('brandzo:db-status', { detail: { online: isOnline } }));
  };

  // 1. جلب البيانات في الوقت الحقيقي
  useEffect(() => {
    const q = query(collection(db, 'warehouses'), orderBy('code'));
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const docs = [];
        querySnapshot.forEach((doc) => {
          docs.push({ id: doc.id, ...doc.data() });
        });
        setWarehouses(docs);
        setLoading(false);
        setOfflineMode(false);
        dispatchStatus(true);
      },
      (err) => {
        console.error("Firestore error:", err);
        setOfflineMode(true);
        dispatchStatus(false);
        // Load from localStorage
        const localData = localStorage.getItem(STORAGE_KEY);
        if (localData) {
          setWarehouses(JSON.parse(localData));
        }
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Sync localStorage when in offline mode
  useEffect(() => {
    if (offlineMode) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(warehouses));
    }
  }, [warehouses, offlineMode]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'لديك تغييرات غير محفوظة. هل أنت متأكد من أنك تريد المغادرة؟';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // 2. وظيفة الإضافة أو التعديل
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.code || !formData.name) return;

    try {
      setStatusMsg({ type: 'info', text: editingId ? 'جاري التعديل...' : 'جاري الحفظ...' });

      if (offlineMode) {
        if (editingId) {
          setWarehouses(warehouses.map(wh => wh.id === editingId ? { ...wh, ...formData } : wh));
        } else {
          const newWh = {
            id: crypto.randomUUID(),
            ...formData,
            status: 'نشط',
            createdAt: new Date().toISOString()
          };
          setWarehouses([...warehouses, newWh]);
        }
      } else {
        const whData = {
          code: formData.code,
          name: formData.name,
          manager: formData.manager,
          // ‹FNB-106› نوع المنشأة: مستودعٌ أم وحدة إنتاج مركزيّة (المطبخ).
          // الغياب ⇒ مستودع — سلوك اليوم حرفيًّا، فالترحيل بلا أثر.
          facilityType: formData.facilityType || DEFAULT_FACILITY_TYPE,
          status: 'نشط',
          createdAt: serverTimestamp(),
        };

        if (editingId) {
          await updateDoc(doc(db, 'warehouses', editingId), whData);
        } else {
          await addDoc(collection(db, 'warehouses'), whData);
        }
      }

      setFormData({ code: '', name: '', manager: '', facilityType: DEFAULT_FACILITY_TYPE });
      setEditingId(null);
      setStatusMsg({ type: 'success', text: editingId ? 'تم تعديل المستودع بنجاح' : 'تمت إضافة المستودع بنجاح' });
      setHasUnsavedChanges(false);
      setTimeout(() => setStatusMsg({ type: '', text: '' }), 3000);
    } catch (error) {
      setStatusMsg({ type: 'error', text: 'فشل العملية: ' + error.message });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المستودع؟')) return;

    try {
      if (offlineMode) {
        setWarehouses(warehouses.filter(wh => wh.id !== id));
      } else {
        await deleteDoc(doc(db, 'warehouses', id));
      }
      setStatusMsg({ type: 'success', text: 'تم حذف المستودع بنجاح' });
      setTimeout(() => setStatusMsg({ type: '', text: '' }), 3000);
    } catch (error) {
      setStatusMsg({ type: 'error', text: 'فشل الحذف: ' + error.message });
    }
  };

  const startEdit = (wh) => {
    setEditingId(wh.id);
    setFormData({ code: wh.code, name: wh.name, manager: wh.manager || '', facilityType: facilityTypeOf(wh) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(warehouses, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brandzo-warehouses-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const imported = JSON.parse(evt.target.result);
          if (!Array.isArray(imported)) throw new Error('البيانات ليست مصفوفة');
          if (!imported.every(wh => wh.code)) throw new Error('بيانات غير صالحة: كود المستودع مطلوب');

          if (offlineMode) {
            setWarehouses(imported);
          } else {
            const batch = writeBatch(db);
            imported.forEach(wh => {
              const newDocRef = doc(collection(db, 'warehouses'));
              batch.set(newDocRef, {
                code: wh.code,
                name: wh.name || '',
                manager: wh.manager || '',
                status: wh.status || 'نشط',
                createdAt: serverTimestamp()
              });
            });
            await batch.commit();
          }
          setStatusMsg({ type: 'success', text: `تم استيراد ${imported.length} مستودع بنجاح` });
        } catch (err) {
          setStatusMsg({ type: 'error', text: 'فشل الاستيراد: ' + err.message });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleInputChange = (field) => (e) => {
    setFormData({ ...formData, [field]: e.target.value });
    setHasUnsavedChanges(true);
  };

  // ‹LOC-704› أكوادُ المواقع القائمة — تُقرأ مرّةً ويُحسب منها ناقصُ كلّ مستودع.
  useEffect(() => {
    if (!role) return undefined;
    return listenLocations((rows) => setBinCodes(rows.map((r) => r.code)));
  }, [role]);

  /**
   * ★★ خطّةُ التوليد — **الناقصُ لا الكلّ**. تُحسب في المنطق الخالص
   * (`binTemplate.generationPlan`) وتُعرض هنا: لكلّ مستودعٍ كم له وكم ينقصه،
   * ومن بلا قالبٍ يُقال له ذلك بدل أن يُترك صامتًا.
   */
  const plan = React.useMemo(
    () => generationPlan({ warehouses, templates: TEMPLATES, existingCodes: binCodes, assignments: ASSIGNMENTS }),
    [warehouses, binCodes]
  );
  const planByCode = React.useMemo(
    () => new Map(plan.rows.map((r) => [r.warehouseCode, r])),
    [plan]
  );

  /**
   * يكتب الناقصَ لمستودعٍ أو للكلّ. آمنٌ عند التكرار: `missing` محسوبٌ بفرق
   * القائم، فالضغطةُ الثانيةُ لا تجد ما تكتبه.
   */
  const generateMissing = async (rows) => {
    const todo = rows.filter((r) => r.missing.length);
    if (!todo.length) return;
    setGenBusy('يولّد…');
    setStatusMsg({ type: '', text: '' });
    try {
      let saved = 0;
      for (const r of todo) {
        const out = await saveLocationsBulk(toLocationInputs(r.missing, { warehouse: r.binPrefix }), profile);
        saved += out?.saved ?? r.missing.length;

        // ★★ ويُثبَّت القالبُ على المستودع إن كان مبدئيًّا من الإسناد المعتمد —
        // فالمرّةُ الأولى تكفي، وما بعدها يُقرأ من الوثيقة لا من البذرة.
        if (r.source === 'assignment') {
          const wh = warehouses.find((w) => w.code === r.warehouseCode);
          const t = templateById(TEMPLATES, r.templateId);
          if (wh?.id && t) {
            await saveWarehouseNumbering(
              wh.id,
              {
                binPrefix: r.binPrefix,
                scheme: schemeFromTemplate(t, { binPrefix: r.binPrefix, params: r.templateParams }),
                segmentLabels: t.segmentLabels || null,
                valueLabels: t.valueLabels || null,
                templateId: t.id,
                templateParams: r.templateParams,
              },
              profile
            ).catch(() => {});
          }
        }
      }
      setStatusMsg({
        type: 'success',
        text: `وُلّد ${int(saved)} موقعًا في ${int(todo.length)} مستودعًا — ${todo.map((r) => r.nameAr || r.warehouseCode).join(' · ')}`,
      });
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'تعذّر التوليد: ' + (err?.message || 'سببٌ غير معروف') });
    } finally {
      setGenBusy('');
    }
  };

  /**
   * ★★ المستودعاتُ التي تخلّف ترقيمُها عن البذرة المعتمدة.
   *
   * يقع هذا حين تُعدَّل تسميةٌ أو مقاسٌ في القالب **بعد** أن وُلِّدت المواقع:
   * فالخانات موجودةٌ صحيحةً، والوثيقةُ تحمل وصفًا قديمًا — فيسأل الويزاردُ
   * «الرفّ؟» حيث صار الاسمُ «المستوى». والزرُّ يظهر **حين يوجد فرقٌ ويسمّيه**،
   * ومستودعٌ مطابقٌ لا يُعرض له شيء.
   */
  const drifted = React.useMemo(
    () => driftedWarehouses(warehouses, { assignments: ASSIGNMENTS, templates: TEMPLATES }),
    [warehouses]
  );

  /**
   * يحدّث وثيقةَ المستودع بالترقيم المعتمد.
   *
   * ⚠️ ولا يمسّ الخانات ولا ربطَ الملصقات: `saveWarehouseNumbering` تكتب في
   * `warehouses` وحدها. فالتحديثُ آمنٌ على ٣٦٠٠ خانةٍ وعلى كلّ ملصقٍ رُبط.
   */
  const refreshNumbering = async (rows) => {
    if (!rows.length) return;
    setGenBusy('يحدّث…');
    setStatusMsg({ type: '', text: '' });
    try {
      for (const r of rows) {
        if (!r.warehouse?.id || !r.approved) continue;
        await saveWarehouseNumbering(r.warehouse.id, r.approved, profile);
      }
      setStatusMsg({
        type: 'success',
        text: `حُدِّث ترقيمُ ${int(rows.length)} مستودعًا — ${rows.map((r) => r.warehouse.name || r.warehouse.code).join(' · ')}. والخاناتُ وربطُ الملصقات لم تُمسّ.`,
      });
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'تعذّر التحديث: ' + (err?.message || 'سببٌ غير معروف') });
    } finally {
      setGenBusy('');
    }
  };

  const activeCount = warehouses.filter((wh) => (wh.status || 'نشط') === 'نشط').length;
  const managedCount = warehouses.filter((wh) => wh.manager).length;

  // ‹FNB-106› «مطبخٌ مركزيّ واحد يخدم الشبكة» — تنبيهٌ يُعلن التعدّد ولا يمنعه.
  const facilityNotes = facilityWarnings(warehouses);

  const listRows = warehouses.map((wh) => ({
    id: wh.id,
    cells: {
      code: <span className="decoration-bf" style={{ fontFamily: 'monospace' }}>{wh.code}</span>,
      name: wh.name,
      manager: wh.manager || '—',
      facilityType: (
        <Badge variant={facilityTypeOf(wh) === 'production_unit' ? 'info' : 'muted'}>
          {FACILITY_TYPES[facilityTypeOf(wh)].labelAr}
        </Badge>
      ),
      status: <Badge variant={(wh.status || 'نشط') === 'نشط' ? 'done' : 'danger'}>{wh.status || 'نشط'}</Badge>,
      bins: (() => {
        const p = planByCode.get(wh.code);
        if (!p) return <span style={{ color: 'var(--o-main-color-muted)' }}>—</span>;
        if (p.problems.length) {
          return <span style={{ color: 'var(--o-main-color-muted)', fontSize: '12px' }} title={p.problems[0]}>بلا قالب</span>;
        }
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontFamily: 'monospace' }}>{int(p.have)}/{int(p.total)}</span>
            {p.extra > 0 && (
              <span
                style={{ color: 'var(--o-main-color-muted)', fontSize: '11px' }}
                title="أكوادٌ قائمةٌ لا يصفها القالبُ الحاليّ — صُغِّر القالبُ بعد توليدها. لا تُحذف (قد تشير إليها حركات)؛ تُؤرشَف من شاشة المواقع."
              >
                +{int(p.extra)} خارج القالب
              </span>
            )}
            {p.missing.length > 0 && canEditLocations(role) && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={Boolean(genBusy)}
                onClick={() => generateMissing([p])}
              >
                ولّد {int(p.missing.length)}
              </button>
            )}
          </span>
        );
      })(),
      actions: (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEdit(wh)}>تعديل</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleDelete(wh.id)}>حذف</button>
        </div>
      ),
    },
  }));

  return (
    <div className="o_theme" dir="rtl">
      <div className="o_control_panel">
        <div className="o_cp_start">
          <nav className="o_breadcrumb" aria-label="مسار التنقّل"><span className="o_active">إدارة المستودعات</span></nav>
        </div>
        <div className="o_cp_end" style={{ gap: '8px' }}>
          <button type="button" className="btn btn-secondary" onClick={handleExport}>
            <Icon name="arrowUpTray" size={15} /> تصدير JSON
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleImport}>
            <Icon name="arrowDownTray" size={15} /> استيراد JSON
          </button>
        </div>
      </div>

      <div className="o_ds">
        <div role="tablist" aria-label="أقسام المستودعات" style={{ display: 'flex', gap: '6px', marginBottom: '14px', borderBottom: '1px solid var(--o-border-color)' }}>
          {[
            { id: 'warehouses', label: 'المستودعات', icon: 'package' },
            { id: 'locations', label: 'مواقع التخزين', icon: 'mapPin' },
            // ‹LOC-602› الخريطة تبويبٌ ثالث لا صفحةٌ ثانية: هي والشجرة عينان على
            // البيانات نفسها — الشجرة تقول «ما تركيب المستودع؟» والخريطة تقول
            // «أيّ رفٍّ يقبل الآن؟». ولو سكنتا رابطين لَافترق منطقاهما.
            { id: 'map', label: 'خريطة المواقع', icon: 'map' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className="btn btn-link"
              style={{
                borderBottom: tab === t.id ? '2px solid var(--o-brand-primary)' : '2px solid transparent',
                fontWeight: tab === t.id ? 700 : 500,
                borderRadius: 0,
              }}
            >
              <Icon name={t.icon} size={15} /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'locations' && <LocationTree role={role} />}

        {tab === 'map' && <LocationMap />}

        {tab === 'warehouses' && (
        <>
        <p style={{ fontSize: 'var(--o-font-size-sm)', color: 'var(--o-main-color-muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
          كود المستودع (WH Code) هو المعرّف الفريد. عند انقطاع السحابة يعمل النظام محلّيًّا ثم يزامن لاحقًا.
        </p>

        {/* ‹LOC-709› تحديثُ ترقيمٍ وُلِّد قبل تعديل القالب — يظهر بالفرق ويسمّيه. */}
        {canEditLocations(role) && drifted.length > 0 && (
          <div className="o_ds_card o_ds_pad" style={{ marginBottom: '14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
            <Icon name="layers" size={16} />
            <span style={{ flex: 1, fontSize: 'var(--o-font-size-sm)', lineHeight: 1.6 }}>
              ترقيمُ {int(drifted.length)} مستودعًا يخالف القالب المعتمد —{' '}
              <strong>{[...new Set(drifted.flatMap((d) => d.fields))].join(' · ')}</strong>.
              {' '}التحديثُ يمسّ وصفَ المستودع وحدَه: <strong>لا الخانات ولا ربطَ الملصقات</strong>.
            </span>
            <button type="button" className="btn btn-secondary" disabled={Boolean(genBusy)} onClick={() => refreshNumbering(drifted)}>
              {genBusy || `حدّث الترقيم (${int(drifted.length)})`}
            </button>
          </div>
        )}

        {/* ‹LOC-704› ضغطةٌ واحدةٌ لكلّ ما ينقص — والزرُّ آمنٌ عند التكرار. */}
        {canEditLocations(role) && (plan.totalMissing > 0 || plan.blocked.length > 0) && (
          <div className="o_ds_card o_ds_pad" style={{ marginBottom: '14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
            <Icon name="mapPin" size={16} />
            <span style={{ flex: 1, fontSize: 'var(--o-font-size-sm)', lineHeight: 1.6 }}>
              {plan.totalMissing > 0
                ? `ينقص ${int(plan.totalMissing)} موقعًا في ${int(plan.readyCount)} من المستودعات — تُكتب بضغطةٍ واحدة، والموجودُ لا يُكرَّر.`
                : plan.blocked.length === plan.rows.length
                  ? 'لا مستودعَ له قالبُ ترقيم بعد.'
                  : 'كلُّ مستودعٍ له قالبٌ مكتملُ المواقع.'}
              {plan.blocked.length > 0 && (
                <span style={{ color: 'var(--o-main-color-muted)' }}>
                  {' '}و{int(plan.blocked.length)} منها بلا قالب — عرّفه في بانية مواقع التخزين.
                </span>
              )}
            </span>
            {plan.totalMissing > 0 && (
              <button type="button" className="btn btn-primary" disabled={Boolean(genBusy)} onClick={() => generateMissing(plan.rows)}>
                {genBusy || `ولّد الناقص (${int(plan.totalMissing)})`}
              </button>
            )}
            <a className="btn btn-secondary btn-sm" href="../location-builder/">بانية المواقع</a>
          </div>
        )}

        {offlineMode && (
          <div className="o_alert warning" style={{ marginBottom: '14px' }}>
            <div className="o_alert_title"><Icon name="alertTriangle" size={16} /> وضع عمل محلي — البيانات محفوظة على هذا الجهاز فقط</div>
          </div>
        )}

        {statusMsg.text && (
          <div className={`o_alert ${statusMsg.type === 'error' ? 'danger' : statusMsg.type === 'success' ? 'success' : ''}`} style={{ marginBottom: '14px' }}>
            {statusMsg.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="o_ds_card o_ds_pad" dir="rtl" style={{ marginBottom: '18px' }}>
          <h3 className="o_form_title" style={{ fontSize: '18px', marginTop: 0 }}>
            {editingId ? 'تعديل بيانات المستودع' : 'إضافة مستودع جديد'}
          </h3>
          <div className="o_form_grid">
            <FieldWrap label="كود المستودع (WH001) *">
              <input
                type="text"
                className="o_input"
                placeholder="كود المستودع (WH001)"
                value={formData.code}
                onChange={handleInputChange('code')}
                required
                style={{ direction: 'ltr', textAlign: 'right' }}
              />
            </FieldWrap>
            <FieldWrap label="اسم المستودع *">
              <input
                type="text"
                className="o_input"
                placeholder="اسم المستودع"
                value={formData.name}
                onChange={handleInputChange('name')}
                required
              />
            </FieldWrap>
            <FieldWrap label="نوع المنشأة">
              <select
                className="o_input"
                value={formData.facilityType || DEFAULT_FACILITY_TYPE}
                onChange={handleInputChange('facilityType')}
              >
                {Object.values(FACILITY_TYPES).map((t) => (
                  <option key={t.id} value={t.id}>{t.labelAr} — {t.hint}</option>
                ))}
              </select>
            </FieldWrap>
            <FieldWrap label="المدير المسؤول">
              <input
                type="text"
                className="o_input"
                placeholder="المدير المسئول"
                value={formData.manager}
                onChange={handleInputChange('manager')}
              />
            </FieldWrap>
          </div>
          <div className="o_form_actions">
            {editingId && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setEditingId(null); setFormData({ code: '', name: '', manager: '', facilityType: DEFAULT_FACILITY_TYPE }); }}
              >
                إلغاء
              </button>
            )}
            <button type="submit" className="btn btn-primary">
              {editingId ? 'حفظ التعديلات' : 'إضافة مستودع'}
            </button>
          </div>
        </form>

        {warehouses.length > 0 && (
          <div className="o_dashboard_kpis" style={{ marginBottom: '18px' }}>
            <div className="o_kpi">
              <span className="o_kpi_icon"><Icon name="warehouse" size={20} /></span>
              <span className="o_kpi_value">{int(warehouses.length)}</span>
              <span className="o_kpi_label">المستودعات</span>
            </div>
            <div className="o_kpi">
              <span className="o_kpi_icon"><Icon name="checkCircle" size={20} /></span>
              <span className="o_kpi_value">{int(activeCount)}</span>
              <span className="o_kpi_label">مستودعات نشطة</span>
            </div>
            <div className="o_kpi">
              <span className="o_kpi_icon"><Icon name="users" size={20} /></span>
              <span className="o_kpi_value">{int(managedCount)}</span>
              <span className="o_kpi_label">بمدير مسؤول</span>
            </div>
          </div>
        )}

        <div className="o_ds_card">
          {loading ? (
            <div className="o_dashboard_empty">جاري جلب البيانات من السحابة...</div>
          ) : warehouses.length === 0 ? (
            <div className="o_dashboard_empty">لا توجد مستودعات مسجلة حالياً</div>
          ) : (
            <>
              {facilityNotes.map((note) => (
                <div key={note} className="o_alert o_alert_warning" style={{ marginBottom: '8px' }}>{note}</div>
              ))}
              <ListView selectable={false} columns={LIST_COLS} rows={listRows} />
            </>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
};

function FieldWrap({ label, children }) {
  return (
    <label className="o_field_block">
      <span className="o_form_label">{label}</span>
      {children}
    </label>
  );
}

export default WarehouseManager;
