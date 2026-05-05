// localRecordStore — single owner of AsyncStorage 'ehr_local_records'.
//
// Why this exists (S16 R3, 2026-04-29):
// Previously 12+ scattered call sites across screens + services did the same
// dance: getItem('ehr_local_records') → JSON.parse → mutate → JSON.stringify
// → setItem. With no locking, two screens writing concurrently could lose
// each other's update (last writer wins on the SET, but the parse on the
// other side already saw the older snapshot). After a logout that clears
// the cache, every fallback path was racing the next read.
//
// This service is the only allowed entry point. It serializes mutations
// through an in-memory promise mutex so reads/writes don't interleave.
//
// Storage layout: { [cidHash: string]: { cid?: string; aesKey?: string; ...other fields } }
// Mobile screens used to stuff additional metadata (title, draft state) into
// the same map; we preserve unknown fields when merging so legacy callers
// still see their data.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'ehr_local_records';

export type LocalRecord = {
    cid?: string;
    aesKey?: string;
    [extra: string]: any;
};

export type LocalRecordMap = Record<string, LocalRecord>;

let mutex: Promise<any> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const next = mutex.then(fn, fn);
    // Don't propagate the result's error to the chain — only sequence.
    mutex = next.catch(() => undefined);
    return next;
}

async function readMap(): Promise<LocalRecordMap> {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch {
        // Corrupted blob — treat as empty rather than throw. Caller will
        // re-populate as it discovers/decrypts records.
        return {};
    }
}

async function writeMap(map: LocalRecordMap): Promise<void> {
    await AsyncStorage.setItem(KEY, JSON.stringify(map));
}

/**
 * Read the local cache entry for one cidHash. Returns null if absent.
 * Use this everywhere a screen needs `{cid, aesKey}` for a known record.
 */
export async function getKey(cidHash: string): Promise<LocalRecord | null> {
    return withLock(async () => {
        const map = await readMap();
        const entry = map[cidHash];
        return entry ? { ...entry } : null;
    });
}

/**
 * Read the entire cache map (read-only snapshot). Prefer getKey/getKeys when
 * possible; this is for legacy callers that iterate the map.
 */
export async function getAll(): Promise<LocalRecordMap> {
    return withLock(async () => {
        const map = await readMap();
        return { ...map };
    });
}

/**
 * Atomic set/merge for a single cidHash. Preserves any existing extra fields
 * (title, draft state) on the same key.
 */
export async function setKey(cidHash: string, value: LocalRecord): Promise<void> {
    return withLock(async () => {
        const map = await readMap();
        map[cidHash] = { ...(map[cidHash] || {}), ...value };
        await writeMap(map);
    });
}

/**
 * Atomic merge of a partial map of updates. Preserves existing entries not in
 * the update set. Used by batch flows (cascade share, healer).
 */
export async function merge(updates: LocalRecordMap): Promise<void> {
    return withLock(async () => {
        const map = await readMap();
        for (const [cidHash, value] of Object.entries(updates)) {
            map[cidHash] = { ...(map[cidHash] || {}), ...value };
        }
        await writeMap(map);
    });
}

/**
 * Delete one entry. Used when revoking local access.
 */
export async function deleteKey(cidHash: string): Promise<void> {
    return withLock(async () => {
        const map = await readMap();
        if (cidHash in map) {
            delete map[cidHash];
            await writeMap(map);
        }
    });
}

/**
 * Wipe the entire cache. Used on logout to prevent cross-account leak.
 */
export async function clear(): Promise<void> {
    return withLock(async () => {
        await AsyncStorage.removeItem(KEY);
    });
}

export default {
    getKey,
    getAll,
    setKey,
    merge,
    deleteKey,
    clear,
};
