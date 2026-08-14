/**
 * لوحة المرفقات — الأدلّة الماديّة تُرفع وتُعرض على المستند.
 *
 * لماذا هنا لا في المخطّط؟ لأن الرفع تفاعلٌ يلمس المتصفّح (كاميرا · ضغط · قراءة
 * ملف) — بينما المخطّط منطقٌ خالص. اللوحة تقرأ خانات المرفقات المقترحة من
 * `schema.attachments` (فاتورة · توقيع…) وتُتيح «مرفق آخر» لِما لم يُتوقّع.
 *
 * الضغط داخل المتصفّح شرطُ بقاء: صورة الهاتف ٣–٥م.ب، وسقف مستند Firestore ١م.ب.
 * نُصغّر إلى ١٦٠٠px ونُنقّص الجودة تنازليًّا حتى تدخل الحدّ — فلا يرى الموظّف
 * رسالة حجمٍ أصلًا. وPDF (الفاتورة) يُرفع كما هو، فإن كبُر طُلب تصغيره.
 */
import { useRef, useState } from 'react';
import {
  validateSource,
  validateEncoded,
  dataUrlBytes,
  isImageType,
  kindLabel,
  ATTACHMENT_KINDS,
  versionChains,
  newVersionPayload,
} from '../../../services/documents/attachmentFile.js';
import { addAttachment } from '../../../services/documents/attachmentsService.js';
import { readAsDataUrl, compressImage } from './attachmentCapture.js';

/**
 * بطاقة **سلسلة** مرفق (SAP-11 · ف‑٢٦): تعرض الإصدار الأحدث، وتحته
 * التاريخ كاملًا — الإصدار الجديد لا يمحو السابق (§17 ‹882›)، وزرّ
 * «إصدار جديد» يفتح المنتقي وارثًا التصنيف والسلسلة.
 */
