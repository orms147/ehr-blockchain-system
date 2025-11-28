// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AccessControl.sol";
import "../src/RecordRegistry.sol";
import "../src/ConsentLedger.sol";
import "./helpers/TestHelpers.sol";

/**
 * @title RecordRegistryTest
 * @notice Comprehensive tests for RecordRegistry contract
 * Coverage: Add record, Update, Transfer, Query functions, Hash-only storage, Edge cases
 */
contract RecordRegistryTest is TestHelpers {
    AccessControl public accessControl;
    RecordRegistry public recordRegistry;
    ConsentLedger public consentLedger;
    
    // Test accounts
    address public ministry;
    address public patient1;
    address public patient2;
    address public doctor1;
    
    // Test data
    string constant CID_1 = "QmTest1";
    string constant CID_2 = "QmTest2";
    string constant CID_3 = "QmTest3";
    string constant PARENT_CID = "QmParent";
    string constant RECORD_TYPE_GENERAL = "General";
    string constant RECORD_TYPE_LAB = "Lab Result";
    
    // Events
    event RecordAdded(
        address indexed owner,
        bytes32 indexed cidHash,
        bytes32 indexed parentCidHash,
        bytes32 recordTypeHash,
        uint40 timestamp
    );
    event RecordUpdated(bytes32 indexed oldCidHash, bytes32 indexed newCidHash, address indexed owner);
    event OwnershipTransferred(bytes32 indexed cidHash, address indexed oldOwner, address indexed newOwner);
    
    function setUp() public {
        // Setup accounts
        ministry = makeAddr("ministry");
        patient1 = makeAddr("patient1");
        patient2 = makeAddr("patient2");
        doctor1 = makeAddr("doctor1");
        
        // Deploy contracts
        vm.prank(ministry);
        accessControl = new AccessControl(ministry);
        
        recordRegistry = new RecordRegistry(accessControl);
        
        vm.prank(ministry);
        consentLedger = new ConsentLedger(ministry);
        
        // Set ConsentLedger in RecordRegistry
        vm.prank(address(this)); // deployer
        recordRegistry.setConsentLedger(address(consentLedger));
        
        // Register users
        vm.prank(patient1);
        accessControl.registerAsPatient();
        
        vm.prank(patient2);
        accessControl.registerAsPatient();
        
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
    }
    
    // ========== ADD RECORD TESTS ==========
    
    function test_AddRecord_Success() public {
        bytes32 expectedCidHash = keccak256(bytes(CID_1));
        bytes32 expectedTypeHash = keccak256(bytes(RECORD_TYPE_GENERAL));
        
        vm.expectEmit(true, true, true, false);
        emit RecordAdded(patient1, expectedCidHash, bytes32(0), expectedTypeHash, 0);
        
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, "", RECORD_TYPE_GENERAL);
        
        // Verify record exists
        IRecordRegistry.Record memory rec = recordRegistry.getRecord(keccak256(bytes(CID_1)));
        assertEq(rec.owner, patient1, "Owner should be patient1");
        assertEq(rec.cidHash, expectedCidHash, "CID hash should match");
        assertEq(rec.recordTypeHash, expectedTypeHash, "Record type hash should match");
        assertEq(rec.parentCidHash, bytes32(0), "Parent should be empty");
        assertTrue(rec.exists, "Record should exist");
    }
    
    function test_AddRecord_WithParent_Success() public {
        // Add parent first
        vm.prank(patient1);
        recordRegistry.addRecord(PARENT_CID, "", RECORD_TYPE_GENERAL);
        
        // Add child
        bytes32 expectedCidHash = keccak256(bytes(CID_1));
        bytes32 expectedParentHash = keccak256(bytes(PARENT_CID));
        
        vm.expectEmit(true, true, true, false);
        emit RecordAdded(patient1, expectedCidHash, expectedParentHash, keccak256(bytes(RECORD_TYPE_LAB)), 0);
        
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, PARENT_CID, RECORD_TYPE_LAB);
        
        // Verify parent-child relationship
        IRecordRegistry.Record memory rec = recordRegistry.getRecord(keccak256(bytes(CID_1)));
        assertEq(rec.parentCidHash, expectedParentHash, "Parent hash should match");
        
        // Verify child is in parent's children list
        bytes32[] memory children = recordRegistry.getChildRecords(keccak256(bytes(PARENT_CID)));
        assertEq(children.length, 1, "Should have 1 child");
        assertEq(children[0], expectedCidHash, "Child hash should match");
    }
    
    function test_AddRecord_RevertWhen_EmptyCID() public {
        vm.expectRevert(IRecordRegistry.EmptyCID.selector);
        vm.prank(patient1);
        recordRegistry.addRecord("", "", RECORD_TYPE_GENERAL);
    }
    
    function test_AddRecord_RevertWhen_AlreadyExists() public {
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, "", RECORD_TYPE_GENERAL);
        
        vm.expectRevert(IRecordRegistry.RecordExists.selector);
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, "", RECORD_TYPE_GENERAL);
    }
    
    function test_AddRecord_RevertWhen_ParentNotExist() public {
        vm.expectRevert(IRecordRegistry.ParentNotExist.selector);
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, "NonExistentParent", RECORD_TYPE_GENERAL);
    }
    
    function test_AddRecord_RevertWhen_MaxChildrenExceeded() public {
        // Add parent
        vm.prank(patient1);
        recordRegistry.addRecord(PARENT_CID, "", RECORD_TYPE_GENERAL);
        
        // Add max children (10)
        uint8 maxChildren = recordRegistry.getMaxChildrenLimit();
        vm.startPrank(patient1);
        for (uint8 i = 0; i < maxChildren; i++) {
            recordRegistry.addRecord(
                string(abi.encodePacked("Child", vm.toString(i))),
                PARENT_CID,
                RECORD_TYPE_LAB
            );
        }
        
        // Try to add one more
        vm.expectRevert(IRecordRegistry.TooManyChildren.selector);
        recordRegistry.addRecord("ExtraChild", PARENT_CID, RECORD_TYPE_LAB);
        vm.stopPrank();
    }
    
    // ========== UPDATE RECORD TESTS ==========
    
    function test_UpdateRecordCID_Success() public {
        // Add record
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, "", RECORD_TYPE_GENERAL);
        
        // Update CID
        bytes32 oldHash = keccak256(bytes(CID_1));
        bytes32 newHash = keccak256(bytes(CID_2));
        
        vm.expectEmit(true, true, true, false);
        emit RecordUpdated(oldHash, newHash, patient1);
        
        vm.prank(patient1);
        recordRegistry.updateRecordCID(CID_1, CID_2);
        
        // Verify new record exists with preserved data
        IRecordRegistry.Record memory rec = recordRegistry.getRecord(keccak256(bytes(CID_2)));
        assertEq(rec.owner, patient1, "Owner should be preserved");
        assertEq(rec.cidHash, newHash, "New CID hash should match");
        assertEq(rec.recordTypeHash, keccak256(bytes(RECORD_TYPE_GENERAL)), "Record type should be preserved");
        assertTrue(rec.exists, "New record should exist");
        
        // Verify old record is deleted
        vm.expectRevert(IRecordRegistry.RecordNotExist.selector);
        recordRegistry.getRecord(keccak256(bytes(CID_1)));
    }
    
    function test_UpdateRecordCID_WithChildren_Success() public {
        // Add parent and child
        vm.startPrank(patient1);
        recordRegistry.addRecord(PARENT_CID, "", RECORD_TYPE_GENERAL);
        recordRegistry.addRecord(CID_1, PARENT_CID, RECORD_TYPE_LAB);
        
        // Update parent CID
        string memory newParentCID = "QmNewParent";
        recordRegistry.updateRecordCID(PARENT_CID, newParentCID);
        vm.stopPrank();
        
        // Verify child still references correct parent
        bytes32[] memory children = recordRegistry.getChildRecords(keccak256(bytes(newParentCID)));
        assertEq(children.length, 1, "Should still have 1 child");
    }
    
    function test_UpdateRecordCID_RevertWhen_NotOwner() public {
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, "", RECORD_TYPE_GENERAL);
        
        vm.expectRevert(IRecordRegistry.NotOwner.selector);
        vm.prank(patient2);
        recordRegistry.updateRecordCID(CID_1, CID_2);
    }
    
    function test_UpdateRecordCID_RevertWhen_OldNotExist() public {
        vm.expectRevert(IRecordRegistry.RecordNotExist.selector);
        vm.prank(patient1);
        recordRegistry.updateRecordCID("NonExistent", CID_2);
    }
    
    function test_UpdateRecordCID_RevertWhen_NewAlreadyExists() public {
        vm.startPrank(patient1);
        recordRegistry.addRecord(CID_1, "", RECORD_TYPE_GENERAL);
        recordRegistry.addRecord(CID_2, "", RECORD_TYPE_GENERAL);
        
        vm.expectRevert(IRecordRegistry.RecordExists.selector);
        recordRegistry.updateRecordCID(CID_1, CID_2);
        vm.stopPrank();
    }
    
    // ========== TRANSFER OWNERSHIP TESTS ==========
    
    function test_TransferOwnership_Success() public {
        // Add record
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, "", RECORD_TYPE_GENERAL);
        
        bytes32 cidHash = keccak256(bytes(CID_1));
        
        vm.expectEmit(true, true, true, false);
        emit OwnershipTransferred(cidHash, patient1, patient2);
        
        vm.prank(patient1);
        recordRegistry.transferOwnership(cidHash, patient2);
        
        // Verify new owner
        IRecordRegistry.Record memory rec = recordRegistry.getRecord(keccak256(bytes(CID_1)));
        assertEq(rec.owner, patient2, "Owner should be patient2");
        
        // Verify record is in new owner's list
        bytes32[] memory patient2Records = recordRegistry.getOwnerRecords(patient2);
        assertEq(patient2Records.length, 1, "Patient2 should have 1 record");
        assertEq(patient2Records[0], cidHash, "Record should be in patient2's list");
        
        // Verify record is removed from old owner's list
        bytes32[] memory patient1Records = recordRegistry.getOwnerRecords(patient1);
        assertEq(patient1Records.length, 0, "Patient1 should have 0 records");
    }
    
    function test_TransferOwnership_RevertWhen_NotOwner() public {
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, "", RECORD_TYPE_GENERAL);
        
        bytes32 cidHash = keccak256(bytes(CID_1));
        
        vm.expectRevert(IRecordRegistry.NotOwner.selector);
        vm.prank(patient2);
        recordRegistry.transferOwnership(cidHash, patient2);
    }
    
    function test_TransferOwnership_RevertWhen_InvalidAddress() public {
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, "", RECORD_TYPE_GENERAL);
        
        bytes32 cidHash = keccak256(bytes(CID_1));
        
        vm.expectRevert(IRecordRegistry.InvalidAddress.selector);
        vm.prank(patient1);
        recordRegistry.transferOwnership(cidHash, address(0));
    }
    
    // ========== QUERY FUNCTION TESTS ==========
    
    function test_GetRecord_Success() public {
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, "", RECORD_TYPE_GENERAL);
        
        IRecordRegistry.Record memory rec = recordRegistry.getRecord(keccak256(bytes(CID_1)));
        
        assertEq(rec.owner, patient1, "Owner should match");
        assertEq(rec.cidHash, keccak256(bytes(CID_1)), "CID hash should match");
        assertTrue(rec.exists, "Should exist");
        assertGt(rec.createdAt, 0, "Created timestamp should be set");
    }
    
    function test_GetRecord_RevertWhen_NotExist() public {
        vm.expectRevert(IRecordRegistry.RecordNotExist.selector);
        recordRegistry.getRecord("NonExistent");
    }
    
    function test_GetOwnerRecords_MultipleRecords() public {
        // Add multiple records
        vm.startPrank(patient1);
        recordRegistry.addRecord(CID_1, "", RECORD_TYPE_GENERAL);
        recordRegistry.addRecord(CID_2, "", RECORD_TYPE_LAB);
        recordRegistry.addRecord(CID_3, "", RECORD_TYPE_GENERAL);
        vm.stopPrank();
        
        bytes32[] memory records = recordRegistry.getOwnerRecords(patient1);
        assertEq(records.length, 3, "Should have 3 records");
        
        // Verify count
        uint256 count = recordRegistry.getOwnerRecordCount(patient1);
        assertEq(count, 3, "Count should be 3");
    }
    
    function test_GetChildRecords_MultipleChildren() public {
        // Add parent and children
        vm.startPrank(patient1);
        recordRegistry.addRecord(PARENT_CID, "", RECORD_TYPE_GENERAL);
        recordRegistry.addRecord(CID_1, PARENT_CID, RECORD_TYPE_LAB);
        recordRegistry.addRecord(CID_2, PARENT_CID, RECORD_TYPE_LAB);
        vm.stopPrank();
        
        bytes32[] memory children = recordRegistry.getChildRecords(keccak256(bytes(PARENT_CID)));
        assertEq(children.length, 2, "Should have 2 children");
        
        uint256 count = recordRegistry.getChildCount(keccak256(bytes(PARENT_CID)));
        assertEq(count, 2, "Child count should be 2");
    }
    
    function test_RecordExists_True() public {
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, "", RECORD_TYPE_GENERAL);
        
        assertTrue(recordRegistry.recordExists(keccak256(bytes(CID_1))), "Record should exist");
    }
    
    function test_RecordExists_False() public view {
        assertFalse(recordRegistry.recordExists("NonExistent"), "Record should not exist");
    }
    
    // ========== ACCESS CONTROL TESTS ==========
    
    function test_CanAccessRecord_Owner() public {
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, "", RECORD_TYPE_GENERAL);
        
        bytes32 cidHash = keccak256(bytes(CID_1));
        assertTrue(recordRegistry.canAccessRecord(patient1, cidHash), "Owner should have access");
    }
    
    function test_CanAccessRecord_NonOwner_NoConsent() public {
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, "", RECORD_TYPE_GENERAL);
        
        bytes32 cidHash = keccak256(bytes(CID_1));
        assertFalse(recordRegistry.canAccessRecord(doctor1, cidHash), "Non-owner without consent should not have access");
    }
    
    // ========== HASH-ONLY STORAGE VERIFICATION ==========
    
    function test_HashOnlyStorage_NoCIDString() public {
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, "", RECORD_TYPE_GENERAL);
        
        // Verify that only hash is stored (no plaintext CID)
        IRecordRegistry.Record memory rec = recordRegistry.getRecord(keccak256(bytes(CID_1)));
        
        // The struct should only have cidHash (bytes32), not a string CID
        assertEq(rec.cidHash, keccak256(bytes(CID_1)), "Should only store hash");
        
        // Note: We can't directly verify that no string is stored,
        // but we can verify the struct only has bytes32 cidHash field
    }
    
    // ========== EDGE CASES ==========
    
    function test_EdgeCase_EmptyRecordType() public {
        // Empty record type should be allowed
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, "", "");
        
        IRecordRegistry.Record memory rec = recordRegistry.getRecord(keccak256(bytes(CID_1)));
        assertEq(rec.recordTypeHash, keccak256(bytes("")), "Empty record type hash should match");
    }
    
    function test_EdgeCase_VeryLongCID() public {
        string memory longCID = "QmVeryLongCIDWithLotsOfCharacters1234567890abcdefghijklmnopqrstuvwxyz";
        
        vm.prank(patient1);
        recordRegistry.addRecord(longCID, "", RECORD_TYPE_GENERAL);
        
        assertTrue(recordRegistry.recordExists(keccak256(bytes(longCID))), "Long CID should work");
    }
    
    function test_EdgeCase_GetMaxChildrenLimit() public view {
        uint8 limit = recordRegistry.getMaxChildrenLimit();
        assertEq(limit, 10, "Max children should be 10");
    }
}





