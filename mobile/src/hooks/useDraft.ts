// useDraft — local auto-save for form screens per spec Q4.
//
// Behavior:
//   - Debounce 1.5s after last edit, write to AsyncStorage
//   - TTL 24h (older drafts discarded on load)
//   - Key shape: `viehp.draft.{screenId}.{patientId|'new'}`
//   - Returns: { draft, saveStatus, clear, restorable, applyRestore, dismiss }
//   - restorable = if there's a stored draft DIFFERENT from current empty state,
//     surface banner — user must explicitly accept before applyRestore() loads it.
//     Never auto-fill (per spec: tránh nhầm bệnh nhân khác).
//
// Backend sync (per spec Q4): deferred.

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type DraftRecord<T> = {
    data: T;
    savedAt: number;  // epoch ms
};

const TTL_MS = 24 * 60 * 60 * 1000;
const DEBOUNCE_MS = 1500;

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface UseDraftReturn<T> {
    /** Current draft data (mirrors caller's state) */
    draft: T;
    /** Last save status — for "Tự lưu" indicator */
    saveStatus: SaveStatus;
    /** Caller writes here; we debounce-save to storage */
    update: (next: T | ((prev: T) => T)) => void;
    /** Wipe saved + reset local */
    clear: () => Promise<void>;
    /** True iff stored draft exists + not empty + age < TTL */
    restorable: boolean;
    /** Replace local with stored draft */
    applyRestore: () => void;
    /** Dismiss restore banner without applying */
    dismissRestore: () => void;
    /** Saved timestamp for "Tự lưu · 14:23" display */
    savedAtMs: number | null;
}

interface UseDraftOptions<T> {
    /** Screen id, eg "createRecord" / "doctorRequestAccess" */
    screenId: string;
    /** Per-patient namespacing — pass patient wallet OR 'new' if unknown */
    patientKey: string;
    /** Initial empty state */
    initial: T;
    /** Heuristic for "is this draft worth restoring?" — return false to skip banner */
    isMeaningful?: (data: T) => boolean;
}

function keyFor(screenId: string, patientKey: string): string {
    return `viehp.draft.${screenId}.${patientKey}`;
}

export default function useDraft<T extends object>({
    screenId,
    patientKey,
    initial,
    isMeaningful,
}: UseDraftOptions<T>): UseDraftReturn<T> {
    const [draft, setDraft] = useState<T>(initial);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [savedAtMs, setSavedAtMs] = useState<number | null>(null);
    const [stored, setStored] = useState<T | null>(null);
    const [dismissed, setDismissed] = useState(false);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const storageKey = keyFor(screenId, patientKey);

    // On mount: check for stored draft
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(storageKey);
                if (cancelled || !raw) return;
                const parsed = JSON.parse(raw) as DraftRecord<T>;
                if (!parsed?.data || typeof parsed.savedAt !== 'number') return;
                const age = Date.now() - parsed.savedAt;
                if (age > TTL_MS) {
                    AsyncStorage.removeItem(storageKey).catch(() => {});
                    return;
                }
                setStored(parsed.data);
                setSavedAtMs(parsed.savedAt);
            } catch {
                // corrupt entry — wipe silently
                AsyncStorage.removeItem(storageKey).catch(() => {});
            }
        })();
        return () => { cancelled = true; };
    }, [storageKey]);

    // Debounced save
    const update = useCallback(
        (next: T | ((prev: T) => T)) => {
            setDraft((prev) => {
                const value = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
                if (debounceRef.current) clearTimeout(debounceRef.current);
                setSaveStatus('saving');
                debounceRef.current = setTimeout(async () => {
                    try {
                        const record: DraftRecord<T> = { data: value, savedAt: Date.now() };
                        await AsyncStorage.setItem(storageKey, JSON.stringify(record));
                        setSaveStatus('saved');
                        setSavedAtMs(record.savedAt);
                    } catch {
                        setSaveStatus('error');
                    }
                }, DEBOUNCE_MS);
                return value;
            });
        },
        [storageKey],
    );

    const clear = useCallback(async () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        try {
            await AsyncStorage.removeItem(storageKey);
        } catch {}
        setDraft(initial);
        setSaveStatus('idle');
        setSavedAtMs(null);
        setStored(null);
    }, [storageKey, initial]);

    const applyRestore = useCallback(() => {
        if (stored) {
            setDraft(stored);
            setStored(null);
            setDismissed(false);
        }
    }, [stored]);

    const dismissRestore = useCallback(() => {
        setDismissed(true);
        setStored(null);
        // Don't clear storage — user may dismiss accidentally, keep for next mount
    }, []);

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    const restorable = !!stored && !dismissed && (isMeaningful ? isMeaningful(stored) : true);

    return {
        draft,
        saveStatus,
        update,
        clear,
        restorable,
        applyRestore,
        dismissRestore,
        savedAtMs,
    };
}