function AttachmentCard({ chain, onNewVersion, busy }) {
  const att = chain.latest;
  const image = isImageType(att.mime);
  const when = att.at?.toDate?.();
  const stamp = when
    ? when.toLocaleString('ar-LY-u-nu-latn', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';
  const sizeKb = att.size ? `${Math.round(att.size / 1024)}KB` : '';
  return (
    <div className="bg-surface border border-line rounded-xl overflow-hidden">
      <a
        href={att.dataUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block hover:opacity-90 transition-opacity"
        title={`${att.label} — ${att.byName}${att.sha256 ? `\nالبصمة: ${att.sha256}` : ''}`}
      >
        <div className="aspect-square bg-chip flex items-center justify-center overflow-hidden">
          {image ? (
            <img src={att.dataUrl} alt={att.label} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <span className="text-4xl text-accent/70" aria-hidden="true">📄</span>
          )}
        </div>
        <div className="p-2">
          <p className="text-[11px] font-bold text-ink truncate">
            {att.label}
            {chain.count > 1 && (
              <span className="ms-1 text-[10px] text-accent font-normal">إصدار {att.version || chain.count}</span>
            )}
          </p>
          <p className="text-[10px] text-gray-500 truncate">
            {att.byName}
            {stamp ? ` · ${stamp}` : ''}
            {sizeKb ? ` · ${sizeKb}` : ''}
          </p>
          {att.sha256 && (
            <p className="text-[9px] text-gray-400 truncate" style={{ direction: 'ltr', textAlign: 'right', fontFamily: 'monospace' }} title="بصمة SHA-256 — تُثبت أنّ الدليل لم يُبدَّل">
              {att.sha256.slice(0, 12)}…
            </p>
          )}
        </div>
      </a>
      <div className="px-2 pb-2 flex items-center justify-between gap-1">
        {onNewVersion && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onNewVersion(att)}
            className="text-[10px] font-bold text-accent hover:underline disabled:opacity-50"
            title="يرفع ملفًّا جديدًا في السلسلة نفسها — والسابق يبقى في التاريخ"
          >
            + إصدار جديد
          </button>
        )}
        {chain.history.length > 0 && (
          <span className="text-[9px] text-gray-500" title="الإصدارات السابقة محفوظة — افتحها من القائمة أدناه">
            {chain.history.length} سابق
          </span>
        )}
      </div>
      {chain.history.length > 0 && (
        <div className="px-2 pb-2 border-t border-line pt-1">
          {chain.history.map((old) => (
            <a
              key={old.id}
              href={old.dataUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-[9px] text-gray-500 hover:text-accent truncate"
            >
              إصدار {old.version || '؟'} — {old.byName}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * @param {object} props
 * @param {string} props.docId    معرّف المستند (لازم — لا إرفاق قبل الحفظ)
 * @param {object} props.schema   المخطّط (لخانات المرفقات المقترحة)
 * @param {object} props.me       الملف الشخصي (للهوية على كل مرفق)
 * @param {Array}  props.attachments قائمة المرفقات الحيّة (يشترك بها الأب)
 */
export default function AttachmentsPanel({ docId, schema, me, attachments = [], onEnsureDoc }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);
  const slotRef = useRef({ kind: 'other', label: 'مرفق آخر', version: 1, supersedes: null });

  /** خانات المخطّط المقترحة + «مرفق آخر» دومًا. */
  const slots = [
    ...(schema?.attachments || []),
    { key: '__other', kind: 'other', label: 'مرفق آخر' },
  ];

  /** أنواع تُلتقط بالكاميرا مباشرةً؛ ما عداها (فاتورة · نسخة موقّعة · أخرى) يفتح
   * منتقي الملفّات ليختار الموظّف PDF المورّد أو صورةً موجودة من المعرض. */
  const CAMERA_KINDS = ['goods', 'signature', 'packing'];

  function pick(slot) {
    const kind = slot.kind || 'other';
    slotRef.current = {
      kind,
      label: slot.label || kindLabel(kind),
      version: Number(slot.version) || 1,
      supersedes: slot.supersedes || null,
    };
    const input = fileRef.current;
    if (input) {
      // نضبط capture لحظة الاختيار: كاميرا لخانات الصور، ومنتقي ملفّات لغيرها —
      // فلا يُحبَس رافع الفاتورة (PDF) في الكاميرا (درس المراجعة العدائية).
      if (CAMERA_KINDS.includes(kind)) input.setAttribute('capture', 'environment');
      else input.removeAttribute('capture');
      input.click();
    }
  }

  /** «إصدار جديد» (ف‑٢٦): يفتح المنتقي وارثًا التصنيف والسلسلة من السابق. */
  function pickNewVersion(att) {
    pick(newVersionPayload(att));
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // نسمح بإعادة اختيار نفس الملف
    if (!file) return;

    const pre = validateSource(file);
    if (!pre.ok) {
      setMsg({ tone: 'err', text: pre.error });
      return;
    }

    setBusy(true);
    setMsg(null);
    try {
      // المستند الجديد يولد عند أوّل إرفاق (فعلٌ حقيقيّ) فلا مسودّة فارغة تُخلَّف.
      let id = docId;
      if (!id && onEnsureDoc) id = await onEnsureDoc();
      if (!id) {
        setMsg({ tone: 'err', text: 'تعذّر حفظ المستند لإرفاق الدليل.' });
        return;
      }
      const image = isImageType(file.type);
      const dataUrl = image ? await compressImage(file) : await readAsDataUrl(file);
      const post = validateEncoded(dataUrlBytes(dataUrl), { isImage: image });
      if (!post.ok) {
        setMsg({ tone: 'err', text: post.error });
        return;
      }
      const { kind, label, version, supersedes } = slotRef.current;
      await addAttachment(id, {
        kind,
        label,
        name: file.name,
        mime: image ? 'image/jpeg' : file.type,
        dataUrl,
        version,
        supersedes,
        profile: me,
      });
      setMsg({ tone: 'ok', text: version > 1 ? `أُرفق إصدار ${version} من: ${label}` : `أُرفق: ${label}` });
      setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      setMsg({ tone: 'err', text: err.message || 'تعذّر الرفع.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-chip border border-line rounded-2xl p-4 sm:p-5">
      <h2 className="text-base font-bold text-ink mb-1">📎 المرفقات والأدلّة</h2>
      <p className="text-[11px] text-gray-500 mb-3">
        الدليل الماديّ الذي يُطابَق عليه المستند — صورة تُضغط تلقائيًّا، أو PDF. ملحق-فقط: يُضاف ولا يُحذف.
      </p>

      {!docId && (
        <p className="text-[11px] text-accent/80 bg-accent/10 border border-accent/30 rounded-lg px-3 py-2 mb-3">
          يُحفظ المستند تلقائيًّا عند أوّل إرفاق.
        </p>
      )}
      <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={onFile}
            disabled={busy}
          />

          <div className="flex flex-wrap gap-2 mb-4">
            {slots.map((slot) => (
              <button
                key={slot.key || slot.label}
                type="button"
                disabled={busy}
                onClick={() => pick(slot)}
                className="text-xs font-bold px-3 py-1.5 rounded-lg border border-accent/40 text-accent bg-accent/10 hover:bg-accent/20 disabled:opacity-50 transition-colors"
              >
                + {slot.label}
              </button>
            ))}
          </div>

          {msg && (
            <p
              className={`text-xs rounded-lg px-3 py-2 mb-3 border ${
                msg.tone === 'err'
                  ? 'bg-brand-red/10 border-brand-red/40 text-red-300'
                  : 'bg-accent/10 border-accent/30 text-accent'
              }`}
            >
              {busy ? 'جارٍ الرفع…' : msg.text}
            </p>
          )}
          {busy && !msg && <p className="text-xs text-accent mb-3">جارٍ الضغط والرفع…</p>}

          {attachments.length === 0 ? (
            <p className="text-xs text-gray-500">لا مرفقات بعد.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {/* السلاسل لا القائمة المسطّحة (ف‑٢٦): الأحدث يتصدّر وتاريخه تحته */}
              {versionChains(attachments).map((chain) => (
                <AttachmentCard key={chain.latest.id} chain={chain} onNewVersion={pickNewVersion} busy={busy} />
              ))}
            </div>
          )}
      </div>
    </section>
  );
}

export { ATTACHMENT_KINDS };
