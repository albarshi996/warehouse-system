/**
 * بطاقةُ هويّة الممسوح — «يقرأ الباركود أوّلًا، يظهر الاسم، ثمّ تُكتب البيانات»
 * (طلب المالك · 2026-10-02).
 *
 * ★★★ **الاسمُ أوّلًا وبأكبر خطٍّ في الشاشة.** هذا ليس ذوقًا: العاملُ يقف
 * عند الشاحنة بهاتفٍ في يدٍ وكرتونةٍ في الأخرى، ويقرأ **سطرًا واحدًا** قبل
 * أن يضغط. فإن كان ذلك السطرُ رقمًا من ثلاث عشرة خانة فهو لم يقرأ شيئًا.
 *
 * ★★ والرمزُ والباركودُ تحته بخطٍّ صغير: يُحتاجان عند الشكّ لا في كلّ مسحة.
 *
 * ★ ولا أحمرَ إلّا للتحذير (قاعدة R): «ضمن الأمر» خضراء، و«غيرُ مذكورٍ في
 * الأمر» **صفراء لا حمراء** — فهي ليست خطأً بل أمرًا يستحقّ نظرة. والأحمرُ
 * للمجهول وحده، وهو الحالةُ التي لا تُقيَّد فعلًا.
 *
 * مكوّنُ عرضٍ خالص: لا حالةَ فيه ولا حكم — كلُّ الحكم في
 * `services/scan/scanIdentity.js` المُختبَر.
 */
import Icon from '../../ui/Icon.jsx';
import { SCAN_PHASES, expectationBadge } from '../../../services/scan/scanIdentity.js';

export default function ScannedIdentity({ identity, missing = '', children, onClear }) {
  const phase = identity?.phase || SCAN_PHASES.idle.id;

  /* ── لا مسحَ بعد: دعوةٌ صريحة لا شاشةٌ خالية ── */
  if (phase === SCAN_PHASES.idle.id) {
    return (
      <div style={card('var(--o-gray-300)', 'var(--o-gray-100)')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Icon name="package" size={22} />
          <div>
            <strong style={{ fontSize: '15px' }}>{SCAN_PHASES.idle.title}</strong>
            <p style={hintStyle}>{SCAN_PHASES.idle.hint}</p>
          </div>
        </div>
        {identity?.problem && <p style={{ ...hintStyle, marginTop: '8px' }}>{identity.problem}</p>}
      </div>
    );
  }

  /* ── مجهول: يُسمّى رمزُه ويُقال إنّه لا يُقيَّد ── */
  if (phase === SCAN_PHASES.unknown.id) {
    return (
      <div style={card('var(--o-brand-primary)', '#fdecec')}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <Icon name="alertTriangle" size={22} />
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: '15px' }}>{SCAN_PHASES.unknown.title}</strong>
            <p style={{ ...codeStyle, fontSize: '15px', margin: '4px 0' }}>{identity.code}</p>
            <p style={hintStyle}>{SCAN_PHASES.unknown.hint}</p>
          </div>
          {onClear && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClear}>
              <Icon name="x" size={13} /> إلغاء
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ── معرَّف: الاسمُ أوّلًا ── */
  const badge = expectationBadge(identity.expectation);
  return (
    <div style={card('var(--o-brand-primary)', 'var(--o-brand-light)')}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '11px', color: 'var(--o-main-color-muted)', letterSpacing: '.2px' }}>
            الصنف الممسوح
          </span>
          {/* ★★★ أكبرُ خطٍّ في الشاشة — هو السطرُ الذي يُقرأ قبل الضغط. */}
          <h3 style={{ margin: '2px 0 6px', fontSize: '20px', lineHeight: 1.35, fontWeight: 800 }}>
            {identity.name}
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
            {identity.lines.map((l) => (
              <span key={l.label} style={{ fontSize: '11.5px', color: 'var(--o-main-color-muted)' }}>
                {l.label}:{' '}
                <span style={l.label === 'الرمز' || l.label === 'الباركود الممسوح' ? codeStyle : undefined}>
                  {l.value}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
          {badge && (
            <span
              style={{
                whiteSpace: 'nowrap', padding: '3px 10px', borderRadius: '999px', fontSize: '11px',
                fontWeight: 700,
                background: badge.tone === 'ok' ? '#eef6f0' : '#fdf6e3',
                color: badge.tone === 'ok' ? '#146c43' : '#8a6d1b',
                border: `1px solid ${badge.tone === 'ok' ? '#cfe6d6' : '#efe0b8'}`,
              }}
            >
              {badge.label}
            </span>
          )}
          {onClear && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClear}>
              <Icon name="x" size={13} /> صنفٌ آخر
            </button>
          )}
        </div>
      </div>

      {/* ── ثمّ تُكتب البيانات ── */}
      {children && (
        <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed var(--o-gray-300)' }}>
          {children}
        </div>
      )}

      {/* الناقصُ مسمّىً — لا «أكمل البيانات» المبهمة */}
      {missing && (
        <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#8a6d1b', fontWeight: 600 }}>
          <Icon name="alertTriangle" size={13} /> {missing}
        </p>
      )}
    </div>
  );
}

const card = (border, bg) => ({
  border: `1px solid ${border}`,
  background: bg,
  borderRadius: 'var(--o-border-radius-lg, 10px)',
  padding: '12px 14px',
  marginBottom: '12px',
});

const hintStyle = {
  margin: '3px 0 0',
  fontSize: '12px',
  color: 'var(--o-main-color-muted)',
  lineHeight: 1.7,
};

/* الرمزُ اللاتينيُّ معزولٌ داخل نصٍّ عربيّ — بلا عزله تهاجر شُرَطُه وأقواسُه
   إلى أوّله فيُقرأ مقلوبًا، وهو مزلقٌ متكرّرٌ في كلّ شاشةٍ تعرض باركودًا. */
const codeStyle = { fontFamily: 'monospace', direction: 'ltr', unicodeBidi: 'isolate' };
