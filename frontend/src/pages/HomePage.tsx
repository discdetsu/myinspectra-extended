import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DropZone } from '../components/Upload';
import { uploadImage } from '../services/api';
import './HomePage.css';

export function HomePage() {
    const navigate = useNavigate();
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFileSelect = async (file: File) => {
        setIsUploading(true);
        setError(null);

        try {
            const response = await uploadImage(file);

            if (response.request_id) {
                navigate(`/case/${response.request_id}`);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="home-page">
            <header className="page-header">
                <p className="page-subtitle">INSPECTRA CXR</p>
                <h1 className="page-title">File Upload</h1>
            </header>

            {error && (
                <div className="error-banner">
                    <span className="error-icon">⚠️</span>
                    <span>{error}</span>
                    <button className="dismiss-btn" onClick={() => setError(null)}>✕</button>
                </div>
            )}

            <DropZone onFileSelect={handleFileSelect} isUploading={isUploading} />
        </div>
    );
}
