// Mobile Trusted Contact service.
//
// Wraps the on-chain registry (ConsentLedger.setTrustedContactBySig via
// /api/relayer/trusted-contact) plus the off-chain encryption ceremony
// (POST /api/key-share/bulk-trusted-contact). Use addContact for both: it
// signs + relays first, then runs the ceremony to pre-share AES keys for
// every existing record.

import api from './api';
import keccakKeys from './keyShare.service';
import walletActionService from './walletAction.service';
import authService from './auth.service';
import recordService from './record.service';
import { signTrustedContactPermit, getDeadline } from '../utils/eip712';
import { encryptForRecipient, getOrCreateEncryptionKeypair } from './nacl-crypto';
import localRecordStore from './localRecordStore';

/**
 * Patient designates a wallet as Trusted Contact.
 * 1. Patient signs EIP-712 TrustedContactPermit.
 * 2. Backend relays setTrustedContactBySig (gas sponsored).
 * 3. Mobile fetches all records of patient → encrypts aesKey for contact's
 *    pubkey → POST bulk pre-share to backend → KeyShare rows ready.
 *
 * Step 3 is the "encryption ceremony": skipping it would leave the contact
 * with on-chain trust but no decryption keys. We run it inline so a single
 * tap covers the full activation.
 *
 * @param {object} params
 * @param {string} params.contactAddress
 * @param {string} [params.label]            - "Vợ", "Con trai"... <= 120 chars
 * @returns {Promise<{txHash: string, preShareWritten: number, preShareFailed: number}>}
 */
export async function addContact({ contactAddress, label = '' }) {
    const { walletClient, address: patient } = await walletActionService.getWalletContext();

    // 1. Sign EIP-712.
    const ctx = await api.get(`/api/relayer/grant-context?grantee=${contactAddress.toLowerCase()}`);
    const deadline = getDeadline(1);
    const signature = await signTrustedContactPermit(walletClient, {
        patient,
        contact: contactAddress,
        label,
        active: true,
        deadline,
        nonce: ctx.nonce,
    });

    // 2. Relayer submits.
    const relayResult = await api.post('/api/relayer/trusted-contact', {
        contactAddress: contactAddress.toLowerCase(),
        label,
        active: true,
        deadline,
        signature,
    });

    // 3. Encryption ceremony.
    const preShare = await runEncryptionCeremony(contactAddress);

    return {
        txHash: relayResult.txHash,
        preShareWritten: preShare.written ?? 0,
        preShareFailed: preShare.failed ?? 0,
    };
}

/**
 * Patient revokes a Trusted Contact. Cascade KeyShare revoke is handled
 * server-side when the on-chain TrustedContactRevoked event is indexed —
 * the contact loses decryption ability automatically. We just relay the
 * on-chain mutation here.
 */
export async function removeContact({ contactAddress }) {
    const { walletClient, address: patient } = await walletActionService.getWalletContext();

    const ctx = await api.get(`/api/relayer/grant-context?grantee=${contactAddress.toLowerCase()}`);
    const deadline = getDeadline(1);
    const signature = await signTrustedContactPermit(walletClient, {
        patient,
        contact: contactAddress,
        label: '',
        active: false,
        deadline,
        nonce: ctx.nonce,
    });

    const relayResult = await api.post('/api/relayer/trusted-contact', {
        contactAddress: contactAddress.toLowerCase(),
        label: '',
        active: false,
        deadline,
        signature,
    });

    return { txHash: relayResult.txHash };
}

/**
 * Internal: encrypt every locally-cached AES key for the contact's pubkey
 * and POST as a bulk batch. Failures are not fatal — backend returns a
 * per-cidHash failures array; caller can retry later.
 */
