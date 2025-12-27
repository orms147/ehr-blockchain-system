// IPFS Service - Upload/Download encrypted files via Pinata
const PINATA_API_KEY = process.env.NEXT_PUBLIC_PINATA_API_KEY;
const PINATA_SECRET = process.env.NEXT_PUBLIC_PINATA_SECRET;
const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT;
const PINATA_GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY
    ? `https://${process.env.NEXT_PUBLIC_PINATA_GATEWAY}`
    : 'https://gateway.pinata.cloud';

// Helper function for retry with exponential backoff
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            console.warn(`Upload attempt ${i + 1}/${maxRetries} failed:`, error.message);
            if (i < maxRetries - 1) {
                const delay = baseDelay * Math.pow(2, i);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
}

export const ipfsService = {
    // Upload encrypted data to IPFS via Pinata
    async upload(encryptedData, metadata = {}) {
        return retryWithBackoff(async () => {
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
        });
    },

    // Download encrypted data from IPFS
    async download(cid) {
        const response = await fetch(`${PINATA_GATEWAY}/ipfs/${cid}`);

        if (!response.ok) {
            throw new Error('Failed to download from IPFS');
        }

        return await response.text();
    },

    // Upload already-encrypted content to IPFS
    // For cases where content is pre-encrypted (e.g., pending updates)
    async uploadEncrypted({ encryptedData, metadata = {} }) {
        // Just use regular upload - encryptedData is already encrypted string
        const cid = await this.upload(encryptedData, {
            name: metadata.title || 'Encrypted Record',
            type: metadata.recordType || 'medical-record',
        });
        return { cid };
    },

    // Get IPFS URL
    getUrl(cid) {
        return `${PINATA_GATEWAY}/ipfs/${cid}`;
    },
};

export default ipfsService;
