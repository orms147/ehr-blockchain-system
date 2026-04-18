// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IRecordRegistry - Privacy-Safe Version
 * @notice All functions use bytes32 cidHash instead of string CID
 * @dev Frontend MUST compute keccak256(bytes(cid)) off-chain
 */
interface IRecordRegistry {
    struct Record {
        bytes32 cidHash;        // keccak256(cid) - privacy protection
        bytes32 parentCidHash;  // keccak256(parentCID)
        address createdBy;
        address owner;
        bytes32 recordTypeHash; // keccak256(recordType)
        uint40 createdAt;
        uint8 version;
        bool exists;
    }

    // Events
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
    event SponsorAuthorized(
        address indexed sponsor,
        bool isAuthorized
    );

    // Errors
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
    error RecordHasChildren();
    error Unauthorized();
    error NotSponsor();

    // ============ WRITE FUNCTIONS (Hash-based) ============

    /**
     * @notice Patient adds their own record
     * @param cidHash keccak256(bytes(cid)) - computed off-chain
     * @param parentCidHash keccak256(bytes(parentCID)) or bytes32(0) if root
     * @param recordTypeHash keccak256(bytes(recordType))
     */
    function addRecord(
        bytes32 cidHash,
        bytes32 parentCidHash,
        bytes32 recordTypeHash
    ) external;

    /**
     * @notice Authorized sponsor adds record on behalf of patient (for gas sponsorship)
     * @param cidHash keccak256(bytes(cid)) - computed off-chain
     * @param parentCidHash keccak256(bytes(parentCID)) or bytes32(0) if root
     * @param recordTypeHash keccak256(bytes(recordType))
     * @param patient Patient address who owns the record (must be registered patient)
     */
    function addRecordFor(
        bytes32 cidHash,
        bytes32 parentCidHash,
        bytes32 recordTypeHash,
        address patient
    ) external;

    /**
     * @notice Doctor/authorized contract adds record for patient
     * @param cidHash keccak256(bytes(cid)) - computed off-chain
     * @param parentCidHash keccak256(bytes(parentCID)) or bytes32(0) if root
     * @param recordTypeHash keccak256(bytes(recordType))
     * @param patient Patient address who will own the record
     */
    function addRecordByDoctor(
        bytes32 cidHash,
        bytes32 parentCidHash,
        bytes32 recordTypeHash,
        address patient
    ) external;


    /**
     * @notice Update record CID (for corrections)
     * @param oldCidHash Hash of old CID
     * @param newCidHash Hash of new CID
     */
    function updateRecordCID(
        bytes32 oldCidHash,
        bytes32 newCidHash
    ) external;

    /**
     * @notice Transfer record ownership
     * @param cidHash Record to transfer
     * @param newOwner New owner address
     */
    function transferOwnership(
        bytes32 cidHash,
        address newOwner
    ) external;

    // ============ VIEW FUNCTIONS ============

    function getRecord(bytes32 cidHash) external view returns (Record memory);
    function getOwnerRecords(address owner) external view returns (bytes32[] memory);
    function getOwnerRecordCount(address owner) external view returns (uint256);
    function getChildRecords(bytes32 parentCidHash) external view returns (bytes32[] memory);
    function getChildCount(bytes32 parentCidHash) external view returns (uint256);
    function recordExists(bytes32 cidHash) external view returns (bool);
    function getMaxChildrenLimit() external pure returns (uint8);

    /// @notice Returns the parent cidHash of a record. Returns bytes32(0) when
    /// the record is a root OR does not exist. Lightweight helper used by
    /// ConsentLedger to walk the record tree during canAccess checks.
    function parentOf(bytes32 cidHash) external view returns (bytes32);
}