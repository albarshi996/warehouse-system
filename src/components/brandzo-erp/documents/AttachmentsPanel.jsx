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
  MAX_ATTACHMENT_BYTES,
} from '../../../services/documents/attachmentFile.js';
import { addAttachment } from '../../../services/documents/attachmentsService.js';

/** يقرأ ملفًا كسلسلة dataURL (لِـPDF أو كمصدرٍ للضغط). */
function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('تعذّرت قراءة الملف.'));
    r.readAsDataURL(file);
  });
}

/**
 * يضغط صورةً إلى JPEG داخل حدّ الحجم: يُصغّر أبعادها إلى سقفٍ ثم يُنقّص الجودة
 * تنازليًّا حتى تدخل `MAX_ATTACHMENT_BYTES`. يُعيد dataURL أو يرمي إن استحال.
 */
async function compressImage(file, maxDim = 1600) {
  const dataUrl = await readAsDataUrl(file);
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('تعذّر فتح الصورة.'));
    el.src = dataUrl;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // خلفية بيضاء بدل شفافية PNG السوداء عند التحويل لـJPEG
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  for (const quality of [0.72, 0.6, 0.5, 0.4, 0.32]) {
    const out = canvas.toDataURL('image/jpeg', quality);
    if (dataUrlBytes(out) <= MAX_ATTACHMENT_BYTES) return out;
  }
  // ما زالت أكبر من الحدّ: نُنصّف البُعد ونعيد الكرّة — والبُعد يتناقص فعلًا
  // (١٦٠٠ ← ٨٠٠) فيبلغ الحدّ ويتوقّف، ثمّ يُسلَّم بأدنى جودة كملاذٍ أخير.
  // (لو مرّرنا رقمًا ثابتًا لَدار التكرار أبدًا — درس المراجعة العدائية.)
  if (maxDim > 900) return compressImage(file, Math.round(maxDim / 2));
  return canvas.toDataURL('image/jpeg', 0.3);
}

/** بطاقة مرفقٍ واحد — مصغّرة تفتح الأصل في تبويب، مع من رفعها ووقتها. */
function AttachmentCard({ att }) {
  const image = isImageType(att.mime);
  const when = att.at?.toDate?.();
  const stamp = when
    ? when.toLocaleString('ar-LY-u-nu-latn', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';
  return (
    <a
      href={att.dataUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-surface border border-line rounded-xl overflow-hidden hover:border-accent/50 transition-colors"
      title={`${att.label} — ${att.byName}`}
    >
      <div className="aspect-square bg-chip flex items-center justify-center overflow-hidden">
        {image ? (
          <img src={att.dataUrl} alt={att.label} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <span className="text-4xl text-accent/70" aria-hidden="true">📄</span>
        )}
      </div>
      <div className="p-2">
        <p className="text-[11px] font-bold text-ink truncate">{att.label}</p>
        <p className="text-[10px] text-gray-500 truncate">
          {att.byName}
          {stamp ? ` · ${stamp}` : ''}
        </p>
      </div>
    </a>
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
  const slotRef = useRef({ kind: 'other', label: 'مرفق آخر' });

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
    slotRef.current = { kind, label: slot.label || kindLabel(kind) };
    const input = fileRef.current;
    if (input) {
      // نضبط capture لحظة الاختيار: كاميرا لخانات الصور، ومنتقي ملفّات لغيرها —
      // فلا يُحبَس رافع الفاتورة (PDF) في الكاميرا (درس المراجعة العدائية).
      if (CAMERA_KINDS.includes(kind)) input.setAttribute('capture', 'environment');
      else input.removeAttribute('capture');
      input.click();
    }
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
      const { kind, label } = slotRef.current;
      await addAttachment(id, {
        kind,
        label,
        name: file.name,
        mime: image ? 'image/jpeg' : file.type,
        dataUrl,
        profile: me,
      });
      setMsg({ tone: 'ok', text: `أُرفق: ${label}` });
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
              {attachments.map((att) => (
                <AttachmentCard key={att.id} att={att} />
              ))}
            </div>
          )}
      </div>
    </section>
  );
}

export { ATTACHMENT_KINDS };
