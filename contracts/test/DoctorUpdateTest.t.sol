// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AccessControl.sol";
import "../src/RecordRegistry.sol";
import "../src/ConsentLedger.sol";
import "../src/DoctorUpdate.sol";
import "./helpers/TestHelpers.sol";

/**
 * @title DoctorUpdateTest
 * @notice Tests for DoctorUpdate with hash-based API
 */
contract DoctorUpdateTest is TestHelpers {
    AccessControl public accessControl;
    RecordRegistry public recordRegistry;
    ConsentLedger public consentLedger;
    DoctorUpdate public doctorUpdate;
    
    address public ministry;
    address public patient1;
    address public doctor1;
    address public doctor2;
    address public org1;
    address public witness1;
    address public witness2;
    address public attacker;
    
    // Constants
    bytes32 constant CID_HASH = keccak256("QmCID1");
    bytes32 constant PARENT_HASH = bytes32(0);
    bytes32 constant RECORD_TYPE = keccak256("Diagnosis");
    bytes32 constant ENC_KEY_HASH = keccak256("encKey");
    
    function setUp() public {
        ministry = makeAddr("ministry");
        patient1 = makeAddr("patient1");
        doctor1 = makeAddr("doctor1");
        doctor2 = makeAddr("doctor2");
        org1 = makeAddr("org1");
        witness1 = makeAddr("witness1");
        witness2 = makeAddr("witness2");
        attacker = makeAddr("attacker");
        
        // Deploy contracts
        vm.prank(ministry);
        accessControl = new AccessControl(ministry);
        
        recordRegistry = new RecordRegistry(accessControl);
        
        vm.prank(ministry);
        consentLedger = new ConsentLedger(ministry);
        
        doctorUpdate = new DoctorUpdate(accessControl, recordRegistry, consentLedger);
        
        // Wiring
        recordRegistry.authorizeContract(address(doctorUpdate), true);
        
        vm.prank(ministry);
        consentLedger.authorizeContract(address(doctorUpdate), true);
        
        // Setup patient
        vm.prank(patient1);
        accessControl.registerAsPatient();
        
        // Setup verified doctors
        _setupVerifiedDoctor(doctor1);
        _setupVerifiedDoctor(doctor2);
        _setupVerifiedDoctor(witness1);
        _setupVerifiedDoctor(witness2);
    }
    
    function _setupVerifiedDoctor(address doctor) internal {
        // Setup org only once
        if (!accessControl.isOrganization(org1)) {
            vm.prank(org1);
            accessControl.registerAsOrganization();
            vm.prank(ministry);
            accessControl.verifyOrganization(org1, "Hospital");
        }
        
        // Register and verify doctor
        vm.prank(doctor);
        accessControl.registerAsDoctor();
        
        vm.prank(org1);
        accessControl.verifyDoctor(doctor, "Doctor");
    }
    
    // ========== ADD RECORD BY DOCTOR ==========
    
    function test_AddRecordByDoctor_Success() public {
        vm.prank(doctor1);
        doctorUpdate.addRecordByDoctor(
            CID_HASH,
            PARENT_HASH,
            RECORD_TYPE,
            patient1,
            ENC_KEY_HASH,
            7 * 24  // 7 days in hours
        );
        
        // Check record created
        assertTrue(recordRegistry.recordExists(CID_HASH), "Record should exist");
        
        IRecordRegistry.Record memory rec = recordRegistry.getRecord(CID_HASH);
        assertEq(rec.owner, patient1, "Owner should be patient");
        assertEq(rec.createdBy, address(doctorUpdate), "Creator should be DoctorUpdate");
        
        // Check doctor has consent
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_HASH), "Doctor should have access");
    }
    
    function test_AddRecordByDoctor_NoEncKey_NoDoctorAccess() public {
        vm.prank(doctor1);
        doctorUpdate.addRecordByDoctor(
            CID_HASH,
            PARENT_HASH,
            RECORD_TYPE,
            patient1,
            bytes32(0),  // No enc key
            0
        );
        
        // Record created
        assertTrue(recordRegistry.recordExists(CID_HASH), "Record should exist");
        
        // Doctor should NOT have consent (no key provided)
        assertFalse(consentLedger.canAccess(patient1, doctor1, CID_HASH), "Doctor should NOT have access without key");
    }
    
    function test_AddRecordByDoctor_RevertWhen_NotDoctor() public {
        vm.expectRevert();  // NotDoctor
        vm.prank(attacker);
        doctorUpdate.addRecordByDoctor(
            CID_HASH, PARENT_HASH, RECORD_TYPE, patient1, ENC_KEY_HASH, 0
        );
    }
    
    function test_AddRecordByDoctor_RevertWhen_PatientNotRegistered() public {
        address unregistered = makeAddr("unregistered");
        
        vm.expectRevert();  // NotPatient
        vm.prank(doctor1);
        doctorUpdate.addRecordByDoctor(
            CID_HASH, PARENT_HASH, RECORD_TYPE, unregistered, ENC_KEY_HASH, 0
        );
    }
    
    function test_AddRecordByDoctor_RevertWhen_InvalidAccessDuration() public {
        vm.expectRevert();  // InvalidAccessDuration (> 90 days)
        vm.prank(doctor1);
        doctorUpdate.addRecordByDoctor(
            CID_HASH, PARENT_HASH, RECORD_TYPE, patient1, ENC_KEY_HASH,
            100 * 24  // 100 days > 90 days max
        );
    }
    
    // ========== EMERGENCY ACCESS ==========
    
    function test_GrantEmergencyAccess_Success() public {
        address[] memory witnesses = new address[](2);
        witnesses[0] = witness1;
        witnesses[1] = witness2;
        
        vm.prank(doctor1);
        doctorUpdate.grantEmergencyAccess(
            patient1,
            CID_HASH,
            ENC_KEY_HASH,
            "Patient unconscious, need immediate access",
            witnesses
        );
        
        // Doctor should have 24h access
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_HASH), "Doctor should have emergency access");
        
        // Check expiry is 24h
        IConsentLedger.Consent memory c = consentLedger.getConsent(patient1, doctor1, CID_HASH);
        assertEq(c.expireAt, uint40(block.timestamp) + 24 hours, "Should expire in 24h");
    }
    
    function test_GrantEmergencyAccess_RevertWhen_InsufficientWitnesses() public {
        address[] memory witnesses = new address[](1);  // Only 1 witness
        witnesses[0] = witness1;
        
        vm.expectRevert();  // InsufficientWitnesses
        vm.prank(doctor1);
        doctorUpdate.grantEmergencyAccess(
            patient1, CID_HASH, ENC_KEY_HASH, "Emergency", witnesses
        );
    }
    
    function test_GrantEmergencyAccess_RevertWhen_WitnessIsDoctor() public {
        address[] memory witnesses = new address[](2);
        witnesses[0] = doctor1;  // Doctor is witness - invalid
        witnesses[1] = witness2;
        
        vm.expectRevert();  // InvalidWitness
        vm.prank(doctor1);
        doctorUpdate.grantEmergencyAccess(
            patient1, CID_HASH, ENC_KEY_HASH, "Emergency", witnesses
        );
    }
    
    function test_GrantEmergencyAccess_RevertWhen_DuplicateWitness() public {
        address[] memory witnesses = new address[](2);
        witnesses[0] = witness1;
        witnesses[1] = witness1;  // Duplicate
        
        vm.expectRevert();  // InvalidWitness
        vm.prank(doctor1);
        doctorUpdate.grantEmergencyAccess(
            patient1, CID_HASH, ENC_KEY_HASH, "Emergency", witnesses
        );
    }
    
    function test_GrantEmergencyAccess_RevertWhen_EmptyJustification() public {
        address[] memory witnesses = new address[](2);
        witnesses[0] = witness1;
        witnesses[1] = witness2;
        
        vm.expectRevert();  // InvalidParameter
        vm.prank(doctor1);
        doctorUpdate.grantEmergencyAccess(
            patient1, CID_HASH, ENC_KEY_HASH, "", witnesses  // Empty justification
        );
    }
    
    // ========== VIEW FUNCTIONS ==========
    
    function test_GetAccessLimits() public view {
        (
            uint40 minHours,
            uint40 maxHours,
            uint40 defaultHours,
            uint40 emergencyHours,
            uint8 minWitnesses
        ) = doctorUpdate.getAccessLimits();
        
        assertEq(minHours, 1, "Min should be 1 hour");
        assertEq(maxHours, 90 * 24, "Max should be 90 days in hours");
        assertEq(defaultHours, 7 * 24, "Default should be 7 days in hours");
        assertEq(emergencyHours, 24, "Emergency should be 24 hours");
        assertEq(minWitnesses, 2, "Min witnesses should be 2");
    }
}
