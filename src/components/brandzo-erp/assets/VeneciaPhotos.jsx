/**
 * صورُ أصل مخزن فينسيا ‹VEN-401› — ضغطٌ في المتصفّح ثمّ رفعٌ إلى المرفقات.
 *
 * ═══ ★★★ ولا صورةَ تسكن سجلَّ الأصل ═══
 * الصورُ في `entity_attachments` (صنف `venecia_asset`)، و`listenEntityAttachments`
 * **لا يُستدعى إلّا حين يُفتح لوحُ الأصل** — أي حين يكون هذا المكوّن مرسومًا.
 * فما دام أحدٌ لا ينظر إلى صورة، تكلفتُها صفر. والذي يسكن السجلَّ حقلان:
 * مصغَّرةٌ بحدٍّ ثمانيةِ كيلوبايت وعدَد.
 *
 * ═══ ★★ والضغطُ قبل الرفع لا بعده ═══
 * صورةُ هاتفٍ بأربعةِ ميغابايت تصير ≈ ١٣٠ ك.ب: تصغيرٌ إلى ١٢٨٠ بكسل
 * وWebP بجودة ٠٫٧٢. والسقفُ القائم (٧٠٠ ك.ب) يبقى **حارسًا يرفض** لا هدفًا.
 *
 * ═══ ★ والقرارات كلُّها في `veneciaPhotos` المختبَر ═══
 * الحدودُ والأبعادُ والأحكامُ والبصمةُ والمصغَّرة — وهذا الملفّ يملك ما لا
 * يُنجَز إلّا في المتصفّح: اللوحةَ (`canvas`) وقراءةَ الملفّ.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import Icon from '../../ui/Icon.jsx';
import { sha256Hex } from '../../../services/documents/attachmentFile.js';
import {
  addEntityAttachment,
  listenEntityAttachments,
} from '../../../services/documents/attachmentsService.js';
import {
  PHOTO_LIMITS,
  VENECIA_ENTITY_KIND,
  duplicateOf,
  encodedVerdict,
  fitWithin,
  photoPayload,
  photoSummary,
  photoVerdict,
  quotaEstimate,
  thumbVerdict,
} from '../../../services/assets/veneciaPhotos.js';
import { setAssetPhotoBadge } from '../../../services/assets/veneciaService.js';

const kb = (n) => `${Math.round((Number(n) || 0) / 1024)} ك.ب`;

/**
 * يرسم الصورةَ على لوحةٍ بالأبعاد المطلوبة ويُعيد dataURL مضغوطًا.
 * WebP أوّلًا، و**JPEG احتياطًا**: متصفّحٌ قديمٌ قد يتجاهل `image/webp`
 * فيُعيد PNG عملاقًا من حيث لا يُشعر — فيُفحص الناتجُ لا يُفترض.
 */
async function drawCompressed(bitmap, { width, height, quality }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  const webp = canvas.toDataURL('image/webp', quality);
  if (webp.startsWith('data:image/webp')) return { dataUrl: webp, mime: 'image/webp' };
  return { dataUrl: canvas.toDataURL('image/jpeg', quality), mime: 'image/jpeg' };
}

