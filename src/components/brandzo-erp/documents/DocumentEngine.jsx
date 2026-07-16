/**
 * محرّك المستندات — الشاشة الواحدة التي تخدم كل النماذج.
 *
 * لا يعرف هذا الملف شيئًا عن «الاستلام» ولا عن «تصريح البوابة»: يقرأ المخطّط
 * ويرسمه. إضافة نموذج جديد = ملف مخطّط، لا شاشة جديدة (ROADMAP §11.2).
 *
 * دورة الحياة:
 *   ?type=GRN            ← مستند جديد، يعيش محليًّا حتى أول حفظ
 *   ?type=GRN&id=abc123  ← مستند قائم، يُتابَع لحظيًّا
 *
 * لماذا لا يُنشَأ المستند في السحابة فور فتح الصفحة؟ لأن كل فتحة صفحة كانت
 * ستُخلّف مسودّة فارغة. المستند يولد عند أول حفظ حقيقي.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { getSchema } from '../../../services/documents/schemas/index.js';
import {
  createDraft,
  saveDocument,
  transitionDocument,
  listenDocument,
  listenAudit,
} from '../../../services/documents/documentsService.js';
import { emptyDocument, emptyChecklist, missingRequired, isEmptyLine, applyItemToLine } from '../../../services/documents/schemaUtils.js';
import { lookupByBarcode } from '../../../services/itemService.js';
import { isEditable } from '../../../services/documents/states.js';
import FieldInput from './FieldInput.jsx';
import LineItemsTable from './LineItemsTable.jsx';
import Checklist from './Checklist.jsx';
import StateBar from './StateBar.jsx';
import AuditTrail from './AuditTrail.jsx';
import DocumentPrint from './DocumentPrint.jsx';

/** يقرأ معاملات الرابط (الموقع ثابت — لا توجيه من الخادم). */
function readParams() {
  if (typeof window === 'undefined') return { type: 'GRN', id: null };
  const p = new URLSearchParams(window.location.search);
  return { type: p.get('type') || 'GRN', id: p.get('id') };
}

