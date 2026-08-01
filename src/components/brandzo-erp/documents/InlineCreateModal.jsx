/**
 * الإنشاء المباشر للأب المفقود — «العملية الجراحية» المحور ٦ (المرحلة ب٢).
 *
 * عند كتابة رقم أبٍ غير موجود، تفتح هذه النافذة معالجًا مصغّرًا بالحقول
 * الإلزامية لنوع الأب — دون مغادرة صفحة الابن. عند «إنشاء وربط»:
 *   1. يُنشأ الأب مسودّةً بالحقول المُدخَلة.
 *   2. يُقدَّم (لمن يملك صلاحية التقديم) فيأخذ **رقمًا شرعيًّا من العدّاد** —
 *      لا رقمًا ملفّقًا كتبه المستخدم (سلامة الترقيم مقدّسة).
 *   3. يُربَط بالابن تلقائيًّا ويُغلق المعالج.
 * ومن لا يملك التقديم: يُنشأ الأب مسودّةً ويُعلَم أنّه يحتاج تقديمًا ثم ربطًا.
 *
 * خيار «رقم ورقيّ/تاريخيّ»: إن كان الرقم المكتوب لمستندٍ ورقيّ خارج النظام،
 * يُحفظ في `header.externalRef` ويُنشأ الأب بترقيم النظام الطبيعيّ — فيبقى
 * الأثران معًا (الرقم الرسميّ الجديد + المرجع الورقيّ).
 */
import { useState } from 'react';
import { useOverlayBack } from '../../../services/ui/useOverlayBack.js';
import { getSchema } from '../../../services/documents/schemas/index.js';
import { emptyDocument, allFields } from '../../../services/documents/schemaUtils.js';
import { createDraft, transitionDocument, getDocument } from '../../../services/documents/documentsService.js';
import FieldInput from './FieldInput.jsx';

export default function InlineCreateModal({ parentType, suggestedNumber, profile, onCreated, onClose }) {
  const schema = getSchema(parentType);
  const [doc, setDoc] = useState(() => emptyDocument(schema));
  const [paperMode, setPaperMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useOverlayBack(true, onClose, 'docref-inline-create');

  // معالج مصغّر: الحقول الإلزامية للرأس فقط (لا محسوب/هويّة/مرجع مستنديّ).
  const fields = allFields(schema).filter(
    (f) => f.required && !['computed', 'identity', 'docref'].includes(f.kind)
  );

  const patch = (key, value) => setDoc((d) => ({ ...d, header: { ...d.header, [key]: value } }));

  const missing = fields.filter((f) => String(doc.header?.[f.key] ?? '').trim() === '').map((f) => f.label);

  async function create() {
    if (missing.length) {
      setErr(`أكمل الحقول الإلزامية: ${missing.join(' · ')}`);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const header = { ...doc.header };
      if (paperMode && suggestedNumber) header.externalRef = String(suggestedNumber).trim();
      const id = await createDraft({
        type: parentType,
        stage: schema?.stage ?? null,
        profile,
        header,
        lines: doc.lines,
      });
      // نحاول التقديم لمنحه رقمًا شرعيًّا من العدّاد.
      try {
        await transitionDocument(id, 'submitted', { profile, schema });
        const created = await getDocument(id);
        onCreated(created, null);
      } catch {
        // لا صلاحية تقديم أو نقص — يبقى مسودّةً بلا رقم (لا يُربط بعد).
        const created = await getDocument(id);
        onCreated(
          created,
          `أُنشئ ${parentType} كمسودّة (بلا رقم بعد) — يحتاج تقديمًا من صاحب صلاحيته، ثم ارجع واكتب رقمه لربطه.`
        );
      }
    } catch (e) {
      setErr(e?.message || 'تعذّر الإنشاء');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto bg-surface border border-line rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-line sticky top-0 bg-surface">
          <div>
            <h3 className="text-base font-bold text-ink">إنشاء الأب المرجعيّ مباشرةً — {schema?.title || parentType}</h3>
            <p className="text-[11px] text-ink-2 mt-0.5">
              يُنشأ ويُقدَّم فيأخذ رقمًا شرعيًّا من العدّاد، ثم يُربط بمستندك — دون مغادرة الصفحة.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-ink-2 hover:text-ink text-xl leading-none px-2 disabled:opacity-50"
            aria-label="إغلاق"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {suggestedNumber && (
            <label className="flex items-start gap-2 text-xs text-ink-2 bg-chip border border-line rounded-lg p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={paperMode}
                onChange={(e) => setPaperMode(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-accent"
              />
              <span>
                الرقم <span className="font-mono font-bold text-ink">{suggestedNumber}</span> يعود لمستندٍ
                <strong> ورقيّ/تاريخيّ</strong> خارج النظام — احفظه كمرجع خارجيّ (<span className="font-mono">externalRef</span>)
                وامنح الأب ترقيم النظام الطبيعيّ.
              </span>
            </label>
          )}

          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {fields.map((f) => (
              <FieldInput key={f.key} field={f} doc={doc} disabled={busy} onChange={patch} />
            ))}
          </div>

          {fields.length === 0 && (
            <p className="text-xs text-ink-2">لا حقول إلزامية لهذا النوع — اضغط «إنشاء وربط» مباشرةً.</p>
          )}

          {err && (
            <div className="text-xs font-bold text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              ⚠️ {err}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-line sticky bottom-0 bg-surface">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-lg border border-line text-sm text-ink-2 hover:bg-chip disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={create}
            disabled={busy}
            className="px-5 py-2 rounded-lg bg-accent text-white text-sm font-bold hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'جارٍ الإنشاء…' : 'إنشاء وربط'}
          </button>
        </div>
      </div>
    </div>
  );
}
