# AI Frontend Development Prompt - EHR System

## 🎯 Project Context

Bạn đang code frontend cho hệ thống **EHR (Electronic Health Records)** trên blockchain Arbitrum. Đây là hệ thống quản lý hồ sơ y tế phi tập trung, ưu tiên **privacy** và **patient control**.

---

## 🏗️ Tech Stack Requirements

### Core Technologies
- **Framework**: Next.js 14+ (App Router) hoặc Vite + React
- **Blockchain**: 
  - `ethers.js` v6 hoặc `viem` + `wagmi` v2
  - **KHÔNG dùng** Web3.js (deprecated)
- **Wallet**: RainbowKit hoặc ConnectKit
- **State Management**: Zustand hoặc React Context
- **Styling**: Tôi sẽ tự viết CSS/styling

### TypeScript
- **BẮT BUỘC** dùng TypeScript
- Generate types từ contract ABIs

---

## 🔐 Security & Privacy Requirements

### 1. Privacy-First Design

**CRITICAL: CID Storage**
```typescript
// ❌ WRONG: NEVER store plaintext CID on-chain
await recordRegistry.addRecord("QmXXXXX", ...);

// ✅ CORRECT: Only hash is stored on-chain
const cid = "QmXXXXX";  // From IPFS
const cidHash = ethers.keccak256(ethers.toUtf8Bytes(cid));
// Contract only sees: 0xabcd1234... (hash)
```

**Data Flow:**
```
User uploads file → IPFS → Get CID (QmXXX)
                              ↓
                    Store in local DB/IndexedDB
                              ↓
                    Hash CID → Send to contract
                              ↓
                    Contract stores: keccak256(CID)
```

**Storage Strategy:**
- **On-chain**: Chỉ lưu `keccak256(CID)` (32 bytes hash)
- **Off-chain DB**: Lưu plaintext CID + metadata
- **IndexedDB**: Cache CID cho offline access

### 2. Encryption Requirements

**File Encryption (AES-256-GCM)**
```typescript
// Patient encrypts file before upload to IPFS
import { encrypt, decrypt } from '@/lib/crypto';

// Generate key per record
const encryptionKey = crypto.getRandomValues(new Uint8Array(32));

// Encrypt file
const encryptedData = await encrypt(fileBuffer, encryptionKey);

// Upload to IPFS
const cid = await ipfs.add(encryptedData);

// Share key with doctor (encrypted with doctor's public key)
const doctorPublicKey = await getDoctorPublicKey(doctorAddress);
const encryptedKey = await encryptWithPublicKey(encryptionKey, doctorPublicKey);

// Store encrypted key hash on-chain
const keyHash = ethers.keccak256(encryptedKey);
await consentLedger.grantConsent(doctor, cid, keyHash, ...);
```

**Key Management:**
```typescript
// Patient's master key (derived from wallet signature)
const masterKey = await deriveMasterKey(signer);

// Per-record keys (encrypted with master key)
const recordKey = generateRecordKey();
const encryptedRecordKey = encryptWithMasterKey(recordKey, masterKey);

// Store in IndexedDB
await db.keys.put({
  cidHash: keccak256(cid),
  encryptedKey: encryptedRecordKey
});
```

### 3. Wallet Integration

**Wallet Connection:**
```typescript
import { WagmiConfig, createConfig } from 'wagmi';
import { arbitrum } from 'wagmi/chains';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';

const config = getDefaultConfig({
  appName: 'EHR System',
  projectId: 'YOUR_PROJECT_ID',
  chains: [arbitrum],
});

// In component
const { address, isConnected } = useAccount();
const { data: signer } = useSigner();
```

**Sign Messages (NOT Transactions):**
```typescript
// For authentication
const message = `Login to EHR System\nNonce: ${nonce}\nTimestamp: ${Date.now()}`;
const signature = await signer.signMessage(message);

// Verify on backend
const recoveredAddress = ethers.verifyMessage(message, signature);
```

---

## 📝 Contract Integration Guide

### Contract Addresses (Example - Replace with actual)
```typescript
// config/contracts.ts
export const CONTRACTS = {
  AccessControl: '0x...',
  RecordRegistry: '0x...',
  ConsentLedger: '0x...',
  DoctorUpdate: '0x...',
  EHRSystemSecure: '0x...',
} as const;
```

