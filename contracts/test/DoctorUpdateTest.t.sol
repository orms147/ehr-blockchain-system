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
 * @notice Comprehensive tests for DoctorUpdate contract
 * Coverage: Doctor creates record, Emergency access, Witness validation, Extend access, Edge cases
 */
contract DoctorUpdateTest is TestHelpers {
    AccessControl public accessControl;
    RecordRegistry public recordRegistry;
    ConsentLedger public consentLedger;
    DoctorUpdate public doctorUpdate;
    
    // Test accounts
    address public ministry;
    address public patient1;
    address public doctor1;
    address public doctor2;
    address public org1;
    address public witness1;
    address public witness2;
    address public witness3;
    address public attacker;
    
    // Test data
    string constant CID_1 = "QmTest1";
    string constant PARENT_CID = "QmParent";
    string constant RECORD_TYPE = "Lab Result";
    bytes32 constant PATIENT_ENC_KEY = keccak256("patient-key");
    bytes32 constant DOCTOR_ENC_KEY = keccak256("doctor-key");
    
    // Events
    event RecordAddedByDoctor(
        address indexed doctor,
        address indexed patient,
        bytes32 indexed cidHash,
        bytes32 parentCidHash,
        bytes32 recordTypeHash,
        uint40 doctorAccessExpiry
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
    
    function setUp() public {
        // Setup accounts
        ministry = makeAddr("ministry");
        patient1 = makeAddr("patient1");
        doctor1 = makeAddr("doctor1");
        doctor2 = makeAddr("doctor2");
        org1 = makeAddr("org1");
        witness1 = makeAddr("witness1");
        witness2 = makeAddr("witness2");
        witness3 = makeAddr("witness3");
        attacker = makeAddr("attacker");
        
        // Deploy contracts
        vm.prank(ministry);
        accessControl = new AccessControl(ministry);
        
        recordRegistry = new RecordRegistry(accessControl);
        
        vm.prank(ministry);
        consentLedger = new ConsentLedger(ministry);
        
        doctorUpdate = new DoctorUpdate(accessControl, recordRegistry, consentLedger);
        
        // Set ConsentLedger in RecordRegistry
        vm.prank(address(this));
        recordRegistry.setConsentLedger(address(consentLedger));
        
        // Authorize DoctorUpdate contract
        vm.prank(ministry);
        consentLedger.authorizeContract(address(doctorUpdate), true);

        // Authorize DoctorUpdate in RecordRegistry
        vm.prank(address(this));
        recordRegistry.authorizeContract(address(doctorUpdate), true);
        
        // Register users
        vm.prank(patient1);
        accessControl.registerAsPatient();
        
        // Note: doctors will be registered in _setupVerifiedDoctor
        
        // Setup verified org and doctors
        _setupVerifiedDoctor(doctor1, org1);
        _setupVerifiedDoctor(doctor2, org1);
        _setupVerifiedDoctor(witness1, org1);
        _setupVerifiedDoctor(witness2, org1);
        _setupVerifiedDoctor(witness3, org1);
    }
    
    // ========== ADD RECORD BY DOCTOR TESTS ==========
    
    function test_AddRecordByDoctor_Success() public {
        bytes32 expectedCidHash = keccak256(bytes(CID_1));
        
        vm.expectEmit(true, true, true, false);
        emit RecordAddedByDoctor(
            doctor1,
            patient1,
            expectedCidHash,
            bytes32(0),
            keccak256(bytes(RECORD_TYPE)),
            168 hours // Default duration (7 days)
        );
        
        vm.prank(doctor1);
        doctorUpdate.addRecordByDoctor(
            CID_1,
            "",
            RECORD_TYPE,
            patient1,
            PATIENT_ENC_KEY,
            DOCTOR_ENC_KEY,
            0 // Use default access duration
        );
        
        // Verify record created
        IRecordRegistry.Record memory rec = recordRegistry.getRecord(keccak256(bytes(CID_1)));
        assertEq(rec.owner, patient1, "Owner should be patient");
        assertEq(rec.cidHash, expectedCidHash, "CID hash should match");
        
        // Verify doctor has access
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_1), "Doctor should have access");
    }
    
    function test_Debug_IsDoctor() public view {
        bool isDoc = accessControl.isDoctor(doctor1);
        assertTrue(isDoc, "Doctor1 should be a doctor");
        
        bool isVerified = accessControl.isVerifiedDoctor(doctor1);
        assertTrue(isVerified, "Doctor1 should be verified");
    }
    
    function test_AddRecordByDoctor_WithCustomDuration_Success() public {
        uint40 customHours = 48; // 48 hours
        
        vm.prank(doctor1);
        doctorUpdate.addRecordByDoctor(
            CID_1,
            "",
            RECORD_TYPE,
            patient1,
            PATIENT_ENC_KEY,
            DOCTOR_ENC_KEY,
            customHours
        );
        
        // Verify consent with custom expiry
        IConsentLedger.Consent memory consent = consentLedger.getConsent(patient1, doctor1, CID_1);
        uint40 expectedExpiry = uint40(block.timestamp) + (customHours * 1 hours);
        assertEq(consent.expireAt, expectedExpiry, "Expiry should match custom duration");
    }
    
    function test_AddRecordByDoctor_WithParent_Success() public {
        // Create parent record first
        vm.prank(patient1);
        recordRegistry.addRecord(PARENT_CID, "", "General");
        
        // Doctor creates child record
        vm.prank(doctor1);
        doctorUpdate.addRecordByDoctor(
            CID_1,
            PARENT_CID,
            RECORD_TYPE,
            patient1,
            PATIENT_ENC_KEY,
            DOCTOR_ENC_KEY,
            0
        );
        
        // Verify parent-child relationship
        IRecordRegistry.Record memory rec = recordRegistry.getRecord(keccak256(bytes(CID_1)));
        assertEq(rec.parentCidHash, keccak256(bytes(PARENT_CID)), "Parent should be set");
    }
    
    function test_AddRecordByDoctor_RevertWhen_NotDoctor() public {
        vm.expectRevert(DoctorUpdate.NotDoctor.selector);
        vm.prank(attacker);
        doctorUpdate.addRecordByDoctor(
            CID_1,
            "",
            RECORD_TYPE,
            patient1,
            PATIENT_ENC_KEY,
            DOCTOR_ENC_KEY,
            0
        );
    }
    
    function test_AddRecordByDoctor_RevertWhen_InvalidPatient() public {
        vm.expectRevert(DoctorUpdate.NotPatient.selector);
        vm.prank(doctor1);
        doctorUpdate.addRecordByDoctor(
            CID_1,
            "",
            RECORD_TYPE,
            attacker, // Not a patient
            PATIENT_ENC_KEY,
            DOCTOR_ENC_KEY,
            0
        );
    }
    
    function test_AddRecordByDoctor_RevertWhen_InvalidParameter() public {
        vm.expectRevert(DoctorUpdate.InvalidParameter.selector);
        vm.prank(doctor1);
        doctorUpdate.addRecordByDoctor(
            CID_1,
            "",
            RECORD_TYPE,
            address(0), // Invalid address
            PATIENT_ENC_KEY,
            DOCTOR_ENC_KEY,
            0
        );
    }
    

    
    function test_AddRecordByDoctor_RevertWhen_DurationTooLong() public {
        // Explicitly register to ensure doctor role
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        
        (, uint40 maxHours,,, ) = doctorUpdate.getAccessLimits();
        
        vm.expectRevert(DoctorUpdate.InvalidAccessDuration.selector);
        vm.prank(doctor1);
        doctorUpdate.addRecordByDoctor(
            CID_1,
            "",
            RECORD_TYPE,
            patient1,
            PATIENT_ENC_KEY,
            DOCTOR_ENC_KEY,
            maxHours + 1 // Too long
        );
    }
    
    // ========== EMERGENCY ACCESS TESTS ==========
    
    function test_GrantEmergencyAccess_Success() public {
        address[] memory witnesses = new address[](2);
        witnesses[0] = witness1;
        witnesses[1] = witness2;
        
        string memory justification = "Patient unconscious, critical condition";
        
        vm.expectEmit(true, true, true, false);
        emit EmergencyAccessGranted(doctor1, patient1, keccak256(bytes(CID_1)), justification, witnesses, 0);
        
        vm.prank(doctor1);
        doctorUpdate.grantEmergencyAccess(
            patient1,
            CID_1,
            DOCTOR_ENC_KEY,
            justification,
            witnesses
        );
        
        // Verify doctor has access
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_1), "Doctor should have emergency access");
        
        // Verify consent duration (should be EMERGENCY_ACCESS_DURATION)
        IConsentLedger.Consent memory consent = consentLedger.getConsent(patient1, doctor1, CID_1);
        (,,, uint40 emergencyHours,) = doctorUpdate.getAccessLimits();
        uint40 expectedExpiry = uint40(block.timestamp) + (emergencyHours * 1 hours);
        assertEq(consent.expireAt, expectedExpiry, "Should have emergency duration");
    }
    
    function test_GrantEmergencyAccess_WithThreeWitnesses_Success() public {
        address[] memory witnesses = new address[](3);
        witnesses[0] = witness1;
        witnesses[1] = witness2;
        witnesses[2] = witness3;
        
        vm.prank(doctor1);
        doctorUpdate.grantEmergencyAccess(
            patient1,
            CID_1,
            DOCTOR_ENC_KEY,
            "Emergency",
            witnesses
        );
        
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_1), "Should have access");
    }
    
    function test_GrantEmergencyAccess_RevertWhen_InsufficientWitnesses() public {
        address[] memory witnesses = new address[](1); // Only 1 witness
        witnesses[0] = witness1;
        
        vm.expectRevert(DoctorUpdate.InsufficientWitnesses.selector);
        vm.prank(doctor1);
        doctorUpdate.grantEmergencyAccess(
            patient1,
            CID_1,
            DOCTOR_ENC_KEY,
            "Emergency",
            witnesses
        );
    }
    
    function test_GrantEmergencyAccess_RevertWhen_WitnessNotVerified() public {
        address unverifiedWitness = makeAddr("unverified");
        
        address[] memory witnesses = new address[](2);
        witnesses[0] = witness1;
        witnesses[1] = unverifiedWitness; // Not verified
        
        vm.expectRevert(DoctorUpdate.InvalidWitness.selector);
        vm.prank(doctor1);
        doctorUpdate.grantEmergencyAccess(
            patient1,
            CID_1,
            DOCTOR_ENC_KEY,
            "Emergency",
            witnesses
        );
    }
    
    function test_GrantEmergencyAccess_RevertWhen_DuplicateWitness() public {
        address[] memory witnesses = new address[](2);
        witnesses[0] = witness1;
        witnesses[1] = witness1; // Duplicate
        
        vm.expectRevert(DoctorUpdate.InvalidWitness.selector);
        vm.prank(doctor1);
        doctorUpdate.grantEmergencyAccess(
            patient1,
            CID_1,
            DOCTOR_ENC_KEY,
            "Emergency",
            witnesses
        );
    }
    
    function test_GrantEmergencyAccess_RevertWhen_DoctorAsWitness() public {
        address[] memory witnesses = new address[](2);
        witnesses[0] = doctor1; // Doctor can't be witness for themselves
        witnesses[1] = witness1;
        
        vm.expectRevert(DoctorUpdate.InvalidWitness.selector);
        vm.prank(doctor1);
        doctorUpdate.grantEmergencyAccess(
            patient1,
            CID_1,
            DOCTOR_ENC_KEY,
            "Emergency",
            witnesses
        );
    }
    
    // ========== EXTEND ACCESS TESTS ==========
    
    function test_ExtendDoctorAccess_Success() public {
        // Grant initial access
        vm.prank(doctor1);
        doctorUpdate.addRecordByDoctor(
            CID_1,
            "",
            RECORD_TYPE,
            patient1,
            PATIENT_ENC_KEY,
            DOCTOR_ENC_KEY,
            24 // 24 hours
        );
        
        uint40 initialExpiry = consentLedger.getConsent(patient1, doctor1, CID_1).expireAt;
        
        // Extend access
        uint40 additionalHours = 48;
        
        vm.expectEmit(true, true, true, false);
        emit AccessExtended(patient1, doctor1, keccak256(bytes(CID_1)), 0);
        
        vm.prank(doctor1);
        doctorUpdate.extendDoctorAccess(
            patient1,
            CID_1,
            DOCTOR_ENC_KEY,
            additionalHours
        );
        
        // Verify extended expiry
        uint40 newExpiry = consentLedger.getConsent(patient1, doctor1, CID_1).expireAt;
        assertGt(newExpiry, initialExpiry, "Expiry should be extended");
    }
    
    function test_ExtendDoctorAccess_RevertWhen_NotDoctor() public {
        vm.expectRevert(DoctorUpdate.NotDoctor.selector);
        vm.prank(attacker);
        doctorUpdate.extendDoctorAccess(
            patient1,
            CID_1,
            DOCTOR_ENC_KEY,
            24
        );
    }
    
    function test_ExtendDoctorAccess_RevertWhen_InvalidParameter() public {
        vm.expectRevert(DoctorUpdate.InvalidParameter.selector);
        vm.prank(doctor1);
        doctorUpdate.extendDoctorAccess(
            patient1,
            CID_1,
            bytes32(0), // Invalid enc key
            24
        );
    }
    
    // ========== VIEW FUNCTION TESTS ==========
    
    function test_GetAccessLimits_Success() public view {
        (
            uint40 minHours,
            uint40 maxHours,
            uint40 defaultHours,
            uint40 emergencyHours,
            uint256 minWitnesses
        ) = doctorUpdate.getAccessLimits();
        
        assertEq(minHours, 1, "Min should be 1 hour");
        assertEq(maxHours, 2160, "Max should be 2160 hours (90 days)");  // ✅ Fixed: 90 days not 30
        assertEq(defaultHours, 168, "Default should be 168 hours (7 days)");  // ✅ Fixed: 7 days not 3
        assertEq(emergencyHours, 24, "Emergency should be 24 hours");
        assertEq(minWitnesses, 2, "Min witnesses should be 2");
    }
    
    // ========== EDGE CASES ==========
    
    function test_EdgeCase_MultipleDoctorsCreateRecords() public {
        // Doctor1 creates record
        vm.prank(doctor1);
        doctorUpdate.addRecordByDoctor(
            CID_1,
            "",
            "Lab Result",
            patient1,
            PATIENT_ENC_KEY,
            keccak256("doctor1-key"),
            0
        );
        
        // Doctor2 creates different record
        vm.prank(doctor2);
        doctorUpdate.addRecordByDoctor(
            "QmTest2",
            "",
            "X-Ray",
            patient1,
            PATIENT_ENC_KEY,
            keccak256("doctor2-key"),
            0
        );
        
        // Both should have access to their respective records
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_1), "Doctor1 should have access");
        assertTrue(consentLedger.canAccess(patient1, doctor2, "QmTest2"), "Doctor2 should have access");
        
        // But not to each other's records
        assertFalse(consentLedger.canAccess(patient1, doctor1, "QmTest2"), "Doctor1 should not have access to Doctor2's record");
        assertFalse(consentLedger.canAccess(patient1, doctor2, CID_1), "Doctor2 should not have access to Doctor1's record");
    }
    
    function test_EdgeCase_EmergencyAccessExpiry() public {
        address[] memory witnesses = new address[](2);
        witnesses[0] = witness1;
        witnesses[1] = witness2;
        
        vm.prank(doctor1);
        doctorUpdate.grantEmergencyAccess(
            patient1,
            CID_1,
            DOCTOR_ENC_KEY,
            "Emergency",
            witnesses
        );
        
        // Should have access now
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_1), "Should have access");
        
        // Warp past emergency duration
        (,,, uint40 emergencyHours,) = doctorUpdate.getAccessLimits();
        vm.warp(block.timestamp + (emergencyHours * 1 hours) + 1);
        
        // Should not have access after expiry
        assertFalse(consentLedger.canAccess(patient1, doctor1, CID_1), "Should not have access after expiry");
    }
    
    // ========== HELPER FUNCTIONS ==========
    
    function _setupVerifiedDoctor(address doctor, address org) internal {
        // Register org
        vm.prank(org);
        accessControl.registerAsOrganization();
        
        // Ministry verifies org
        vm.prank(ministry);
        accessControl.verifyOrganization(org, "Hospital ABC");
        
        // Register doctor
        vm.prank(doctor);
        accessControl.registerAsDoctor();
        
        // Org verifies doctor
        vm.prank(org);
        accessControl.verifyDoctor(doctor, "Cardiologist");
    }
}
