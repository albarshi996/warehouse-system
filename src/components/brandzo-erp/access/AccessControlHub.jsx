/**
 * محرر الصلاحيات الفعلي — «العملية الجراحية» المحور ٢-ب (2026-08-02).
 *
 * ⚠️ **ما كان قبل اليوم:** هذه الشاشة كانت عرضًا توثيقيًّا ساكنًا بأدوارٍ
 * محليةٍ منها اثنان لا وجود لهما في النظام (`warehouse_user`/`purchase_manager`)،
 * ولافتة «البوابة مفتوحة» صارت قديمة، ولا تقرأ ولا تكتب شيئًا.
 * **الآن:** شبكة (الأدوار الحقيقية الاثنا عشر × شاشات الكتالوج) يحرّرها
 * المدير العام، تُحفظ في `access_control/matrix` وتسري فورًا على:
 *   • فتح الصفحات (`AuthGate` عبر `pageAccess.canOpenPath`)
 *   • القائمة الجانبية (`RoleNav`)
 *
 * الدلالة: الافتراضي من الكتالوج · «سماح» يضيف شاشة لدور · «حجب» يمنعها ·
 * الحجب يغلب · admin فوق المصفوفة (يستحيل قفله). حدود صادقة: هذه طبقة
 * شاشات — حماية البيانات تبقى بقواعد `firestore.rules` على الخادم.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { ROLES, isAdmin } from '../../../services/auth/roles.js';
import { NAV_GROUPS } from '../../../services/auth/navCatalog.js';
import { canOpenPath, allowedPathsFor, HOME_PATH } from '../../../services/auth/pageAccess.js';
import { overrideFor, setOverride, countOverrides } from '../../../services/auth/accessMatrix.js';
import { subscribeMatrix, saveMatrix } from '../../../services/auth/accessMatrixService.js';
import Badge from '../../odoo/Badge.jsx';

/** صفوف الشبكة: الرئيسية + شاشات الكتالوج الداخلية (بلا تكرار). */
function buildRows() {
  const rows = [{ path: HOME_PATH, label: 'الرئيسية (لوحة التحكم)', group: 'عام' }];
  const seen = new Set([HOME_PATH]);
  for (const g of NAV_GROUPS) {
    for (const it of g.items) {
      if (it.external || seen.has(it.path)) continue;
      seen.add(it.path);
      rows.push({ path: it.path, label: it.label, group: g.group });
    }
  }
  return rows;
}
const ROWS = buildRows();
const EDIT_ROLES = Object.values(ROLES).filter((r) => r.id !== 'admin');
const NEXT_STATE = { none: 'allow', allow: 'deny', deny: null };

