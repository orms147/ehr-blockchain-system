// Mock IPFS Service for development
// Replaces actual Pinata/IPFS upload since no keys are configured in .env

export const ipfsService = {
    async uploadFile(fileBuffer, mimeType) {
        console.log('[MockIPFS] Uploading file...', {
            size: fileBuffer.length,
            type: mimeType
        });

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Generate fake CID
        const fakeCid = 'Qm' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

        return {
            cid: fakeCid,
            url: `https://gateway.pinata.cloud/ipfs/${fakeCid}` // Fake URL
        };
    },

    async uploadJSON(jsonData) {
        console.log('[MockIPFS] Uploading JSON...', Object.keys(jsonData));
        const fakeCid = 'Qm' + Math.random().toString(36).substring(2, 15);
        return {
            cid: fakeCid,
            url: `https://gateway.pinata.cloud/ipfs/${fakeCid}`
        };
    }
};
