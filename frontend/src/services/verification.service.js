// Verification Service - Frontend client for doctor verification
import { api } from './api';

// Get verification status for current doctor
export async function getVerificationStatus() {
    const response = await api.get('/api/verification/status');
    return response;
}

// Submit verification request
export async function submitVerification(data) {
    const response = await api.post('/api/verification/submit', data);
    return response;
}

// Get pending verification requests (for Ministry/Admin)
export async function getPendingVerifications() {
    const response = await api.get('/api/verification/pending');
    return response;
}

// Get all verification requests (for Ministry/Admin)
export async function getAllVerifications(status = null) {
    const url = status ? `/api/verification/all?status=${status}` : '/api/verification/all';
    const response = await api.get(url);
    return response;
}

// Review (approve/reject) verification request (for Ministry/Admin)
export async function reviewVerification(requestId, approved, rejectionReason = null) {
    const response = await api.post('/api/verification/review', {
        requestId,
        approved,
        rejectionReason,
    });
    return response;
}

export const verificationService = {
    getVerificationStatus,
    submitVerification,
    getPendingVerifications,
    getAllVerifications,
    reviewVerification,
};
