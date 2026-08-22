import type { ReactNode } from 'react';

interface AdminTableEmptyStateProps {
  colSpan: number;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}

export function AdminTableEmptyState({
  colSpan,
  title,
  description,
  action,
  compact = false,
}: AdminTableEmptyStateProps) {
  return (
    <td colSpan={colSpan} className="admin-table-empty-cell-next">
      <div
        className={`admin-table-empty-state-next${compact ? ' is-compact' : ''}`}
        role="status"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 3.75h10a2 2 0 0 1 2 2v14.5l-3-1.75-2 1.25-2-1.25-2 1.25-2-1.25-3 1.75V5.75a2 2 0 0 1 2-2Z" />
          <path d="M8.5 8h7M8.5 12h7" />
        </svg>
        <div className="admin-table-empty-copy-next">
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? <div className="admin-table-empty-action-next">{action}</div> : null}
      </div>
    </td>
  );
}