export default function AccessControlHub() {
  const [user, setUser] = useState(null);
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [cloud, setCloud] = useState(null); // null = تعذّرت القراءة (قاعدة غير منشورة؟)
  const [draft, setDraft] = useState({ overrides: {} });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [previewRole, setPreviewRole] = useState('warehouse_manager');
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  useEffect(() => {
    const un = subscribeAuth(async (u) => {
      setUser(u);
      setMe(u ? await fetchUserProfile(u) : null);
      setReady(true);
    });
    return () => un();
  }, []);

  useEffect(() => {
    const un = subscribeMatrix((m) => {
      setCloud(m);
      if (!dirtyRef.current) setDraft(m || { overrides: {} });
    });
    return () => un();
  }, []);

  const previewPaths = useMemo(() => allowedPathsFor(previewRole, draft), [previewRole, draft]);

  if (!ready) {
    return (
      <div className="o_theme">
        <div className="o_ds_card" style={{ padding: 18 }}>
          جارٍ التحقق من الصلاحية…
        </div>
      </div>
    );
  }
  if (!me || !isAdmin(me.role)) {
    return (
      <div className="o_theme">
        <div className="o_ds_card" style={{ padding: 18 }}>
          <strong>غير مصرّح.</strong> شاشة تحرير الصلاحيات للمدير العام وحده — وتوثيق
          الأدوار المقروء للجميع في «المرجع التشغيلي الرسمي» (فصل أدوار البوابة).
        </div>
      </div>
    );
  }

  const cycle = (roleId, path) => {
    const cur = overrideFor(draft, roleId, path);
    setDraft(setOverride(draft, roleId, path, NEXT_STATE[cur || 'none']));
    setDirty(true);
    setMsg(null);
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await saveMatrix(draft, {
        updatedBy: user?.uid || null,
        updatedByName: me?.name || me?.email || null,
      });
      setDirty(false);
      setMsg({ ok: true, text: 'حُفظت المصفوفة — تسري فورًا على فتح الشاشات والقائمة الجانبية.' });
    } catch (err) {
      const code = err?.code || err?.message || String(err);
      setMsg({
        ok: false,
        text:
          code === 'permission-denied'
            ? 'رفض الخادم الكتابة (permission-denied): تأكد أن قواعد Firestore المنشورة تتضمن كتلة access_control وأنك داخل بحساب المدير العام، ثم أعد المحاولة بعد دقيقة (القواعد تحتاج لحظات لتسري).'
            : `تعذّر الحفظ — رمز الخطأ: ${code}. تعديلاتك باقية في هذه الشاشة.`,
      });
    } finally {
      setSaving(false);
    }
  };

  const revert = () => {
    setDraft(cloud || { overrides: {} });
    setDirty(false);
    setMsg(null);
  };

  return (
    <div className="o_theme">
      <style>{`
        .bz-acm-wrap { overflow-x: auto; border: 1px solid #dee2e6; background: #fff; }
        .bz-acm { border-collapse: collapse; width: max-content; min-width: 100%; font-size: 12px; }
        .bz-acm th, .bz-acm td { border-bottom: 1px solid #eee; padding: 5px 8px; text-align: center; white-space: nowrap; }
        .bz-acm thead th { position: sticky; top: 0; background: #f8f9fa; z-index: 2; font-weight: 700; }
        .bz-acm td.bz-acm-page, .bz-acm th.bz-acm-page { position: sticky; right: 0; background: #fff; text-align: right; z-index: 1; min-width: 210px; border-left: 1px solid #dee2e6; }
        .bz-acm thead th.bz-acm-page { background: #f8f9fa; z-index: 3; }
        .bz-acm tr.bz-acm-grp td { background: #f2f4f8; font-weight: 800; text-align: right; color: #1f2937; }
        .bz-acm-cell { cursor: pointer; border: 0; background: transparent; width: 100%; font: inherit; padding: 2px 4px; }
        .bz-acm-cell:hover { outline: 1px dashed #714B67; }
        .bz-acm-on { color: #0a7a3d; font-weight: 700; }
        .bz-acm-off { color: #adb5bd; }
        .bz-acm-allow { background: #e5f4e8; color: #0a7a3d; font-weight: 800; padding: 1px 6px; }
        .bz-acm-deny { background: #fdeceb; color: #c0392b; font-weight: 800; padding: 1px 6px; }
      `}</style>

      <div className="o_ds_card" style={{ padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>كيف تعمل هذه الشاشة</div>
        <ul style={{ fontSize: 12.5, lineHeight: 1.9, margin: 0, paddingInlineStart: 18 }}>
          <li>الافتراضي لكل دور مشتقّ من كتالوج القائمة نفسه — ما تراه هنا هو المطبَّق فعلًا الآن.</li>
          <li>
            اضغط الخلية لتدويرها: افتراضي ← <span className="bz-acm-allow">سماح</span> ←{' '}
            <span className="bz-acm-deny">حجب</span> ← افتراضي. الحجب يغلب، والتعديل يسري فور
            الحفظ على فتح الصفحات والقائمة الجانبية معًا.
          </li>
          <li>
            <strong>المدير العام فوق المصفوفة</strong> فلا عمود له — يستحيل قفله. وهذه طبقة شاشات:
            حماية البيانات تبقى بقواعد الخادم <span style={{ direction: 'ltr' }}>firestore.rules</span>.
          </li>
        </ul>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <button
          className="o_btn o_btn-primary"
          onClick={save}
          disabled={saving || !dirty}
          title={dirty ? 'حفظ التعديلات سحابيًّا' : 'عدّل أي خلية في الشبكة أولًا ليتفعّل الحفظ'}
        >
          {saving ? 'جارٍ الحفظ…' : 'حفظ المصفوفة'}
        </button>
        <button className="o_btn" onClick={revert} disabled={saving || !dirty}>
          تراجُع للنسخة المحفوظة
        </button>
        {dirty ? (
          <Badge variant="warn">تعديلات غير محفوظة</Badge>
        ) : (
          <Badge variant="done">مطابقة للسحابة — الزر يتفعّل عند أول تعديل</Badge>
        )}
        <span style={{ fontSize: 12, color: '#6b7280' }}>
          التجاوزات المعرَّفة: <strong>{countOverrides(draft)}</strong>
        </span>
        {cloud === null && (
          <Badge variant="danger">قراءة المصفوفة متعذّرة — النظام يعمل بالكتالوج وحده</Badge>
        )}
      </div>

      {msg && (
        <div className={`o_alert ${msg.ok ? 'o_alert-success' : 'o_alert-danger'}`} style={{ marginBottom: 10 }}>
          {msg.text}
        </div>
      )}

      <div className="bz-acm-wrap">
        <table className="bz-acm">
          <thead>
            <tr>
              <th className="bz-acm-page">الشاشة</th>
              {EDIT_ROLES.map((r) => (
                <th key={r.id} title={r.id}>
                  {r.label}
                  <div style={{ fontWeight: 400, color: '#6b7280' }}>
                    {allowedPathsFor(r.id, draft).length} شاشة
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => {
              const isNewGroup = i === 0 || ROWS[i - 1].group !== row.group;
              const cells = EDIT_ROLES.map((r) => {
                const ov = overrideFor(draft, r.id, row.path);
                const effective = canOpenPath(r.id, row.path, draft);
                let cls = effective ? 'bz-acm-on' : 'bz-acm-off';
                let text = effective ? '•' : '—';
                if (ov === 'allow') {
                  cls = 'bz-acm-allow';
                  text = 'سماح';
                } else if (ov === 'deny') {
                  cls = 'bz-acm-deny';
                  text = 'حجب';
                }
                const stateTip = ov
                  ? ov === 'allow'
                    ? 'سماح صريح'
                    : 'حجب صريح'
                  : effective
                    ? 'مفتوح افتراضيًّا'
                    : 'مغلق افتراضيًّا';
                return (
                  <td key={r.id}>
                    <button
                      type="button"
                      className="bz-acm-cell"
                      title={`${r.label} — ${row.label}: ${stateTip}`}
                      onClick={() => cycle(r.id, row.path)}
                    >
                      <span className={cls}>{text}</span>
                    </button>
                  </td>
                );
              });
              return [
                isNewGroup ? (
                  <tr className="bz-acm-grp" key={`g-${row.group}`}>
                    <td className="bz-acm-page">{row.group}</td>
                    <td colSpan={EDIT_ROLES.length} />
                  </tr>
                ) : null,
                <tr key={row.path}>
                  <td className="bz-acm-page" title={row.path}>
                    {row.label}
                    <div style={{ fontSize: 10, color: '#9ca3af', direction: 'ltr', textAlign: 'left' }}>
                      {row.path}
                    </div>
                  </td>
                  {cells}
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>

      <div className="o_ds_card" style={{ padding: '14px 16px', marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <strong>معاينة دور:</strong>
          <select
            className="o_input"
            style={{ maxWidth: 220 }}
            value={previewRole}
            onChange={(e) => setPreviewRole(e.target.value)}
          >
            {EDIT_ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            يفتح <strong>{previewPaths.length}</strong> شاشة بالمسودة الحالية:
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {previewPaths.map((p) => {
            const r = ROWS.find((x) => x.path === p);
            return (
              <span key={p} className="o_badge o_badge-draft" title={p}>
                {r ? r.label : p}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
