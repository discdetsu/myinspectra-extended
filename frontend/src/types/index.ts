// TypeScript interfaces for the API responses

export interface Condition {
    name: string;
    thresholded: string;
}

export interface ResultItem {
    name: string;
    score: string | null;
    status: 'positive' | 'low' | 'none';
}

export interface VersionSummary {
    results: ResultItem[];
    conditions: Condition[];
}

export interface CaseListItem {
    request_id: string;
    created_at: string;
    patient_name: string;
    raw_image_url: string | null;
    success_process: boolean;
    v3: VersionSummary;
    v4: VersionSummary;
}

export interface CaseListResponse {
    cases: CaseListItem[];
    total_count: number;
    total_pages: number;
    current_page: number;
    has_next: boolean;
    has_previous: boolean;
}

export interface Prediction {
    disease_name: string;
    prediction_value: number;
    balanced_score: number;
    thresholded_percentage: string;
}

export interface Overlay {
    url: string | null;
    width: number | null;
    height: number | null;
}

export interface RawImage {
    url: string | null;
    filename: string | null;
    width: number | null;
    height: number | null;
}

export interface CaseDetail {
    request_id: string;
    created_at: string;
    success_process: boolean;
    raw_image: RawImage;
    predictions: {
        'v3.5.1': Prediction[];
        'v4.5.0': Prediction[];
    };
    overlays: {
        'v3.5.1'?: Overlay;
        'v4.5.0'?: Overlay;
    };
}

export interface UploadResponse {
    request_id: string;
    success: boolean;
    errors: string[] | null;
}
