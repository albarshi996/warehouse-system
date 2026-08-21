import { useEffect, useMemo, useState } from 'react';

import Icon from '../../ui/Icon.jsx';
import { listenDocumentsByTypes } from '../../../services/documents/documentsService.js';
import { documentNavigator } from '../../../services/documents/documentNavigator.js';
import {
  documentActionItems,
  navigatorButtons,
} from '../../DocumentNavigatorModel.js';

export default function DocumentNavigator({
  type,
  currentId,
  canCreate,
  actionCounts,
  onNavigate,
  onNew,
}) {
  const [documents, setDocuments] = useState([]);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeAction, setActiveAction] = useState(null);

  useEffect(() => listenDocumentsByTypes([type], setDocuments, 1000), [type]);

  const navigator = useMemo(
    () => documentNavigator(documents, { type, currentId, query }),
    [documents, type, currentId, query],
  );
  const moves = useMemo(() => navigatorButtons(navigator), [navigator]);
  const actions = useMemo(
    () => documentActionItems({ saved: Boolean(currentId), ...actionCounts }),
    [currentId, actionCounts],
  );

  function choose(document) {
    if (!document) return;
    setSearchOpen(false);
    setQuery('');
    onNavigate(document);
  }

  function runAction(action) {
    if (action.disabled) return;
    setActiveAction(action);
    if (!action.targetId || typeof document === 'undefined') return;
    document.getElementById(action.targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section className="o_theme no-print" aria-label="التنقل وإجراءات المستند">
      <div className="o_control_panel" style={{ border: '1px solid var(--o-border-color)', borderRadius: 'var(--o-border-radius-lg)' }}>
        <div className="o_cp_start" style={{ flexWrap: 'wrap', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} aria-label="التنقل داخل النوع">
            {moves.map((move) => (
              <button
                key={move.key}
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => choose(move.target)}
                disabled={move.disabled}
                title={move.label}
                aria-label={move.label}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <Icon name={move.icon} size={14} />
                <span className="hidden sm:inline">{move.label}</span>
              </button>
            ))}
          </div>

          <span style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', minWidth: '54px', textAlign: 'center' }}>
            {navigator.position}/{navigator.total}
          </span>

          <div className="o_searchview" style={{ maxWidth: '340px', position: 'relative' }}>
            <Icon name="search" size={14} className="o_searchview_icon" />
            <input
              type="search"
              value={query}
              onFocus={() => setSearchOpen(true)}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchOpen(true);
              }}
              placeholder={`ابحث داخل ${type}`}
              aria-label={`بحث داخل مستندات ${type}`}
            />
            {searchOpen && query && (
              <div
                role="listbox"
                style={{
                  position: 'absolute', insetInline: 0, top: 'calc(100% + 5px)', zIndex: 30,
                  maxHeight: '240px', overflow: 'auto', background: 'var(--o-white)',
                  border: '1px solid var(--o-border-color)', borderRadius: 'var(--o-border-radius)',
                  boxShadow: '0 8px 24px rgba(31, 41, 55, 0.16)',
                }}
              >
                {navigator.searchResults.length ? navigator.searchResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    className="btn btn-link"
                    onClick={() => choose(item)}
                    style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: '12px', textAlign: 'start' }}
                  >
                    <span>{item.number || 'مسودّة'}</span>
                    <span style={{ color: 'var(--o-gray-500)' }}>{item.state || ''}</span>
                  </button>
                )) : (
                  <p style={{ padding: '9px 12px', margin: 0, fontSize: 'var(--o-font-size-xs)', color: 'var(--o-gray-500)' }}>
                    لا نتائج داخل هذا النوع.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="o_cp_end">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onNew}
            disabled={!canCreate}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Icon name="plus" size={15} /> جديد
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px 2px 0' }} aria-label="إجراءات المستند المرتبطة">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => runAction(action)}
            disabled={action.disabled}
            aria-pressed={activeAction?.key === action.key}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          >
            <Icon name={action.icon} size={14} />
            {action.label}
            {action.count > 0 && (
              <span style={{ padding: '0 6px', borderRadius: '999px', background: 'var(--o-gray-200)', fontSize: '10px' }}>
                {action.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeAction && !activeAction.targetId && (
        <p role="status" style={{ margin: '7px 2px 0', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
          {activeAction.summary}
        </p>
      )}
    </section>
  );
}