export default function DocumentEngine() {
  const [{ type, id }, setParams] = useState(readParams);
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [docId, setDocId] = useState(id);
  const [doc, setDoc] = useState(null);
  const [audit, setAudit] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const schema = useMemo(() => getSchema(type), [type]);

  /**
   * `dirty` في مرجع لا في متغيّر مُلتقَط.
   * السبب: مستمع Firestore يُنشَأ مرّة واحدة، فيلتقط قيمة `dirty` وقت إنشائه
   * ويبقى عليها. لو قرأناها منه مباشرةً لرأى `false` أبدًا، فابتلع أي تحديث
   * قادم من السحابة تعديلاتِ الموظّف وهو يكتب. المرجع يقرأ القيمة الحيّة.
   */
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      setMe(user ? await fetchUserProfile(user) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  // مستند جديد: هيكل فارغ محليًّا. مستند قائم: متابعة لحظيّة.
  useEffect(() => {
    if (!schema) return;
    if (!docId) {
      setDoc({ type: schema.type, state: 'draft', ...emptyDocument(schema) });
      return;
    }
    const unsubDoc = listenDocument(docId, (d) => {
      if (!d) return;
      setDoc((prev) => {
        // لا نسحب البساط من تحت من يكتب الآن.
        if (dirtyRef.current && prev) return prev;
        // مستندات قديمة قد تسبق إضافة قائمة الفحص — نملأ الناقص لا نُسقطه.
        return { ...d, header: { _checklist: emptyChecklist(schema), ...d.header } };
      });
    });
    const unsubAudit = listenAudit(docId, setAudit);
    return () => {
      unsubDoc();
      unsubAudit();
    };
  }, [docId, schema]);

  const flash = useCallback((text, tone = 'ok') => {
    setMsg({ text, tone });
    setTimeout(() => setMsg(null), 4000);
  }, []);

  const editable = isEditable(doc?.state) && (!docId || doc?.createdByUid === me?.uid || me?.role === 'admin');
  const canCreate = me && (me.role === 'admin' || (schema?.roles?.create || []).includes(me.role));
  const violations = useMemo(() => (schema?.warnings && doc ? schema.warnings(doc) : []), [schema, doc]);

  function patchHeader(key, value) {
    setDoc((d) => ({ ...d, header: { ...d.header, [key]: value } }));
    setDirty(true);
  }

  function patchLines(lines) {
    setDoc((d) => ({ ...d, lines }));
    setDirty(true);
  }

  /**
   * استدعاء الماستر من بند (I-ب/2): باركود مكتمل ⇒ يتعبّأ الكود والوصف.
   * الفارغ فقط يُملأ — ما كتبه الموظّف بيده لا يُدهس. والمجهول لا يوقف
   * العمل (قرار المالك): تنبيه، ويُكمل البند يدويًّا.
   */
  async function handleLineLookup(kind, value, index) {
    if (kind !== 'item') return;
    try {
      const item = await lookupByBarcode(value);
      if (!item) {
        flash(`⚠️ الباركود ${value} غير معرّف في الماستر — أكمل البند يدويًّا وسجِّل الصنف لاحقًا.`, 'err');
        return;
      }
      setDoc((d) => {
        const current = d.lines?.[index];
        if (!current) return d;
        const { line, filled } = applyItemToLine(current, item);
        if (filled.length === 0) return d;
        const lines = d.lines.map((l, i) => (i === index ? line : l));
        return { ...d, lines };
      });
      setDirty(true);
      flash(`☁️ ${item.nameAr} — استُدعي من الماستر.`);
    } catch {
      // شبكة/صلاحية — لا نعطّل الإدخال اليدوي.
      flash('تعذّر سؤال الماستر — أكمل يدويًّا.', 'err');
    }
  }

  function patchChecklist(next) {
    setDoc((d) => ({ ...d, header: { ...d.header, _checklist: next } }));
    setDirty(true);
  }

  /** يحفظ ويُعيد معرّف المستند (يُنشئه إن كان جديدًا). */
  async function persist() {
    const lines = (doc.lines || []).filter((l) => !isEmptyLine(l));
    const payload = { header: doc.header, lines: lines.length ? lines : doc.lines.slice(0, 1) };

    if (!docId) {
      const newId = await createDraft({ type: schema.type, stage: schema.stage, profile: me, ...payload });
      setDocId(newId);
      setParams((p) => ({ ...p, id: newId }));
      // نُثبّت المعرّف في الرابط ليصمد التحديث ويصير قابلًا للمشاركة.
      const url = new URL(window.location.href);
      url.searchParams.set('id', newId);
      window.history.replaceState({}, '', url);
      return newId;
    }
    await saveDocument(docId, payload);
    return docId;
  }

  async function handleSave() {
    setSaving(true);
    try {
      await persist();
      setDirty(false);
      flash('حُفظت المسودّة.');
    } catch (e) {
      flash(e.message || 'تعذّر الحفظ.', 'err');
    } finally {
      setSaving(false);
    }
  }

  async function handleTransition(to, note) {
    setSaving(true);
    try {
      if (to === 'submitted') {
        const missing = missingRequired(schema, doc);
        if (missing.length) {
          flash(`أكمل الحقول الإلزامية: ${missing.join(' · ')}`, 'err');
          return;
        }
      }
      const targetId = dirty || !docId ? await persist() : docId;
      setDirty(false);
      const number = await transitionDocument(targetId, to, { note, profile: me, schema });
      flash(to === 'submitted' && number ? `أُرسل للاعتماد برقم ${number}` : 'تمّ الإجراء.');
    } catch (e) {
      flash(e.message || 'تعذّر تنفيذ الإجراء.', 'err');
    } finally {
      setSaving(false);
    }
  }

  if (!schema) {
    return (
      <Notice tone="err" title="نوع مستند غير معروف">
        لا يوجد مخطّط للنوع «{type}». الجاهز اليوم: مذكرة الاستلام (GRN).
      </Notice>
    );
  }
  if (!ready || !doc) return <p className="text-gray-300 text-sm py-10 text-center">جارٍ التحميل…</p>;
  if (!me) return <Notice tone="err" title="🔒 يلزم تسجيل الدخول">افتح المستند بعد الدخول لتُسجَّل هويتك على كل إجراء.</Notice>;
  if (!docId && !canCreate) {
    return (
      <Notice tone="err" title="🚫 غير مصرّح">
        إنشاء «{schema.titleAr}» متاح لـ: أمين المخزن · مدير المستودع · موظف المشتريات.
      </Notice>
    );
  }

  return (
    <>
      <div className="doc-screen space-y-5" dir="rtl">
        {msg && (
          <div
            className={`rounded-xl px-4 py-2.5 text-sm text-center border ${
              msg.tone === 'err'
                ? 'bg-brand-red/10 border-brand-red/40 text-red-200'
                : 'bg-brand-gold/15 border-brand-gold/40 text-brand-gold'
            }`}
          >
            {msg.text}
          </div>
        )}

        <StateBar
          doc={doc}
          schema={schema}
          me={me}
          saving={saving}
          dirty={dirty}
          onSave={editable ? handleSave : null}
          onTransition={handleTransition}
          onPrint={() => window.print()}
        />

        {violations.length > 0 && (
          <div className="bg-brand-red/10 border border-brand-red/40 rounded-xl px-4 py-3">
            <p className="text-sm font-bold text-red-200 mb-1">⚠️ خرق نقطة التحكّم الحرجة CCP1</p>
            {violations.map((v) => (
              <p key={v} className="text-xs text-red-300">
                · {v}
              </p>
            ))}
            <p className="text-[11px] text-red-400/80 mt-1.5">
              الورق كان يكتب هذا الحدّ ولا يفحصه. لا يزال بوسعك الإرسال — والقرار يُوثَّق باسمك.
            </p>
          </div>
        )}

        {!editable && doc.state !== 'draft' && (
          <p className="text-xs text-gray-400 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
            🔒 المستند خرج من طور التحرير — الحقول للقراءة فقط.
          </p>
        )}

        {schema.sections.map((section) => (
          <section key={section.key} className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5">
            <h2 className="text-base font-bold text-white mb-3">{section.title}</h2>
            {section.note && section.kind !== 'table' && (
              <p className="text-[11px] text-brand-gold/80 mb-3 leading-relaxed">{section.note}</p>
            )}

            {section.kind === 'fields' && (
              <>
                <div
                  className="grid gap-4"
                  style={{ gridTemplateColumns: `repeat(auto-fit, minmax(190px, 1fr))`, maxWidth: `${(section.columns || 3) * 320}px` }}
                >
                  {(section.fields || []).map((f) => (
                    <FieldInput
                      key={f.key}
                      field={f}
                      doc={doc}
                      disabled={!editable}
                      onChange={patchHeader}
                      violation={violationFor(f, violations)}
                    />
                  ))}
                </div>
                {section.extraFields?.length > 0 && (
                  <div className="grid gap-4 mt-4 md:grid-cols-2">
                    {section.extraFields.map((f) => (
                      <FieldInput key={f.key} field={f} doc={doc} disabled={!editable} onChange={patchHeader} />
                    ))}
                  </div>
                )}
              </>
            )}

            {section.kind === 'table' && (
              <LineItemsTable
                schema={schema}
                section={section}
                lines={doc.lines || []}
                disabled={!editable}
                onChange={patchLines}
                onLookup={handleLineLookup}
              />
            )}

            {section.kind === 'checklist' && (
              <Checklist
                section={section}
                state={doc.header?._checklist}
                disabled={!editable}
                onChange={patchChecklist}
              />
            )}
          </section>
        ))}

        {docId && (
          <section className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5">
            <h2 className="text-base font-bold text-white mb-1">🔏 سجلّ التدقيق</h2>
            <p className="text-[11px] text-gray-500 mb-3">قيود دائمة — لا تُعدَّل ولا تُحذف.</p>
            <AuditTrail entries={audit} />
          </section>
        )}
      </div>

      <DocumentPrint schema={schema} doc={doc} basePath={getBasePath()} />
    </>
  );
}

/** يربط تحذير CCP1 بحقله ليظهر تحته مباشرة. */
function violationFor(field, violations) {
  if (field.key === 'tempChilled') return violations.find((v) => v.includes('المبردات'));
  if (field.key === 'tempFrozen') return violations.find((v) => v.includes('المجمدات'));
  return null;
}

function Notice({ tone, title, children }) {
  const err = tone === 'err';
  return (
    <div
      dir="rtl"
      className={`rounded-2xl p-6 text-center border ${
        err ? 'bg-brand-red/10 border-brand-red/40 text-red-200' : 'bg-white/5 border-white/10 text-gray-300'
      }`}
    >
      <p className="font-bold text-lg mb-1">{title}</p>
      <p className="text-sm">{children}</p>
    </div>
  );
}
