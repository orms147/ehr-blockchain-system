// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AccessControl.sol";
import "../src/ConsentLedger.sol";
import "./helpers/TestHelpers.sol";

/**
 * @title ConsentLedgerTest
 * @notice Tests for ConsentLedger with hash-based API and EIP-712
 */
contract ConsentLedgerTest is TestHelpers {
    ConsentLedger public consentLedger;
    AccessControl public accessControl;
    
    address public ministry;
    address public patient1;
    address public doctor1;
    address public doctor2;
    address public attacker;
    
    uint256 patientPrivateKey = 0x1234;
    
    // Constants
    bytes32 constant CID_HASH = keccak256("QmCID1");
    bytes32 constant ENC_KEY_HASH = keccak256("encKey");
    uint40 constant ONE_WEEK = 7 days;
    uint40 constant FOREVER = type(uint40).max;
    
    function setUp() public {
        ministry = makeAddr("ministry");
        patient1 = vm.addr(patientPrivateKey);
        doctor1 = makeAddr("doctor1");
        doctor2 = makeAddr("doctor2");
        attacker = makeAddr("attacker");
        
        // Deploy
        vm.prank(ministry);
        accessControl = new AccessControl(ministry);
        
        vm.prank(ministry);
        consentLedger = new ConsentLedger(ministry);
        
        // Authorize ministry to call grantInternal
        vm.prank(ministry);
        consentLedger.authorizeContract(ministry, true);
    }
    
    // ========== GRANT INTERNAL ==========
    
    function test_GrantInternal_Success() public {
        uint40 expireAt = uint40(block.timestamp) + ONE_WEEK;
        
        vm.prank(ministry);
        consentLedger.grantInternal(
            patient1,
            doctor1,
            CID_HASH,
            ENC_KEY_HASH,
            expireAt,
            true,  // includeUpdates
            false  // allowDelegate
        );
        
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_HASH), "Doctor should have access");
        
        IConsentLedger.Consent memory c = consentLedger.getConsent(patient1, doctor1, CID_HASH);
        assertEq(c.patient, patient1, "Patient should match");
        assertEq(c.grantee, doctor1, "Grantee should match");
        assertTrue(c.active, "Should be active");
        assertTrue(c.includeUpdates, "Should include updates");
    }
    
    function test_GrantInternal_RevertWhen_NotAuthorized() public {
        vm.expectRevert(IConsentLedger.Unauthorized.selector);
        vm.prank(attacker);
        consentLedger.grantInternal(
            patient1, doctor1, CID_HASH, ENC_KEY_HASH, 
            uint40(block.timestamp) + ONE_WEEK, true, false
        );
    }
    
    function test_GrantInternal_RevertWhen_EmptyCID() public {
        vm.expectRevert(IConsentLedger.EmptyCID.selector);
        vm.prank(ministry);
        consentLedger.grantInternal(
            patient1, doctor1, bytes32(0), ENC_KEY_HASH,
            uint40(block.timestamp) + ONE_WEEK, true, false
        );
    }
    
    function test_GrantInternal_Forever() public {
        vm.prank(ministry);
        consentLedger.grantInternal(
            patient1, doctor1, CID_HASH, ENC_KEY_HASH,
            0,  // expireAt = 0 means forever
            true, false
        );
        
        IConsentLedger.Consent memory c = consentLedger.getConsent(patient1, doctor1, CID_HASH);
        assertEq(c.expireAt, FOREVER, "Should be forever");
    }
    
    // ========== CAN ACCESS ==========
    
    function test_CanAccess_OwnerAlwaysHasAccess() public view {
        // Patient can always access their own records
        assertTrue(consentLedger.canAccess(patient1, patient1, CID_HASH), "Patient should access own record");
    }
    
    function test_CanAccess_ExpiredConsent() public {
        uint40 expireAt = uint40(block.timestamp) + ONE_WEEK;
        
        vm.prank(ministry);
        consentLedger.grantInternal(
            patient1, doctor1, CID_HASH, ENC_KEY_HASH,
            expireAt, true, false
        );
        
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_HASH), "Should have access before expiry");
        
        // Skip past expiry
        vm.warp(expireAt + 1);
        
        assertFalse(consentLedger.canAccess(patient1, doctor1, CID_HASH), "Should NOT have access after expiry");
    }
    
    function test_CanAccess_NoConsent() public view {
        assertFalse(consentLedger.canAccess(patient1, doctor1, CID_HASH), "Should NOT have access without consent");
    }
    
    // ========== REVOKE ==========
    
    function test_Revoke_Success() public {
        // Grant consent
        vm.prank(ministry);
        consentLedger.grantInternal(
            patient1, doctor1, CID_HASH, ENC_KEY_HASH,
            0, true, false
        );
        
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_HASH), "Should have access");
        
        // Patient revokes
        vm.prank(patient1);
        consentLedger.revoke(doctor1, CID_HASH);
        
        assertFalse(consentLedger.canAccess(patient1, doctor1, CID_HASH), "Should NOT have access after revoke");
    }
    
    function test_Revoke_RevertWhen_NotPatient() public {
        vm.prank(ministry);
        consentLedger.grantInternal(
            patient1, doctor1, CID_HASH, ENC_KEY_HASH,
            0, true, false
        );
        
        vm.expectRevert(IConsentLedger.Unauthorized.selector);
        vm.prank(attacker);
        consentLedger.revoke(doctor1, CID_HASH);
    }
    
    // ========== DELEGATION ==========
    
    function test_GrantDelegation_Success() public {
        vm.prank(patient1);
        consentLedger.grantDelegation(doctor1, 30 days, true);
        
        IConsentLedger.Delegation memory d = consentLedger.getDelegation(patient1, doctor1);
        assertTrue(d.active, "Should be active");
        assertTrue(d.allowSubDelegate, "Should allow sub-delegate");
        assertEq(d.expiresAt, uint40(block.timestamp) + 30 days, "Expiry should match");
    }
    
    function test_GrantDelegation_RevertWhen_TooShort() public {
        vm.expectRevert(IConsentLedger.InvalidDuration.selector);
        vm.prank(patient1);
        consentLedger.grantDelegation(doctor1, 1 hours, false);  // Less than MIN_DURATION
    }
    
    function test_GrantUsingDelegation_Success() public {
        // Patient grants delegation to doctor1
        vm.prank(patient1);
        consentLedger.grantDelegation(doctor1, 30 days, false);
        
        // Doctor1 uses delegation to grant access to doctor2
        vm.prank(doctor1);
        consentLedger.grantUsingDelegation(
            patient1,
            doctor2,
            CID_HASH,
            ENC_KEY_HASH,
            uint40(block.timestamp) + ONE_WEEK
        );
        
        assertTrue(consentLedger.canAccess(patient1, doctor2, CID_HASH), "Doctor2 should have access");
    }
    
    function test_GrantUsingDelegation_RevertWhen_NoDelegation() public {
        vm.expectRevert(IConsentLedger.NoActiveDelegation.selector);
        vm.prank(doctor1);
        consentLedger.grantUsingDelegation(
            patient1, doctor2, CID_HASH, ENC_KEY_HASH,
            uint40(block.timestamp) + ONE_WEEK
        );
    }
    
    function test_RevokeDelegation_Success() public {
        vm.prank(patient1);
        consentLedger.grantDelegation(doctor1, 30 days, false);
        
        vm.prank(patient1);
        consentLedger.revokeDelegation(doctor1);
        
        IConsentLedger.Delegation memory d = consentLedger.getDelegation(patient1, doctor1);
        assertFalse(d.active, "Should be inactive");
    }
    
    // ========== PER-RECORD DELEGATION ==========
    
    function test_GrantUsingRecordDelegation_Success() public {
        // Grant consent with allowDelegate = true
        vm.prank(ministry);
        consentLedger.grantInternal(
            patient1, doctor1, CID_HASH, ENC_KEY_HASH,
            0, true, true  // allowDelegate = true
        );
        
        // Doctor1 delegates to doctor2
        vm.prank(doctor1);
        consentLedger.grantUsingRecordDelegation(
            patient1, doctor2, CID_HASH, ENC_KEY_HASH,
            uint40(block.timestamp) + ONE_WEEK
        );
        
        assertTrue(consentLedger.canAccess(patient1, doctor2, CID_HASH), "Doctor2 should have access");
    }
    
    function test_GrantUsingRecordDelegation_RevertWhen_NotAllowed() public {
        // Grant consent with allowDelegate = false
        vm.prank(ministry);
        consentLedger.grantInternal(
            patient1, doctor1, CID_HASH, ENC_KEY_HASH,
            0, true, false  // allowDelegate = false
        );
        
        vm.expectRevert(IConsentLedger.Unauthorized.selector);
        vm.prank(doctor1);
        consentLedger.grantUsingRecordDelegation(
            patient1, doctor2, CID_HASH, ENC_KEY_HASH,
            uint40(block.timestamp) + ONE_WEEK
        );
    }
    
    // ========== EIP-712 GRANT BY SIGNATURE ==========
    
    function test_GrantBySig_Success() public {
        uint40 expireAt = uint40(block.timestamp) + ONE_WEEK;
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = consentLedger.getNonce(patient1);
        
        // Build EIP-712 signature
        bytes32 structHash = keccak256(abi.encode(
            keccak256("ConsentPermit(address patient,address grantee,bytes32 rootCidHash,bytes32 encKeyHash,uint256 expireAt,bool includeUpdates,bool allowDelegate,uint256 deadline,uint256 nonce)"),
            patient1,
            doctor1,
            CID_HASH,
            ENC_KEY_HASH,
            expireAt,
            true,
            false,
            deadline,
            nonce
        ));
        
        bytes32 domainSeparator = consentLedger.DOMAIN_SEPARATOR();
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(patientPrivateKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Execute
        consentLedger.grantBySig(
            patient1, doctor1, CID_HASH, ENC_KEY_HASH,
            expireAt, true, false, deadline, signature
        );
        
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_HASH), "Should have access");
        assertEq(consentLedger.getNonce(patient1), nonce + 1, "Nonce should increment");
    }
    
    function test_GrantBySig_RevertWhen_DeadlinePassed() public {
        uint256 deadline = block.timestamp - 1;  // Already passed
        
        bytes memory fakeSignature = new bytes(65);
        
        vm.expectRevert(IConsentLedger.DeadlinePassed.selector);
        consentLedger.grantBySig(
            patient1, doctor1, CID_HASH, ENC_KEY_HASH,
            uint40(block.timestamp) + ONE_WEEK, true, false, deadline, fakeSignature
        );
    }
}