### ABI Integration
```typescript
// Copy ABIs from contracts/out/
import AccessControlABI from '@/abis/AccessControl.json';
import RecordRegistryABI from '@/abis/RecordRegistry.json';

// Generate types
import { AccessControl } from '@/types/contracts';

const contract = new ethers.Contract(
  CONTRACTS.AccessControl,
  AccessControlABI,
  signer
) as AccessControl;
```

### Common Patterns

#### 1. Read Data (Free)
```typescript
// Check if user is patient
const isPatient = await accessControl.isPatient(address);

// Get record (by hash!)
const cidHash = ethers.keccak256(ethers.toUtf8Bytes(cid));
const record = await recordRegistry.getRecord(cidHash);

// Check access
const canAccess = await consentLedger.canAccess(patientAddress, doctorAddress, cid);
```

#### 2. Write Data (Requires Gas)
```typescript
// Add record
const tx = await recordRegistry.addRecord(
  cid,           // string (will be hashed in contract)
  parentCID,     // string (empty if root)
  recordType     // string (e.g., "Blood Test")
);

// Wait for confirmation
const receipt = await tx.wait();

// Get event data
const event = receipt.logs.find(log => 
  log.topics[0] === recordRegistry.interface.getEvent('RecordAdded').topicHash
);
```

#### 3. EIP-712 Signatures (Gas-less)
```typescript
// Patient signs consent off-chain
const domain = {
  name: 'EHR Consent Ledger',
  version: '3',
  chainId: 42161, // Arbitrum
  verifyingContract: CONTRACTS.ConsentLedger
};

const types = {
  ConsentPermit: [
    { name: 'patient', type: 'address' },
    { name: 'grantee', type: 'address' },
    { name: 'rootCID', type: 'string' },
    { name: 'encKeyHash', type: 'bytes32' },
    { name: 'expireAt', type: 'uint256' },
    { name: 'includeUpdates', type: 'bool' },
    { name: 'allowDelegate', type: 'bool' },
    { name: 'deadline', type: 'uint256' },
    { name: 'nonce', type: 'uint256' }
  ]
};

const value = {
  patient: patientAddress,
  grantee: doctorAddress,
  rootCID: cid,
  encKeyHash: keyHash,
  expireAt: Math.floor(Date.now() / 1000) + 86400 * 90,
  includeUpdates: false,
  allowDelegate: false,
  deadline: Math.floor(Date.now() / 1000) + 3600,
  nonce: await consentLedger.getNonce(patientAddress)
};

// Sign
const signature = await signer.signTypedData(domain, types, value);

// Doctor submits (pays gas)
await consentLedger.grantBySig(
  value.patient,
  value.grantee,
  value.rootCID,
  value.encKeyHash,
  value.expireAt,
  value.includeUpdates,
  value.allowDelegate,
  value.deadline,
  signature
);
```

---

## 🎨 UI/UX Requirements

### Role-Based Views

**Patient Dashboard:**
- Upload medical records
- View own records
- Grant/revoke access to doctors
- View access history
- Manage delegations

**Doctor Dashboard:**
- Request access to patient records
- View granted records
- Create records for patients (with auto-access)
- Emergency access (with witnesses)

**Organization Dashboard:**
- Verify doctors
- Manage organization members
- View member list

### Critical UX Patterns

#### 1. Transaction Feedback
```typescript
// Show loading state
const [txState, setTxState] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');

async function handleAddRecord() {
  try {
    setTxState('pending');
    const tx = await recordRegistry.addRecord(...);
    
    // Show "Transaction submitted" with tx hash
    toast.info(`Transaction submitted: ${tx.hash}`);
    
    // Wait for confirmation
    await tx.wait();
    
    setTxState('success');
    toast.success('Record added successfully!');
  } catch (error) {
    setTxState('error');
    
    // Parse error
    if (error.code === 'ACTION_REJECTED') {
      toast.error('Transaction rejected by user');
    } else if (error.reason) {
      toast.error(`Error: ${error.reason}`);
    }
  }
}
```

