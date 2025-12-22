import { useEffect } from 'react';
import { downloadPdf, revokePdfUrl } from '../utils/pdfExport';
import './PdfPreviewModal.css';

interface PdfPreviewModalProps {
    isOpen: boolean;
    pdfUrl: string | null;
    filename: string;
    onClose: () => void;
}

export function PdfPreviewModal({ isOpen, pdfUrl, filename, onClose }: PdfPreviewModalProps) {
    // Handle escape key to close modal
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    // Clean up blob URL when modal closes
    useEffect(() => {
        return () => {
            if (pdfUrl) {
                revokePdfUrl(pdfUrl);
            }
        };
    }, [pdfUrl]);

    if (!isOpen || !pdfUrl) return null;

    const handleDownload = () => {
        downloadPdf(pdfUrl, filename);
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className="pdf-modal-overlay" onClick={handleBackdropClick}>
            <div className="pdf-modal">
                <div className="pdf-modal-header">
                    <h3>Report Preview</h3>
                    <button className="pdf-modal-close" onClick={onClose} title="Close">
                        ×
                    </button>
                </div>

                <div className="pdf-modal-content">
                    <iframe
                        src={pdfUrl}
                        title="PDF Preview"
                        className="pdf-preview-frame"
                    />
                </div>

                <div className="pdf-modal-actions">
                    <button className="btn btn-secondary" onClick={onClose}>
                        Close
                    </button>
                    <button className="btn btn-primary" onClick={handleDownload}>
                        <span>📥</span> Download PDF
                    </button>
                </div>
            </div>
        </div>
    );
}
