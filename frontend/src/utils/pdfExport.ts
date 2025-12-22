import { jsPDF } from 'jspdf';
import type { CaseDetail, Prediction } from '../types';

// ==========================================
// CONFIGURATION & THEME
// ==========================================

const THEME = {
    colors: {
        primary: '#1a1a2e',      // Dark Navy
        secondary: '#16213e',    // Slightly lighter navy
        accent: '#0f3460',       // Blue accent
        text: {
            primary: '#2b2d42',
            secondary: '#8d99ae',
            light: '#ffffff',
            danger: '#e63946',
        },
        border: '#e0e0e0',
        background: {
            light: '#f8f9fa',
            white: '#ffffff',
            zebra: '#fcfcfc',
        }
    },
    layout: {
        pageWidth: 210,
        pageHeight: 297,
        margin: 12,
        rowHeight: 8,
        imageGap: 4,
    },
    fonts: {
        main: 'helvetica',
    }
} as const;

const CONTENT_WIDTH = THEME.layout.pageWidth - (THEME.layout.margin * 2);

const CONDITIONS_ORDER = [
    'Atelectasis', 'Cardiomegaly', 'Edema', 'Lung Opacity',
    'Mass', 'Nodule', 'Pleural Effusion', 'Pneumothorax', 'Tuberculosis'
];

// ==========================================
// TYPES
// ==========================================

interface PdfExportParams {
    caseData: CaseDetail;
    selectedVersion: 'v3.5.1' | 'v4.5.0';
    predictions: Prediction[];
}

interface LoadedImage {
    base64: string;
    width: number;
    height: number;
    aspectRatio: number;
}

// ==========================================
// UTILITIES
// ==========================================

const Utils = {
    formatPercent: (score: number = 0) => `${(score * 100).toFixed(6)}%`,

    formatDate: (dateStr: string) => {
        const d = new Date(dateStr);
        return {
            date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        };
    },

    loadImage: async (url: string): Promise<LoadedImage> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = url;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error('Canvas context failure'));

                ctx.drawImage(img, 0, 0);
                resolve({
                    base64: canvas.toDataURL('image/jpeg', 0.92),
                    width: img.width,
                    height: img.height,
                    aspectRatio: img.width / img.height
                });
            };
            img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
        });
    }
};

// ==========================================
// MAIN GENERATOR CLASS
// ==========================================

class CXRReportGenerator {
    private doc: jsPDF;
    private yPos: number = 0;

