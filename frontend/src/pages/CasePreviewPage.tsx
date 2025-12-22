import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchCaseDetail } from '../services/api';
import { generatePdfReport, revokePdfUrl } from '../utils/pdfExport';
import { PdfPreviewModal } from '../components/PdfPreviewModal';
import type { CaseDetail, Prediction } from '../types';
import './CasePreviewPage.css';

type HeatmapVersion = 'raw' | 'v3.5.1' | 'v4.5.0';

function getScoreColor(score: string): string {
    // Green only for 'Low', red for everything over threshold
    if (score.toLowerCase() === 'low') return 'var(--color-success)';
    return 'var(--color-error)';
}

export function CasePreviewPage() {
    const { requestId } = useParams<{ requestId: string }>();
    const [caseData, setCaseData] = useState<CaseDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedVersion, setSelectedVersion] = useState<HeatmapVersion>('v4.5.0');

    // PDF export state
    const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [pdfFilename, setPdfFilename] = useState('');
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

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
        // For 'raw' view, show v4.5.0 predictions; otherwise show for selected version
        const version = selectedVersion === 'raw' ? 'v4.5.0' : selectedVersion;
        return caseData.predictions[version] || [];
    };

    // PDF export handler
    const handleExportPdf = async () => {
        if (!caseData) return;

        setIsGeneratingPdf(true);
        try {
            // Clean up previous PDF URL if exists
            if (pdfUrl) {
                revokePdfUrl(pdfUrl);
            }

            const version = selectedVersion === 'raw' ? 'v4.5.0' : selectedVersion;
            const predictions = caseData.predictions[version] || [];

            const result = await generatePdfReport({
                caseData,
                selectedVersion: version,
                predictions,
            });

            setPdfUrl(result.blobUrl);
            setPdfFilename(result.filename);
            setIsPdfModalOpen(true);
        } catch (error) {
            console.error('Failed to generate PDF:', error);
            alert('Failed to generate PDF report. Please try again.');
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const handleClosePdfModal = () => {
        setIsPdfModalOpen(false);
        // Note: We don't revoke the URL here to allow re-opening the preview
        // The URL will be revoked when generating a new PDF or when component unmounts
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
                        {/* Abnormality */}
                        {(() => {
                            const abnormality = getCurrentPredictions().find(p =>
                                ['Pleural Effusion', 'Cardiomegaly', 'Atelectasis', 'Edema', 'Nodule', 'Mass', 'Lung Opacity'].includes(p.disease_name)
                            );
                            const isPositive = abnormality && abnormality.thresholded_percentage !== 'Low';
                            // Find max score if any positive
                            let maxScore = 'Low';
                            if (isPositive) {
                                const positiveAbnormalities = getCurrentPredictions().filter(p =>
                                    ['Pleural Effusion', 'Cardiomegaly', 'Atelectasis', 'Edema', 'Nodule', 'Mass', 'Lung Opacity'].includes(p.disease_name) &&
                                    p.thresholded_percentage !== 'Low'
                                );
                                if (positiveAbnormalities.length > 0) {
                                    let maxVal = 0;
                                    for (const p of positiveAbnormalities) {
                                        const val = parseInt(p.thresholded_percentage.replace('%', '')) || 0;
                                        if (val > maxVal) {
                                            maxVal = val;
                                            maxScore = p.thresholded_percentage;
                                        }
                                    }
                                }
                            }
                            return (
                                <div
                                    className="score-bar"
                                    style={{ background: isPositive ? 'var(--color-error)' : 'var(--color-success)' }}
                                >
                                    Abnormality {isPositive ? maxScore : 'Low'}
                                </div>
                            );
                        })()}

                        {/* Tuberculosis */}
                        {(() => {
                            const tb = getCurrentPredictions().find(p =>
                                ['Tuberculosis', 'Inspectra Lung Opacity v2'].includes(p.disease_name) &&
                                p.thresholded_percentage !== 'Low'
                            );
                            const isPositive = !!tb;
                            return (
                                <div
                                    className="score-bar"
                                    style={{ background: isPositive ? 'var(--color-error)' : 'var(--color-success)' }}
                                >
                                    Tuberculosis {isPositive ? tb!.thresholded_percentage : 'Low'}
                                </div>
                            );
                        })()}

                        {/* Pneumothorax */}
                        {(() => {
                            const pneumo = getCurrentPredictions().find(p => p.disease_name === 'Pneumothorax');
                            const isPositive = pneumo && pneumo.thresholded_percentage !== 'Low';
                            return (
                                <div
                                    className="score-bar"
                                    style={{ background: isPositive ? 'var(--color-error)' : 'var(--color-success)' }}
                                >
                                    Pneumothorax {isPositive ? pneumo!.thresholded_percentage : 'Low'}
                                </div>
                            );
                        })()}
                    </div>

                    <div className="conditions-table">
                        <div className="table-header">
                            <span>SUSPECTED CONDITIONS</span>
                            <span>CONFIDENCE SCORE</span>
                        </div>
                        {getCurrentPredictions()
                            .filter(p => !['Abnormality', 'Tuberculosis', 'Pneumothorax', 'Inspectra Lung Opacity v2'].includes(p.disease_name))
                            .sort((a, b) => a.disease_name.localeCompare(b.disease_name))
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

                    <button
                        className="btn btn-primary export-pdf-btn"
                        onClick={handleExportPdf}
                        disabled={isGeneratingPdf || selectedVersion === 'raw'}
                    >
                        {isGeneratingPdf ? (
                            <>
                                <span className="spinner" style={{ width: 14, height: 14 }} />
                                Generating...
                            </>
                        ) : (
                            <>
                                <span>📄</span> Export PDF
                            </>
                        )}
                    </button>
                </aside>
            </div>

            <PdfPreviewModal
                isOpen={isPdfModalOpen}
                pdfUrl={pdfUrl}
                filename={pdfFilename}
                onClose={handleClosePdfModal}
            />
        </div>
    );
}
