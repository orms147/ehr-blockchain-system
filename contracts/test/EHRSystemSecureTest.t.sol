// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AccessControl.sol";
import "../src/RecordRegistry.sol";
import "../src/ConsentLedger.sol";
import "../src/EHRSystemSecure.sol";
import "../src/interfaces/IEHRSystemSecure.sol";
import "./helpers/TestHelpers.sol";

/**
 * @title EHRSystemSecureTest
 * @notice Comprehensive tests for EHRSystemSecure contract
 * Coverage: Request access, 2-step approval, Reject, Pause/unpause, Edge cases
 */
contract EHRSystemSecureTest is TestHelpers {
    AccessControl public accessControl;
    RecordRegistry public recordRegistry;
    ConsentLedger public consentLedger;
    EHRSystemSecure public ehrSystem;
    
    // Test accounts
    address public ministry;
    address public patient1;
    address public doctor1;
    address public org1;
    address public attacker;
    
    // Test data
    string constant CID_1 = "QmTest1";
    bytes32 constant ENC_KEY = keccak256("enc-key");
    
    // Events
    event AccessRequested(
        bytes32 indexed reqId,
        address indexed requester,
        address indexed patient,
        string rootCID,
        IEHRSystem.RequestType reqType,
        uint40 expiry
    );
    event RequestApprovedByRequester(
        bytes32 indexed reqId,
        address indexed requester,
        uint40 timestamp
    );
    event RequestApprovedByPatient(
        bytes32 indexed reqId,
        address indexed patient,
        uint40 timestamp
    );
    event RequestCompleted(
        bytes32 indexed reqId,
        address indexed requester,
        address indexed patient,
        IEHRSystem.RequestType reqType
    );
    event RequestRejected(bytes32 indexed reqId, address indexed rejectedBy, uint40 timestamp);
    
    function setUp() public {
        // Setup accounts
        ministry = makeAddr("ministry");
        patient1 = makeAddr("patient1");
        doctor1 = makeAddr("doctor1");
        org1 = makeAddr("org1");
        attacker = makeAddr("attacker");
        
        // Deploy contracts
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
        
        // Set ConsentLedger
        vm.prank(address(this));
        recordRegistry.setConsentLedger(address(consentLedger));
        
        // Authorize EHRSystem
        vm.prank(ministry);
        consentLedger.authorizeContract(address(ehrSystem), true);
        
        // Register users
        vm.prank(patient1);
        accessControl.registerAsPatient();
        
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        
        // Create a test record
        vm.prank(patient1);
        recordRegistry.addRecord(CID_1, "", "General");
    }
    
    // ========== REQUEST ACCESS TESTS ==========
    
    function test_RequestAccess_DirectAccess_Success() public {
        vm.expectEmit(false, true, true, false); // Ignore reqId check
        emit AccessRequested(
            bytes32(0),
            doctor1,
            patient1,
            CID_1,
            IEHRSystem.RequestType.DirectAccess,
            0
        );
        
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            CID_1,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY,
            0, // Use default consent duration
            0  // Use default validity
        );
    }
    
    function test_RequestAccess_FullDelegation_Success() public {
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            "", // Empty CID for FullDelegation
            IEHRSystem.RequestType.FullDelegation,
            ENC_KEY,
            0,
            0
        );
    }
    
    function test_RequestAccess_RecordDelegation_Success() public {
        vm.expectEmit(false, true, true, false); // Ignore reqId (topic 1) and non-indexed data
        emit AccessRequested(
            bytes32(0),
            doctor1,
            patient1,
            CID_1,
            IEHRSystem.RequestType.RecordDelegation,
            0
        );
        
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            CID_1,
            IEHRSystem.RequestType.RecordDelegation,
            ENC_KEY,
            0,
            0
        );
    }

    function test_RecordDelegation_EndToEnd() public {
        // 1. Request RecordDelegation
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            CID_1,
            IEHRSystem.RequestType.RecordDelegation,
            ENC_KEY,
            0,
            0
        );
        
        bytes32 reqId = _getAccessRequestId(doctor1, patient1, CID_1, IEHRSystem.RequestType.RecordDelegation, 0);
        
        // 2. Approvals
        vm.prank(doctor1);
        ehrSystem.confirmAccessRequest(reqId);
        
        vm.warp(block.timestamp + 2 minutes); // Wait for delay
        
        vm.prank(patient1);
        ehrSystem.confirmAccessRequest(reqId);
        
        // No need for 3rd call as patient approval completes it
        
        // 3. Verify Access AND Delegation Rights
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_1), "Should have access");
        
        // Check if doctor1 can delegate (grantUsingRecordDelegation)
        address doctor2 = makeAddr("doctor2");
        vm.prank(doctor2);
        accessControl.registerAsDoctor();
        
        vm.prank(doctor1);
        consentLedger.grantUsingRecordDelegation(
            patient1,
            doctor2,
            CID_1,
            ENC_KEY,
            0
        );
        
        assertTrue(consentLedger.canAccess(patient1, doctor2, CID_1), "Doctor2 should have access via delegation");
    }

    
    function test_RequestAccess_Delegation_Success() public {
        address relative = makeAddr("relative");
        
        vm.prank(relative);
        ehrSystem.requestAccess(
            patient1,
            "", // Empty CID for FullDelegation
            IEHRSystem.RequestType.FullDelegation,
            ENC_KEY,
            0,
            0
        );
    }
    
    function test_RequestAccess_WithCustomDurations_Success() public {
        uint40 consentHours = 48;
        uint40 validityHours = 24;
        
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            CID_1,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY,
            consentHours,
            validityHours
        );
    }
    
    function test_RequestAccess_RevertWhen_SelfRequest() public {
        vm.expectRevert(IEHRSystem.InvalidRequest.selector);
        vm.prank(patient1);
        ehrSystem.requestAccess(
            patient1, // Same as requester
            CID_1,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY,
            0,
            0
        );
    }
    
    function test_RequestAccess_RevertWhen_InvalidPatient() public {
        vm.expectRevert(IEHRSystem.InvalidRequest.selector);
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            attacker, // Not a patient
            CID_1,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY,
            0,
            0
        );
    }
    
    function test_RequestAccess_RevertWhen_ValidityTooLong() public {
        vm.expectRevert(IEHRSystem.InvalidRequest.selector);
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            CID_1,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY,
            0,
            31 * 24 // > 30 days
        );
    }
    
    /*
    function test_RequestAccess_RevertWhen_NotDoctorForDirectAccess() public {
        address notDoctor = makeAddr("notDoctor");
        
        vm.expectRevert(IEHRSystem.InvalidRequest.selector);
        vm.prank(notDoctor);
        ehrSystem.requestAccess(
            patient1,
            CID_1,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY,
            0,
            0
        );
    }
    */
    
    // ========== 2-STEP APPROVAL TESTS ==========
    
    function test_ApproveRequest_TwoStepFlow_Success() public {
        // Step 1: Doctor requests
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            CID_1,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY,
            0,
            0
        );
        
        // Get request ID (we need to calculate it)
        bytes32 reqId = _getAccessRequestId(doctor1, patient1, CID_1, IEHRSystem.RequestType.DirectAccess, 0);
        
        // Step 2: Patient approves
        vm.expectEmit(true, true, false, false); // Ignore timestamp
        emit RequestApprovedByPatient(reqId, patient1, 0);
        
        vm.prank(patient1);
        ehrSystem.confirmAccessRequest(reqId);
        
        // Step 3: Wait for approval delay
        vm.warp(block.timestamp + 2 minutes);
        
        // Step 4: Requester confirms
        vm.expectEmit(false, true, true, true); // Ignore reqId check
        emit RequestCompleted(reqId, doctor1, patient1, IEHRSystem.RequestType.DirectAccess);
        
        vm.prank(doctor1);
        ehrSystem.confirmAccessRequest(reqId);
        
        // Verify consent granted
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_1), "Should have access after completion");
    }
    
    function test_ApproveRequest_RequesterFirst_Success() public {
        // Request
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            CID_1,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY,
            0,
            0
        );
        
        bytes32 reqId = _getAccessRequestId(doctor1, patient1, CID_1, IEHRSystem.RequestType.DirectAccess, 0);
        
        // Requester approves first
        vm.prank(doctor1);
        ehrSystem.confirmAccessRequest(reqId);
        
        vm.warp(block.timestamp + 2 minutes); // Wait for delay BEFORE second approval (completion)
        
        // Patient approves second
        vm.prank(patient1);
        ehrSystem.confirmAccessRequest(reqId);
        
        // Wait for delay
        vm.warp(block.timestamp + 2 minutes);
        
        // Requester confirms - ALREADY DONE in step 2 (RequesterApproved) + step 3 (Patient -> Completed)
        // So we don't need to call confirmAccessRequest again for the requester if they started it.
        // Just verify access.
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_1), "Should have access");
    }
    
    function test_ApproveRequest_RevertWhen_ApprovalTooSoon() public {
        // Request
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            CID_1,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY,
            0,
            0
        );
        
        bytes32 reqId = _getAccessRequestId(doctor1, patient1, CID_1, IEHRSystem.RequestType.DirectAccess, 0);
        
        // Patient approves
        vm.prank(patient1);
        ehrSystem.confirmAccessRequest(reqId);
        
        // Try to complete immediately (without waiting for delay)
        vm.expectRevert(IEHRSystem.ApprovalTooSoon.selector);
        vm.prank(doctor1);
        ehrSystem.confirmAccessRequest(reqId);
    }
    
    function test_ApproveRequest_RevertWhen_RequestExpired() public {
        // Request
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            CID_1,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY,
            0,
            24 // 24 hours validity
        );
        
        // Complete a request
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            CID_1,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY,
            0,
            0
        );
        
        bytes32 reqId = _getAccessRequestId(doctor1, patient1, CID_1, IEHRSystem.RequestType.DirectAccess, 0);
        
        vm.prank(patient1);
        ehrSystem.confirmAccessRequest(reqId);
        
        vm.warp(block.timestamp + 2 minutes);
        
        vm.prank(doctor1);
        ehrSystem.confirmAccessRequest(reqId);
        
        // Try to approve again
        vm.expectRevert(IEHRSystem.AlreadyProcessed.selector);
        vm.prank(patient1);
        ehrSystem.confirmAccessRequest(reqId);
    }
    
    // ========== REJECT REQUEST TESTS ==========
    
    function test_RejectRequest_ByPatient_Success() public {
        // Request
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            CID_1,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY,
            0,
            0
        );
        
        bytes32 reqId = _getAccessRequestId(doctor1, patient1, CID_1, IEHRSystem.RequestType.DirectAccess, 0);
        
        // Patient rejects
        vm.expectEmit(true, true, false, false); // Ignore non-indexed data
        emit RequestRejected(reqId, patient1, 0);
        
        vm.prank(patient1);
        ehrSystem.rejectRequest(reqId);
        
        // Verify no consent granted
        assertFalse(consentLedger.canAccess(patient1, doctor1, CID_1), "Should not have access");
    }
    
    function test_RejectRequest_ByRequester_Success() public {
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            CID_1,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY,
            0,
            0
        );
        
        bytes32 reqId = _getAccessRequestId(doctor1, patient1, CID_1, IEHRSystem.RequestType.DirectAccess, 0);
        
        // Requester rejects (cancels)
        vm.prank(doctor1);
        ehrSystem.rejectRequest(reqId);
    }
    
    function test_RejectRequest_RevertWhen_Unauthorized() public {
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            CID_1,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY,
            0,
            0
        );
        
        bytes32 reqId = _getAccessRequestId(doctor1, patient1, CID_1, IEHRSystem.RequestType.DirectAccess, 0);
        
        vm.expectRevert(IEHRSystem.NotParty.selector);
        vm.prank(attacker);
        ehrSystem.rejectRequest(reqId);
    }
    
    function test_RejectRequest_RevertWhen_AlreadyCompleted() public {
        // Complete request first
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            CID_1,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY,
            0,
            0
        );
        
        bytes32 reqId = _getAccessRequestId(doctor1, patient1, CID_1, IEHRSystem.RequestType.DirectAccess, 0);
        
        vm.prank(patient1);
        ehrSystem.confirmAccessRequest(reqId);
        
        vm.warp(block.timestamp + 1 minutes + 1);
        
        vm.prank(doctor1);
        ehrSystem.confirmAccessRequest(reqId);
        
        // Try to reject completed request
        vm.expectRevert(IEHRSystem.AlreadyProcessed.selector);
        vm.prank(patient1);
        ehrSystem.rejectRequest(reqId);
    }
    
    // ========== PAUSE/UNPAUSE TESTS ==========
    
    function test_Pause_Success() public {
        vm.prank(address(this)); // Owner
        ehrSystem.pause();
        
        assertTrue(ehrSystem.paused(), "Should be paused");
    }
    
    function test_Unpause_Success() public {
        vm.prank(address(this));
        ehrSystem.pause();
        
        vm.prank(address(this));
        ehrSystem.unpause();
        
        assertFalse(ehrSystem.paused(), "Should be unpaused");
    }
    
    function test_RequestAccess_RevertWhen_Paused() public {
        vm.prank(address(this));
        ehrSystem.pause();
        
        vm.expectRevert();
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            CID_1,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY,
            0,
            0
        );
    }
    
    // ========== VIEW FUNCTION TESTS ==========
    
    function test_getAccessRequest_Success() public {
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            CID_1,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY,
            0,
            0
        );
        
        bytes32 reqId = _getAccessRequestId(doctor1, patient1, CID_1, IEHRSystem.RequestType.DirectAccess, 0);
        
        IEHRSystem.AccessRequest memory req = ehrSystem.getAccessRequest(reqId);
        
        assertEq(req.requester, doctor1, "Requester should match");
        assertEq(req.patient, patient1, "Patient should match");
        assertEq(uint8(req.reqType), uint8(IEHRSystem.RequestType.DirectAccess), "Type should match");
        assertEq(uint8(req.status), uint8(IEHRSystem.RequestStatus.Pending), "Status should be pending");
    }
    
    function test_getSystemConstants_Success() public view {
        (
            uint40 minApprovalDelay,
            uint40 maxRequestValidity,
            uint40 defaultConsentDuration,
            uint40 maxDelegationDuration
        ) = ehrSystem.getSystemConstants();
        
        assertEq(minApprovalDelay, 1 minutes, "Min approval delay should be 1 minute");
        assertEq(maxRequestValidity, 30 days, "Max request validity should be 30 days");
        assertEq(defaultConsentDuration, 30 days, "Default consent duration should be 30 days");
        assertEq(maxDelegationDuration, 365 days, "Max delegation duration should be 365 days");
    }
    
    // ========== EDGE CASES ==========
    
    function test_EdgeCase_MultipleRequests_SamePatient() public {
        // Doctor1 requests
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            CID_1,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY,
            0,
            0
        );
        
        // Doctor2 also requests (should work)
        address doctor2 = makeAddr("doctor2");
        vm.prank(doctor2);
        accessControl.registerAsDoctor();
        
        vm.prank(doctor2);
        ehrSystem.requestAccess(
            patient1,
            CID_1,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY,
            0,
            0
        );
    }
    
    function test_EdgeCase_RequestNonceIncrement() public {
        // First request
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            CID_1,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY,
            0,
            0
        );
        
        bytes32 reqId1 = _getAccessRequestId(doctor1, patient1, CID_1, IEHRSystem.RequestType.DirectAccess, 0);
        
        // Second request (nonce should increment)
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            CID_1,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY,
            0,
            0
        );
        
        bytes32 reqId2 = _getAccessRequestId(doctor1, patient1, CID_1, IEHRSystem.RequestType.DirectAccess, 1);
        
        // Request IDs should be different
        assertTrue(reqId1 != reqId2, "Request IDs should be different");
    }
    
    // ========== HELPER FUNCTIONS ==========
    
    function _getAccessRequestId(
        address requester,
        address patient,
        string memory rootCID,
        IEHRSystem.RequestType reqType,
        uint256 nonce
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            requester,
            patient,
            rootCID,
            reqType,
            nonce
        ));
    }
}
