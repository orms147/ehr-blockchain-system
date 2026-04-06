import AsyncStorage from '@react-native-async-storage/async-storage';
import recordService from './record.service';

const LOCAL_RECORDS_STORAGE_KEY = 'ehr_local_records';

function toLocalRenderableRecord(cidHash, raw) {
    const createdAtSource = raw?.createdAt || raw?.submittedAt || raw?.failedAt || Date.now();
    const createdAtDate = new Date(createdAtSource);
    const createdAtTs = Number.isNaN(createdAtDate.getTime()) ? Date.now() : createdAtDate.getTime();

    const title = raw?.title || raw?.recordType || 'Hồ sơ local';
    const recordType = raw?.recordType || 'local_record';

    return {
        id: raw?.recordId || `local-${cidHash}`,
        cidHash,
        parentCidHash: raw?.parentCidHash || null,
        type: recordType,
        title,
        description: raw?.description || raw?.syncError || null,
        date: new Date(createdAtTs).toLocaleDateString('vi-VN'),
        createdAt: new Date(createdAtTs).toISOString(),
        createdAtTs,
        createdBy: raw?.createdBy || raw?.ownerAddress || null,
        createdByDisplay: raw?.createdByDisplay || 'Bạn (local)',
        ownerAddress: raw?.ownerAddress || null,
        syncStatus: raw?.syncStatus || 'failed',
        syncError: raw?.syncError || null,
        isLocalDraft: true,
    };
}

async function readLocalRecordsMap() {
    const raw = await AsyncStorage.getItem(LOCAL_RECORDS_STORAGE_KEY);
    if (!raw) {
        return {};
    }

    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

async function writeLocalRecordsMap(map) {
    await AsyncStorage.setItem(LOCAL_RECORDS_STORAGE_KEY, JSON.stringify(map || {}));
}

function isRecordAlreadyExistsError(error) {
    if (!error) return false;

    if (Number(error?.status) === 409 && String(error?.code || '').toUpperCase() === 'RECORD_EXISTS') {
        return true;
    }

    const raw = String(error?.message || '').toLowerCase();
    return raw.includes('record already exists') || raw.includes('already exists');
}

function mergeConfirmedDraft(draft, response, remoteRecord = null) {
    const nowIso = new Date().toISOString();

    return {
        ...(draft || {}),
        syncStatus: response?.syncStatus || 'confirmed',
        syncError: null,
        txHash: response?.txHash || draft?.txHash || null,
        submittedAt: response?.submittedAt || draft?.submittedAt || nowIso,
        confirmedAt: response?.confirmedAt || nowIso,
        failedAt: null,
        recordId: response?.id || draft?.recordId || null,
        createdAt: response?.createdAt || draft?.createdAt || nowIso,
        ownerAddress: remoteRecord?.ownerAddress || draft?.ownerAddress || null,
        createdBy: remoteRecord?.createdBy || draft?.createdBy || null,
    };
}

async function retryOneRecord(cidHash, draft) {
    try {
        const response = await recordService.createRecord(
            cidHash,
            draft?.recordTypeHash || null,
            draft?.parentCidHash || null,
            draft?.title || null,
            draft?.description || null,
            draft?.recordType || null,
        );

        return mergeConfirmedDraft(draft, response, null);
    } catch (error) {
        if (!isRecordAlreadyExistsError(error)) {
            throw error;
        }

        const remoteRecord = await recordService.getRecord(cidHash).catch(() => null);

        // If backend says record already exists, treat local draft as confirmed to stop infinite retry.
        return mergeConfirmedDraft(
            draft,
            {
                syncStatus: 'confirmed',
                createdAt: remoteRecord?.createdAt,
                txHash: remoteRecord?.txHash,
                id: remoteRecord?.id,
                confirmedAt: remoteRecord?.confirmedAt,
                submittedAt: remoteRecord?.submittedAt,
            },
            remoteRecord,
        );
    }
}

export async function retryFailedLocalRecords({ limit = 3 } = {}) {
    const localMap = await readLocalRecordsMap();
    const failedEntries = Object.entries(localMap).filter(([, value]) => value?.syncStatus === 'failed');

    if (failedEntries.length === 0) {
        return { attempted: 0, succeeded: 0, failed: 0 };
    }

    let attempted = 0;
    let succeeded = 0;
    let failed = 0;

    for (const [cidHash, draft] of failedEntries.slice(0, Math.max(1, limit))) {
        attempted += 1;

        try {
            localMap[cidHash] = await retryOneRecord(cidHash, draft || {});
            succeeded += 1;
        } catch (error) {
            failed += 1;
            localMap[cidHash] = {
                ...(draft || {}),
                syncStatus: 'failed',
                syncError: error?.message || 'Không thể đồng bộ on-chain. Vui lòng thử lại.',
                failedAt: new Date().toISOString(),
            };
        }
    }

    await writeLocalRecordsMap(localMap);
    return { attempted, succeeded, failed };
}

export async function getLocalDraftRecords() {
    const localMap = await readLocalRecordsMap();

    return Object.entries(localMap)
        .filter(([, value]) => value?.syncStatus === 'failed' || value?.syncStatus === 'pending')
        .map(([cidHash, value]) => toLocalRenderableRecord(cidHash, value));
}

export default {
    retryFailedLocalRecords,
    getLocalDraftRecords,
};
