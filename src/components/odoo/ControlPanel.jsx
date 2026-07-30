/**
 * ControlPanel — لوحة التحكم العلوية لأودو (D2 · النمط ١).
 * مسار التنقّل + أزرار الإجراء في جهة، وحقل بحث بالرقائق ومبدّل عرض وعدّاد
 * سجلات في الجهة المقابلة.
 *
 * props:
 *   breadcrumb: [{ label, href?, active? }]
 *   actions:    [{ label, variant='secondary', onClick? }]
 *   facets:     [{ key, val }]
 *   searchPlaceholder: string
 *   pager:      { current, total }   // نصّ جاهز أو أرقام لاتينية مسبقًا
 *   views:      [{ id, glyph, active? }]
 */
export default function ControlPanel({
  breadcrumb = [],
  actions = [],
  facets = [],
  searchPlaceholder = 'بحث…',
  pager = null,
  views = [],
}) {
  return (
    <div className="o_control_panel">
      <div className="o_cp_start">
        {breadcrumb.length > 0 && (
          <nav className="o_breadcrumb" aria-label="مسار التنقّل">
            {breadcrumb.map((b, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                {i > 0 && <span className="o_sep">/</span>}
                {b.active ? (
                  <span className="o_active">{b.label}</span>
                ) : (
                  <a href={b.href || '#'}>{b.label}</a>
                )}
              </span>
            ))}
          </nav>
        )}
        {actions.map((a, i) => (
          <button key={i} type="button" className={`btn btn-${a.variant || 'secondary'}`} onClick={a.onClick}>
            {a.label}
          </button>
        ))}
      </div>

      <div className="o_cp_end">
        <div className="o_searchview">
          <span className="o_searchview_icon" aria-hidden="true">⌕</span>
          {facets.map((f, i) => (
            <span className="o_facet" key={i}>
              <span className="o_facet_key">{f.key}</span>
              <span className="o_facet_val">{f.val}</span>
            </span>
          ))}
          <input type="text" placeholder={searchPlaceholder} aria-label="بحث" />
        </div>
        {pager && (
          <span className="o_pager">
            {pager.current} / {pager.total}
          </span>
        )}
        {views.length > 0 && (
          <div className="o_switch_view" role="group" aria-label="مبدّل العرض">
            {views.map((v) => (
              <button
                key={v.id}
                type="button"
                className={v.active ? 'active' : ''}
                aria-pressed={!!v.active}
                aria-label={v.label || v.id}
                title={v.label || v.id}
              >
                {v.glyph}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
