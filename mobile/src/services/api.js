import { API_BASE_URL } from '../constants/config';

class ApiService {
    constructor() {
        this.baseUrl = API_BASE_URL;
        this.token = null;
    }

    setToken(token) {
        this.token = token;
    }

    clearToken() {
        this.token = null;
    }

    getToken() {
        return this.token;
    }

    async parseResponseBody(response) {
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            try {
                return await response.json();
            } catch {
                return null;
            }
        }

        try {
            const text = await response.text();
            return text ? { message: text } : null;
        } catch {
            return null;
        }
    }

    buildHttpError(response, data, fallbackMessage) {
        const message = data?.error || data?.message || `${fallbackMessage} (HTTP ${response.status})`;
        const error = new Error(message);
        error.status = response.status;
        error.data = data;
        if (data?.code) error.code = data.code;
        if (data?.details) error.details = data.details;
        if (data?.txHash) error.txHash = data.txHash;
        return error;
    }

    isNetworkError(error) {
        if (!error) return false;

        const raw = String(error?.message || '').toLowerCase();
        if (error instanceof TypeError) return true;

        return (
            raw.includes('network request failed')
            || raw.includes('failed to fetch')
            || raw.includes('networkerror')
            || raw.includes('fetch failed')
            || raw.includes('socket')
            || raw.includes('connection')
        );
    }

    buildBackendUnavailableError() {
        const error = new Error(
            `Không thể kết nối backend (${this.baseUrl}). Hãy bật backend và kiểm tra EXPO_PUBLIC_API_URL.`
        );
        error.code = 'BACKEND_UNREACHABLE';
        return error;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const timeoutMs = options.timeoutMs ?? 15000;
        const method = String(options.method || 'GET').toUpperCase();
        const retryCount = Number.isInteger(options.retryCount)
            ? options.retryCount
            : (method === 'GET' ? 1 : 0);
        const retryDelayMs = options.retryDelayMs ?? 350;

        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        if (this.getToken()) {
            headers['Authorization'] = `Bearer ${this.getToken()}`;
        }

        for (let attempt = 0; attempt <= retryCount; attempt += 1) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await fetch(url, {
                    ...options,
                    headers,
                    signal: options.signal || controller.signal,
                });

                const data = await this.parseResponseBody(response);

                if (!response.ok) {
                    throw this.buildHttpError(response, data, 'API request failed');
                }

                return data;
            } catch (error) {
                const canRetry = attempt < retryCount;

                if (error?.name === 'AbortError') {
                    if (canRetry) {
                        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
                        continue;
                    }

                    throw new Error('Kết nối đến máy chủ quá thời gian. Vui lòng thử lại.');
                }

                if (this.isNetworkError(error)) {
                    if (canRetry) {
                        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
                        continue;
                    }

                    throw this.buildBackendUnavailableError();
                }

                throw error;
            } finally {
                clearTimeout(timeoutId);
            }
        }

        throw new Error('API request failed unexpectedly.');
    }

    async get(endpoint, query = null) {
        let finalEndpoint = endpoint;

        if (query && typeof query === 'object') {
            const params = new URLSearchParams();
            Object.entries(query).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    params.append(key, String(value));
                }
            });
            const queryString = params.toString();
            if (queryString) {
                finalEndpoint = `${endpoint}${endpoint.includes('?') ? '&' : '?'}${queryString}`;
            }
        }

        return this.request(finalEndpoint, { method: 'GET' });
    }

    async post(endpoint, body) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    async put(endpoint, body) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body),
        });
    }

    async postFormData(endpoint, formData) {
        const url = `${this.baseUrl}${endpoint}`;
        const timeoutMs = 20000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const headers = {};

        if (this.getToken()) {
            headers['Authorization'] = `Bearer ${this.getToken()}`;
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: formData,
                signal: controller.signal,
            });

            const data = await this.parseResponseBody(response);

            if (!response.ok) {
                throw this.buildHttpError(response, data, 'API request failed');
            }

            return data;
        } catch (error) {
            if (error?.name === 'AbortError') {
                throw new Error('Tải tệp quá thời gian. Vui lòng thử lại.');
            }

            if (this.isNetworkError(error)) {
                throw this.buildBackendUnavailableError();
            }

            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    async ping() {
        return this.request('/health', { method: 'GET', timeoutMs: 6000, retryCount: 0 });
    }
}

export const api = new ApiService();
export default api;