export async function runEncryptionCeremony(contactAddress) {
    const contact = contactAddress.toLowerCase();

    // Need contact's NaCl encryption pubkey to encrypt for them.
    const contactKeyResp = await authService.getEncryptionKey(contact);
    const contactPubKey = contactKeyResp?.encryptionPublicKey;
    if (!contactPubKey) {
        throw new Error('Người thân chưa kích hoạt khoá mã hoá. Yêu cầu họ đăng nhập app trước khi đặt làm Người thân tin cậy.');
    }

    // Patient's keypair — for senderPublicKey field on each KeyShare row.
    // BUG FIX 2026-05-28: trước đây gọi getOrCreateEncryptionKeypair() không
    // args → walletClient undefined → "Cannot read property 'signMessage' of
    // undefined". Hàm cần walletClient + walletAddress để derive keypair từ
    // signature. Refetch context tại đây.
    const { walletClient, address: patient } = await walletActionService.getWalletContext();
    const myKeypair = await getOrCreateEncryptionKeypair(walletClient, patient);
    const senderPublicKey = myKeypair.publicKey;

    // Records of the patient. Use the existing 'my records' endpoint and
    // intersect with locally-cached AES keys (no AES key cached → can't
    // encrypt → skip; user can re-attempt after opening that record).
    const myRecords = await recordService.getMyRecords();
    const localMap = await localRecordStore.getAll();

    const items = [];
    for (const rec of myRecords) {
        const cidHash = String(rec.cidHash || '').toLowerCase();
        if (!cidHash) continue;
        const local = localMap[cidHash];
        if (!local?.cid || !local?.aesKey) continue;

        const encrypted = encryptForRecipient(
            JSON.stringify({ cid: local.cid, aesKey: local.aesKey }),
            contactPubKey,
            myKeypair.secretKey,
        );
        items.push({ cidHash, encryptedPayload: encrypted });
    }

    if (items.length === 0) {
        return { written: 0, failed: 0, failures: [] };
    }

    return api.post('/api/key-share/bulk-trusted-contact', {
        recipientAddress: contact,
        senderPublicKey,
        items,
    });
}

/**
 * Auto pre-share a single new record (called from CreateRecord/DoctorCreateUpdate
 * after a successful upload). Encrypts AES key for every active Trusted Contact
 * and writes one KeyShare row per contact.
 *
 * @param {object} params
 * @param {string} params.cidHash       - canonical hash of new record
 * @param {string} params.cid           - plaintext CID (for encrypted payload)
 * @param {string} params.aesKey        - AES key (for encrypted payload)
 * @param {string} params.patientAddress - record owner (record.ownerAddress)
 */
export async function autoPreShareNewRecord({ cidHash, cid, aesKey, patientAddress }) {
    if (!cidHash || !cid || !aesKey || !patientAddress) return { written: 0 };

    const { walletClient, address: caller } = await walletActionService.getWalletContext();
    if (caller.toLowerCase() !== patientAddress.toLowerCase()) {
        // Doctor-authored record for a patient: only the patient's own app
        // should pre-share to their Trusted Contacts (doctor doesn't have
        // patient's contact list permissions). Skip silently.
        return { written: 0 };
    }

    const contacts = await api.get('/api/trusted-contacts/me');
    if (!Array.isArray(contacts) || contacts.length === 0) return { written: 0 };

    // BUG FIX 2026-05-28: pass walletClient + caller — getOrCreateEncryptionKeypair
    // cần signature để derive (cùng pattern bug đã fix ở runEncryptionCeremony).
    const myKeypair = await getOrCreateEncryptionKeypair(walletClient, caller);
    const senderPublicKey = myKeypair.publicKey;

    let written = 0;
    for (const tc of contacts) {
        try {
            const contactKeyResp = await authService.getEncryptionKey(tc.contactAddress);
            const contactPubKey = contactKeyResp?.encryptionPublicKey;
            if (!contactPubKey) continue;

            const encrypted = encryptForRecipient(
                JSON.stringify({ cid, aesKey }),
                contactPubKey,
                myKeypair.secretKey,
            );

            await api.post('/api/key-share/bulk-trusted-contact', {
                recipientAddress: tc.contactAddress,
                senderPublicKey,
                items: [{ cidHash: cidHash.toLowerCase(), encryptedPayload: encrypted }],
            });
            written += 1;
        } catch (err) {
            console.warn('Auto pre-share to', tc.contactAddress, 'failed:', err?.message || err);
        }
    }

    return { written };
}

export async function listMyContacts() {
    return api.get('/api/trusted-contacts/me');
}

export async function lookupByCccd(cccdHash) {
    return api.get(`/api/emergency/lookup-by-cccd?cccdHash=${cccdHash}`);
}

export async function getContactsForPatient(patientAddress) {
    return api.get(`/api/trusted-contacts/by-patient/${patientAddress.toLowerCase()}`);
}

export default {
    addContact,
    removeContact,
    runEncryptionCeremony,
    autoPreShareNewRecord,
    listMyContacts,
    lookupByCccd,
    getContactsForPatient,
};
