// keyShareHealer.service.ts (S12.C, 2026-04-25)
//
// Heals KeyShare gaps where the caller AUTHORED a record version (e.g. doctor
// created V1 for patient) and a recipient now has on-chain consent on that
// chain but no off-chain KeyShare row for this specific version.
//
// Most common trigger: doctor created V1 when patient hadn't registered yet,
// so the patient KeyShare for V1 was silently skipped at save-only time.
// Patient later approved a NEW doctor's request — cascade in handleApprove
// could not produce a payload for V1 (patient never had AES_V1 in the first
// place) so the new doctor permanently can't decrypt V1.
//
// This service runs on the original creator's device. They still have AES_V1
// in their local AsyncStorage cache (from creation time). For each orphan,
// re-encrypt the cached payload for the recipient and post a fresh KeyShare.
//
// Idempotent: backend `POST /api/key-share` upserts on (cidHash, sender,
// recipient), so running this multiple times is safe.

import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import keyShareService from './keyShare.service';
import walletActionService from './walletAction.service';
import { encryptForRecipient, getOrCreateEncryptionKeypair } from './nacl-crypto';
import localRecordStore from './localRecordStore';

type Orphan = {
    cidHash: string;
    recipientAddress: string;
    recipientPubkey: string;
};

const HEALER_LAST_RUN_KEY = 'ehr_keyshare_healer_last_run';
const MIN_INTERVAL_MS = 60_000; // throttle: at most once per minute per session

async function fetchOrphans(): Promise<Orphan[]> {
    return api.get('/api/key-share/missing-for-creator');
}


export async function runKeyShareHealer(options: { force?: boolean } = {}): Promise<{
    healed: number;
    skipped: number;
    errors: number;
}> {
    const result = { healed: 0, skipped: 0, errors: 0 };

    if (!options.force) {
        const lastRunStr = await AsyncStorage.getItem(HEALER_LAST_RUN_KEY);
        const lastRun = lastRunStr ? parseInt(lastRunStr, 10) : 0;
        if (Date.now() - lastRun < MIN_INTERVAL_MS) {
            return result;
        }
    }
    await AsyncStorage.setItem(HEALER_LAST_RUN_KEY, String(Date.now()));

    let orphans: Orphan[];
    try {
        orphans = await fetchOrphans();
    } catch (err) {
        console.warn('[keyShareHealer] fetch orphans failed', err);
        return result;
    }
    if (!orphans.length) return result;

    const localRecords = await localRecordStore.getAll();
    let walletCtx: any;
    let myKeypair: any;
    try {
        walletCtx = await walletActionService.getWalletContext();
        myKeypair = await getOrCreateEncryptionKeypair(walletCtx.walletClient, walletCtx.address);
    } catch (err) {
        console.warn('[keyShareHealer] wallet context unavailable', err);
        return result;
    }

    for (const o of orphans) {
        const cidHashLower = o.cidHash.toLowerCase();
        const local = localRecords[cidHashLower] || localRecords[o.cidHash];
        if (!local?.cid || !local?.aesKey) {
            // Creator doesn't have the AES key locally — can't heal this one.
            // Could happen if creator wiped AsyncStorage (logout) — orphan
            // remains until the original creator's next session that still
            // has the cache OR we add a server-side heal flow.
            result.skipped += 1;
            continue;
        }

        try {
            const payload = JSON.stringify({ cid: local.cid, aesKey: local.aesKey });
            const encrypted = encryptForRecipient(payload, o.recipientPubkey, myKeypair.secretKey);
            await keyShareService.shareKey({
                cidHash: o.cidHash,
                recipientAddress: o.recipientAddress,
                encryptedPayload: encrypted,
                senderPublicKey: myKeypair.publicKey,
            });
            result.healed += 1;
        } catch (err) {
            console.warn('[keyShareHealer] heal failed for', o.cidHash, err);
            result.errors += 1;
        }
    }

    if (result.healed > 0) {
        console.log(`[keyShareHealer] healed ${result.healed} orphan KeyShare(s)`);
    }
    return result;
}

export default { runKeyShareHealer };
