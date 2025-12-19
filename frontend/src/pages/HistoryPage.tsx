import { useState, useEffect, useCallback } from 'react';
import { CaseTable } from '../components/History';
import { fetchCases } from '../services/api';
import type { CaseListItem } from '../types';
import './HistoryPage.css';

export function HistoryPage() {
    const [cases, setCases] = useState<CaseListItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [error, setError] = useState<string | null>(null);

    const loadCases = useCallback(async (page: number) => {
        setIsLoading(true);
        setError(null);

        try {
            const data = await fetchCases(page, 10);
            setCases(data.cases);
            setTotalPages(data.total_pages);
            setCurrentPage(data.current_page);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load cases');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadCases(1);
    }, [loadCases]);

    const handlePageChange = (page: number) => {
        if (page >= 1 && page <= totalPages) {
            loadCases(page);
        }
    };

    const renderPagination = () => {
        if (totalPages <= 1) return null;

        const pages = [];
        const showEllipsis = totalPages > 5;

        for (let i = 1; i <= Math.min(totalPages, 5); i++) {
            pages.push(
                <button
                    key={i}
                    className={`pagination-btn ${currentPage === i ? 'active' : ''}`}
                    onClick={() => handlePageChange(i)}
                >
                    {i}
                </button>
            );
        }

        return (
            <div className="pagination">
                <button
                    className="pagination-btn"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                >
                    Previous
                </button>
                {pages}
                {showEllipsis && totalPages > 5 && <span className="pagination-ellipsis">...</span>}
                <button
                    className="pagination-btn"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                >
                    Next
                </button>
            </div>
        );
    };

    return (
        <div className="history-page">
            <header className="page-header">
                <p className="page-subtitle">INSPECTRA CXR</p>
                <h1 className="page-title">Image History</h1>
            </header>

            {error && (
                <div className="error-banner">
                    <span className="error-icon">⚠️</span>
                    <span>{error}</span>
                    <button className="dismiss-btn" onClick={() => setError(null)}>✕</button>
                </div>
            )}

            <CaseTable cases={cases} isLoading={isLoading} />
            {renderPagination()}
        </div>
    );
}
