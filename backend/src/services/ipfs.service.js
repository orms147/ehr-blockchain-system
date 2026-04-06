// IPFS Service — real Pinata when PINATA_JWT is set, mock fallback otherwise.
// Dev environments without Pinata keys keep working transparently.
import { createLogger } from '../utils/logger.js';

const log = createLogger('IPFS');

const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud';
const PINATA_API = 'https://api.pinata.cloud';

const isReal = !!PINATA_JWT;

if (isReal) {
    log.info('Pinata IPFS enabled (real uploads)');
} else {
    log.warn('PINATA_JWT not set — using MOCK IPFS (dev only)');
}

// ---------- Mock fallback ----------
const mockUploadFile = async (fileBuffer, mimeType) => {
    log.info('[MOCK] uploadFile', { size: fileBuffer.length, type: mimeType });
    await new Promise(r => setTimeout(r, 500));
    const fakeCid = 'Qm' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    return { cid: fakeCid, url: `${PINATA_GATEWAY}/ipfs/${fakeCid}` };
};

const mockUploadJSON = async (jsonData) => {
    log.info('[MOCK] uploadJSON', { keys: Object.keys(jsonData || {}) });
    await new Promise(r => setTimeout(r, 200));
    const fakeCid = 'Qm' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    return { cid: fakeCid, url: `${PINATA_GATEWAY}/ipfs/${fakeCid}` };
};

// ---------- Real Pinata ----------
const pinataHeaders = () => ({ Authorization: `Bearer ${PINATA_JWT}` });

const realUploadFile = async (fileBuffer, mimeType) => {
    log.info('uploadFile', { size: fileBuffer.length, type: mimeType });

    const form = new FormData();
    // Node 18+ Blob/FormData accept Uint8Array.
    const blob = new Blob([fileBuffer], { type: mimeType || 'application/octet-stream' });
    form.append('file', blob, `upload-${Date.now()}`);
    form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

    const res = await fetch(`${PINATA_API}/pinning/pinFileToIPFS`, {
        method: 'POST',
        headers: pinataHeaders(),
        body: form,
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        log.error('Pinata uploadFile failed', { status: res.status, body: text });
        throw new Error(`Pinata upload failed: ${res.status}`);
    }

    const data = await res.json();
    const cid = data.IpfsHash;
    return { cid, url: `${PINATA_GATEWAY}/ipfs/${cid}` };
};

const realUploadJSON = async (jsonData) => {
    log.info('uploadJSON', { keys: Object.keys(jsonData || {}) });

    const res = await fetch(`${PINATA_API}/pinning/pinJSONToIPFS`, {
        method: 'POST',
        headers: {
            ...pinataHeaders(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            pinataContent: jsonData,
            pinataOptions: { cidVersion: 1 },
        }),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        log.error('Pinata uploadJSON failed', { status: res.status, body: text });
        throw new Error(`Pinata JSON upload failed: ${res.status}`);
    }

    const data = await res.json();
    const cid = data.IpfsHash;
    return { cid, url: `${PINATA_GATEWAY}/ipfs/${cid}` };
};

export const ipfsService = {
    uploadFile: isReal ? realUploadFile : mockUploadFile,
    uploadJSON: isReal ? realUploadJSON : mockUploadJSON,
    isReal,
};
