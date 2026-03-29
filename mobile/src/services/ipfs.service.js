// IPFS Service - Upload/Download encrypted files via Pinata (Mobile App)

// Assuming EXPO_PUBLIC environment variables are set in .env
const PINATA_JWT = process.env.EXPO_PUBLIC_PINATA_JWT;
const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY
    ? `https://${process.env.EXPO_PUBLIC_PINATA_GATEWAY}`
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

            // React Native FormData string append or Blob
            // For simple strings, we can just append it directly or create a virtual file
            formData.append('file', {
                uri: 'data:application/octet-stream;base64,' + encryptedData, // or just pass the string if Pinata accepts it
                name: 'encrypted-record.bin',
                type: 'application/octet-stream'
            });

            // Add metadata
            formData.append('pinataMetadata', JSON.stringify({
                name: metadata.name || 'EHR Record',
                keyvalues: {
                    type: metadata.type || 'medical-record',
                    timestamp: Date.now().toString(),
                }
            }));

            if (!PINATA_JWT) {
                throw new Error('Missing Pinata JWT. Configure EXPO_PUBLIC_PINATA_JWT or move upload to backend.');
            }

            const headers = { 'Authorization': `Bearer ${PINATA_JWT}` };

            const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Type': 'multipart/form-data',
                },
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
    async uploadEncrypted({ encryptedData, metadata = {} }) {
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
