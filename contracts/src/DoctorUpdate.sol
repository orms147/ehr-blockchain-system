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

    // ================ ERRORS ================
    error NotDoctor();
    error NotPatient();
    error InvalidParameter();
    error InvalidAccessDuration();

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
            false
        );

        emit TemporaryAccessGranted(patient, doctor, cidHash, expireAt, duration);
    }

    // ================ VIEW FUNCTIONS ================

    function getAccessLimits() external pure returns (
        uint40 minHours,
        uint40 maxHours,
        uint40 defaultHours
    ) {
        return (
            MIN_DOCTOR_ACCESS / 1 hours,
            MAX_DOCTOR_ACCESS / 1 hours,
            DEFAULT_DOCTOR_ACCESS / 1 hours
        );
    }
}