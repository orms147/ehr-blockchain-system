// Global error handler — standardized response format.
// Response shape: { code, error, message, details?, txHash? }
// Both 'error' and 'message' carry the human-readable string for backward compat.
import { createLogger } from '../utils/logger.js';

const log = createLogger('ErrorHandler');

export function errorHandler(err, req, res, next) {
    // Prisma: unique constraint violation
    if (err.code === 'P2002') {
        const field = err.meta?.target?.[0] || 'unknown';
        const msg = `Resource already exists (${field})`;
        return res.status(409).json({
            code: 'RESOURCE_DUPLICATE',
            error: msg,
            message: msg,
            details: { field },
        });
    }

    // Prisma: record not found
    if (err.code === 'P2025') {
        const msg = 'Resource not found';
        return res.status(404).json({
            code: 'RESOURCE_NOT_FOUND',
            error: msg,
            message: msg,
        });
    }

    // Zod validation errors
    if (err.name === 'ZodError') {
        const msg = 'Validation failed';
        return res.status(400).json({
            code: 'VALIDATION_ERROR',
            error: msg,
            message: msg,
            details: err.errors,
        });
    }

    // Multer file upload errors
    if (err.name === 'MulterError') {
        const msg = err.code === 'LIMIT_FILE_SIZE'
            ? 'File quá lớn. Vui lòng chọn file dưới 50MB.'
            : `Upload error: ${err.message}`;
        return res.status(400).json({
            code: `UPLOAD_${err.code || 'ERROR'}`,
            error: msg,
            message: msg,
        });
    }

    // AppError or generic errors
    const statusCode = err.statusCode || 500;
    const code = err.code || 'INTERNAL_ERROR';
    const msg = err.message || 'Internal server error';

    const body = {
        code,
        error: msg,
        message: msg,
    };

    if (err.details) body.details = err.details;
    if (err.txHash) body.txHash = err.txHash;

    if (statusCode === 500) {
        log.error('Unhandled error', { error: err.message, stack: err.stack?.split('\n')[1]?.trim() });
    }

    res.status(statusCode).json(body);
}

// Enhanced error class with error code and optional metadata.
export class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', extra = {}) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = extra.details || null;
        this.txHash = extra.txHash || null;
    }
}

