// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AccessControl.sol";
import "../src/RecordRegistry.sol";
import "../src/ConsentLedger.sol";
import "../src/EHRSystemSecure.sol";
import "../src/DoctorUpdate.sol";
import "../src/interfaces/IEHRSystemSecure.sol";
import "./helpers/TestHelpers.sol";

/**
 * @title IntegrationTest
 * @notice End-to-end integration tests for the entire EHR system
 * Coverage: Complete user flows across multiple contracts
 */
contract IntegrationTest is TestHelpers {
    AccessControl public accessControl;
    RecordRegistry public recordRegistry;
    ConsentLedger public consentLedger;
    EHRSystemSecure public ehrSystem;
    DoctorUpdate public doctorUpdate;
    
    // Test accounts
    address public ministry;
    address public patient1;
    address public doctor1;
    address public org1;
    address public relative;
    address public witness1;
    address public witness2;
    
    // Test data
    string constant CID_GENERAL = "QmGeneral123";
    string constant CID_LAB = "QmLab456";
    string constant CID_XRAY = "QmXRay789";
    bytes32 constant PATIENT_KEY = keccak256("patient-key");
    bytes32 constant DOCTOR_KEY = keccak256("doctor-key");
    
    function setUp() public {
        // Setup accounts
        ministry = makeAddr("ministry");
        patient1 = makeAddr("patient1");
        doctor1 = makeAddr("doctor1");
        org1 = makeAddr("org1");
        relative = makeAddr("relative");
        witness1 = makeAddr("witness1");
        witness2 = makeAddr("witness2");
        
        // Deploy all contracts
        vm.prank(ministry);
        accessControl = new AccessControl(ministry);
        
        recordRegistry = new RecordRegistry(accessControl);
        
        vm.prank(ministry);
        consentLedger = new ConsentLedger(ministry);
        
        ehrSystem = new EHRSystemSecure(
            address(accessControl),
            address(recordRegistry),
            address(consentLedger)
        );
        
        doctorUpdate = new DoctorUpdate(
            accessControl,
            recordRegistry,
            consentLedger
        );
        
        // Setup contracts
        vm.prank(address(this));
        recordRegistry.setConsentLedger(address(consentLedger));
        
        vm.prank(address(this));
        recordRegistry.authorizeContract(address(doctorUpdate), true);
        
        vm.startPrank(ministry);
        consentLedger.authorizeContract(address(ehrSystem), true);
        consentLedger.authorizeContract(address(doctorUpdate), true);
        vm.stopPrank();
    }
    
    // ========== END-TO-END FLOW 1: PATIENT-INITIATED FLOW ==========
    
    function test_Integration_PatientCreatesRecord_DoctorRequests_PatientApproves() public {
        // Step 1: Patient registers
        vm.prank(patient1);
        accessControl.registerAsPatient();
        
        // Step 2: Patient creates medical record
        vm.prank(patient1);
        recordRegistry.addRecord(CID_GENERAL, "", "General Checkup");
        
        // Verify record created
        IRecordRegistry.Record memory rec = recordRegistry.getRecord(keccak256(bytes(CID_GENERAL)));
        assertEq(rec.owner, patient1, "Patient should own record");
        
        // Step 3: Doctor registers
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        
        // Step 4: Doctor requests access via EHRSystem
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            CID_GENERAL,
            IEHRSystem.RequestType.DirectAccess,
            DOCTOR_KEY,
            0,
            0
        );
        
        bytes32 reqId = keccak256(abi.encode(
            doctor1,
            patient1,
            CID_GENERAL,
            IEHRSystem.RequestType.DirectAccess,
            uint256(0)
        ));
        
        // Step 5: Patient approves request
        vm.prank(patient1);
        ehrSystem.confirmAccessRequest(reqId);
        
        // Step 6: Wait for approval delay
        vm.warp(block.timestamp + 1 minutes + 1);
        
        // Step 7: Doctor confirms
        vm.prank(doctor1);
        ehrSystem.confirmAccessRequest(reqId);
        
        // Step 8: Verify doctor has access
        assertTrue(
            consentLedger.canAccess(patient1, doctor1, CID_GENERAL),
            "Doctor should have access after approval"
        );
        
        // Step 9: Verify consent details
        IConsentLedger.Consent memory consent = consentLedger.getConsent(patient1, doctor1, CID_GENERAL);
        assertTrue(consent.active, "Consent should be active");
        assertEq(consent.encKeyHash, DOCTOR_KEY, "Enc key should match");
    }
    
    // ========== END-TO-END FLOW 2: DOCTOR-INITIATED FLOW ==========
    
    function test_Integration_DoctorCreatesRecord_AutoGrantsAccess() public {
        // Setup: Verify doctor
        _setupVerifiedDoctor(doctor1, org1);
        
        // Explicitly register to ensure doctor role (fix for NotDoctor error)
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        
        // Step 1: Patient registers
        vm.prank(patient1);
        accessControl.registerAsPatient();
        
        // Debug checks
        bool isDoc = accessControl.isDoctor(doctor1);
        require(isDoc, "Debug: doctor1 is NOT a doctor");
        require(address(doctorUpdate.accessControl()) == address(accessControl), "Debug: AccessControl address mismatch");
        
        // Step 2: Doctor creates record for patient
        vm.prank(doctor1);
        doctorUpdate.addRecordByDoctor(
            CID_LAB,
            "",
            "Blood Test",
            patient1,
            PATIENT_KEY,
            DOCTOR_KEY,
            72 // 72 hours access
        );
        
        // Step 3: Verify record created and owned by patient
        IRecordRegistry.Record memory rec = recordRegistry.getRecord(keccak256(bytes(CID_LAB)));
        assertEq(rec.owner, patient1, "Patient should own record");
        
        // Step 4: Verify doctor has automatic access
        assertTrue(
            consentLedger.canAccess(patient1, doctor1, CID_LAB),
            "Doctor should have automatic access"
        );
        
        // Step 5: Verify access expires after 72 hours
        vm.warp(block.timestamp + 73 hours);
        assertFalse(
            consentLedger.canAccess(patient1, doctor1, CID_LAB),
            "Access should expire after 72 hours"
        );
    }
    
    // ========== END-TO-END FLOW 3: DELEGATION FLOW ==========
    
    function test_Integration_PatientDelegates_RelativeGrantsConsent() public {
        // Step 1: Setup patient and record
        vm.prank(patient1);
        accessControl.registerAsPatient();
        
        vm.prank(patient1);
        recordRegistry.addRecord(CID_GENERAL, "", "General");
        
        // Step 2: Patient grants delegation to relative
        vm.prank(patient1);
        consentLedger.grantDelegation(relative, 30 days, false);
        
        // Verify delegation
        IConsentLedger.Delegation memory delegation = consentLedger.getDelegation(patient1, relative);
        assertTrue(delegation.active, "Delegation should be active");
        
        // Step 3: Doctor registers
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        
        // Step 4: Relative grants consent to doctor using delegation
        vm.prank(relative);
        consentLedger.grantUsingDelegation(
            patient1,
            doctor1,
            CID_GENERAL,
            DOCTOR_KEY,
            uint40(block.timestamp + 7 days)
        );
        
        // Step 5: Verify doctor has access
        assertTrue(
            consentLedger.canAccess(patient1, doctor1, CID_GENERAL),
            "Doctor should have access via delegation"
        );
        
        // Step 6: Patient can revoke delegation
        vm.prank(patient1);
        consentLedger.revokeDelegation(relative);
        
        // Verify delegation revoked
        delegation = consentLedger.getDelegation(patient1, relative);
        assertFalse(delegation.active, "Delegation should be revoked");
    }
    
    // ========== END-TO-END FLOW 4: EMERGENCY ACCESS FLOW ==========
    
    function test_Integration_EmergencyAccess_WithWitnesses() public {
        // Setup: Verify doctors
        _setupVerifiedDoctor(doctor1, org1);
        _setupVerifiedDoctor(witness1, org1);
        _setupVerifiedDoctor(witness2, org1);
        
        // Step 1: Patient has existing record
        vm.prank(patient1);
        accessControl.registerAsPatient();
        
        vm.prank(patient1);
        recordRegistry.addRecord(CID_GENERAL, "", "General");
        
        // Step 2: Emergency situation - doctor requests emergency access
        address[] memory witnesses = new address[](2);
        witnesses[0] = witness1;
        witnesses[1] = witness2;
        
        vm.prank(doctor1);
        doctorUpdate.grantEmergencyAccess(
            patient1,
            CID_GENERAL,
            DOCTOR_KEY,
            "Patient unconscious, critical condition",
            witnesses
        );
        
        // Step 3: Verify doctor has emergency access
        assertTrue(
            consentLedger.canAccess(patient1, doctor1, CID_GENERAL),
            "Doctor should have emergency access"
        );
        
        // Step 4: Verify access is time-limited (24 hours)
        IConsentLedger.Consent memory consent = consentLedger.getConsent(patient1, doctor1, CID_GENERAL);
        uint40 expectedExpiry = uint40(block.timestamp) + 24 hours;
        assertEq(consent.expireAt, expectedExpiry, "Emergency access should be 24 hours");
        
        // Step 5: Verify access expires
        vm.warp(block.timestamp + 25 hours);
        assertFalse(
            consentLedger.canAccess(patient1, doctor1, CID_GENERAL),
            "Emergency access should expire"
        );
    }
    
    // ========== END-TO-END FLOW 5: MULTI-RECORD VERSIONING ==========
    
    function test_Integration_RecordVersioning_ParentChild() public {
        // Step 1: Patient creates initial record
        vm.startPrank(patient1);
        accessControl.registerAsPatient();
        recordRegistry.addRecord(CID_GENERAL, "", "General Checkup");
        
        // Step 2: Patient creates child record (update)
        recordRegistry.addRecord(CID_LAB, CID_GENERAL, "Lab Results");
        
        // Step 3: Patient creates another child (X-Ray)
        recordRegistry.addRecord(CID_XRAY, CID_GENERAL, "X-Ray");
        vm.stopPrank();
        
        // Step 4: Verify parent-child relationships
        bytes32[] memory children = recordRegistry.getChildRecords(keccak256(bytes(CID_GENERAL)));
        assertEq(children.length, 2, "Should have 2 children");
        
        // Step 5: Doctor requests access to parent
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        
        vm.prank(ministry);
        consentLedger.authorizeContract(address(this), true);
        
        consentLedger.grantInternal(
            patient1,
            doctor1,
            CID_GENERAL,
            DOCTOR_KEY,
            0,
            true, // includeUpdates = true
            false
        );
        
        // Step 6: Verify doctor has access to parent
        assertTrue(
            consentLedger.canAccess(patient1, doctor1, CID_GENERAL),
            "Should have access to parent"
        );
        
        // Note: Child access would need to be checked separately
        // as includeUpdates is a flag, not automatic child access
    }
    
    // ========== END-TO-END FLOW 6: REVOKE AND RE-GRANT ==========
    
    function test_Integration_RevokeAndReGrant() public {
        // Step 1: Setup and grant consent
        vm.prank(patient1);
        accessControl.registerAsPatient();
        
        vm.prank(patient1);
        recordRegistry.addRecord(CID_GENERAL, "", "General");
        
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        
        vm.prank(ministry);
        consentLedger.authorizeContract(address(this), true);
        
        consentLedger.grantInternal(
            patient1,
            doctor1,
            CID_GENERAL,
            DOCTOR_KEY,
            0,
            false,
            false
        );
        
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_GENERAL), "Should have access");
        
        // Step 2: Patient revokes consent
        vm.prank(patient1);
        consentLedger.revoke(doctor1, CID_GENERAL);
        
        assertFalse(consentLedger.canAccess(patient1, doctor1, CID_GENERAL), "Should not have access");
        
        // Step 3: Patient re-grants consent
        consentLedger.grantInternal(
            patient1,
            doctor1,
            CID_GENERAL,
            DOCTOR_KEY,
            uint40(block.timestamp + 7 days),
            false,
            false
        );
        
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_GENERAL), "Should have access again");
    }
    
    // ========== END-TO-END FLOW 7: MULTIPLE DOCTORS ACCESS ==========
    
    function test_Integration_MultipleDoctors_SameRecord() public {
        // Setup
        vm.prank(patient1);
        accessControl.registerAsPatient();
        
        vm.prank(patient1);
        recordRegistry.addRecord(CID_GENERAL, "", "General");
        
        address doctor2 = makeAddr("doctor2");
        
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        
        vm.prank(doctor2);
        accessControl.registerAsDoctor();
        
        vm.prank(ministry);
        consentLedger.authorizeContract(address(this), true);
        
        // Grant access to both doctors
        consentLedger.grantInternal(patient1, doctor1, CID_GENERAL, DOCTOR_KEY, 0, false, false);
        consentLedger.grantInternal(patient1, doctor2, CID_GENERAL, keccak256("doctor2-key"), 0, false, false);
        
        // Both should have access
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_GENERAL), "Doctor1 should have access");
        assertTrue(consentLedger.canAccess(patient1, doctor2, CID_GENERAL), "Doctor2 should have access");
        
        // Revoke one doctor's access
        vm.prank(patient1);
        consentLedger.revoke(doctor1, CID_GENERAL);
        
        // Only doctor2 should have access
        assertFalse(consentLedger.canAccess(patient1, doctor1, CID_GENERAL), "Doctor1 should not have access");
        assertTrue(consentLedger.canAccess(patient1, doctor2, CID_GENERAL), "Doctor2 should still have access");
    }
    
    // ========== END-TO-END FLOW 8: TRANSFER OWNERSHIP ==========
    
    function test_Integration_TransferRecordOwnership() public {
        // Setup
        vm.prank(patient1);
        accessControl.registerAsPatient();
        
        address patient2 = makeAddr("patient2");
        vm.prank(patient2);
        accessControl.registerAsPatient();
        
        // Patient1 creates record
        vm.prank(patient1);
        recordRegistry.addRecord(CID_GENERAL, "", "General");
        
        bytes32 cidHash = keccak256(bytes(CID_GENERAL));
        
        // Verify patient1 owns it
        IRecordRegistry.Record memory rec = recordRegistry.getRecord(keccak256(bytes(CID_GENERAL)));
        assertEq(rec.owner, patient1, "Patient1 should own record");
        
        // Transfer to patient2
        vm.prank(patient1);
        recordRegistry.transferOwnership(cidHash, patient2);
        
        // Verify patient2 owns it now
        rec = recordRegistry.getRecord(keccak256(bytes(CID_GENERAL)));
        assertEq(rec.owner, patient2, "Patient2 should own record");
        
        // Verify it's in patient2's record list
        bytes32[] memory patient2Records = recordRegistry.getOwnerRecords(patient2);
        assertEq(patient2Records.length, 1, "Patient2 should have 1 record");
        assertEq(patient2Records[0], cidHash, "Record should be in patient2's list");
        
        // Verify it's removed from patient1's list
        bytes32[] memory patient1Records = recordRegistry.getOwnerRecords(patient1);
        assertEq(patient1Records.length, 0, "Patient1 should have 0 records");
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

