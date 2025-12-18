// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IRecordRegistry.sol";
import "./interfaces/IAccessControl.sol";
import "./interfaces/IConsentLedger.sol";

/**
 * @title RecordRegistry - Privacy-Safe Version
 * @notice All functions use bytes32 cidHash instead of string CID
 * @dev Frontend MUST compute keccak256(bytes(cid)) off-chain before calling
 * 
 * SECURITY: This version NEVER receives plaintext CID on-chain.
 * The CID only exists in frontend/IPFS, never in blockchain calldata.
 */
contract RecordRegistry is IRecordRegistry {
    IAccessControl public immutable accessControl;
    IConsentLedger public consentLedger;
    
    address public immutable deployer;

    // Storage
    mapping(bytes32 => Record) private _records;
    
    // Owner records (stores hashes)
    mapping(address => bytes32[]) private _ownerRecords;
    mapping(bytes32 => bytes32[]) private _parentChildren;

    // Record index mapping: patient address => (cidHash => index+1)
    mapping(address => mapping(bytes32 => uint256)) private _ownerRecordIndex;

    // Authorized contracts (e.g. DoctorUpdate)
    mapping(address => bool) public authorizedContracts;

    // Constants
    uint8 private constant MAX_CHILDREN = 100;

    // Constructor
    constructor(IAccessControl _accessControl) {
        accessControl = _accessControl;
        deployer = msg.sender;
    }

    // Modifiers
    modifier onlyRecordOwner(bytes32 cidHash) {
        if (_records[cidHash].owner != msg.sender) revert NotOwner();
        _;
    }

    // ============ ADMIN FUNCTIONS ============

    function setConsentLedger(address _consentLedger) external {
        require(msg.sender == deployer, "Only deployer");
        require(_consentLedger != address(0), "zero");
        require(address(consentLedger) == address(0), "Already set");
        consentLedger = IConsentLedger(_consentLedger);
    }

    function authorizeContract(address contractAddr, bool isAuthorized) external {
        require(msg.sender == deployer, "Only deployer");
        authorizedContracts[contractAddr] = isAuthorized;
    }

    // ============ WRITE FUNCTIONS (Hash-based) ============

    /**
     * @notice Patient adds their own record
     * @param cidHash keccak256(bytes(cid)) - computed OFF-CHAIN
     * @param parentCidHash keccak256(bytes(parentCID)) or bytes32(0) if root
     * @param recordTypeHash keccak256(bytes(recordType)) - computed OFF-CHAIN
     */
    function addRecord(
        bytes32 cidHash,
        bytes32 parentCidHash,
        bytes32 recordTypeHash
    ) external override {
        if (!accessControl.isPatient(msg.sender)) revert NotPatient();
        if (cidHash == bytes32(0)) revert EmptyCID();
        
        _addRecord(cidHash, parentCidHash, recordTypeHash, msg.sender, msg.sender);
    }

    /**
     * @notice Doctor/authorized contract adds record for patient
     * @param cidHash keccak256(bytes(cid)) - computed OFF-CHAIN
     * @param parentCidHash keccak256(bytes(parentCID)) or bytes32(0) if root
     * @param recordTypeHash keccak256(bytes(recordType)) - computed OFF-CHAIN
     * @param patient Patient address who will own the record
     */
    function addRecordByDoctor(
        bytes32 cidHash,
        bytes32 parentCidHash,
        bytes32 recordTypeHash,
        address patient
    ) external override {
        // Allow Doctor OR Authorized Contract
        if (!accessControl.isDoctor(msg.sender) && !authorizedContracts[msg.sender]) {
            revert NotDoctor();
        }
        if (cidHash == bytes32(0)) revert EmptyCID();
        
        _addRecord(cidHash, parentCidHash, recordTypeHash, msg.sender, patient);
    }

    /**
     * @dev Internal function to add a record
     */
    function _addRecord(
        bytes32 cidHash,
        bytes32 parentCidHash,
        bytes32 recordTypeHash,
        address creator,
        address patient
    ) internal {
        if (cidHash == bytes32(0)) revert EmptyCID();
        if (_records[cidHash].exists) revert RecordExists();

        // Update version, push this record in parent's children
        uint8 version = 1;
        if (parentCidHash != bytes32(0)) {
            if (!_records[parentCidHash].exists) revert ParentNotExist();
            version = _records[parentCidHash].version + 1;
            
            if (_parentChildren[parentCidHash].length >= MAX_CHILDREN) {
                revert TooManyChildren();
            }
            _parentChildren[parentCidHash].push(cidHash);
        }

        // Add record struct
        uint40 now40 = uint40(block.timestamp);

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

        // Track owner records
        _ownerRecords[patient].push(cidHash);
        _ownerRecordIndex[patient][cidHash] = _ownerRecords[patient].length;

        emit RecordAdded(patient, cidHash, parentCidHash, recordTypeHash, now40);
    }

    /**
     * @notice Update record CID (for corrections within time limit)
     * @param oldCidHash Hash of old CID
     * @param newCidHash Hash of new CID
     */
    function updateRecordCID(
        bytes32 oldCidHash,
        bytes32 newCidHash
    ) external override {
        Record storage rec = _records[oldCidHash];
        if (!rec.exists) revert RecordNotExist();
        
        // Cannot update if this record has children
        if (_parentChildren[oldCidHash].length > 0) {
            revert RecordHasChildren();
        }

        // Check permissions & time lock
        bool isOwner = msg.sender == rec.owner;
        bool isCreator = msg.sender == rec.createdBy;
        
        if (!isOwner) {
            if (isCreator) {
                // Doctor can only fix within 24 hours
                if (block.timestamp > rec.createdAt + 1 days) {
                    revert Unauthorized();
                }
            } else {
                revert Unauthorized();
            }
        }

        // Check new record doesn't exist
        if (_records[newCidHash].exists) revert RecordExists();
        if (newCidHash == bytes32(0)) revert EmptyCID();

        // Copy data to new hash
        _records[newCidHash] = Record({
            cidHash: newCidHash,
            parentCidHash: rec.parentCidHash,
            createdBy: rec.createdBy,
            owner: rec.owner,
            recordTypeHash: rec.recordTypeHash,
            createdAt: rec.createdAt,
            version: rec.version,
            exists: true
        });

        // Update parent's children array
        if (rec.parentCidHash != bytes32(0)) {
            bytes32[] storage children = _parentChildren[rec.parentCidHash];
            for (uint256 i = 0; i < children.length; i++) {
                if (children[i] == oldCidHash) {
                    children[i] = newCidHash;
                    break;
                }
            }
        }

        // Update owner records
        uint256 idx = _ownerRecordIndex[rec.owner][oldCidHash];
        if (idx > 0) {
            _ownerRecords[rec.owner][idx - 1] = newCidHash;
            _ownerRecordIndex[rec.owner][newCidHash] = idx;
            delete _ownerRecordIndex[rec.owner][oldCidHash];
        }

        address recordOwner = rec.owner;

        // Delete old record
        delete _records[oldCidHash];

        emit RecordUpdated(oldCidHash, newCidHash, recordOwner);
    }

    /**
     * @notice Transfer record ownership
     * @param cidHash Record to transfer
     * @param newOwner New owner address
     */
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

    // ============ VIEW FUNCTIONS ============

    function getRecord(bytes32 cidHash) external view override returns (Record memory) {
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

    function getMaxChildrenLimit() external pure override returns (uint8) {
        return MAX_CHILDREN;
    }
}
