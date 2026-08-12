import { useMemo } from 'react';

import Icon from '../../ui/Icon.jsx';
import { getSchema } from '../../../services/documents/schemas/index.js';
import { getState } from '../../../services/documents/states.js';
import {
  buildDocumentRelationshipGraph,
  relationshipMetric,
} from '../../../services/documents/documentRelationshipGraph.js';

function formatDate(value) {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('ar-LY-u-nu-latn', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

function RelationshipNode({ node, current = false }) {
  const schema = getSchema(node.type);
  const state = node.state ? getState(node.state) : null;
  const content = (
    <>
      <span style={{ fontSize: '10px', color: 'var(--o-gray-500)', fontWeight: 700 }}>
        {schema?.titleAr || node.type}
      </span>
      <strong style={{ fontSize: '13px', color: 'var(--o-main-text-color)' }}>
        {node.number || 'مسودّة بلا رقم'}
      </strong>
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', fontSize: '10px', color: 'var(--o-gray-500)' }}>
        {state && <span style={{ color: state.color, fontWeight: 700 }}>{state.label}</span>}
        {formatDate(node.date) && <span>{formatDate(node.date)}</span>}
        {node.byName && <span>{node.byName}</span>}
      </span>
    </>
  );
  const style = {
    display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0,
    padding: '10px 12px', borderRadius: 'var(--o-border-radius-lg)',
    border: current ? '2px solid var(--o-brand-primary)' : '1px solid var(--o-border-color)',
    background: current ? 'var(--o-gray-100)' : 'var(--o-white)',
    textDecoration: 'none', boxShadow: '0 2px 8px rgba(31, 41, 55, 0.06)',
  };
  return current
    ? <div dir="rtl" style={style} aria-current="page">{content}</div>
    : <a dir="rtl" href={node.href} style={style}>{content}</a>;
}

function EdgeFacts({ edge }) {
  const when = formatDate(edge.createdAt);
  return (
    <div dir="rtl" style={{ fontSize: '10px', color: 'var(--o-gray-500)', lineHeight: 1.6 }}>
      <div style={{ color: edge.color, fontWeight: 700 }}>{edge.label}</div>
      <div>{relationshipMetric(edge)}</div>
      {(edge.byNames.length > 0 || when) && (
        <div>{[edge.byNames.join('، '), when].filter(Boolean).join(' · ')}</div>
      )}
      {edge.legacy && <div>توافق قراءة من الروابط القديمة</div>}
    </div>
  );
}

function Connector({ edge }) {
  return (
    <div aria-hidden="true" style={{ minWidth: 0, alignSelf: 'center' }}>
      <div style={{ borderTop: `2px ${edge.lineStyle} ${edge.color}`, width: '100%' }} />
    </div>
  );
}

function IncomingBranch({ edge }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(145px, 1fr) minmax(50px, 0.42fr)', alignItems: 'center' }}>
      <div style={{ minWidth: 0 }}>
        <RelationshipNode node={edge.node} />
        <EdgeFacts edge={edge} />
      </div>
      <Connector edge={edge} />
    </div>
  );
}

function OutgoingBranch({ edge }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(50px, 0.42fr) minmax(145px, 1fr)', alignItems: 'center' }}>
      <Connector edge={edge} />
      <div style={{ minWidth: 0 }}>
        <RelationshipNode node={edge.node} />
        <EdgeFacts edge={edge} />
      </div>
    </div>
  );
}

function MobileBranch({ edge, title }) {
  return (
    <div style={{ borderInlineStart: `2px ${edge.lineStyle} ${edge.color}`, paddingInlineStart: '10px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--o-gray-500)', marginBottom: '5px' }}>{title}</div>
      <RelationshipNode node={edge.node} />
      <EdgeFacts edge={edge} />
    </div>
  );
}

export default function DocumentRelationshipMap({
  current,
  relations,
  documents,
  storedAvailable = true,
  basePath,
}) {
  const graph = useMemo(() => buildDocumentRelationshipGraph({
    current, relations, documents, basePath,
  }), [current, relations, documents, basePath]);

  if (!graph.current) return null;

  return (
    <section className="o_theme" aria-label="خريطة علاقات المستند">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'start', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '7px', margin: 0, fontSize: '15px', color: 'var(--o-main-text-color)' }}>
            <Icon name="workflows" size={17} />
            خريطة علاقات المستند
          </h2>
          <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--o-gray-500)' }}>
            المصادر والنتائج والمراجع والمرتجعات والتصحيحات والعكس، منفصلة عن تنقّل النوع.
          </p>
        </div>
        <span style={{ fontSize: '11px', color: 'var(--o-gray-500)' }}>
          {graph.nodeCount} مستند · {graph.relationCount} علاقة
        </span>
      </div>

      {!storedAvailable && (
        <p role="status" style={{ margin: '0 0 10px', padding: '7px 10px', border: '1px solid var(--o-warning)', borderRadius: 'var(--o-border-radius)', background: 'var(--o-badge-warning-bg)', color: 'var(--o-text-warning)', fontSize: '11px' }}>
          مجموعة العلاقات الجديدة غير متاحة في هذه الجلسة؛ المعروض الآن توافق قراءة من روابط المستندات القديمة.
        </p>
      )}

      {graph.incoming.length === 0 && graph.outgoing.length === 0 ? (
        <div style={{ display: 'grid', justifyContent: 'center', gap: '8px' }}>
          <RelationshipNode node={graph.current} current />
          <p style={{ margin: 0, textAlign: 'center', fontSize: '11px', color: 'var(--o-gray-500)' }}>
            لا علاقات مثبتة لهذا المستند حتى الآن.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden lg:grid" dir="ltr" style={{ gridTemplateColumns: 'minmax(220px, 1fr) minmax(170px, 0.65fr) minmax(220px, 1fr)', alignItems: 'center' }}>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div dir="rtl" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--o-gray-500)' }}>المصادر والمراجع الواردة</div>
              {graph.incoming.length
                ? graph.incoming.map((edge) => <IncomingBranch key={edge.key} edge={edge} />)
                : <span dir="rtl" style={{ fontSize: '11px', color: 'var(--o-gray-500)' }}>لا مصدر وارد</span>}
            </div>
            <RelationshipNode node={graph.current} current />
            <div style={{ display: 'grid', gap: '12px' }}>
              <div dir="rtl" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--o-gray-500)' }}>النتائج والعلاقات الصادرة</div>
              {graph.outgoing.length
                ? graph.outgoing.map((edge) => <OutgoingBranch key={edge.key} edge={edge} />)
                : <span dir="rtl" style={{ fontSize: '11px', color: 'var(--o-gray-500)' }}>لا نتيجة صادرة</span>}
            </div>
          </div>

          <div className="grid gap-3 lg:hidden">
            {graph.incoming.map((edge) => <MobileBranch key={edge.key} edge={edge} title="مصدر أو مرجع وارد" />)}
            <RelationshipNode node={graph.current} current />
            {graph.outgoing.map((edge) => <MobileBranch key={edge.key} edge={edge} title="نتيجة أو علاقة صادرة" />)}
          </div>
        </>
      )}
    </section>
  );
}