#### 2. Gas Estimation
```typescript
// Estimate before sending
const gasEstimate = await recordRegistry.addRecord.estimateGas(cid, '', 'Lab Test');
const gasPrice = await provider.getFeeData();
const estimatedCost = gasEstimate * gasPrice.gasPrice;

// Show to user
console.log(`Estimated cost: ${ethers.formatEther(estimatedCost)} ETH`);
```

#### 3. Error Handling
```typescript
// Map contract errors to user-friendly messages
const ERROR_MESSAGES = {
  'NotPatient()': 'You must register as a patient first',
  'RecordExists()': 'This record already exists',
  'EmptyCID()': 'CID cannot be empty',
  'NotOwner()': 'You do not own this record',
  'NotAuthorized()': 'You are not authorized for this action'
};

function parseContractError(error: any): string {
  const errorData = error.data?.data || error.data;
  
  for (const [selector, message] of Object.entries(ERROR_MESSAGES)) {
    if (errorData?.includes(selector)) {
      return message;
    }
  }
  
  return error.reason || 'Transaction failed';
}
```

---

## 🔄 State Management

### Zustand Store Example
```typescript
// stores/useEHRStore.ts
import { create } from 'zustand';

interface EHRStore {
  // User state
  userRole: 'patient' | 'doctor' | 'organization' | null;
  isVerified: boolean;
  
  // Records cache
  records: Map<string, Record>;
  
  // Actions
  setUserRole: (role: string) => void;
  addRecord: (cidHash: string, record: Record) => void;
  clearCache: () => void;
}

export const useEHRStore = create<EHRStore>((set) => ({
  userRole: null,
  isVerified: false,
  records: new Map(),
  
  setUserRole: (role) => set({ userRole: role }),
  addRecord: (cidHash, record) => set((state) => ({
    records: new Map(state.records).set(cidHash, record)
  })),
  clearCache: () => set({ records: new Map() })
}));
```

---

## 📊 Data Indexing

### The Graph Integration (Optional)
```graphql
# schema.graphql
type Record @entity {
  id: ID!                    # cidHash
  owner: Bytes!
  createdBy: Bytes!
  parentCidHash: Bytes
  recordTypeHash: Bytes!
  createdAt: BigInt!
  version: Int!
}

type Consent @entity {
  id: ID!                    # patient-grantee-cidHash
  patient: Bytes!
  grantee: Bytes!
  cidHash: Bytes!
  grantedAt: BigInt!
  expireAt: BigInt!
  active: Boolean!
}
```

### Alternative: Direct Event Listening
```typescript
// Listen to events for real-time updates
recordRegistry.on('RecordAdded', (owner, cidHash, parentCidHash, recordTypeHash, timestamp) => {
  console.log('New record added:', { owner, cidHash });
  
  // Update UI
  queryClient.invalidateQueries(['records', owner]);
});
```

---

## 🧪 Testing Requirements

### Unit Tests
```typescript
// __tests__/contracts/recordRegistry.test.ts
import { expect } from '@jest/globals';
import { ethers } from 'ethers';

describe('RecordRegistry Integration', () => {
  it('should hash CID correctly', () => {
    const cid = 'QmTest123';
    const hash = ethers.keccak256(ethers.toUtf8Bytes(cid));
    
    expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
  });
  
  it('should add record', async () => {
    const tx = await recordRegistry.addRecord('QmTest', '', 'Lab');
    const receipt = await tx.wait();
    
    expect(receipt.status).toBe(1);
  });
});
```

### E2E Tests (Playwright)
```typescript
// e2e/patient-flow.spec.ts
test('patient can upload and share record', async ({ page }) => {
  // Connect wallet
  await page.click('[data-testid="connect-wallet"]');
  
  // Upload file
  await page.setInputFiles('input[type="file"]', 'test-record.pdf');
  await page.click('[data-testid="upload-button"]');
  
  // Wait for IPFS upload
  await page.waitForSelector('[data-testid="cid-display"]');
  
  // Add to blockchain
  await page.click('[data-testid="add-to-blockchain"]');
  
  // Confirm transaction in MetaMask (manual)
  // ...
  
  // Verify record appears
  await expect(page.locator('[data-testid="record-list"]')).toContainText('test-record.pdf');
});
```

