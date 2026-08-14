/**
 * مرفقات البطاقة — صنفٌ أو مورّد أو عميل (SAP-11 · يسدّ ف‑٢٨ · SR-55).
 *
 * شهادة الصنف وصورته، عقد المورّد، سجلّ العميل — «المرفق كائنٌ موثَّق، لا
 * رابطٌ داخل ملاحظة» (§17 ‹865›). نفس عقد مرفقات المستندات حرفيًّا: نفس
 * الفحص والضغط (`attachmentCapture`) ونفس الجسم بالبصمة والحجم والإصدار،
 * ونفس نموذج الإلحاق-فقط — والاختلاف الوحيد مفتاح التتبّع: كيانٌ لا مستند.
 *
 * ⚠️ الكتابة الحيّة مرهونة بنشر قاعدة `entity_attachments` (قرار المالك).
 */
import { useEffect, useState, useRef } from 'react';
import {
  validateSource,
  validateEncoded,
  dataUrlBytes,
  isImageType,
  versionChains,
  newVersionPayload,
} from '../../../services/documents/attachmentFile.js';
import {
  addEntityAttachment,
  listenEntityAttachments,
} from '../../../services/documents/attachmentsService.js';
import { readAsDataUrl, compressImage } from './attachmentCapture.js';

export default function EntityAttachments({ entityKind, entityId, me }) {
  const [attachments, setAttachments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { kind: 'ok'|'err', text }
  const fileRef = useRef(null);
  const slotRef = useRef({ version: 1, supersedes: null, kind: 'other', label: 'مرفق' });

  useEffect(() => {
    return listenEntityAttachments(entityKind, entityId, setAttachments);
  }, [entityKind, entityId]);

  function pick(slot = { version: 1, supersedes: null, kind: 'other', label: 'مرفق' }) {
    slotRef.current = slot;
    fileRef.current?.click();
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const pre = validateSource(file);
    if (!pre.ok) {
      setMsg({ kind: 'err', text: pre.error });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const image = isImageType(file.type);
      const dataUrl = image ? await compressImage(file) : await readAsDataUrl(file);
      const post = validateEncoded(dataUrlBytes(dataUrl), { isImage: image });
      if (!post.ok) {
        setMsg({ kind: 'err', text: post.error });
        return;
      }
      const { kind, label, version, supersedes } = slotRef.current;
      await addEntityAttachment(entityKind, entityId, {
        kind,
        label: label === 'مرفق' ? file.name : label,
        name: file.name,
        mime: image ? 'image/jpeg' : file.type,
        dataUrl,
        version,
        supersedes,
        profile: me,
      });
      setMsg({ kind: 'ok', text: version > 1 ? `أُرفق إصدار ${version}.` : 'أُرفق.' });
      setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      setMsg({ kind: 'err', text: err?.message ?? 'تعذّر الرفع — هل نُشرت قاعدة entity_attachments؟' });
    } finally {
      setBusy(false);
    }
  }

  const chains = versionChains(attachments);

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        style={{ display: 'none' }}
        onChange={onFile}
        disabled={busy}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: chains.length ? '8px' : 0 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => pick()} disabled={busy}>
          {busy ? 'جارٍ الرفع…' : '+ إضافة مرفق'}
        </button>
        {msg && (
          <span style={{ fontSize: '11px', color: msg.kind === 'err' ? 'var(--o-text-danger, #b3261e)' : 'var(--o-text-success, #1a7f37)' }}>
            {msg.text}
          </span>
        )}
      </div>

      {chains.length === 0 ? (
        <p style={{ margin: '6px 0 0', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
          لا مرفقات — صورة تُضغط تلقائيًّا أو PDF، ملحق-فقط لا يُحذف.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--o-font-size-xs)' }}>
          <tbody>
            {chains.map((chain) => {
              const att = chain.latest;
              return (
                <tr key={att.id} style={{ borderTop: '1px solid var(--o-border-color, #e5e5ea)' }}>
                  <td style={{ padding: '5px 4px' }}>
                    <a href={att.dataUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--o-action)', fontWeight: 'var(--o-font-weight-bold)' }}>
                      {att.label || att.name}
                    </a>
                    {chain.count > 1 && (
                      <span style={{ marginInlineStart: '5px', fontSize: '10px', color: 'var(--o-main-color-muted)' }}>
                        إصدار {att.version || chain.count} · {chain.history.length} سابق
                      </span>
                    )}
                    <div style={{ fontSize: '9px', color: 'var(--o-main-color-muted)' }}>
                      {att.byName}
                      {att.size ? ` · ${Math.round(att.size / 1024)}KB` : ''}
                      {att.sha256 && (
                        <span style={{ fontFamily: 'monospace', direction: 'ltr', display: 'inline-block', marginInlineStart: '4px' }} title={`البصمة: ${att.sha256}`}>
                          {att.sha256.slice(0, 10)}…
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '5px 4px', whiteSpace: 'nowrap', textAlign: 'left' }}>
                    <button
                      type="button"
                      className="btn btn-link btn-sm"
                      style={{ padding: '2px 6px' }}
                      onClick={() => pick(newVersionPayload(att))}
                      disabled={busy}
                      title="ملفٌّ جديد في السلسلة نفسها — والسابق يبقى"
                    >
                      إصدار جديد
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
