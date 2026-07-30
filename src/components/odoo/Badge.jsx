/**
 * Badge — شارة حالة أودو (D2).
 * variant: draft | progress | done | warn | danger
 */
const VARIANTS = {
  draft: 'o_badge-draft',
  progress: 'o_badge-progress',
  done: 'o_badge-done',
  warn: 'o_badge-warn',
  danger: 'o_badge-danger',
};

export default function Badge({ variant = 'draft', children }) {
  return <span className={`o_badge ${VARIANTS[variant] || VARIANTS.draft}`}>{children}</span>;
}
