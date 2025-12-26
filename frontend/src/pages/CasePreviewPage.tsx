import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchCaseDetail, predictWithV5 } from '../services/api';
import { generatePdfReport, revokePdfUrl } from '../utils/pdfExport';
import { PdfPreviewModal } from '../components/PdfPreviewModal';
import type { CaseDetail, Prediction, V5Result } from '../types';
import './CasePreviewPage.css';

type HeatmapVersion = 'raw' | 'v3.5.1' | 'v4.5.0' | 'v5';

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
    const [selectedDisease, setSelectedDisease] = useState<string | null>(null);

    // V5 Experimental state
    const [v5Data, setV5Data] = useState<V5Result | null>(null);
    const [isLoadingV5, setIsLoadingV5] = useState(false);
    const [v5Error, setV5Error] = useState<string | null>(null);

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

    // Reset selected disease when version changes
    useEffect(() => {
        setSelectedDisease(null);
    }, [selectedVersion]);

    // Load v5 data on-demand when v5 version is selected
    useEffect(() => {
        if (selectedVersion !== 'v5' || !requestId || v5Data) return;

        const loadV5 = async () => {
            setIsLoadingV5(true);
            setV5Error(null);
            try {
                const data = await predictWithV5(requestId);
                setV5Data(data);
            } catch (err) {
                setV5Error(err instanceof Error ? err.message : 'V5 prediction failed');
            } finally {
                setIsLoadingV5(false);
            }
        };

        loadV5();
    }, [selectedVersion, requestId, v5Data]);

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

        // V5: use base64 overlay from v5Data
        if (selectedVersion === 'v5') {
            if (isLoadingV5) return caseData.raw_image.url; // Show raw while loading
            return v5Data?.overlay_image || caseData.raw_image.url;
        }

        // If a disease is selected, show individual heatmap
        if (selectedDisease && caseData.individual_heatmaps) {
            const individualHeatmaps = caseData.individual_heatmaps[selectedVersion as 'v3.5.1' | 'v4.5.0'] || [];
            const match = individualHeatmaps.find(h => h.disease_name === selectedDisease);
            if (match?.url) return match.url;
        }

        return caseData.overlays[selectedVersion as 'v3.5.1' | 'v4.5.0']?.url || caseData.raw_image.url;
    };

    // Get list of diseases that have individual heatmaps available
    const getClickableDiseases = (): Set<string> => {
        if (!caseData?.individual_heatmaps) return new Set();
        // V5 doesn't have individual heatmaps
        if (selectedVersion === 'v5') return new Set();
        const version = selectedVersion === 'raw' ? 'v4.5.0' : selectedVersion as 'v3.5.1' | 'v4.5.0';
        const heatmaps = caseData.individual_heatmaps[version] || [];
        return new Set(heatmaps.map(h => h.disease_name));
    };

    // Handle disease click for toggling individual heatmap
    const handleDiseaseClick = (diseaseName: string, isPositive: boolean) => {
        if (!isPositive) return;
        const clickable = getClickableDiseases();
        if (!clickable.has(diseaseName)) return;

        // Toggle selection
        if (selectedDisease === diseaseName) {
            setSelectedDisease(null);
        } else {
            setSelectedDisease(diseaseName);
        }
    };

    // Reset to overlay view
    const handleResetHeatmap = () => {
        setSelectedDisease(null);
    };

    const getCurrentPredictions = (): Prediction[] => {
        if (!caseData) return [];
        // V5: use predictions from v5Data
        if (selectedVersion === 'v5') {
            return v5Data?.predictions || [];
        }
        // For 'raw' view, show v4.5.0 predictions; otherwise show for selected version
        const version = selectedVersion === 'raw' ? 'v4.5.0' : selectedVersion as 'v3.5.1' | 'v4.5.0';
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

            // V5 is experimental, use v4 for PDF export if v5 selected
            const version: 'v3.5.1' | 'v4.5.0' = (selectedVersion === 'raw' || selectedVersion === 'v5') ? 'v4.5.0' : selectedVersion;
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
                            <button
                                className={`version-btn experimental ${selectedVersion === 'v5' ? 'active' : ''}`}
                                onClick={() => setSelectedVersion('v5')}
                            >
                                {isLoadingV5 ? '...' : 'v5 (Experimental)'}
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
                        {/* V5 loading overlay */}
                        {selectedVersion === 'v5' && isLoadingV5 && (
                            <div className="v5-loading-overlay">
                                <div className="spinner" />
                                <span>Processing v5 (Experimental)...</span>
                            </div>
                        )}
                        {/* V5 error display */}
                        {selectedVersion === 'v5' && v5Error && (
                            <div className="v5-error-overlay">
                                <span>⚠️ {v5Error}</span>
                            </div>
                        )}
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
                            const abnormalityClasses = ['Pleural Effusion', 'Cardiomegaly', 'Atelectasis', 'Edema', 'Nodule', 'Mass', 'Lung Opacity'];
                            const positiveAbnormalities = getCurrentPredictions().filter(p =>
                                abnormalityClasses.includes(p.disease_name) &&
                                p.thresholded_percentage !== 'Low'
                            );
                            const isPositive = positiveAbnormalities.length > 0;

                            // Find max score from positive abnormalities
                            let maxScore = 'Low';
                            if (isPositive) {
                                let maxVal = 0;
                                for (const p of positiveAbnormalities) {
                                    const val = parseInt(p.thresholded_percentage.replace('%', '')) || 0;
                                    if (val > maxVal) {
                                        maxVal = val;
                                        maxScore = p.thresholded_percentage;
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
                            const isClickable = isPositive && getClickableDiseases().has('Tuberculosis');
                            const isSelected = selectedDisease === 'Tuberculosis';
                            return (
                                <div
                                    className={`score-bar ${isClickable ? 'clickable' : ''} ${isSelected ? 'selected' : ''}`}
                                    style={{
                                        background: isPositive ? 'var(--color-error)' : 'var(--color-success)',
                                        cursor: isClickable ? 'pointer' : 'default'
                                    }}
                                    onClick={() => isClickable && handleDiseaseClick('Tuberculosis', isPositive)}
                                >
                                    Tuberculosis {isPositive ? tb!.thresholded_percentage : 'Low'}
                                </div>
                            );
                        })()}

                        {/* Pneumothorax */}
                        {(() => {
                            const pneumo = getCurrentPredictions().find(p => p.disease_name === 'Pneumothorax');
                            const isPositive = pneumo && pneumo.thresholded_percentage !== 'Low';
                            const isClickable = isPositive && getClickableDiseases().has('Pneumothorax');
                            const isSelected = selectedDisease === 'Pneumothorax';
                            return (
                                <div
                                    className={`score-bar ${isClickable ? 'clickable' : ''} ${isSelected ? 'selected' : ''}`}
                                    style={{
                                        background: isPositive ? 'var(--color-error)' : 'var(--color-success)',
                                        cursor: isClickable ? 'pointer' : 'default'
                                    }}
                                    onClick={() => isClickable && handleDiseaseClick('Pneumothorax', isPositive)}
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
                            .map((pred) => {
                                const isPositive = pred.thresholded_percentage !== 'Low';
                                const isClickable = isPositive && getClickableDiseases().has(pred.disease_name);
                                const isSelected = selectedDisease === pred.disease_name;

                                return (
                                    <div
                                        key={pred.disease_name}
                                        className={`condition-row ${isClickable ? 'clickable' : ''} ${isSelected ? 'selected' : ''}`}
                                        onClick={() => isClickable && handleDiseaseClick(pred.disease_name, isPositive)}
                                        style={{ cursor: isClickable ? 'pointer' : 'default' }}
                                    >
                                        <span
                                            className="condition-name"
                                            style={{
                                                fontWeight: isPositive ? 600 : 400,
                                                color: isSelected
                                                    ? 'var(--color-primary)'
                                                    : isPositive
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
                                );
                            })}

                        {/* Reset button when a disease is selected */}
                        {selectedDisease && (
                            <button
                                className="reset-heatmap-btn"
                                onClick={handleResetHeatmap}
                            >
                                ↻ Reset to Combined View
                            </button>
                        )}
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
