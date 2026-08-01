/**
 * Pager — شريط ترقيم بنمط أودو («١–٥٠ / ٢٤٣» بسهمين) — «العملية الجراحية» المحور ٧.
 *
 * يحلّ محلّ قصّ الذيل الصامت: يعرض المدى والإجمالي ويتنقّل بين الصفحات فلا
 * يضيع صفٌّ. خالٍ من المنطق — يستمدّ كلّ شيء من `pageInfo` الخالصة. أنماطه
 * سطريّة مكتفية ذاتيًّا (لا يعتمد `.o_theme`) فيعمل داخل أيّ شاشة.
 *
 * props: total · page (0-index) · size · onPage(newPage)
 */
import { pageInfo } from '../../services/ui/pagination.js';

const WRAP = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 12.5,
  color: '#6b7280',
};
const COUNTER = { fontVariantNumeric: 'tabular-nums', fontWeight: 700, direction: 'ltr' };
const BTN = {
  width: 26,
  height: 26,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid #dee2e6',
  borderRadius: 6,
  background: '#fff',
  color: '#374151',
  fontSize: 16,
  lineHeight: 1,
  cursor: 'pointer',
};
const BTN_OFF = { ...BTN, opacity: 0.4, cursor: 'default' };

export default function Pager({ total, page, size = 50, onPage }) {
  const info = pageInfo(total, page, size);
  if (info.total <= size) return null; // صفحة واحدة ⇒ لا حاجة للشريط

  return (
    <div style={WRAP} role="navigation" aria-label="ترقيم الصفحات">
      <span style={COUNTER}>{info.label}</span>
      <span style={{ display: 'inline-flex', gap: 4 }}>
        <button
          type="button"
          style={info.hasPrev ? BTN : BTN_OFF}
          disabled={!info.hasPrev}
          onClick={() => onPage?.(info.page - 1)}
          aria-label="الصفحة السابقة"
          title="السابقة"
        >
          ‹
        </button>
        <button
          type="button"
          style={info.hasNext ? BTN : BTN_OFF}
          disabled={!info.hasNext}
          onClick={() => onPage?.(info.page + 1)}
          aria-label="الصفحة التالية"
          title="التالية"
        >
          ›
        </button>
      </span>
    </div>
  );
}
