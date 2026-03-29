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
        return error;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const timeoutMs = options.timeoutMs ?? 15000;

        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        if (this.getToken()) {
            headers['Authorization'] = `Bearer ${this.getToken()}`;
        }

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
            if (error?.name === 'AbortError') {
                throw new Error('Ket noi den may chu qua thoi gian. Vui long thu lai.');
            }
            console.error(`API Error on ${endpoint}:`, error);
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    // GET request
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

    // POST request (JSON)
    async post(endpoint, body) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    // PUT request (JSON)
    async put(endpoint, body) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body),
        });
    }

    // POST FormData (for file uploads)
    async postFormData(endpoint, formData) {
        const url = `${this.baseUrl}${endpoint}`;
        const timeoutMs = 20000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const headers = {};
        // Don't set Content-Type - browser sets it automatically with boundary for FormData

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
                throw new Error('Tai tep qua thoi gian. Vui long thu lai.');
            }
            console.error(`API Error on formData ${endpoint}:`, error);
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    // DELETE request
    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }
}

export const api = new ApiService();
export default api;
