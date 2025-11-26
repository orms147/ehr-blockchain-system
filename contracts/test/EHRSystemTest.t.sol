// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AccessControl.sol";
import "../src/RecordRegistry.sol";
import "../src/ConsentLedger.sol";
import "../src/EHRSystemSecure.sol";
import "../src/DoctorUpdate.sol";

contract EHRSystemTest is Test {
    AccessControl accessControl;
    RecordRegistry recordRegistry;
    ConsentLedger consentLedger;
    EHRSystemSecure ehrSystem;
    DoctorUpdate doctorUpdate;

    address ministry = address(0x1);
    address patient = address(0x2);
    address doctor = address(0x3);
    address org = address(0x4);

    function setUp() public {
        vm.startPrank(ministry);
        accessControl = new AccessControl(ministry);
        recordRegistry = new RecordRegistry(accessControl);
        consentLedger = new ConsentLedger(ministry);
        ehrSystem = new EHRSystemSecure(address(accessControl), address(recordRegistry), address(consentLedger));
        doctorUpdate = new DoctorUpdate(accessControl, recordRegistry, consentLedger);

        // Authorize contracts
        consentLedger.authorizeContract(address(ehrSystem), true);
        consentLedger.authorizeContract(address(doctorUpdate), true);
        // ehrSystem does not have authorizeContract, removed.
        vm.stopPrank();
    }

    // 1. Verify AccessControl Fix: Multiple Roles
    function testMultipleRoles() public {
        vm.startPrank(doctor);
        accessControl.registerAsDoctor();
        accessControl.registerAsPatient(); // Should not revert
        
        (bool isP, bool isD,,,,) = accessControl.getUserStatus(doctor);
        assertTrue(isP, "Should be patient");
        assertTrue(isD, "Should be doctor");
        vm.stopPrank();
    }

    // 2. Verify RecordRegistry Fix: Data Loss in updateRecordCID
    function testUpdateRecordCID_DataPreservation() public {
        vm.startPrank(patient);
        accessControl.registerAsPatient();
        recordRegistry.addRecord("CID_1", "", "General");
        
        // Update CID
        recordRegistry.updateRecordCID("CID_1", "CID_2");
        
        // Check if data preserved
        IRecordRegistry.Record memory rec = recordRegistry.getRecord("CID_2");
        assertEq(rec.owner, patient, "Owner should be preserved");
        assertEq(rec.cidHash, keccak256(bytes("CID_2")), "CID hash mismatch");
        
        // Old record should be gone
        vm.expectRevert();
        recordRegistry.getRecord("CID_1");
        vm.stopPrank();
    }

    // 3. Verify ConsentLedger Fix: Enforce Double Confirmation
    function testConsentLedger_NoDirectGrant() public {
        vm.startPrank(patient);
        // Try to call internal grant directly (should fail as not authorized)
        // Note: We removed the public grant, so we can't even call it easily.
        // But let's try to call grantInternal
        vm.expectRevert(); // Unauthorized
        consentLedger.grantInternal(patient, doctor, "CID", bytes32(0), 0, true, false);
        vm.stopPrank();
    }
}
