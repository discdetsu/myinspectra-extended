import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchCaseDetail } from '../services/api';
import type { CaseDetail, Prediction } from '../types';
import './CasePreviewPage.css';

type HeatmapVersion = 'raw' | 'v3.5.1' | 'v4.5.0';

function getScoreColor(score: string): string {
    const numericMatch = score.match(/\d+/);
    if (numericMatch) {
        const num = parseInt(numericMatch[0]);
        if (num >= 70) return 'var(--color-error)';
        if (num >= 40) return 'var(--color-warning)';
        return 'var(--color-success)';
    }
    if (score.toLowerCase() === 'low') return 'var(--color-success)';
    if (score.toLowerCase() === 'high') return 'var(--color-error)';
    return 'var(--color-text-secondary)';
}

export function CasePreviewPage() {
    const { requestId } = useParams<{ requestId: string }>();
    const [caseData, setCaseData] = useState<CaseDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedVersion, setSelectedVersion] = useState<HeatmapVersion>('v4.5.0');

    // Zoom and pan state
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!requestId) return;

        const loadCase = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const data = await fetchCaseDetail(requestId);
                setCaseData(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load case');
            } finally {
                setIsLoading(false);
            }
        };

        loadCase();
    }, [requestId]);

    // Zoom controls
    const handleZoomIn = useCallback(() => {
        setScale(prev => Math.min(prev * 1.25, 5));
    }, []);

    const handleZoomOut = useCallback(() => {
        setScale(prev => Math.max(prev / 1.25, 0.5));
    }, []);

    const handleReset = useCallback(() => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    }, []);

    // Mouse wheel zoom - use native event listener to avoid passive event issues
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            setScale(prev => Math.max(0.5, Math.min(5, prev * delta)));
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, [caseData]); // Re-run when caseData loads so container ref is available

    // Drag handlers
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (scale <= 1) return;
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }, [scale, position]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging) return;
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    }, [isDragging, dragStart]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    const getCurrentImageUrl = (): string | null => {
        if (!caseData) return null;
        if (selectedVersion === 'raw') return caseData.raw_image.url;
        return caseData.overlays[selectedVersion]?.url || caseData.raw_image.url;
    };

    const getCurrentPredictions = (): Prediction[] => {
        if (!caseData) return [];
        return caseData.predictions['v4.5.0'] || [];
    };

    const getAbnormalityScore = (): Prediction | undefined => {
        return getCurrentPredictions().find(p => p.disease_name === 'Abnormality');
    };

    const getTbScore = (): Prediction | undefined => {
        return getCurrentPredictions().find(p => p.disease_name === 'Tuberculosis');
    };

    if (isLoading) {
        return (
            <div className="case-preview-page">
                <div className="loading-container">
                    <div className="spinner" />
                    <span>Loading case...</span>
                </div>
            </div>
        );
    }

    if (error || !caseData) {
        return (
            <div className="case-preview-page">
                <div className="error-container">
                    <h2>Error loading case</h2>
                    <p>{error || 'Case not found'}</p>
                    <Link to="/history" className="btn btn-primary">Back to History</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="case-preview-page">
            <div className="preview-layout">
                {/* Image Viewer Section */}
                <div className="image-section">
                    <div className="image-nav">
                        <Link to="/history" className="nav-btn">‹</Link>

                        <div className="image-toolbar">
                            <button className="toolbar-btn" onClick={handleZoomIn} title="Zoom In">+</button>
                            <button className="toolbar-btn" onClick={handleZoomOut} title="Zoom Out">−</button>
                            <button className="toolbar-btn" onClick={handleReset} title="Reset">↻</button>
                        </div>

                        <div className="version-selector">
                            <button
                                className={`version-btn ${selectedVersion === 'raw' ? 'active' : ''}`}
                                onClick={() => setSelectedVersion('raw')}
                            >
                                Raw
                            </button>
                            <button
                                className={`version-btn ${selectedVersion === 'v3.5.1' ? 'active' : ''}`}
                                onClick={() => setSelectedVersion('v3.5.1')}
                                disabled={!caseData.overlays['v3.5.1']?.url}
                            >
                                v3.5.1
                            </button>
                            <button
                                className={`version-btn ${selectedVersion === 'v4.5.0' ? 'active' : ''}`}
                                onClick={() => setSelectedVersion('v4.5.0')}
                                disabled={!caseData.overlays['v4.5.0']?.url}
                            >
                                v4.5.0
                            </button>
                        </div>

                        <button className="nav-btn">›</button>
                    </div>

                    <div
                        className={`image-container ${isDragging ? 'dragging' : ''} ${scale > 1 ? 'zoomable' : ''}`}
                        ref={containerRef}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                    >
                        <img
                            src={getCurrentImageUrl() || ''}
                            alt="X-ray"
                            className="case-image"
                            loading="lazy"
                            draggable={false}
                            style={{
                                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                            }}
                        />
                    </div>
                </div>

                {/* Analysis Panel */}
                <aside className="analysis-panel">
                    <div className="panel-header">
                        <h2>Preliminary Analysis Result</h2>
                        <button className="refresh-btn" title="Refresh">↻</button>
                    </div>

                    <div className="summary-scores">
                        {getAbnormalityScore() && (
                            <div
                                className="score-bar"
                                style={{ background: getScoreColor(getAbnormalityScore()!.thresholded_percentage) }}
                            >
                                Abnormality {getAbnormalityScore()!.thresholded_percentage}
                            </div>
                        )}
                        {getTbScore() && (
                            <div
                                className="score-bar tb"
                                style={{
                                    background: getTbScore()!.thresholded_percentage === 'Low'
                                        ? 'var(--color-bg-active)'
                                        : getScoreColor(getTbScore()!.thresholded_percentage)
                                }}
                            >
                                Tuberculosis {getTbScore()!.thresholded_percentage}
                            </div>
                        )}
                    </div>

                    <div className="conditions-table">
                        <div className="table-header">
                            <span>SUSPECTED CONDITIONS</span>
                            <span>CONFIDENCE SCORE</span>
                        </div>
                        {getCurrentPredictions()
                            .filter(p => !['Abnormality', 'Tuberculosis'].includes(p.disease_name))
                            .map((pred) => (
                                <div key={pred.disease_name} className="condition-row">
                                    <span
                                        className="condition-name"
                                        style={{
                                            fontWeight: pred.thresholded_percentage !== 'Low' ? 600 : 400,
                                            color: pred.thresholded_percentage !== 'Low'
                                                ? 'var(--color-text-primary)'
                                                : 'var(--color-text-muted)'
                                        }}
                                    >
                                        {pred.disease_name}
                                    </span>
                                    <span
                                        className="condition-score"
                                        style={{ color: getScoreColor(pred.thresholded_percentage) }}
                                    >
                                        {pred.thresholded_percentage}
                                    </span>
                                </div>
                            ))}
                    </div>

                    <div className="disclaimer">
                        <strong>Caution:</strong> Not for clinical use
                    </div>

                    <div className="study-info">
                        <h3>Study Information</h3>
                        <div className="info-row">
                            <span className="info-label">Filename:</span>
                            <span className="info-value">{caseData.raw_image.filename}</span>
                        </div>
                        <div className="info-row">
                            <span className="info-label">Study date:</span>
                            <span className="info-value">
                                {new Date(caseData.created_at).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true,
                                })}
                            </span>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}
