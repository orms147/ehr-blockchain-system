// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AccessControl.sol";
import "../src/RecordRegistry.sol";
import "./helpers/TestHelpers.sol";

/**
 * @title RecordRegistryTest
 * @notice Tests for RecordRegistry with hash-based API
 */
contract RecordRegistryTest is TestHelpers {
    AccessControl public accessControl;
    RecordRegistry public recordRegistry;
    
    address public ministry;
    address public patient1;
    address public patient2;
    address public doctor1;
    address public org1;
    address public attacker;
    
    // Hash constants
    bytes32 constant CID_1 = keccak256("QmCID1");
    bytes32 constant CID_2 = keccak256("QmCID2");
    bytes32 constant CID_3 = keccak256("QmCID3");
    bytes32 constant PARENT_HASH = bytes32(0);
    bytes32 constant RECORD_TYPE = keccak256("Diagnosis");
    
    function setUp() public {
        ministry = makeAddr("ministry");
        patient1 = makeAddr("patient1");
        patient2 = makeAddr("patient2");
        doctor1 = makeAddr("doctor1");
        org1 = makeAddr("org1");
        attacker = makeAddr("attacker");
        
        // Deploy contracts
        vm.prank(ministry);
        accessControl = new AccessControl(ministry);
        recordRegistry = new RecordRegistry(accessControl);
        
        // Setup patient
        vm.prank(patient1);
        accessControl.registerAsPatient();
        
        vm.prank(patient2);
        accessControl.registerAsPatient();
        
        // Setup verified doctor
        vm.prank(org1);
        accessControl.registerAsOrganization();
        vm.prank(ministry);
        accessControl.verifyOrganization(org1, "Hospital");
        
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        vm.prank(org1);
        accessControl.verifyDoctor(doctor1, "Cardiologist");
        
        // Authorize DoctorUpdate contract (simulated)
        recordRegistry.authorizeContract(doctor1, true);
    }
    
    // ========== ADD RECORD (Patient) ==========
    
    function test_AddRecord_ByPatient_Success() public {
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, PARENT_HASH, RECORD_TYPE);
        
        assertTrue(recordRegistry.recordExists(CID_1), "Record should exist");
        
        IRecordRegistry.Record memory rec = recordRegistry.getRecord(CID_1);
        assertEq(rec.owner, patient1, "Owner should be patient");
        assertEq(rec.createdBy, patient1, "Creator should be patient");
        assertEq(rec.cidHash, CID_1, "CID hash should match");
        assertEq(rec.version, 1, "Version should be 1");
    }
    
    function test_AddRecord_RevertWhen_NotPatient() public {
        vm.expectRevert(IRecordRegistry.NotPatient.selector);
        vm.prank(attacker);
        recordRegistry.addRecord(CID_1, PARENT_HASH, RECORD_TYPE);
    }
    
    function test_AddRecord_RevertWhen_EmptyCID() public {
        vm.expectRevert(IRecordRegistry.EmptyCID.selector);
        vm.prank(patient1);
        recordRegistry.addRecord(bytes32(0), PARENT_HASH, RECORD_TYPE);
    }
    
    function test_AddRecord_RevertWhen_RecordExists() public {
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, PARENT_HASH, RECORD_TYPE);
        
        vm.expectRevert(IRecordRegistry.RecordExists.selector);
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, PARENT_HASH, RECORD_TYPE);
    }
    
    function test_AddRecord_WithParent_Success() public {
        // Add parent record
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, PARENT_HASH, RECORD_TYPE);
        
        // Add child record
        vm.prank(patient1);
        recordRegistry.addRecord(CID_2, CID_1, RECORD_TYPE);
        
        IRecordRegistry.Record memory child = recordRegistry.getRecord(CID_2);
        assertEq(child.parentCidHash, CID_1, "Parent should be CID_1");
        assertEq(child.version, 2, "Child version should be 2");
        
        // Check children list
        bytes32[] memory children = recordRegistry.getChildRecords(CID_1);
        assertEq(children.length, 1, "Should have 1 child");
        assertEq(children[0], CID_2, "Child should be CID_2");
    }
    
    function test_AddRecord_RevertWhen_ParentNotExist() public {
        bytes32 fakeParent = keccak256("FakeParent");
        
        vm.expectRevert(IRecordRegistry.ParentNotExist.selector);
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, fakeParent, RECORD_TYPE);
    }
    
    // ========== ADD RECORD BY DOCTOR ==========
    
    function test_AddRecordByDoctor_Success() public {
        vm.prank(doctor1);
        recordRegistry.addRecordByDoctor(CID_1, PARENT_HASH, RECORD_TYPE, patient1);
        
        IRecordRegistry.Record memory rec = recordRegistry.getRecord(CID_1);
        assertEq(rec.owner, patient1, "Owner should be patient");
        assertEq(rec.createdBy, doctor1, "Creator should be doctor");
    }
    
    function test_AddRecordByDoctor_RevertWhen_NotDoctor() public {
        vm.expectRevert(IRecordRegistry.NotDoctor.selector);
        vm.prank(attacker);
        recordRegistry.addRecordByDoctor(CID_1, PARENT_HASH, RECORD_TYPE, patient1);
    }
    
    // ========== UPDATE RECORD CID ==========
    
    function test_UpdateRecordCID_ByOwner_Success() public {
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, PARENT_HASH, RECORD_TYPE);
        
        vm.prank(patient1);
        recordRegistry.updateRecordCID(CID_1, CID_2);
        
        assertFalse(recordRegistry.recordExists(CID_1), "Old record should not exist");
        assertTrue(recordRegistry.recordExists(CID_2), "New record should exist");
        
        IRecordRegistry.Record memory rec = recordRegistry.getRecord(CID_2);
        assertEq(rec.owner, patient1, "Owner should be same");
    }
    
    function test_UpdateRecordCID_ByCreator_Within24h_Success() public {
        // Doctor creates record
        vm.prank(doctor1);
        recordRegistry.addRecordByDoctor(CID_1, PARENT_HASH, RECORD_TYPE, patient1);
        
        // Doctor updates within 24h
        vm.prank(doctor1);
        recordRegistry.updateRecordCID(CID_1, CID_2);
        
        assertTrue(recordRegistry.recordExists(CID_2), "New record should exist");
    }
    
    function test_UpdateRecordCID_ByCreator_RevertWhen_After24h() public {
        // Doctor creates record
        vm.prank(doctor1);
        recordRegistry.addRecordByDoctor(CID_1, PARENT_HASH, RECORD_TYPE, patient1);
        
        // Skip 25 hours
        vm.warp(block.timestamp + 25 hours);
        
        vm.expectRevert(IRecordRegistry.Unauthorized.selector);
        vm.prank(doctor1);
        recordRegistry.updateRecordCID(CID_1, CID_2);
    }
    
    function test_UpdateRecordCID_RevertWhen_HasChildren() public {
        // Add parent and child
        vm.startPrank(patient1);
        recordRegistry.addRecord(CID_1, PARENT_HASH, RECORD_TYPE);
        recordRegistry.addRecord(CID_2, CID_1, RECORD_TYPE);
        vm.stopPrank();
        
        // Try to update parent
        vm.expectRevert(IRecordRegistry.RecordHasChildren.selector);
        vm.prank(patient1);
        recordRegistry.updateRecordCID(CID_1, CID_3);
    }
    
    // ========== TRANSFER OWNERSHIP ==========
    
    function test_TransferOwnership_Success() public {
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, PARENT_HASH, RECORD_TYPE);
        
        vm.prank(patient1);
        recordRegistry.transferOwnership(CID_1, patient2);
        
        IRecordRegistry.Record memory rec = recordRegistry.getRecord(CID_1);
        assertEq(rec.owner, patient2, "Owner should be patient2");
        
        // Check owner records updated
        bytes32[] memory p1Records = recordRegistry.getOwnerRecords(patient1);
        bytes32[] memory p2Records = recordRegistry.getOwnerRecords(patient2);
        assertEq(p1Records.length, 0, "Patient1 should have 0 records");
        assertEq(p2Records.length, 1, "Patient2 should have 1 record");
    }
    
    function test_TransferOwnership_RevertWhen_NotOwner() public {
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, PARENT_HASH, RECORD_TYPE);
        
        vm.expectRevert(IRecordRegistry.NotOwner.selector);
        vm.prank(attacker);
        recordRegistry.transferOwnership(CID_1, patient2);
    }
    
    // ========== VIEW FUNCTIONS ==========
    
    function test_GetOwnerRecords_Multiple() public {
        vm.startPrank(patient1);
        recordRegistry.addRecord(CID_1, PARENT_HASH, RECORD_TYPE);
        recordRegistry.addRecord(CID_2, PARENT_HASH, RECORD_TYPE);
        recordRegistry.addRecord(CID_3, PARENT_HASH, RECORD_TYPE);
        vm.stopPrank();
        
        bytes32[] memory records = recordRegistry.getOwnerRecords(patient1);
        assertEq(records.length, 3, "Should have 3 records");
        assertEq(recordRegistry.getOwnerRecordCount(patient1), 3, "Count should be 3");
    }
}
