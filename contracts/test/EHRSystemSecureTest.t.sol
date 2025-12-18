// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AccessControl.sol";
import "../src/RecordRegistry.sol";
import "../src/ConsentLedger.sol";
import "../src/EHRSystemSecure.sol";
import "./helpers/TestHelpers.sol";

/**
 * @title EHRSystemSecureTest
 * @notice Tests for EHRSystemSecure access request flow
 */
contract EHRSystemSecureTest is TestHelpers {
    AccessControl public accessControl;
    RecordRegistry public recordRegistry;
    ConsentLedger public consentLedger;
    EHRSystemSecure public ehrSystem;
    
    address public ministry;
    address public patient1;
    address public doctor1;
    address public org1;
    address public attacker;
    
    uint256 patientPrivateKey = 0x5678;
    
    // Constants
    bytes32 constant CID_HASH = keccak256("QmCID1");
    bytes32 constant ENC_KEY_HASH = keccak256("encKey");
    
    function setUp() public {
        ministry = makeAddr("ministry");
        patient1 = vm.addr(patientPrivateKey);
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
        
        // Wiring
        vm.prank(ministry);
        consentLedger.authorizeContract(address(ehrSystem), true);
        
        // Setup patient
        vm.prank(patient1);
        accessControl.registerAsPatient();
        
        // Setup verified doctor
        _setupVerifiedDoctor();
    }
    
    function _setupVerifiedDoctor() internal {
        vm.prank(org1);
        accessControl.registerAsOrganization();
        vm.prank(ministry);
        accessControl.verifyOrganization(org1, "Hospital");
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        vm.prank(org1);
        accessControl.verifyDoctor(doctor1, "Cardiologist");
    }
    
    // ========== REQUEST ACCESS ==========
    
    function test_RequestAccess_DirectAccess_Success() public {
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            CID_HASH,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY_HASH,
            7 * 24,  // 7 days consent
            7 * 24   // 7 days validity
        );
        
        // Get the request ID
        uint256 nonce = ehrSystem.getCurrentNonce();
        bytes32 reqId = keccak256(abi.encode(
            doctor1,
            patient1,
            CID_HASH,
            IEHRSystem.RequestType.DirectAccess,
            nonce - 1
        ));
        
        IEHRSystem.AccessRequest memory req = ehrSystem.getAccessRequest(reqId);
        assertEq(req.requester, doctor1, "Requester should be doctor");
        assertEq(req.patient, patient1, "Patient should match");
        assertEq(req.rootCidHash, CID_HASH, "CID hash should match");
        assertTrue(req.status == IEHRSystem.RequestStatus.Pending, "Should be pending");
    }
    
    function test_RequestAccess_RevertWhen_SameAsPatient() public {
        vm.expectRevert(IEHRSystem.InvalidRequest.selector);
        vm.prank(patient1);
        ehrSystem.requestAccess(
            patient1,  // Same as sender
            CID_HASH,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY_HASH, 0, 0
        );
    }
    
    function test_RequestAccess_FullDelegation_MustBeZeroCidHash() public {
        vm.expectRevert(IEHRSystem.InvalidRequest.selector);
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            CID_HASH,  // Non-zero for FullDelegation
            IEHRSystem.RequestType.FullDelegation,
            ENC_KEY_HASH, 0, 0
        );
    }
    
    function test_RequestAccess_FullDelegation_Success() public {
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            bytes32(0),  // Zero for FullDelegation
            IEHRSystem.RequestType.FullDelegation,
            bytes32(0),
            30 * 24,  // 30 days
            7 * 24
        );
        
        // Should succeed
        assertEq(ehrSystem.getCurrentNonce(), 1, "Nonce should be 1");
    }
    
    // ========== CONFIRM ACCESS REQUEST ==========
    
    function test_ConfirmAccessRequest_DualApproval_Success() public {
        // Create request
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1,
            CID_HASH,
            IEHRSystem.RequestType.DirectAccess,
            ENC_KEY_HASH,
            7 * 24,
            7 * 24
        );
        
        bytes32 reqId = _getLatestReqId();
        
        // Doctor confirms first
        vm.prank(doctor1);
        ehrSystem.confirmAccessRequest(reqId);
        
        IEHRSystem.AccessRequest memory req = ehrSystem.getAccessRequest(reqId);
        assertTrue(req.status == IEHRSystem.RequestStatus.RequesterApproved, "Should be RequesterApproved");
        
        // Wait for MIN_APPROVAL_DELAY
        vm.warp(block.timestamp + 2 minutes);
        
        // Patient confirms
        vm.prank(patient1);
        ehrSystem.confirmAccessRequest(reqId);
        
        req = ehrSystem.getAccessRequest(reqId);
        assertTrue(req.status == IEHRSystem.RequestStatus.Completed, "Should be Completed");
        
        // Doctor should now have access
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_HASH), "Doctor should have access");
    }
    
    function test_ConfirmAccessRequest_RevertWhen_TooSoon() public {
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1, CID_HASH, IEHRSystem.RequestType.DirectAccess,
            ENC_KEY_HASH, 7 * 24, 7 * 24
        );
        
        bytes32 reqId = _getLatestReqId();
        
        // Doctor confirms
        vm.prank(doctor1);
        ehrSystem.confirmAccessRequest(reqId);
        
        // Patient tries to confirm immediately
        vm.expectRevert(IEHRSystem.ApprovalTooSoon.selector);
        vm.prank(patient1);
        ehrSystem.confirmAccessRequest(reqId);
    }
    
    function test_ConfirmAccessRequest_RevertWhen_Expired() public {
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1, CID_HASH, IEHRSystem.RequestType.DirectAccess,
            ENC_KEY_HASH, 7 * 24, 1  // 1 hour validity
        );
        
        bytes32 reqId = _getLatestReqId();
        
        // Skip past expiry
        vm.warp(block.timestamp + 2 hours);
        
        vm.expectRevert(IEHRSystem.RequestExpired.selector);
        vm.prank(doctor1);
        ehrSystem.confirmAccessRequest(reqId);
    }
    
    // ========== CONFIRM WITH SIGNATURE ==========
    
    function test_ConfirmAccessRequestWithSignature_Success() public {
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1, CID_HASH, IEHRSystem.RequestType.DirectAccess,
            ENC_KEY_HASH, 7 * 24, 7 * 24
        );
        
        bytes32 reqId = _getLatestReqId();
        
        // Doctor confirms first
        vm.prank(doctor1);
        ehrSystem.confirmAccessRequest(reqId);
        
        // Wait for delay
        vm.warp(block.timestamp + 2 minutes);
        
        // Patient signs confirmation
        uint256 deadline = block.timestamp + 1 hours;
        IEHRSystem.AccessRequest memory req = ehrSystem.getAccessRequest(reqId);
        
        bytes32 structHash = keccak256(abi.encode(
            keccak256("ConfirmRequest(bytes32 reqId,address requester,address patient,bytes32 rootCidHash,uint8 reqType,uint256 deadline)"),
            reqId,
            req.requester,
            req.patient,
            req.rootCidHash,
            uint8(req.reqType),
            deadline
        ));
        
        bytes32 domainSeparator = ehrSystem.DOMAIN_SEPARATOR();
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(patientPrivateKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Anyone can submit (relayer)
        ehrSystem.confirmAccessRequestWithSignature(reqId, deadline, signature);
        
        req = ehrSystem.getAccessRequest(reqId);
        assertTrue(req.status == IEHRSystem.RequestStatus.Completed, "Should be Completed");
    }
    
    // ========== REJECT REQUEST ==========
    
    function test_RejectRequest_ByPatient_Success() public {
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1, CID_HASH, IEHRSystem.RequestType.DirectAccess,
            ENC_KEY_HASH, 7 * 24, 7 * 24
        );
        
        bytes32 reqId = _getLatestReqId();
        
        vm.prank(patient1);
        ehrSystem.rejectRequest(reqId);
        
        IEHRSystem.AccessRequest memory req = ehrSystem.getAccessRequest(reqId);
        assertTrue(req.status == IEHRSystem.RequestStatus.Rejected, "Should be Rejected");
    }
    
    function test_RejectRequest_ByRequester_Success() public {
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1, CID_HASH, IEHRSystem.RequestType.DirectAccess,
            ENC_KEY_HASH, 7 * 24, 7 * 24
        );
        
        bytes32 reqId = _getLatestReqId();
        
        vm.prank(doctor1);
        ehrSystem.rejectRequest(reqId);
        
        IEHRSystem.AccessRequest memory req = ehrSystem.getAccessRequest(reqId);
        assertTrue(req.status == IEHRSystem.RequestStatus.Rejected, "Should be Rejected");
    }
    
    function test_RejectRequest_RevertWhen_NotParty() public {
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1, CID_HASH, IEHRSystem.RequestType.DirectAccess,
            ENC_KEY_HASH, 7 * 24, 7 * 24
        );
        
        bytes32 reqId = _getLatestReqId();
        
        vm.expectRevert(IEHRSystem.NotParty.selector);
        vm.prank(attacker);
        ehrSystem.rejectRequest(reqId);
    }
    
    // ========== HELPERS ==========
    
    function _getLatestReqId() internal view returns (bytes32) {
        uint256 nonce = ehrSystem.getCurrentNonce();
        return keccak256(abi.encode(
            doctor1,
            patient1,
            CID_HASH,
            IEHRSystem.RequestType.DirectAccess,
            nonce - 1
        ));
    }
}
