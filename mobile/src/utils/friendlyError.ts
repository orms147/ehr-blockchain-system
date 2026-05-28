// friendlyError — centralized Vietnamese error formatting helpers (Plan §14 P0).
//
// Vì sao: trước đây mỗi screen tự chain `err?.data?.error || err?.message ||
// 'fallback'` → raw English / OAuth code / contract revert reason leak ra Alert
// user-facing VN. User report sample: "Đăng nhập thất bại Login failed,
// access_denied".
//
// Module exports 4 functions chuyên biệt theo loại error source:
//   - friendlyBackendError(err)  — backend HTTP error (axios response)
//   - friendlyProviderError(err) — Web3Auth / OAuth provider errors
//   - friendlyChainError(err)    — re-export formatChainError đã có sẵn
//   - friendlyPickerError(err)   — expo-image-picker / file system errors
//
// Pattern: ưu tiên backend `code` mapped → backend `message` nếu là tiếng
// Việt → fallback tiếng Việt (KHÔNG render raw English).

import { formatChainError } from './rpcRetry';

// ────────────────────────────────────────────────────────────────────────
// Backend HTTP errors (axios)
// ────────────────────────────────────────────────────────────────────────

/**
 * Backend conventional codes (scan từ backend/src/routes/*.routes.js).
 * Mỗi route trả `{ code: 'XYZ', error: '...', message: '...' }` khi 4xx/5xx.
 * Mapping cover ~25 code phổ biến + room mở rộng.
 */
const BACKEND_CODE_MAP: Record<string, string> = {
    // Auth + permission
    'AUTH_REQUIRED': 'Cần đăng nhập để tiếp tục.',
    'INVALID_TOKEN': 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    'ONCHAIN_ROLE_FORBIDDEN': 'Bạn không có quyền thực hiện thao tác này.',
    'PATIENT_NOT_REGISTERED': 'Tài khoản chưa đăng ký vai trò bệnh nhân.',
    'DOCTOR_NOT_VERIFIED': 'Tài khoản bác sĩ chưa được tổ chức y tế xác minh.',

    // Records / KeyShare
    'RECORD_NOT_FOUND': 'Không tìm thấy hồ sơ.',
    'RECORD_EXISTS': 'Hồ sơ này đã tồn tại. Vui lòng làm mới danh sách.',
    'CID_RESERVED': 'Mã hồ sơ này đang được dùng. Hãy thử lại với hồ sơ khác.',
    'MAX_CHILDREN_REACHED': 'Hồ sơ gốc đã đạt giới hạn phiên bản. Hãy tạo hồ sơ mới.',
    'CONSENT_NOT_FOUND': 'Bạn chưa có quyền truy cập hồ sơ này.',
    'NO_ONCHAIN_CONSENT_FOR_RECIPIENT': 'Người nhận chưa có quyền trên hệ thống. Cấp quyền trước khi chia sẻ.',
    'KEY_NOT_SHARED_FOR_VERSION': 'Bệnh nhân chưa chia sẻ khoá giải mã cho phiên bản này.',
    'CREATOR_KEY_LOST': 'Khoá giải mã đã mất trên thiết bị này. Mở lại trên thiết bị cũ hoặc liên hệ quản trị viên.',
    'OWNER_KEY_MISSING': 'Bản cập nhật do bác sĩ khác tạo, họ chưa chia sẻ khoá cho bạn.',
    'KEY_SHARE_REVOKED': 'Bệnh nhân đã thu hồi quyền truy cập.',
    'KEY_SHARE_EXPIRED': 'Quyền truy cập đã hết hạn.',

    // Profile / CCCD / BHYT
    'NATIONAL_ID_TAKEN': 'Số CCCD này đã được đăng ký bởi tài khoản khác.',
    'INVALID_BHYT': 'Số thẻ BHYT không đúng định dạng (2 chữ + 13 số).',

    // Quota
    'QUOTA_EXHAUSTED': 'Đã hết lượt miễn phí trong tháng. Vui lòng thử lại sau.',
    'SPONSOR_NOT_AUTHORIZED': 'Hệ thống chưa được cấp quyền hỗ trợ. Liên hệ quản trị viên.',
    'RELAYER_NOT_AUTHORIZED': 'Hệ thống chưa được cấp quyền hỗ trợ. Liên hệ quản trị viên.',
    'RELAYER_NOT_CONFIGURED': 'Hệ thống chưa sẵn sàng. Vui lòng liên hệ quản trị viên.',

    // Files / uploads
    'FILE_SIZE_EXCEEDED': 'Tệp quá lớn. Vui lòng chọn tệp nhỏ hơn.',
    'INVALID_FILE_TYPE': 'Định dạng tệp không được hỗ trợ.',
    'VALIDATION_ERROR': 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.',

    // Generic
    'INTERNAL_ERROR': 'Lỗi hệ thống. Vui lòng thử lại sau ít phút.',
    'NOT_FOUND': 'Không tìm thấy dữ liệu yêu cầu.',
};

/**
 * Heuristic: chuỗi có chứa ký tự dấu tiếng Việt không?
 * Dùng để detect "backend message này đã tiếng Việt sẵn — OK render thẳng".
 */
function containsVietnameseChars(s: string): boolean {
    return /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ]/.test(s);
}

/**
 * Backend error → user-friendly Vietnamese.
 * Ưu tiên (cao → thấp):
 *   1. err.data.code mapped trong BACKEND_CODE_MAP
 *   2. err.data.message nếu là tiếng Việt (backend đã localize)
 *   3. fallback param hoặc default
 *
 * KHÔNG bao giờ render `err.message` raw (axios message thường tiếng Anh).
 */
