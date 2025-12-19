import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { CaseListItem } from '../../types';
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

function getScoreClass(score: string | null): string {
    if (!score) return 'neutral';
    const numericMatch = score.match(/\d+/);
    if (numericMatch) {
        const num = parseInt(numericMatch[0]);
        if (num >= 70) return 'error';
        if (num >= 40) return 'warning';
        return 'success';
    }
    if (score.toLowerCase() === 'low') return 'success';
    if (score.toLowerCase() === 'high') return 'error';
    return 'neutral';
}

export function CaseTable({ cases, isLoading }: CaseTableProps) {
    const tableRows = useMemo(() => {
        if (isLoading) {
            return Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="skeleton-row">
                    <td><div className="skeleton" style={{ height: 16, width: '80%' }} /></td>
                    <td><div className="skeleton" style={{ height: 16, width: 120 }} /></td>
                    <td><div className="skeleton" style={{ height: 22, width: 100 }} /></td>
                    <td><div className="skeleton" style={{ height: 22, width: 80 }} /></td>
                    <td><div className="skeleton" style={{ height: 28, width: 50 }} /></td>
                </tr>
            ));
        }

        if (cases.length === 0) {
            return (
                <tr>
                    <td colSpan={5}>
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
                <td>
                    <div className="tags-cell">
                        {caseItem.abnormality_score && (
                            <span className={`tag tag-${getScoreClass(caseItem.abnormality_score)}`}>
                                Abnormality {caseItem.abnormality_score}
                            </span>
                        )}
                        {caseItem.tuberculosis_score && (
                            <span className={`tag tag-${getScoreClass(caseItem.tuberculosis_score)}`}>
                                Tuberculosis {caseItem.tuberculosis_score}
                            </span>
                        )}
                    </div>
                </td>
                <td>
                    <div className="tags-cell">
                        {caseItem.conditions.map((c, i) => (
                            <span key={i} className={`tag tag-${getScoreClass(c.thresholded)}`}>
                                {c.name}
                            </span>
                        ))}
                        {caseItem.conditions.length === 0 && (
                            <span className="tag tag-neutral">N/A</span>
                        )}
                    </div>
                </td>
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
                        <th>Result ↕</th>
                        <th>Condition / Disease ↕</th>
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
