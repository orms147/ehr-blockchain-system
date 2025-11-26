// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IAccessControl.sol";
import "./interfaces/IRecordRegistry.sol";
import "./interfaces/IConsentLedger.sol";

/**
 * @title DoctorUpdate - Complete Implementation
 * @notice Allows doctors to create records for patients with:
 * - Flexible record types (no hardcoding)
 * - Configurable access duration with limits
 * - Emergency access with witness validation
 * - Proper validation
 */
contract DoctorUpdate is ReentrancyGuard {

    // ================ IMMUTABLES ================
    IAccessControl public immutable accessControl;
    IRecordRegistry public immutable recordRegistry;
    IConsentLedger public immutable consentLedger;

    // ================ CONSTANTS ================
    uint40 private constant MIN_DOCTOR_ACCESS = 1 hours;
    uint40 private constant MAX_DOCTOR_ACCESS = 90 days;
    uint40 private constant DEFAULT_DOCTOR_ACCESS = 7 days;
    uint40 private constant EMERGENCY_ACCESS_DURATION = 24 hours;

    uint8 private constant MIN_WITNESSES = 2;

    // ================ EVENTS ================
    event RecordAddedByDoctor(
        address indexed doctor,
        address indexed patient,
        bytes32 indexed cidHash,
        bytes32 parentCidHash,
        bytes32 recordTypeHash,
        uint40 doctorAccessExpiry
    );

    event TemporaryAccessGranted(
        address indexed patient,
        address indexed doctor,
        bytes32 indexed cidHash,
        uint40 expireAt,
        uint40 duration
    );

    event EmergencyAccessGranted(
        address indexed doctor,
        address indexed patient,
        bytes32 indexed cidHash,
        string justification,
        address[] witnesses,
        uint40 expireAt
    );

    event AccessExtended(
        address indexed patient,
        address indexed doctor,
        bytes32 indexed cidHash,
        uint40 newExpiry
    );

    // ================ ERRORS ================
    error NotDoctor();
    error NotPatient();
    error InvalidParameter();
    error InvalidAccessDuration();
    error InsufficientWitnesses();
    error InvalidWitness();

    // ================ CONSTRUCTOR ================
    constructor(
        IAccessControl _accessControl,
        IRecordRegistry _recordRegistry,
        IConsentLedger _consentLedger
    ) {
        accessControl = _accessControl;
        recordRegistry = _recordRegistry;
        consentLedger = _consentLedger;
    }

    // ================ MODIFIERS ================
    modifier onlyDoctor() {
        if (!accessControl.isDoctor(msg.sender)) revert NotDoctor();
        _;
    }

    // ================ MAIN FUNCTION ================

    /**
     * @notice Doctor creates record for patient with automatic consent grants
     * @param cid IPFS CID of the new record
     * @param parentCID Parent record CID (empty if root)
     * @param recordType Type of record (e.g., "Diagnosis", "Lab Result", "Prescription")
     * @param patient Patient address
     * @param patientEncKeyHash Encryption key hash for patient
     * @param doctorEncKeyHash Encryption key hash for doctor
     * @param doctorAccessHours How long doctor can access (0 = use default)
     */
    function addRecordByDoctor(
        string calldata cid,
        string calldata parentCID,
        string calldata recordType,
        address patient,
        bytes32 patientEncKeyHash,
        bytes32 doctorEncKeyHash,
        uint40 doctorAccessHours
    ) external onlyDoctor nonReentrant {
        // Validate inputs
        if (patient == address(0)) revert InvalidParameter();
        if (!accessControl.isPatient(patient)) revert NotPatient();
        if (bytes(cid).length == 0) revert InvalidParameter();
        if (bytes(recordType).length == 0) revert InvalidParameter();

        // Create record (owner = patient)
        recordRegistry.addRecordByDoctor(cid, parentCID, recordType, patient);

        // Grant patient permanent access (if key provided)
        if (patientEncKeyHash != bytes32(0)) {
            consentLedger.grantInternal(
                patient,
                patient,
                cid,
                patientEncKeyHash,
                0, // forever
                true,
                true
            );
        }

        // Grant doctor temporary access (if key provided)
        uint40 expireAt;
        if (doctorEncKeyHash != bytes32(0)) {
            expireAt = _grantDoctorAccess(
                patient,
                msg.sender,
                cid,
                doctorEncKeyHash,
                doctorAccessHours
            );
        }

        emit RecordAddedByDoctor(
            msg.sender,
            patient,
            keccak256(bytes(cid)),
            bytes(parentCID).length > 0 ? keccak256(bytes(parentCID)) : bytes32(0),
            keccak256(bytes(recordType)),
            expireAt
        );
    }

    // ================ EMERGENCY ACCESS ================

    /**
     * @notice Grant emergency access with witness validation
     * @dev Requires at least 2 witnesses (doctors or org members)
     * @param patient Patient address
     * @param cid Record CID to access
     * @param encKeyHash Encryption key hash
     * @param justification Reason for emergency access
     * @param witnesses Array of witness addresses
     */
    function grantEmergencyAccess(
        address patient,
        string calldata cid,
        bytes32 encKeyHash,
        string calldata justification,
        address[] calldata witnesses
    ) external onlyDoctor nonReentrant {
        if (!accessControl.isPatient(patient)) revert NotPatient();
        if (witnesses.length < MIN_WITNESSES) revert InsufficientWitnesses();
        if (bytes(justification).length == 0) revert InvalidParameter();
        if (encKeyHash == bytes32(0)) revert InvalidParameter();

        // Validate witnesses
        _validateWitnesses(witnesses);

        uint40 expireAt = uint40(block.timestamp) + EMERGENCY_ACCESS_DURATION;

        consentLedger.grantInternal(
            patient,
            msg.sender,
            cid,
            encKeyHash,
            expireAt,
            true,
            false
        );

        emit EmergencyAccessGranted(
            msg.sender,
            patient,
            keccak256(bytes(cid)),
            justification,
            witnesses,
            expireAt
        );
    }

    // ================ EXTEND ACCESS ================

    /**
     * @notice Doctor extends their existing access
     * @dev Useful for ongoing treatment
     */
    function extendDoctorAccess(
        address patient,
        string calldata cid,
        bytes32 encKeyHash,
        uint40 additionalHours
    ) external onlyDoctor nonReentrant {
        if (!accessControl.isPatient(patient)) revert NotPatient();
        if (encKeyHash == bytes32(0)) revert InvalidParameter();

        uint40 expireAt = _grantDoctorAccess(
            patient,
            msg.sender,
            cid,
            encKeyHash,
            additionalHours
        );

        emit AccessExtended(patient, msg.sender, keccak256(bytes(cid)), expireAt);
    }

    // ================ INTERNAL FUNCTIONS ================

    /**
     * @notice Internal function to grant doctor access with validation
     */
    function _grantDoctorAccess(
        address patient,
        address doctor,
        string calldata cid,
        bytes32 encKeyHash,
        uint40 accessHours
    ) internal returns (uint40 expireAt) {
        uint40 duration;

        // Use default if not specified
        if (accessHours == 0) {
            duration = DEFAULT_DOCTOR_ACCESS;
        } else {
            duration = accessHours * 1 hours;

            // Validate duration
            if (duration < MIN_DOCTOR_ACCESS || duration > MAX_DOCTOR_ACCESS) {
                revert InvalidAccessDuration();
            }
        }

        expireAt = uint40(block.timestamp) + duration;

        consentLedger.grantInternal(
            patient,
            doctor,
            cid,
            encKeyHash,
            expireAt,
            true,
            false
        );

        emit TemporaryAccessGranted(patient, doctor, keccak256(bytes(cid)), expireAt, duration);
    }

    /**
     * @notice Validate emergency access witnesses
     */
    function _validateWitnesses(address[] calldata witnesses) internal view {
        uint256 witnessCount = witnesses.length;

        for (uint256 i; i < witnessCount;) {
            address witness = witnesses[i];

            // Cannot be the requesting doctor
            if (witness == msg.sender) revert InvalidWitness();

            // Must be doctor or organization member
            bool isValidWitness = accessControl.isDoctor(witness) ||
                                 accessControl.isOrganization(witness);

            if (!isValidWitness) revert InvalidWitness();

            // Check for duplicate witnesses
            for (uint256 j = i + 1; j < witnessCount;) {
                if (witnesses[j] == witness) revert InvalidWitness();
                unchecked { ++j; }
            }

            unchecked { ++i; }
        }
    }

    // ================ VIEW FUNCTIONS ================

    /**
     * @notice Get access duration limits
     */
    function getAccessLimits() external pure returns (
        uint40 minHours,
        uint40 maxHours,
        uint40 defaultHours,
        uint40 emergencyHours,
        uint8 minWitnesses
    ) {
        return (
            MIN_DOCTOR_ACCESS / 1 hours,
            MAX_DOCTOR_ACCESS / 1 hours,
            DEFAULT_DOCTOR_ACCESS / 1 hours,
            EMERGENCY_ACCESS_DURATION / 1 hours,
            MIN_WITNESSES
        );
    }
}