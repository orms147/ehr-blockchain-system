// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IRecordRegistry.sol";
import "./interfaces/IAccessControl.sol";
import "./interfaces/IConsentLedger.sol";

/**
 * @title RecordRegistry - Secure Implementation
 * @notice ✅ SECURITY FIXES:
 * - NO plaintext CID storage (removed _cidStrings mapping)
 * - Deployer-only access control for setConsentLedger
 * - Hash-only storage throughout
 */
contract RecordRegistry is IRecordRegistry {
    IAccessControl public immutable accessControl;
    IConsentLedger public consentLedger;
    
    // ✅ FIX: Add deployer for access control
    address public immutable deployer;

    // ============ STORAGE ============
    // Hash-based storage for privacy
    mapping(bytes32 => Record) private _records;
    
    // ✅ REMOVED: mapping(bytes32 => string) private _cidStrings;
    // NO plaintext CID storage on-chain!
    
    // Owner records (stores hashes)
    mapping(address => bytes32[]) private _ownerRecords;
    mapping(bytes32 => bytes32[]) private _parentChildren;

    // Index mapping (hash => index+1)
    mapping(address => mapping(bytes32 => uint256)) private _ownerRecordIndex;

    // ============ CONSTANTS ============
    uint40 private constant FOREVER = type(uint40).max;
    uint8 private constant MAX_CHILDREN = 100;

    constructor(IAccessControl _accessControl) {
        accessControl = _accessControl;
        deployer = msg.sender;  // ✅ Save deployer
    }

    // ============ ADMIN ============
    /**
     * @notice Set ConsentLedger address
     * ✅ FIX: Only deployer can call
     */
    function setConsentLedger(address _consentLedger) external {
        require(msg.sender == deployer, "Only deployer");  // ✅ Access control
        require(address(consentLedger) == address(0), "Already set");
        consentLedger = IConsentLedger(_consentLedger);
    }

    modifier onlyRecordOwner(bytes32 cidHash) {
        if (_records[cidHash].owner != msg.sender) revert NotOwner();
        _;
    }

    // ============ PATIENT CREATE ============
    function addRecord(
        string calldata cid,
        string calldata parentCID,
        string calldata recordType
    ) external override {
        if (!accessControl.isPatient(msg.sender)) revert NotPatient();
        
        bytes32 cidHash = keccak256(bytes(cid));
        bytes32 parentHash = bytes(parentCID).length > 0 
            ? keccak256(bytes(parentCID)) 
            : bytes32(0);
            
        _addRecord(cidHash, parentHash, recordType, msg.sender, msg.sender);
    }

    // ============ DOCTOR CREATE ============
    function addRecordByDoctor(
        string calldata cid,
        string calldata parentCID,
        string calldata recordType,
        address patient
    ) external override {
        if (!accessControl.isDoctor(msg.sender)) revert NotDoctor();
        
        bytes32 cidHash = keccak256(bytes(cid));
        bytes32 parentHash = bytes(parentCID).length > 0 
            ? keccak256(bytes(parentCID)) 
            : bytes32(0);
            
        _addRecord(cidHash, parentHash, recordType, msg.sender, patient);
    }

    // ============ INTERNAL ============
    function _addRecord(
        bytes32 cidHash,
        bytes32 parentCidHash,
        string memory recordType,
        address creator,
        address patient
    ) internal {
        if (cidHash == bytes32(0)) revert EmptyCID();
        if (_records[cidHash].exists) revert RecordExists();

        uint8 version = 1;
        if (parentCidHash != bytes32(0)) {
            if (!_records[parentCidHash].exists) revert ParentNotExist();
            version = _records[parentCidHash].version + 1;
            
            if (_parentChildren[parentCidHash].length >= MAX_CHILDREN) {
                revert TooManyChildren();
            }
            _parentChildren[parentCidHash].push(cidHash);
        }

        uint40 now40 = uint40(block.timestamp);
        bytes32 recordTypeHash = keccak256(bytes(recordType));

        _records[cidHash] = Record({
            cidHash: cidHash,
            parentCidHash: parentCidHash,
            createdBy: creator,
            owner: patient,
            recordTypeHash: recordTypeHash,
            createdAt: now40,
            version: version,
            exists: true
        });

        // ✅ NO plaintext CID storage

        // Track owner records
        _ownerRecords[patient].push(cidHash);
        _ownerRecordIndex[patient][cidHash] = _ownerRecords[patient].length;

        emit RecordAdded(patient, cidHash, parentCidHash, recordTypeHash, now40);
    }

    // ============ UPDATE ============
    function updateRecordCID(
        string calldata oldCID,
        string calldata newCID
    ) external override {
        bytes32 oldHash = keccak256(bytes(oldCID));
        bytes32 newHash = keccak256(bytes(newCID));
        
        Record storage rec = _records[oldHash];
        if (!rec.exists) revert RecordNotExist();
        
        // Check permissions:
        // 1. Check Children (Áp dụng cho TẤT CẢ)
        // Nếu hồ sơ này đã có con, tuyệt đối không được sửa để bảo toàn tính nhất quán
        if (_parentChildren[oldHash].length > 0) {
            revert RecordHasChildren(); 
        }

        // 2. Check Permissions & Time Lock
        bool isOwner = msg.sender == rec.owner;
        bool isCreator = msg.sender == rec.createdBy;
        
        if (!isOwner) {
            if (isCreator) {
                // Bác sĩ chỉ được sửa trong 24h
                if (block.timestamp > rec.createdAt + 1 days) {
                    revert Unauthorized(); 
                }
            } else {
                revert Unauthorized(); // Người lạ
            }
        }

        if (_records[newHash].exists) revert RecordExists();

        // Copy data to new hash
        _records[newHash] = Record({
            cidHash: newHash,
            parentCidHash: rec.parentCidHash,
            createdBy: rec.createdBy,
            owner: rec.owner,
            recordTypeHash: rec.recordTypeHash,
            createdAt: rec.createdAt,
            version: rec.version,
            exists: true
        });

        // ✅ NO plaintext CID storage

        // Update parent's children
        if (rec.parentCidHash != bytes32(0)) {
            bytes32[] storage children = _parentChildren[rec.parentCidHash];
            for (uint256 i = 0; i < children.length; i++) {
                if (children[i] == oldHash) {
                    children[i] = newHash;
                    break;
                }
            }
        }

        // Update owner records
        uint256 idx = _ownerRecordIndex[rec.owner][oldHash];
        if (idx > 0) {
            _ownerRecords[rec.owner][idx - 1] = newHash;
            _ownerRecordIndex[rec.owner][newHash] = idx;
            delete _ownerRecordIndex[rec.owner][oldHash];
        }

        // Delete old record
        delete _records[oldHash];

        emit RecordUpdated(oldHash, newHash, rec.owner);
    }

    function transferOwnership(
        bytes32 cidHash,
        address newOwner
    ) external override onlyRecordOwner(cidHash) {
        if (newOwner == address(0)) revert InvalidAddress();
        
        Record storage rec = _records[cidHash];
        address previousOwner = rec.owner;
        
        // Remove from old owner
        uint256 idx = _ownerRecordIndex[previousOwner][cidHash];
        if (idx > 0) {
            uint256 lastIdx = _ownerRecords[previousOwner].length - 1;
            if (idx - 1 != lastIdx) {
                bytes32 lastHash = _ownerRecords[previousOwner][lastIdx];
                _ownerRecords[previousOwner][idx - 1] = lastHash;
                _ownerRecordIndex[previousOwner][lastHash] = idx;
            }
            _ownerRecords[previousOwner].pop();
            delete _ownerRecordIndex[previousOwner][cidHash];
        }
        
        // Add to new owner
        rec.owner = newOwner;
        _ownerRecords[newOwner].push(cidHash);
        _ownerRecordIndex[newOwner][cidHash] = _ownerRecords[newOwner].length;
        
        emit OwnershipTransferred(previousOwner, newOwner, cidHash);
    }

    /**
     * @notice ✅ REMOVED: getRecordCID function
     * Plaintext CIDs must be stored and retrieved off-chain
     */

    // ============ VIEW FUNCTIONS ============
    function getRecord(bytes32 cidHash) external view override returns (Record memory) {
        if (!_records[cidHash].exists) revert RecordNotExist();
        return _records[cidHash];
    }

    function getRecordByString(string calldata cid) external view override returns (Record memory) {
        bytes32 cidHash = keccak256(bytes(cid));
        if (!_records[cidHash].exists) revert RecordNotExist();
        return _records[cidHash];
    }

    function getOwnerRecords(address owner) external view override returns (bytes32[] memory) {
        return _ownerRecords[owner];
    }

    function getOwnerRecordCount(address owner) external view override returns (uint256) {
        return _ownerRecords[owner].length;
    }

    function getChildRecords(bytes32 parentCidHash) external view override returns (bytes32[] memory) {
        return _parentChildren[parentCidHash];
    }

    function getChildCount(bytes32 parentCidHash) external view override returns (uint256) {
        return _parentChildren[parentCidHash].length;
    }

    function recordExists(bytes32 cidHash) external view override returns (bool) {
        return _records[cidHash].exists;
    }

    function recordExistsByString(string calldata cid) external view override returns (bool) {
        bytes32 cidHash = keccak256(bytes(cid));
        return _records[cidHash].exists;
    }

    function getMaxChildrenLimit() external pure override returns (uint8) {
        return MAX_CHILDREN;
    }
}
