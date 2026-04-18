// Unified expiry/date formatting for the mobile app. Keep locale consistent
// (vi-VN) and share the >=1 day → "DD/MM/YYYY", <1 day → "Xh Ym" rule.

type DateInput = string | number | Date | null | undefined;

function toDate(input: DateInput): Date | null {
    if (input == null || input === '') return null;
    const d = input instanceof Date ? input : new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
}

function pad2(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}

function formatDayMonthYear(d: Date): string {
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatDayMonthYearTime(d: Date): string {
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatCountdown(msRemaining: number): string {
    const totalMinutes = Math.floor(msRemaining / 60_000);
    if (totalMinutes < 1) return '<1m';
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
}

export function formatExpiry(expiresAt: DateInput): string {
    const d = toDate(expiresAt);
    if (!d) return 'Vĩnh viễn';
    const remaining = d.getTime() - Date.now();
    if (remaining <= 0) return 'Đã hết hạn';
    const ONE_DAY = 24 * 60 * 60 * 1000;
    if (remaining >= ONE_DAY) return formatDayMonthYear(d);
    return formatCountdown(remaining);
}

export function formatExpiryCountdown(expiresAt: DateInput): string | null {
    const d = toDate(expiresAt);
    if (!d) return null;
    const remaining = d.getTime() - Date.now();
    if (remaining <= 0) return 'Đã hết hạn';
    return formatCountdown(remaining);
}

export type ExpiryUrgency = 'expired' | 'urgent' | 'soon' | 'normal' | 'none';

export function getExpiryUrgency(expiresAt: DateInput): ExpiryUrgency {
    const d = toDate(expiresAt);
    if (!d) return 'none';
    const remaining = d.getTime() - Date.now();
    if (remaining <= 0) return 'expired';
    const ONE_HOUR = 60 * 60 * 1000;
    const ONE_DAY = 24 * ONE_HOUR;
    if (remaining < ONE_HOUR) return 'urgent';
    if (remaining < ONE_DAY) return 'soon';
    return 'normal';
}

// For createdAt / non-expiry dates — simple DD/MM/YYYY.
export function formatDate(date: DateInput): string {
    const d = toDate(date);
    return d ? formatDayMonthYear(d) : '';
}

export function formatDateTime(date: DateInput): string {
    const d = toDate(date);
    return d ? formatDayMonthYearTime(d) : '';
}
