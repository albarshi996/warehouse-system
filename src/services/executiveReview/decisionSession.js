export const DECISION_STATES = Object.freeze({
  pending: 'لم يُحسم',
  approved: 'معتمد',
  conditional: 'معتمد بشروط',
  deferred: 'مؤجل',
  review: 'إعادة للدراسة',
});

export const EMPTY_DECISION = Object.freeze({
  status: 'pending',
  note: '',
  owner: '',
  due: '',
});

export function createDecisionSession(count) {
  return {
    version: 1,
    updatedAt: null,
    decisions: Array.from({ length: Math.max(0, count) }, () => ({ ...EMPTY_DECISION })),
  };
}
export function normalizeDecisionSession(value, count) {
  const clean = createDecisionSession(count);
  if (!value || !Array.isArray(value.decisions)) return clean;

  clean.updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : null;
  clean.decisions = clean.decisions.map((empty, index) => {
    const item = value.decisions[index];
    if (!item || typeof item !== 'object') return empty;
    return {
      status: Object.hasOwn(DECISION_STATES, item.status) ? item.status : 'pending',
      note: typeof item.note === 'string' ? item.note : '',
      owner: typeof item.owner === 'string' ? item.owner : '',
      due: typeof item.due === 'string' ? item.due : '',
    };
  });
  return clean;
}

export function updateDecision(session, index, patch) {
  if (!session?.decisions?.[index]) return session;
  const decisions = session.decisions.map((item, itemIndex) => (
    itemIndex === index ? { ...item, ...patch } : item
  ));
  return { ...session, updatedAt: new Date().toISOString(), decisions };
}

export function summarizeDecisionSession(session) {
  const counts = Object.fromEntries(Object.keys(DECISION_STATES).map((key) => [key, 0]));
  for (const item of session?.decisions ?? []) {
    const status = Object.hasOwn(counts, item.status) ? item.status : 'pending';
    counts[status] += 1;
  }
  const total = session?.decisions?.length ?? 0;
  const resolved = total - counts.pending;
  return { ...counts, total, resolved, remaining: counts.pending };
}
