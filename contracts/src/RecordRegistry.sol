// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IRecordRegistry.sol";
import "./interfaces/IAccessControl.sol";
import "./interfaces/IConsentLedger.sol";

contract RecordRegistry is IRecordRegistry {
    IAccessControl public immutable accessControl;
    IConsentLedger public consentLedger;
    
    address public immutable deployer;

    // Storage

    mapping(bytes32 => Record) private _records;
    
    // Owner records (stores hashes)
    mapping(address => bytes32[]) private _ownerRecords;
    mapping(bytes32 => bytes32[]) private _parentChildren;      //next records

    // Record index mapping : patient address => (cidHash => index+1)
    mapping(address => mapping(bytes32 => uint256)) private _ownerRecordIndex;

    // Authorized contracts (e.g. DoctorUpdate)
    mapping(address => bool) public authorizedContracts;

    // Constant
    uint40 private constant FOREVER = type(uint40).max;
    uint8 private constant MAX_CHILDREN = 100;

    // Constructor
    constructor (IAccessControl _accesscontrol) {
        accessControl = _accesscontrol;
        deployer = msg.sender;
    }

    // Modifier
    modifier onlyRecordOwner(bytes32 cidHash) {
        if (_records[cidHash].owner != msg.sender) revert NotOwner();
        _;
    }

    // FUNCTION

    // Admin
    function setConsentLedger(address _consentLedger) external {
        require(msg.sender == deployer, "Only deployer");  // Access control
        require(address(consentLedger) == address(0), "Already set");
        consentLedger = IConsentLedger(_consentLedger);
    }

    /**
     * @notice Authorize a contract to add records (e.g. DoctorUpdate)
     */
    function authorizeContract(address contractAddr, bool isAuthorized) external {
        require(msg.sender == deployer, "Only deployer");
        authorizedContracts[contractAddr] = isAuthorized;
    }

    // Add record
    function addRecord (string calldata cid, string calldata parentCID, string calldata recordType) external {
        if (!accessControl.isPatient(msg.sender)) revert NotPatient();
        if (bytes(cid).length == 0) revert EmptyCID();
        
        //hash CID record + parent record (if existed)
        bytes32 cidHash = keccak256(bytes(cid));            //keccak(bytes)
        bytes32 parentHash = bytes(parentCID).length > 0    //check parent empty ? 
            ? keccak256(bytes(parentCID)) 
            : bytes32(0);         

        _addRecord(cidHash, parentHash, recordType, msg.sender, msg.sender);
    }

    function addRecordByDoctor(
        string calldata cid,
        string calldata parentCID,
        string calldata recordType,
        address patient
    ) external override {
        // Allow Doctor OR Authorized Contract
        if (!accessControl.isDoctor(msg.sender) && !authorizedContracts[msg.sender]) {
            revert NotDoctor();
        }
        if (bytes(cid).length == 0) revert EmptyCID();
        
        bytes32 cidHash = keccak256(bytes(cid));
        bytes32 parentHash = bytes(parentCID).length > 0 
            ? keccak256(bytes(parentCID)) 
            : bytes32(0);
            
        _addRecord(cidHash, parentHash, recordType, msg.sender, patient);
    }

    function _addRecord(
        bytes32 cidHash,
        bytes32 parentCidHash,
        string memory recordType,
        address creator,
        address patient
    ) internal {
        if (cidHash == bytes32(0)) revert EmptyCID();
        if (_records[cidHash].exists) revert RecordExists();

        // Update version, push this record in mapping record (_parentChildren)
        uint8 version = 1;
        if (parentCidHash != bytes32(0)) {          
            if (!_records[parentCidHash].exists) revert ParentNotExist();
            version = _records[parentCidHash].version + 1;      // Record version = pre + 1
            
            // OPTION (?), maybe cannot > 100  !!! 
            if (_parentChildren[parentCidHash].length >= MAX_CHILDREN) {
                revert TooManyChildren();
            }
            _parentChildren[parentCidHash].push(cidHash);
        }

        // Add record struct to mapping (cidHash -> Record ) 
        uint40 now40 = uint40(block.timestamp);
        bytes32 recordTypeHash = keccak256(bytes(recordType));      //Hash record's name

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

    // Update function 
    // Actually: replace it with another record
    function updateRecordCID(string calldata oldCID, string calldata newCID) external override {
        bytes32 oldHash = keccak256(bytes(oldCID));
        bytes32 newHash = keccak256(bytes(newCID));
        
        Record storage rec = _records[oldHash];
        if (!rec.exists) revert RecordNotExist();
        
        // Check permissions : Cannot update if thí record has children
        if (_parentChildren[oldHash].length > 0) {
            revert RecordHasChildren(); 
        }

        // Check Permissions & Time Lock
        bool isOwner = msg.sender == rec.owner;
        bool isCreator = msg.sender == rec.createdBy;
        
        if (!isOwner) {
            if (isCreator) {
                // Doctor can only fix it within 24 hours
                if (block.timestamp > rec.createdAt + 1 days) {
                    revert Unauthorized(); 
                }
            } else {
                revert Unauthorized(); 
            }
        }

        // If new record exist 
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

        // Update _parentChildren mapping
        if (rec.parentCidHash != bytes32(0)) {
            bytes32[] storage children = _parentChildren[rec.parentCidHash];    // All children record (hashCID)
            for (uint256 i = 0; i < children.length; i++) {     // Loop find index
                if (children[i] == oldHash) {
                    children[i] = newHash;
                    break;
                }
            }
        }

        // Update owner records
        uint256 idx = _ownerRecordIndex[rec.owner][oldHash];    // Get old record index 
        if (idx > 0) {
            _ownerRecords[rec.owner][idx - 1] = newHash;        // -1 cuz start at 0 index
            _ownerRecordIndex[rec.owner][newHash] = idx;
            delete _ownerRecordIndex[rec.owner][oldHash];       // Delete = set -> deffault
        }

        address recordOwner = rec.owner;

        // // Update children
        // bytes32[] memory myChildren = _parentChildren[oldHash];
        // if (myChildren.length > 0) {
        //     _parentChildren[newHash] = myChildren;
        //     delete _parentChildren[oldHash];

        //     for (uint256 i = 0; i < myChildren.length; i++) {
        //         if (_records[myChildren[i]].exists) {
        //             _records[myChildren[i]].parentCidHash = newHash;
        //         }
        //     }
        // }

        // Delete old record
        delete _records[oldHash];  

        emit RecordUpdated(oldHash, newHash, recordOwner);
    }
    
    // Transfer ownership from doctor to patient
    function transferOwnership(
        bytes32 cidHash,
        address newOwner
    ) external override onlyRecordOwner(cidHash) {
        if (newOwner == address(0)) revert InvalidAddress();
        
        Record storage rec = _records[cidHash]; // Get REcord struct 
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

    // View function
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
