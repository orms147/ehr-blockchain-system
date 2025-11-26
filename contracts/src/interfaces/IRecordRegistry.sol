// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRecordRegistry {
    struct Record {
        bytes32 cidHash;        // keccak256(cid) - privacy protection
        bytes32 parentCidHash;  // keccak256(parentCID)
        address createdBy;
        address owner;
        bytes32 recordTypeHash;
        uint40 createdAt;
        uint8 version;
        bool exists;
    }

    event RecordAdded(
        address indexed owner,
        bytes32 indexed cidHash,
        bytes32 parentCidHash,
        bytes32 recordTypeHash,
        uint40 timestamp
    );

    event RecordUpdated(
        bytes32 indexed oldCidHash,
        bytes32 indexed newCidHash,
        address indexed owner
    );

    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner,
        bytes32 indexed cidHash
    );

    error NotPatient();
    error NotDoctor();
    error NotOwner();
    error RecordExists();
    error RecordNotExist();
    error ParentNotExist();
    error TooManyChildren();
    error MaxVersionReached();
    error EmptyCID();
    error InvalidAddress();
    error Unauthorized();

    // Add records (accepts string, stores hash)
    function addRecord(
        string calldata cid,
        string calldata parentCID,
        string calldata recordType
    ) external;

    function addRecordByDoctor(
        string calldata cid,
        string calldata parentCID,
        string calldata recordType,
        address patient
    ) external;

    // Update (accepts string, uses hash internally)
    function updateRecordCID(
        string calldata oldCID,
        string calldata newCID
    ) external;

    function transferOwnership(
        bytes32 cidHash,
        address newOwner
    ) external;

    // View functions - hash-based
    function getRecord(bytes32 cidHash) external view returns (Record memory);
    function getRecordByString(string calldata cid) external view returns (Record memory);
    
    // Owner records (returns hashes)
    function getOwnerRecords(address owner) external view returns (bytes32[] memory);
    function getOwnerRecordCount(address owner) external view returns (uint256);
    
    // Children (returns hashes)
    function getChildRecords(bytes32 parentCidHash) external view returns (bytes32[] memory);
    function getChildCount(bytes32 parentCidHash) external view returns (uint256);
    
    function recordExists(bytes32 cidHash) external view returns (bool);
    function recordExistsByString(string calldata cid) external view returns (bool);
    function getMaxChildrenLimit() external pure returns (uint8);
}