    constructor() {
        this.doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
        });
    }

    /**
     * Main entry point to generate the PDF
     */
    public async generate(params: PdfExportParams): Promise<{ blobUrl: string; filename: string }> {
        const { caseData, selectedVersion, predictions } = params;

        // 1. Render Header
        this.renderHeader();

        // 2. Render Patient/Study Info
        this.renderStudyInfo(caseData);

        // 3. Render Images (Async)
        await this.renderImagesSection(caseData, selectedVersion);

        // 4. Render Analysis Table
        this.renderAnalysisTable(predictions);

        // 5. Render System Info & Footer
        this.renderSystemInfo(selectedVersion);
        this.renderFooter();

        // 6. Finalize
        const blob = this.doc.output('blob');
        const filename = this.generateFilename(caseData.raw_image.filename ?? undefined);

        return {
            blobUrl: URL.createObjectURL(blob),
            filename
        };
    }

    // --- RENDERERS ---

    private renderHeader() {
        // Top Bar Background
        this.doc.setFillColor(THEME.colors.primary);
        this.doc.rect(0, 0, THEME.layout.pageWidth, 22, 'F');

        // Accent Line
        this.doc.setFillColor(THEME.colors.accent);
        this.doc.rect(0, 22, THEME.layout.pageWidth, 1.5, 'F');

        // Title
        this.doc.setTextColor(THEME.colors.text.light);
        this.doc.setFont(THEME.fonts.main, 'bold');
        this.doc.setFontSize(16);
        this.doc.text('Inspectra CXR Analysis Report', THEME.layout.pageWidth / 2, 14, { align: 'center' });

        this.yPos = 32;
    }

    private renderStudyInfo(caseData: CaseDetail) {
        const { date, time } = Utils.formatDate(caseData.created_at);
        const filename = caseData.raw_image.filename || 'Unknown';

        // Container
        this.doc.setFillColor(THEME.colors.background.light);
        this.doc.setDrawColor(THEME.colors.border);
        this.doc.rect(THEME.layout.margin, this.yPos, CONTENT_WIDTH, 12, 'FD');

        // Text
        this.doc.setTextColor(THEME.colors.text.primary);
        this.doc.setFontSize(9);

        // Left: Filename
        this.doc.setFont(THEME.fonts.main, 'bold');
        this.doc.text('Filename:', THEME.layout.margin + 4, this.yPos + 7.5);
        this.doc.setFont(THEME.fonts.main, 'normal');
        this.doc.text(filename, THEME.layout.margin + 22, this.yPos + 7.5);

        // Right: Date
        const dateText = `Exam Date: ${date} • ${time}`;
        this.doc.text(dateText, THEME.layout.pageWidth - THEME.layout.margin - 4, this.yPos + 7.5, { align: 'right' });

        this.yPos += 18;
    }

    private async renderImagesSection(caseData: CaseDetail, version: 'v3.5.1' | 'v4.5.0') {
        const availableW = (CONTENT_WIDTH - THEME.layout.imageGap) / 2;

        // Optimistic layout calculation to prevent overflow
        // Header(32) + Info(18) + Table(~100) + Footer(30) = ~180mm used. 
        // Remaining for images ~110mm.
        const maxImgHeight = 95;

        try {
            // Parallel loading
            const loadPromises: Promise<LoadedImage | null>[] = [];

            loadPromises.push(caseData.raw_image.url ? Utils.loadImage(caseData.raw_image.url) : Promise.resolve(null));

            const overlayUrl = caseData.overlays[version]?.url;
            loadPromises.push(overlayUrl ? Utils.loadImage(overlayUrl) : Promise.resolve(null));

            const [rawImg, overlayImg] = await Promise.all(loadPromises);

            // Determine height based on aspect ratio of the raw image (primary)
            let drawHeight = maxImgHeight;
            if (rawImg) {
                drawHeight = Math.min(availableW / rawImg.aspectRatio, maxImgHeight);
            }

            // Draw Raw
            if (rawImg) {
                this.doc.addImage(rawImg.base64, 'JPEG', THEME.layout.margin, this.yPos, availableW, drawHeight);
                this.drawLabel('Original', THEME.layout.margin, this.yPos);
            } else {
                this.drawPlaceholder(THEME.layout.margin, this.yPos, availableW, drawHeight);
            }

            // Draw Overlay
            const xPosOverlay = THEME.layout.margin + availableW + THEME.layout.imageGap;
            if (overlayImg) {
                this.doc.addImage(overlayImg.base64, 'JPEG', xPosOverlay, this.yPos, availableW, drawHeight);
                this.drawLabel('AI Analysis', xPosOverlay, this.yPos);
            } else {
                this.drawPlaceholder(xPosOverlay, this.yPos, availableW, drawHeight);
            }

            this.yPos += drawHeight + 8;

        } catch (e) {
            console.error("PDF Image Generation Error", e);
            this.drawPlaceholder(THEME.layout.margin, this.yPos, CONTENT_WIDTH, 50, 'Image Load Error');
            this.yPos += 60;
        }
    }

    private renderAnalysisTable(predictions: Prediction[]) {
        // Header
        this.doc.setFillColor(THEME.colors.secondary);
        this.doc.rect(THEME.layout.margin, this.yPos, CONTENT_WIDTH, 8, 'F');
        this.doc.setTextColor(THEME.colors.text.light);
        this.doc.setFontSize(9);
        this.doc.setFont(THEME.fonts.main, 'bold');
        this.doc.text('Condition', THEME.layout.margin + 4, this.yPos + 5.5);
        this.doc.text('Confidence Score', THEME.layout.pageWidth - THEME.layout.margin - 4, this.yPos + 5.5, { align: 'right' });

        this.yPos += 8;

        // Rows
        CONDITIONS_ORDER.forEach((condition, idx) => {
            const pred = predictions.find(p => p.disease_name === condition);
            const score = pred ? pred.balanced_score : 0;
            const isAlternating = idx % 2 === 0;

            this.renderTableRow(condition, Utils.formatPercent(score), isAlternating);
        });

        // Summary Row (Preliminary Abnormality)
        const abnormalKeys = ['Pleural Effusion', 'Cardiomegaly', 'Atelectasis', 'Edema', 'Nodule', 'Mass', 'Lung Opacity'];
        const maxScore = Math.max(...predictions
            .filter(p => abnormalKeys.includes(p.disease_name))
            .map(p => p.balanced_score), 0);

        this.yPos += 1; // spacer
        this.doc.setDrawColor(THEME.colors.accent);
        this.doc.setLineWidth(0.5);
        this.doc.line(THEME.layout.margin, this.yPos, THEME.layout.pageWidth - THEME.layout.margin, this.yPos);

        this.doc.setFillColor(THEME.colors.background.light);
        this.doc.rect(THEME.layout.margin, this.yPos, CONTENT_WIDTH, 8, 'F');

        this.doc.setTextColor(THEME.colors.text.primary);
        this.doc.setFont(THEME.fonts.main, 'bold');
        this.doc.text('Preliminary: Abnormality Probability', THEME.layout.margin + 4, this.yPos + 5.5);
        this.doc.setTextColor(THEME.colors.text.secondary);
        this.doc.setFont(THEME.fonts.main, 'normal');
        this.doc.text(Utils.formatPercent(maxScore), THEME.layout.pageWidth - THEME.layout.margin - 4, this.yPos + 5.5, { align: 'right' });

        this.yPos += 12;
    }

    private renderTableRow(label: string, value: string, alternate: boolean) {
        const h = THEME.layout.rowHeight;

        if (alternate) {
            this.doc.setFillColor(THEME.colors.background.zebra);
            this.doc.rect(THEME.layout.margin, this.yPos, CONTENT_WIDTH, h, 'F');
        }

        this.doc.setFont(THEME.fonts.main, 'normal');
        this.doc.setFontSize(9);

        // Label
        this.doc.setTextColor(THEME.colors.text.primary);
        this.doc.text(label, THEME.layout.margin + 4, this.yPos + 5);

        // Value
        this.doc.setTextColor(THEME.colors.text.secondary);
        this.doc.text(value, THEME.layout.pageWidth - THEME.layout.margin - 4, this.yPos + 5, { align: 'right' });

        // Subtle divider
        this.doc.setDrawColor(THEME.colors.background.light);
        this.doc.line(THEME.layout.margin, this.yPos + h, THEME.layout.pageWidth - THEME.layout.margin, this.yPos + h);

        this.yPos += h;
    }

    private renderSystemInfo(version: string) {
        // Compact footer info box
        this.doc.setFontSize(8);
        this.doc.setTextColor(THEME.colors.text.secondary);

        this.doc.setDrawColor(THEME.colors.border);
        this.doc.line(THEME.layout.margin, this.yPos, THEME.layout.pageWidth - THEME.layout.margin, this.yPos);
        this.yPos += 5;

        this.doc.text(`Inspectra CXR Version: ${version}`, THEME.layout.margin, this.yPos);
        this.doc.text(`Generated: ${new Date().toISOString()}`, THEME.layout.pageWidth - THEME.layout.margin, this.yPos, { align: 'right' });

        this.yPos += 10;
    }

    private renderFooter() {
        const bottomY = THEME.layout.pageHeight - 20;

        this.doc.setTextColor(THEME.colors.text.danger);
        this.doc.setFontSize(10);
        this.doc.setFont(THEME.fonts.main, 'bold');

        this.doc.text('CAUTION: AI-Generated Report. Not for clinical diagnosis.', THEME.layout.pageWidth / 2, bottomY, { align: 'center' });

        this.doc.setFontSize(8);
        this.doc.setFont(THEME.fonts.main, 'normal');
        this.doc.setTextColor(THEME.colors.text.secondary);
        this.doc.text('This analysis is intended as a triage and prioritization tool only.', THEME.layout.pageWidth / 2, bottomY + 5, { align: 'center' });
    }

    // --- HELPERS ---

    private drawLabel(text: string, x: number, y: number) {
        // Tiny semi-transparent label on image
        this.doc.setFillColor(0, 0, 0); // Black
        this.doc.rect(x, y, 20, 5, 'F');
        this.doc.setTextColor(255, 255, 255);
        this.doc.setFontSize(7);
        this.doc.text(text, x + 10, y + 3.5, { align: 'center' });
    }

    private drawPlaceholder(x: number, y: number, w: number, h: number, text = 'Image Unavailable') {
        this.doc.setDrawColor(THEME.colors.border);
        this.doc.setFillColor(THEME.colors.background.light);
        this.doc.rect(x, y, w, h, 'FD');
        this.doc.setTextColor(THEME.colors.text.secondary);
        this.doc.setFontSize(8);
        this.doc.text(text, x + (w / 2), y + (h / 2), { align: 'center' });
    }

    private generateFilename(originalName: string = 'scan'): string {
        const safeName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const dateStr = new Date().toISOString().slice(0, 10);
        return `CXR_Report_${safeName}_${dateStr}.pdf`;
    }
}

// ==========================================
// PUBLIC EXPORTS
// ==========================================

export async function generatePdfReport(params: PdfExportParams): Promise<{ blobUrl: string; filename: string }> {
    const generator = new CXRReportGenerator();
    return generator.generate(params);
}

export function downloadPdf(blobUrl: string, filename: string): void {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export function revokePdfUrl(blobUrl: string): void {
    URL.revokeObjectURL(blobUrl);
}