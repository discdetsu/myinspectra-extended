import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { CaseListItem, VersionSummary } from '../../types';
import './CaseTable.css';

interface CaseTableProps {
    cases: CaseListItem[];
    isLoading: boolean;
}

function formatDate(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}

function renderResults(summary: VersionSummary) {
    // Check if all 3 models are 'none' (no data)
    const allNone = summary.results.every(r => r.status === 'none');
    if (allNone) {
        return <span className="tag tag-neutral">N/A</span>;
    }

    return (
        <div className="tags-cell">
            {summary.results.map((r, i) => {
                if (r.status === 'none') return null;
                const colorClass = r.status === 'positive' ? 'tag-error' : 'tag-success';
                const label = r.status === 'positive' ? `${r.name} ${r.score}` : `${r.name} Low`;
                return (
                    <span key={i} className={`tag ${colorClass}`}>
                        {label}
                    </span>
                );
            })}
        </div>
    );
}

function renderConditions(summary: VersionSummary) {
    if (summary.conditions.length === 0) {
        return <span className="tag tag-neutral">N/A</span>;
    }
    return (
        <div className="tags-cell">
            {summary.conditions.map((c, i) => (
                <span key={i} className="tag tag-error">
                    {c.name}
                </span>
            ))}
        </div>
    );
}

export function CaseTable({ cases, isLoading }: CaseTableProps) {
    const tableRows = useMemo(() => {
        if (isLoading) {
            return Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="skeleton-row">
                    <td><div className="skeleton" style={{ height: 16, width: '80%' }} /></td>
                    <td><div className="skeleton" style={{ height: 16, width: 120 }} /></td>
                    <td><div className="skeleton" style={{ height: 22, width: 80 }} /></td>
                    <td><div className="skeleton" style={{ height: 22, width: 100 }} /></td>
                    <td><div className="skeleton" style={{ height: 22, width: 80 }} /></td>
                    <td><div className="skeleton" style={{ height: 22, width: 100 }} /></td>
                    <td><div className="skeleton" style={{ height: 28, width: 50 }} /></td>
                </tr>
            ));
        }

        if (cases.length === 0) {
            return (
                <tr>
                    <td colSpan={7}>
                        <div className="empty-state">
                            <div className="empty-state-icon">📋</div>
                            <div className="empty-state-title">No cases found</div>
                            <div className="empty-state-text">Upload an image to get started</div>
                        </div>
                    </td>
                </tr>
            );
        }

        return cases.map((caseItem) => (
            <tr key={caseItem.request_id}>
                <td className="cell-name">{caseItem.patient_name}</td>
                <td className="cell-date">{formatDate(caseItem.created_at)}</td>
                <td>{renderResults(caseItem.v3)}</td>
                <td>{renderConditions(caseItem.v3)}</td>
                <td>{renderResults(caseItem.v4)}</td>
                <td>{renderConditions(caseItem.v4)}</td>
                <td>
                    <Link to={`/case/${caseItem.request_id}`} className="btn btn-ghost view-btn">
                        View
                    </Link>
                </td>
            </tr>
        ));
    }, [cases, isLoading]);

    return (
        <div className="table-container">
            <table className="table case-table">
                <thead>
                    <tr>
                        <th>File Name ↕</th>
                        <th>Study Date / Time ↕</th>
                        <th>Result v3.5.1 ↕</th>
                        <th>Condition v3.5.1 ↕</th>
                        <th>Result v4.5.0 ↕</th>
                        <th>Condition v4.5.0 ↕</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {tableRows}
                </tbody>
            </table>
        </div>
    );
}
