// IPFS Service - Upload/Download encrypted files via Pinata
const PINATA_API_KEY = import.meta.env.VITE_PINATA_API_KEY;
const PINATA_SECRET = import.meta.env.VITE_PINATA_SECRET;
const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;
const PINATA_GATEWAY = import.meta.env.VITE_PINATA_GATEWAY
    ? `https://${import.meta.env.VITE_PINATA_GATEWAY}`
    : 'https://gateway.pinata.cloud';

export const ipfsService = {
    // Upload encrypted data to IPFS via Pinata
    async upload(encryptedData, metadata = {}) {
        const formData = new FormData();

        // Create blob from encrypted data
        const blob = new Blob([encryptedData], { type: 'application/octet-stream' });
        formData.append('file', blob, 'encrypted-record.bin');

        // Add metadata
        formData.append('pinataMetadata', JSON.stringify({
            name: metadata.name || 'EHR Record',
            keyvalues: {
                type: metadata.type || 'medical-record',
                timestamp: Date.now().toString(),
            }
        }));

        // Use JWT if available, otherwise use API key/secret
        const headers = PINATA_JWT
            ? { 'Authorization': `Bearer ${PINATA_JWT}` }
            : {
                'pinata_api_key': PINATA_API_KEY,
                'pinata_secret_api_key': PINATA_SECRET,
            };

        const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
            method: 'POST',
            headers,
            body: formData,
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to upload to IPFS: ${error}`);
        }

        const result = await response.json();
        return result.IpfsHash; // Returns CID
    },

    // Download encrypted data from IPFS
    async download(cid) {
        const response = await fetch(`${PINATA_GATEWAY}/ipfs/${cid}`);

        if (!response.ok) {
            throw new Error('Failed to download from IPFS');
        }

        return await response.text();
    },

    // Get IPFS URL
    getUrl(cid) {
        return `${PINATA_GATEWAY}/ipfs/${cid}`;
    },
};

export default ipfsService;