---

## 🚨 Common Pitfalls to Avoid

### 1. ❌ Storing Plaintext CID On-Chain
```typescript
// WRONG
await contract.someFunction("QmXXXXX");  // Exposes CID!

// CORRECT
const cidHash = ethers.keccak256(ethers.toUtf8Bytes("QmXXXXX"));
await contract.someFunction(cidHash);
```

### 2. ❌ Not Checking Empty CID
```typescript
// Contract will revert if CID is empty
if (!cid || cid.trim() === '') {
  throw new Error('CID cannot be empty');
}
```

### 3. ❌ Wrong Function Signature
```typescript
// WRONG: Passing CID string to function expecting hash
await recordRegistry.getRecord("QmXXX");  // ❌

// CORRECT: Hash first
const cidHash = ethers.keccak256(ethers.toUtf8Bytes("QmXXX"));
await recordRegistry.getRecord(cidHash);  // ✅
```

### 4. ❌ Not Handling Reverts
```typescript
// WRONG: No error handling
await contract.someFunction();

// CORRECT: Try-catch with error parsing
try {
  await contract.someFunction();
} catch (error) {
  const message = parseContractError(error);
  toast.error(message);
}
```

### 5. ❌ Exposing Private Keys
```typescript
// NEVER do this
const privateKey = '0x...';  // ❌ NEVER hardcode!

// CORRECT: Use wallet connection
const signer = await provider.getSigner();
```

---

## 📦 Project Structure

```
frontend/
├── src/
│   ├── app/                    # Next.js app router
│   │   ├── patient/
│   │   ├── doctor/
│   │   └── organization/
│   ├── components/
│   │   ├── wallet/
│   │   ├── records/
│   │   └── consent/
│   ├── lib/
│   │   ├── contracts/          # Contract instances
│   │   ├── crypto/             # Encryption utils
│   │   ├── ipfs/               # IPFS client
│   │   └── utils/
│   ├── hooks/
│   │   ├── useContract.ts
│   │   ├── useIPFS.ts
│   │   └── useEncryption.ts
│   ├── types/
│   │   ├── contracts/          # Generated from ABIs
│   │   └── index.ts
│   ├── abis/                   # Contract ABIs
│   └── config/
│       └── contracts.ts        # Contract addresses
├── public/
└── package.json
```

---

## 🎯 Deliverables Checklist

### Must Have:
- [ ] Wallet connection (RainbowKit/ConnectKit)
- [ ] Role detection (Patient/Doctor/Organization)
- [ ] IPFS integration (upload/download)
- [ ] AES-256 encryption/decryption
- [ ] Contract read operations
- [ ] Contract write operations with error handling
- [ ] Transaction status feedback
- [ ] CID hashing (privacy!)
- [ ] EIP-712 signature support

### Nice to Have:
- [ ] The Graph integration
- [ ] IndexedDB caching
- [ ] Offline mode
- [ ] Gas estimation
- [ ] Transaction history
- [ ] Multi-language support

---

## 🔗 Resources

### Documentation:
- Contract ABIs: `contracts/out/`
- API Reference: `docs/API_REFERENCE.md`
- Contract Guides: `docs/contracts/`

### Libraries:
- ethers.js: https://docs.ethers.org/v6/
- wagmi: https://wagmi.sh/
- RainbowKit: https://www.rainbowkit.com/
- IPFS: https://js.ipfs.tech/

---

## ⚡ Quick Start Commands

```bash
# Install dependencies
npm install ethers wagmi @rainbow-me/rainbowkit

# Generate types from ABIs
npx typechain --target ethers-v6 --out-dir src/types/contracts 'abis/*.json'

# Run dev server
npm run dev
```

---

**CRITICAL REMINDERS:**
1. ✅ **NEVER** store plaintext CID on-chain
2. ✅ **ALWAYS** hash CID before sending to contract
3. ✅ **ALWAYS** encrypt files before IPFS upload
4. ✅ **ALWAYS** handle transaction errors
5. ✅ **NEVER** expose private keys

**Happy Coding! 🚀**
