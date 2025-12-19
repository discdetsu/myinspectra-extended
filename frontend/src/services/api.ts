// API client for communicating with Django backend

import type { CaseListResponse, CaseDetail, UploadResponse } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://hydra.perceptra.tech:8000';

export async function fetchCases(page = 1, pageSize = 10, search = ''): Promise<CaseListResponse> {
    const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
    });
    if (search) params.append('search', search);

    const response = await fetch(`${API_BASE_URL}/api/cases/?${params}`);
    if (!response.ok) throw new Error('Failed to fetch cases');
    return response.json();
}

export async function fetchCaseDetail(requestId: string): Promise<CaseDetail> {
    const response = await fetch(`${API_BASE_URL}/api/cases/${requestId}/`);
    if (!response.ok) throw new Error('Failed to fetch case detail');
    return response.json();
}

export async function uploadImage(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch(`${API_BASE_URL}/api/upload/`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
    }

    return response.json();
}
