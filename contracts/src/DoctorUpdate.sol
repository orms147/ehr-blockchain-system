// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IAccessControl.sol";
import "./interfaces/IRecordRegistry.sol";
import "./interfaces/IConsentLedger.sol";

/**
 * @title DoctorUpdate - Privacy-Safe Version
 * @notice All functions use bytes32 cidHash instead of string CID
 * @dev Frontend MUST compute keccak256(bytes(cid)) off-chain before calling
 * 
 * SECURITY: This version NEVER receives plaintext CID on-chain.
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
    uint8 private constant MAX_WITNESSES = 10;

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



    // ================ ERRORS ================
    error NotDoctor();
    error NotPatient();
    error InvalidParameter();
    error InvalidAccessDuration();
    error InsufficientWitnesses();
    error TooManyWitnesses();
    error InvalidWitness();
    error RecordNotExist();

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

    // ================ MAIN FUNCTION (Hash-based) ================

    /**
     * @notice Doctor creates record for patient with automatic consent grants
     * @param cidHash keccak256(bytes(cid)) - computed OFF-CHAIN
     * @param parentCidHash keccak256(bytes(parentCID)) or bytes32(0) if root
     * @param recordTypeHash keccak256(bytes(recordType)) - computed OFF-CHAIN
     * @param patient Patient address
     * @param doctorEncKeyHash Encryption key hash for doctor
     * @param doctorAccessHours How long doctor can access (0 = use default)
     */
    function addRecordByDoctor(
        bytes32 cidHash,
        bytes32 parentCidHash,
        bytes32 recordTypeHash,
        address patient,
        bytes32 doctorEncKeyHash,
        uint40 doctorAccessHours
    ) external onlyDoctor nonReentrant {
        // Validate inputs
        if (patient == address(0)) revert InvalidParameter();
        if (!accessControl.isPatient(patient)) revert NotPatient();
        if (cidHash == bytes32(0)) revert InvalidParameter();

        // Create record (owner = patient)
        recordRegistry.addRecordByDoctor(cidHash, parentCidHash, recordTypeHash, patient);

        // NOTE: Patient does NOT need consent entry
        // canAccess(patient, patient, ...) returns true by default

        // Grant doctor temporary access (if key provided)
        uint40 expireAt;
        if (doctorEncKeyHash != bytes32(0)) {
            // FIX: Only grant independent access if this is a ROOT record.
            // Updates (children) rely on the Root's access permission.
            if (parentCidHash == bytes32(0)) {
                expireAt = _grantDoctorAccess(
                    patient,
                    msg.sender,
                    cidHash,
                    doctorEncKeyHash,
                    doctorAccessHours
                );
            }
        }

        emit RecordAddedByDoctor(
            msg.sender,
            patient,
            cidHash,
            parentCidHash,
            recordTypeHash,
            expireAt
        );
    }

    // ================ EMERGENCY ACCESS (Hash-based) ================

    /**
     * @notice Grant emergency access with witness validation
     * @param cidHash keccak256(bytes(cid)) - computed OFF-CHAIN
     * @param encKeyHash Encryption key hash
     * @param justification Reason for emergency access (OK as string - not sensitive)
     * @param witnesses Array of witness addresses
     */
    function grantEmergencyAccess(
        address patient,
        bytes32 cidHash,
        bytes32 encKeyHash,
        string calldata justification,
        address[] calldata witnesses
    ) external onlyDoctor nonReentrant {
        if (!accessControl.isPatient(patient)) revert NotPatient();
        if (witnesses.length < MIN_WITNESSES) revert InsufficientWitnesses();
        if (witnesses.length > MAX_WITNESSES) revert TooManyWitnesses();
        if (bytes(justification).length == 0) revert InvalidParameter();
        if (encKeyHash == bytes32(0)) revert InvalidParameter();
        if (cidHash == bytes32(0)) revert InvalidParameter();
        // FIX (audit #5): emergency access must reference an existing record.
        if (!recordRegistry.recordExists(cidHash)) revert RecordNotExist();

        // Validate witnesses
        _validateWitnesses(witnesses);

        // FIX (audit #7): explicit overflow guard on uint40 cast.
        uint256 expireAt256 = block.timestamp + EMERGENCY_ACCESS_DURATION;
        if (expireAt256 > type(uint40).max) revert InvalidAccessDuration();
        uint40 expireAt = uint40(expireAt256);

        consentLedger.grantInternal(
            patient,
            msg.sender,
            cidHash,
            encKeyHash,
            expireAt,
            true,
            false
        );

        emit EmergencyAccessGranted(
            msg.sender,
            patient,
            cidHash,
            justification,
            witnesses,
            expireAt
        );
    }

    // ================ INTERNAL FUNCTIONS ================

    function _grantDoctorAccess(
        address patient,
        address doctor,
        bytes32 cidHash,
        bytes32 encKeyHash,
        uint40 accessHours
    ) internal returns (uint40 expireAt) {
        uint40 duration;

        if (accessHours == 0) {
            duration = DEFAULT_DOCTOR_ACCESS;
        } else {
            duration = accessHours * 1 hours;

            if (duration < MIN_DOCTOR_ACCESS || duration > MAX_DOCTOR_ACCESS) {
                revert InvalidAccessDuration();
            }
        }

        // FIX (audit #7): explicit overflow guard on uint40 cast.
        uint256 expireAt256 = block.timestamp + duration;
        if (expireAt256 > type(uint40).max) revert InvalidAccessDuration();
        expireAt = uint40(expireAt256);

        consentLedger.grantInternal(
            patient,
            doctor,
            cidHash,
            encKeyHash,
            expireAt,
            true,
            false
        );

        emit TemporaryAccessGranted(patient, doctor, cidHash, expireAt, duration);
    }

    function _validateWitnesses(address[] calldata witnesses) internal view {
        uint256 witnessCount = witnesses.length;

        for (uint256 i; i < witnessCount;) {
            address witness = witnesses[i];

            if (witness == msg.sender) revert InvalidWitness();

            bool isValidWitness = accessControl.isDoctor(witness) ||
                                 accessControl.isOrganization(witness);

            if (!isValidWitness) revert InvalidWitness();

            for (uint256 j = i + 1; j < witnessCount;) {
                if (witnesses[j] == witness) revert InvalidWitness();
                unchecked { ++j; }
            }

            unchecked { ++i; }
        }
    }

    // ================ VIEW FUNCTIONS ================

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