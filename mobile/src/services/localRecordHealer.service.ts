// One-shot local cache healer for the root-walk refactor rollout.
//
// Before the refactor, backend `GET /api/key-share/record/:cidHash` could
// fall back to an ancestor KeyShare when no direct row existed and return
// that payload with an `isAncestorKey=true` flag. RecordDetailScreen.
// saveLocalKey cached the returned `{cid, aesKey}` under the REQUESTED
// cidHash — so on a chain V1→V2→V3 with only V1 shared, AsyncStorage
// ended up with `ehr_local_records[V2] = V1's keys`. Later flows (patient
// approve cascade, self-view) then shared V1's keys under V2's slot —
// doctor decrypts V2 but sees V1 content.
//
// The refactor fixes the root cause (backend no longer returns ancestor
// fallback, contract walks chain itself). This healer removes any cache
// entries poisoned by the OLD backend behavior. Runs once per install
// after login; idempotent after that.

import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'ehr_local_records';
const HEALED_FLAG_KEY = 'ehr_local_records_healed_v1';

/**
 * Purges the local record cache if we haven't run the healing migration yet.
 * Safe to call multiple times — subsequent invocations are no-ops.
 *
 * Rationale: rather than validating each entry against the backend (slow,
 * many RPC calls), we simply wipe once. On next view of each record, the
 * now-safe backend will repopulate correctly. The trade-off is users may
 * need to tap "Giải mã" once per record they previously had cached — an
 * acceptable one-time cost to guarantee cache integrity.
 */
export async function healLocalRecordCache(): Promise<void> {
    try {
        const alreadyHealed = await AsyncStorage.getItem(HEALED_FLAG_KEY);
        if (alreadyHealed === '1') return;

        // Wipe the cache. Records the user opens from now on will repopulate
        // via RecordDetailScreen.performDecrypt → saveLocalKey which calls
        // the refactored backend that no longer returns ancestor fallbacks.
        await AsyncStorage.removeItem(CACHE_KEY);
        await AsyncStorage.setItem(HEALED_FLAG_KEY, '1');
        // eslint-disable-next-line no-console
        console.info('[healer] Purged ehr_local_records once (root-walk migration)');
    } catch (err) {
        // Non-fatal: healer failure just means the cache stays as-is. The
        // backend ancestor-fallback removal is the real fix; this healer is
        // only a convenience to avoid users seeing stale decrypts.
        // eslint-disable-next-line no-console
        console.warn('[healer] Failed to purge local cache:', err);
    }
}
