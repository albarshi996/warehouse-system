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
  { key: 'status', label: 'الحالة' },
  { key: 'actions', label: 'الإجراءات' },
];

const WarehouseManager = () => {
  // ‹LOC-102› تبويبان على الرابط نفسه: المنشآت ومواقع التخزين داخلها.
  // لا صفحة فوق صفحة — المواقع تخصّ ماستر المستودعات.
  const [tab, setTab] = useState('warehouses');
  const [role, setRole] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [formData, setFormData] = useState({ code: '', name: '', manager: '' });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
  const [offlineMode, setOfflineMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // الدور يحكم تحرير المواقع (المديران) — والقراءة لأيّ مصادَق.
  useEffect(
    () =>
      subscribeAuth(async (user) => {
        if (!user) return setRole('');
        const profile = await fetchUserProfile(user.uid).catch(() => null);
        setRole(profile?.role || '');
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
          status: 'نشط',
          createdAt: serverTimestamp(),
        };

        if (editingId) {
          await updateDoc(doc(db, 'warehouses', editingId), whData);
        } else {
          await addDoc(collection(db, 'warehouses'), whData);
        }
      }

      setFormData({ code: '', name: '', manager: '' });
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
    setFormData({ code: wh.code, name: wh.name, manager: wh.manager || '' });
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

  const activeCount = warehouses.filter((wh) => (wh.status || 'نشط') === 'نشط').length;
  const managedCount = warehouses.filter((wh) => wh.manager).length;

  const listRows = warehouses.map((wh) => ({
    id: wh.id,
    cells: {
      code: <span className="decoration-bf" style={{ fontFamily: 'monospace' }}>{wh.code}</span>,
      name: wh.name,
      manager: wh.manager || '—',
      status: <Badge variant={(wh.status || 'نشط') === 'نشط' ? 'done' : 'danger'}>{wh.status || 'نشط'}</Badge>,
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
                onClick={() => { setEditingId(null); setFormData({ code: '', name: '', manager: '' }); }}
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
            <ListView selectable={false} columns={LIST_COLS} rows={listRows} />
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