/** يقرأ الملفّ صورةً قابلةً للرسم — ويُغلقها بعد الاستعمال. */
async function toBitmap(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('تعذّرت قراءةُ الصورة.'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * @param {{ asset: object, canWrite: boolean, profile: object, assetsCount?: number }} props
 */
export default function VeneciaPhotos({ asset, canWrite = false, profile = null, assetsCount = 0 }) {
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({ tone: '', text: '' });
  const [zoom, setZoom] = useState(null);
  const fileRef = useRef(null);

  const entityId = asset?.docId || '';

  // ★ المستمعُ هنا لا في اللوحة — فالصورُ لا تُقرأ إلّا ولوحُ الأصل مفتوح.
  useEffect(() => {
    if (!entityId) return setPhotos([]);
    return listenEntityAttachments(VENECIA_ENTITY_KIND, entityId, setPhotos);
  }, [entityId]);

  const summary = useMemo(() => photoSummary(photos), [photos]);
  const quota = useMemo(() => quotaEstimate({ assets: assetsCount }), [assetsCount]);

  async function onPick(e) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;

    const verdict = photoVerdict(file, { count: summary.count });
    if (!verdict.ok) return setMsg({ tone: 'bad', text: verdict.problems.join('\n') });

    setBusy('تُضغط…');
    setMsg({ tone: '', text: '' });
    try {
      const bitmap = await toBitmap(file);
      const size = fitWithin(bitmap.width, bitmap.height, PHOTO_LIMITS.maxEdge);
      const full = await drawCompressed(bitmap, { ...size, quality: PHOTO_LIMITS.quality });

      const encoded = encodedVerdict(full.dataUrl);
      if (!encoded.ok) throw new Error(encoded.problems.join('\n'));

      // البصمةُ تكشف المكرَّرة قبل أن تُكتب — فلا تُخزَّن الصورةُ مرّتين.
      // وتُحسب هنا بنفس دالّة الخدمة، فتُطابق حقلَ `sha256` الذي تكتبه هي.
      const sha256 = await sha256Hex(full.dataUrl);
      const twin = duplicateOf(sha256, photos);
      if (twin) throw new Error('هذه الصورةُ مرفوعةٌ سلفًا على هذا الأصل.');

      setBusy('تُرفع…');
      // ولا تُمرَّر حقولٌ زائدة: `attachmentBody` تبني شكلًا ثابتًا وتُسقط
      // ما لا تعرفه — والبصمةُ والحجمُ تحسبهما بنفسها (`sha256` · `size`).
      await addEntityAttachment(
        VENECIA_ENTITY_KIND,
        entityId,
        photoPayload({ dataUrl: full.dataUrl, name: file.name, mime: full.mime, profile })
      );

      // ثمّ المصغَّرةُ على السجلّ — وهي وحدَها ما تقرؤه القائمة.
      const thumbSize = fitWithin(bitmap.width, bitmap.height, PHOTO_LIMITS.thumbEdge);
      const thumb = await drawCompressed(bitmap, { ...thumbSize, quality: PHOTO_LIMITS.thumbQuality });
      const tv = thumbVerdict(thumb.dataUrl);
      await setAssetPhotoBadge(
        entityId,
        { photos: [...photos, { sha256 }], thumbDataUrl: tv.ok ? thumb.dataUrl : '' },
        profile
      );
      bitmap.close?.();

      setMsg({
        tone: 'ok',
        text:
          `رُفعت الصورةُ — ${kb(file.size)} ← ${kb(encoded.bytes)} بعد الضغط` +
          (tv.ok ? ` ومصغَّرةٌ ${kb(tv.bytes)} على السجلّ.` : ' · وتعذّرت المصغَّرةُ فلم تُخزَّن.'),
      });
    } catch (err) {
      setMsg({ tone: 'bad', text: err?.message || 'تعذّر رفعُ الصورة.' });
    } finally {
      setBusy('');
    }
  }

  if (!asset) return null;

  return (
    <div className="rounded-lg border border-line p-3 space-y-2">
      <div className="font-bold text-[13px] text-ink flex items-center gap-1.5 flex-wrap">
        <Icon name="image" size={14} /> الصور
        <span className="text-[10px] font-normal text-muted">
          {summary.count}/{PHOTO_LIMITS.maxPerAsset}
          {summary.count ? ` · ${kb(summary.bytes)}` : ''}
        </span>
        <label className={`btn btn-secondary btn-sm ms-auto ${canWrite && !busy ? 'cursor-pointer' : 'opacity-60'}`}>
          أضف صورة
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="hidden"
            disabled={!canWrite || !!busy || summary.remaining === 0}
            onChange={onPick}
          />
        </label>
      </div>

      <div className="text-[10px] text-muted leading-relaxed">
        تُصغَّر إلى {PHOTO_LIMITS.maxEdge} بكسل قبل الرفع، وتُحفظ <strong>خارج سجلّ الأصل</strong> — فلا
        تُقرأ إلّا وأنت تنظر إليها. والقائمةُ تقرأ مصغَّرةً بحدّ {kb(PHOTO_LIMITS.thumbMaxBytes)} فقط.
        {assetsCount > 0 && (
          <> وبسقف {PHOTO_LIMITS.maxPerAsset} صورٍ لكلّ أصل: {quota.percentOfGb}٪ من الحصّة.</>
        )}
      </div>

      {busy && <div className="text-[11px] font-bold text-accent">{busy}</div>}
      {msg.text && (
        <div
          className={`rounded-lg text-[11px] p-2 border whitespace-pre-line ${
            msg.tone === 'bad'
              ? 'border-brand-red/40 bg-brand-red/5 text-brand-red'
              : 'border-accent/40 bg-accent/5 text-ink-2'
          }`}
        >
          {msg.text}
        </div>
      )}

      {!photos.length ? (
        <div className="text-[11px] text-muted">لا صورةَ بعد.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <button
              key={p.id}
              type="button"
              className="rounded border border-line overflow-hidden"
              style={{ width: 72, height: 72, padding: 0 }}
              title={`${p.name || 'صورة'} · ${kb(p.size)}`}
              onClick={() => setZoom(p)}
            >
              <img
                src={p.dataUrl}
                alt={p.name || 'صورة الأصل'}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </button>
          ))}
        </div>
      )}

      {zoom && (
        <div className="rounded-lg border border-line p-2 space-y-1.5">
          <img
            src={zoom.dataUrl}
            alt={zoom.name || 'صورة الأصل'}
            style={{ maxWidth: '100%', maxHeight: '60vh', display: 'block', margin: '0 auto' }}
          />
          <div className="flex items-center gap-2 text-[10px] text-muted">
            {/* الأبعادُ من الصورة المرسومة — الخدمةُ لا تحفظها، ولا داعيَ لحفظها. */}
            <span>
              {zoom.name || 'صورة'} · {kb(zoom.size)}
            </span>
            <span className="ms-auto">{zoom.byName || ''}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setZoom(null)}>
              أغلق
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