export function friendlyBackendError(err: any, fallback?: string): string {
    if (!err) return fallback || 'Có lỗi xảy ra. Vui lòng thử lại.';

    // Try error code first
    const code = err?.data?.code || err?.response?.data?.code;
    if (code && typeof code === 'string' && BACKEND_CODE_MAP[code]) {
        return BACKEND_CODE_MAP[code];
    }

    // Backend message đã tiếng Việt sẵn → trust và render
    const backendMsg = err?.data?.message || err?.response?.data?.message;
    if (backendMsg && typeof backendMsg === 'string' && containsVietnameseChars(backendMsg)) {
        return backendMsg;
    }
    // Hoặc backend trả `error` field (cũ)
    const backendError = err?.data?.error || err?.response?.data?.error;
    if (backendError && typeof backendError === 'string' && containsVietnameseChars(backendError)) {
        return backendError;
    }

    // Status code-based fallback
    const status = err?.status || err?.response?.status;
    if (status === 429) return 'Hệ thống đang bận. Vui lòng thử lại sau ít phút.';
    if (status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
    if (status === 404) return 'Không tìm thấy dữ liệu yêu cầu.';
    if (status >= 500) return 'Lỗi máy chủ. Vui lòng thử lại sau ít phút.';

    return fallback || 'Có lỗi xảy ra. Vui lòng thử lại.';
}

// ────────────────────────────────────────────────────────────────────────
// Web3Auth / OAuth provider errors
// ────────────────────────────────────────────────────────────────────────

/**
 * OAuth + Web3Auth provider error codes mapping.
 * Source: Web3Auth SDK v8 + OAuth 2.0 standard codes.
 */
const PROVIDER_CODE_MAP: Array<[RegExp, string]> = [
    [/access_denied|user_cancelled|popup_closed/i, 'Bạn đã huỷ đăng nhập.'],
    [/network_error|network[_ ]?fail/i, 'Lỗi kết nối mạng. Vui lòng kiểm tra Wi-Fi hoặc 4G.'],
    [/timeout|quá thời gian/i, 'Hết thời gian chờ. Vui lòng thử lại.'],
    [/unauthorized_client|invalid_client/i, 'Ứng dụng chưa được cấp phép. Liên hệ hỗ trợ.'],
    [/invalid_request|bad_request/i, 'Yêu cầu không hợp lệ. Vui lòng thử lại.'],
    [/reload|please reload/i, 'Cần khởi động lại đăng nhập. Bấm lại nút đăng nhập.'],
    [/server_error|service_unavailable/i, 'Máy chủ đăng nhập tạm thời gián đoạn. Thử lại sau ít phút.'],
    [/already.*signed|already.*logged/i, 'Phiên đăng nhập trước đó còn hoạt động. Vui lòng đóng và mở lại app.'],
    [/email.*invalid|invalid.*email/i, 'Email không hợp lệ.'],
    [/sms.*fail|otp.*fail/i, 'Không gửi được mã OTP. Kiểm tra số điện thoại và thử lại.'],
];

/**
 * Web3Auth / OAuth provider error → Vietnamese.
 * Match theo regex pattern trong message hoặc code.
 *
 * @param err Provider error object
 * @param providerName "Google" | "Apple" | "Email" — append vào fallback
 */
export function friendlyProviderError(err: any, providerName?: string): string {
    if (!err) {
        return providerName
            ? `Đăng nhập ${providerName} thất bại. Vui lòng thử lại.`
            : 'Đăng nhập thất bại. Vui lòng thử lại.';
    }
    const msg = String(err?.message || err?.error || err?.code || err || '');
    for (const [pattern, vn] of PROVIDER_CODE_MAP) {
        if (pattern.test(msg)) return vn;
    }
    return providerName
        ? `Đăng nhập ${providerName} thất bại. Vui lòng thử lại.`
        : 'Đăng nhập thất bại. Vui lòng thử lại.';
}

// ────────────────────────────────────────────────────────────────────────
// File / Image picker errors (expo-image-picker, expo-document-picker)
// ────────────────────────────────────────────────────────────────────────

/**
 * Picker error → Vietnamese.
 * Empty string returned khi user chủ động cancel (không cần Alert).
 */
export function friendlyPickerError(err: any, fallback?: string): string {
    if (!err) return fallback || 'Không thể chọn tệp. Vui lòng thử lại.';
    const msg = String(err?.message || err?.code || err || '').toLowerCase();

    // Silent skip — user cancel chủ động
    if (msg.includes('user cancel') || msg.includes('user canceled') || msg.includes('cancelled')) {
        return '';
    }
    if (msg.includes('permission')) {
        return 'Cần cấp quyền truy cập thư viện ảnh trong Cài đặt > Quyền ứng dụng.';
    }
    if (msg.includes('camera')) {
        return 'Không thể truy cập máy ảnh. Kiểm tra quyền hoặc thử lại.';
    }
    if (msg.includes('file size') || msg.includes('too large')) {
        return 'Tệp quá lớn. Vui lòng chọn tệp nhỏ hơn 10MB.';
    }
    return fallback || 'Không thể chọn tệp. Vui lòng thử lại.';
}

// ────────────────────────────────────────────────────────────────────────
// Re-export contract chain error (đã có sẵn trong rpcRetry — không duplicate)
// ────────────────────────────────────────────────────────────────────────

/** Re-export `formatChainError` từ rpcRetry với alias semantic rõ hơn. */
export const friendlyChainError = formatChainError;
