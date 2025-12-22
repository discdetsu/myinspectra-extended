import { useCallback, useState } from 'react';
import './DropZone.css';

import uploadIconPng from '../../assets/image-upload.png';
import fileIconPng from '../../assets/img.png';

interface DropZoneProps {
    onFileSelect: (file: File) => void;
    isUploading: boolean;
    accept?: string;
}

export function DropZone({ onFileSelect, isUploading, accept = 'image/*,.dcm' }: DropZoneProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const file = e.dataTransfer.files[0];
        if (file) {
            handleFile(file);
        }
    }, []);

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleFile(file);
        }
    }, []);

    const handleFile = (file: File) => {
        setSelectedFile(file);
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                setPreviewUrl(e.target?.result as string);
            };
            reader.readAsDataURL(file);
        } else {
            setPreviewUrl(null);
        }
    };

    const handleSubmit = () => {
        if (selectedFile) {
            onFileSelect(selectedFile);
        }
    };

    const handleClear = () => {
        setSelectedFile(null);
        setPreviewUrl(null);
    };

    return (
        <div className="dropzone-container">
            <div
                className={`dropzone ${isDragging ? 'dragging' : ''} ${selectedFile ? 'has-file' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {selectedFile ? (
                    <div className="dropzone-preview">
                        {previewUrl ? (
                            <img src={previewUrl} alt="Preview" className="preview-image" loading="lazy" />
                        ) : (
                            <div className="file-icon">
                                <img src={fileIconPng} alt="File" className="icon-img" />
                            </div>
                        )}
                        <div className="file-info">
                            <span className="file-name">{selectedFile.name}</span>
                            <span className="file-size">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
                        </div>
                        <button className="clear-btn" onClick={handleClear} disabled={isUploading}>
                            ✕
                        </button>
                    </div>
                ) : (
                    <label className="dropzone-label">
                        <input
                            type="file"
                            accept={accept}
                            onChange={handleFileInput}
                            className="file-input"
                            disabled={isUploading}
                        />
                        <div className="dropzone-icon">
                            <img src={uploadIconPng} alt="Upload" className="icon-img-lg" />
                        </div>
                        <div className="dropzone-text">
                            <span className="dropzone-title">Drop files here to upload</span>
                            <span className="dropzone-hint">or click to browse</span>
                        </div>
                    </label>
                )}
            </div>

            <div className="dropzone-footer">
                <div className="supported-types">
                    <span className="label">Supported file types:</span>
                    <span className="types">.dcm .jpg .jpeg .png .JPG .JPEG .PNG</span>
                </div>

                {selectedFile && (
                    <button
                        className="btn btn-primary submit-btn"
                        onClick={handleSubmit}
                        disabled={isUploading}
                    >
                        {isUploading ? (
                            <>
                                <span className="spinner" />
                                Processing...
                            </>
                        ) : (
                            'Submit'
                        )}
                    </button>
                )}
            </div>
        </div>
    );
}