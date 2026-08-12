/** عرضٌ خالص لحالة شريط المستند، كي تُختبر الدلالات بلا متصفح أو JSX. */

export function navigatorButtons(navigator) {
  const currentId = navigator?.current?.id || navigator?.currentId || null;
  return [
    { key: 'first', label: 'الأول', icon: 'chevronsRight', target: navigator?.first || null },
    { key: 'previous', label: 'السابق', icon: 'chevronRight', target: navigator?.previous || null },
    { key: 'next', label: 'التالي', icon: 'chevronLeft', target: navigator?.next || null },
    { key: 'last', label: 'الأخير', icon: 'chevronsLeft', target: navigator?.last || null },
  ].map((button) => ({
    ...button,
    disabled: !button.target || button.target.id === currentId,
  }));
}

function count(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export function documentActionItems({
  saved = false,
  relationCount = 0,
  attachmentCount = 0,
  auditCount = 0,
  approvalCount = 0,
  stockMoveCount = 0,
  financialEntryCount = 0,
} = {}) {
  const disabled = !saved;
  return [
    {
      key: 'relations', label: 'العلاقات', icon: 'workflows', count: count(relationCount),
      targetId: 'document-relations', disabled,
      summary: 'مصادر المستند ونتائجه ومراجعه المباشرة.',
    },
    {
      key: 'attachments', label: 'المرفقات', icon: 'paperclip', count: count(attachmentCount),
      targetId: 'document-attachments', disabled,
      summary: 'الأدلة والصور والنسخ الموقعة الملحقة بالمستند.',
    },
    {
      key: 'audit', label: 'السجل', icon: 'history', count: count(auditCount),
      targetId: 'document-audit', disabled,
      summary: 'سجل التدقيق الدائم لهذا المستند.',
    },
    {
      key: 'approvals', label: 'الموافقات', icon: 'shieldCheck', count: count(approvalCount),
      targetId: 'document-approvals', disabled,
      summary: 'حالة المستند وانتقالاته وقرارات الاعتماد.',
    },
    {
      key: 'stock', label: 'الأثر المخزني', icon: 'package', count: count(stockMoveCount),
      targetId: null, disabled,
      summary: stockMoveCount > 0
        ? `قُيّد للمستند ${count(stockMoveCount)} أثر مخزني.`
        : 'لا أثر مخزني مثبت على المستند حتى الآن.',
    },
    {
      key: 'financial', label: 'الأثر المالي', icon: 'dollarSign', count: count(financialEntryCount),
      targetId: null, disabled,
      summary: financialEntryCount > 0
        ? `قُيّد للمستند ${count(financialEntryCount)} أثر مالي.`
        : 'لا أثر مالي مثبت على المستند حتى الآن.',
    },
  ];
}

export function approvalAuditCount(entries) {
  const actions = new Set(['submitted', 'approved', 'rejected', 'done']);
  return (entries || []).filter((entry) => actions.has(entry?.action)).length;
}
