// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ConsentLedger.sol";
import "./helpers/TestHelpers.sol";

/**
 * @title ConsentLedgerTest
 * @notice Comprehensive tests for ConsentLedger contract
 * Coverage: Grant consent, EIP-712 signatures, Revoke, Delegation, Expiry, Edge cases
 */
contract ConsentLedgerTest is TestHelpers {
    ConsentLedger public consentLedger;
    
    // Test accounts
    address public admin;
    address public patient1;
    address public patient2;
    address public doctor1;
    address public doctor2;
    address public relative;
    address public authorizedContract;
    address public attacker;
    
    // Private keys for signing
    uint256 public patient1PrivateKey = 0xA11CE;
    uint256 public patient2PrivateKey = 0xB0B;
    
    // Test data
    string constant CID_1 = "QmTest1";
    string constant CID_2 = "QmTest2";
    bytes32 constant ENC_KEY_1 = keccak256("enc-key-1");
    bytes32 constant ENC_KEY_2 = keccak256("enc-key-2");
    
    // EIP-712 constants
    bytes32 public DOMAIN_SEPARATOR;
    bytes32 public constant CONSENT_PERMIT_TYPEHASH = keccak256(
        "ConsentPermit(address patient,address grantee,string rootCID,bytes32 encKeyHash,uint256 expireAt,bool includeUpdates,bool allowDelegate,uint256 deadline,uint256 nonce)"
    );
    bytes32 public constant DELEGATION_PERMIT_TYPEHASH = keccak256(
        "DelegationPermit(address patient,address delegatee,uint40 duration,bool allowSubDelegate,uint256 deadline,uint256 nonce)"
    );
    
    // Events
    event ConsentGranted(
        address indexed patient,
        address indexed grantee,
        bytes32 indexed rootCidHash,
        uint40 expireAt,
        bool allowDelegate
    );
    event ConsentRevoked(
        address indexed patient,
        address indexed grantee,
        bytes32 indexed rootCidHash,
        uint40 revokedAt
    );
    event DelegationGranted(
        address indexed patient,
        address indexed delegatee,
        uint40 expiresAt,
        bool allowSubDelegate
    );
    event DelegationRevoked(address indexed patient, address indexed delegatee);
    event AuthorizedContract(address indexed contractAddress, bool allowed);
    
    function setUp() public {
        // Setup accounts
        admin = makeAddr("admin");
        patient1 = vm.addr(patient1PrivateKey);
        patient2 = vm.addr(patient2PrivateKey);
        doctor1 = makeAddr("doctor1");
        doctor2 = makeAddr("doctor2");
        relative = makeAddr("relative");
        authorizedContract = makeAddr("authorizedContract");
        attacker = makeAddr("attacker");
        
        // Deploy ConsentLedger
        vm.prank(admin);
        consentLedger = new ConsentLedger(admin);
        
        // Calculate domain separator manually
        // EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("EHR Consent Ledger")),
                keccak256(bytes("1")),
                block.chainid,
                address(consentLedger)
            )
        );
        
        // Authorize test contract
        vm.prank(admin);
        consentLedger.authorizeContract(authorizedContract, true);
    }
    
    // ========== AUTHORIZATION TESTS ==========
    
    function test_Constructor_Success() public view {
        assertEq(consentLedger.admin(), admin, "Admin should be set");
        assertTrue(consentLedger.authorizedContracts(admin), "Admin should be authorized");
    }
    
    function test_AuthorizeContract_Success() public {
        vm.expectEmit(true, false, false, true);
        emit AuthorizedContract(doctor1, true);
        
        vm.prank(admin);
        consentLedger.authorizeContract(doctor1, true);
        
        assertTrue(consentLedger.authorizedContracts(doctor1), "Should be authorized");
    }
    
    function test_AuthorizeContract_RevertWhen_NotAdmin() public {
        vm.expectRevert(IConsentLedger.Unauthorized.selector);
        vm.prank(attacker);
        consentLedger.authorizeContract(doctor1, true);
    }
    
    function test_AuthorizeContract_RevertWhen_ZeroAddress() public {
        vm.expectRevert(IConsentLedger.Unauthorized.selector);
        vm.prank(admin);
        consentLedger.authorizeContract(address(0), true);
    }
    
    // ========== GRANT CONSENT INTERNAL TESTS ==========
    
    function test_GrantInternal_Success() public {
        uint40 expireAt = uint40(block.timestamp + 30 days);
        bytes32 expectedCidHash = keccak256(bytes(CID_1));
        
        vm.expectEmit(true, true, true, false);
        emit ConsentGranted(patient1, doctor1, expectedCidHash, expireAt, false);
        
        vm.prank(authorizedContract);
        consentLedger.grantInternal(
            patient1,
            doctor1,
            CID_1,
            ENC_KEY_1,
            expireAt,
            true,
            false
        );
        
        // Verify consent
        IConsentLedger.Consent memory consent = consentLedger.getConsent(patient1, doctor1, CID_1);
        assertEq(consent.patient, patient1, "Patient should match");
        assertEq(consent.grantee, doctor1, "Grantee should match");
        assertEq(consent.rootCidHash, expectedCidHash, "CID hash should match");
        assertEq(consent.encKeyHash, ENC_KEY_1, "Enc key should match");
        assertTrue(consent.active, "Should be active");
        assertTrue(consent.includeUpdates, "Should include updates");
        assertFalse(consent.allowDelegate, "Should not allow delegate");
    }
    
    function test_GrantInternal_Forever_Success() public {
        vm.prank(authorizedContract);
        consentLedger.grantInternal(
            patient1,
            doctor1,
            CID_1,
            ENC_KEY_1,
            0, // 0 = forever
            false,
            false
        );
        
        IConsentLedger.Consent memory consent = consentLedger.getConsent(patient1, doctor1, CID_1);
        assertEq(consent.expireAt, type(uint40).max, "Should be forever");
    }
    
    function test_GrantInternal_RevertWhen_Unauthorized() public {
        vm.expectRevert(IConsentLedger.Unauthorized.selector);
        vm.prank(attacker);
        consentLedger.grantInternal(
            patient1,
            doctor1,
            CID_1,
            ENC_KEY_1,
            uint40(block.timestamp + 30 days),
            false,
            false
        );
    }
    
    function test_GrantInternal_RevertWhen_ZeroGrantee() public {
        vm.expectRevert(IConsentLedger.Unauthorized.selector);
        vm.prank(authorizedContract);
        consentLedger.grantInternal(
            patient1,
            address(0),
            CID_1,
            ENC_KEY_1,
            uint40(block.timestamp + 30 days),
            false,
            false
        );
    }
    
    function test_GrantInternal_RevertWhen_EmptyCID() public {
        vm.expectRevert(IConsentLedger.EmptyCID.selector);
        vm.prank(authorizedContract);
        consentLedger.grantInternal(
            patient1,
            doctor1,
            "",
            ENC_KEY_1,
            uint40(block.timestamp + 30 days),
            false,
            false
        );
    }
    
    function test_GrantInternal_RevertWhen_ExpiredTimestamp() public {
        vm.warp(1000); // Advance time to avoid 0 underflow
        vm.expectRevert(IConsentLedger.InvalidExpire.selector);
        vm.prank(authorizedContract);
        consentLedger.grantInternal(
            patient1,
            doctor1,
            CID_1,
            ENC_KEY_1,
            uint40(block.timestamp - 1), // Past timestamp
            false,
            false
        );
    }
    
    // ========== GRANT BY SIGNATURE TESTS ==========
    
    function test_GrantBySig_Success() public {
        uint40 expireAt = uint40(block.timestamp + 30 days);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = consentLedger.getNonce(patient1);
        
        // Generate signature
        bytes memory signature = signConsentPermit(
            patient1PrivateKey,
            patient1,
            doctor1,
            CID_1,
            ENC_KEY_1,
            expireAt,
            true,
            false,
            nonce,
            deadline,
            DOMAIN_SEPARATOR,
            CONSENT_PERMIT_TYPEHASH
        );
        
        vm.expectEmit(true, true, true, false);
        emit ConsentGranted(patient1, doctor1, keccak256(bytes(CID_1)), expireAt, false);
        
        consentLedger.grantBySig(
            patient1,
            doctor1,
            CID_1,
            ENC_KEY_1,
            expireAt,
            true,
            false,
            deadline,
            signature
        );
        
        // Verify consent
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_1), "Should have access");
        
        // Verify nonce incremented
        assertEq(consentLedger.getNonce(patient1), nonce + 1, "Nonce should increment");
    }
    
    function test_GrantBySig_RevertWhen_DeadlinePassed() public {
        uint40 expireAt = uint40(block.timestamp + 30 days);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = consentLedger.getNonce(patient1);
        
        bytes memory signature = signConsentPermit(
            patient1PrivateKey,
            patient1,
            doctor1,
            CID_1,
            ENC_KEY_1,
            expireAt,
            true,
            false,
            nonce,
            deadline,
            DOMAIN_SEPARATOR,
            CONSENT_PERMIT_TYPEHASH
        );
        
        // Warp past deadline
        vm.warp(deadline + 1);
        
        vm.expectRevert(IConsentLedger.DeadlinePassed.selector);
        consentLedger.grantBySig(
            patient1,
            doctor1,
            CID_1,
            ENC_KEY_1,
            expireAt,
            true,
            false,
            deadline,
            signature
        );
    }
    
    function test_GrantBySig_RevertWhen_InvalidSignature() public {
        uint40 expireAt = uint40(block.timestamp + 30 days);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = consentLedger.getNonce(patient1);
        
        // Sign with wrong private key
        bytes memory signature = signConsentPermit(
            patient2PrivateKey, // Wrong key!
            patient1,
            doctor1,
            CID_1,
            ENC_KEY_1,
            expireAt,
            true,
            false,
            nonce,
            deadline,
            DOMAIN_SEPARATOR,
            CONSENT_PERMIT_TYPEHASH
        );
        
        vm.expectRevert(IConsentLedger.InvalidSignature.selector);
        consentLedger.grantBySig(
            patient1,
            doctor1,
            CID_1,
            ENC_KEY_1,
            expireAt,
            true,
            false,
            deadline,
            signature
        );
    }
    
    function test_GrantBySig_RevertWhen_WrongNonce() public {
        uint40 expireAt = uint40(block.timestamp + 30 days);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 wrongNonce = 999; // Wrong nonce
        
        bytes memory signature = signConsentPermit(
            patient1PrivateKey,
            patient1,
            doctor1,
            CID_1,
            ENC_KEY_1,
            expireAt,
            true,
            false,
            wrongNonce,
            deadline,
            DOMAIN_SEPARATOR,
            CONSENT_PERMIT_TYPEHASH
        );
        
        vm.expectRevert(IConsentLedger.InvalidSignature.selector);
        consentLedger.grantBySig(
            patient1,
            doctor1,
            CID_1,
            ENC_KEY_1,
            expireAt,
            true,
            false,
            deadline,
            signature
        );
    }
    
    // ========== REVOKE CONSENT TESTS ==========
    
    function test_Revoke_Success() public {
        // Grant consent first
        vm.prank(authorizedContract);
        consentLedger.grantInternal(
            patient1,
            doctor1,
            CID_1,
            ENC_KEY_1,
            uint40(block.timestamp + 30 days),
            false,
            false
        );
        
        // Revoke
        vm.expectEmit(true, true, true, false);
        emit ConsentRevoked(patient1, doctor1, keccak256(bytes(CID_1)), 0);
        
        vm.prank(patient1);
        consentLedger.revoke(doctor1, CID_1);
        
        // Verify revoked
        assertFalse(consentLedger.canAccess(patient1, doctor1, CID_1), "Should not have access");
        
        IConsentLedger.Consent memory consent = consentLedger.getConsent(patient1, doctor1, CID_1);
        assertFalse(consent.active, "Should be inactive");
    }
    
    function test_Revoke_RevertWhen_NotPatient() public {
        vm.prank(authorizedContract);
        consentLedger.grantInternal(
            patient1,
            doctor1,
            CID_1,
            ENC_KEY_1,
            uint40(block.timestamp + 30 days),
            false,
            false
        );
        
        vm.expectRevert(IConsentLedger.Unauthorized.selector);
        vm.prank(attacker);
        consentLedger.revoke(doctor1, CID_1);
    }
    
    function test_Revoke_RevertWhen_NotActive() public {
        vm.expectRevert(IConsentLedger.Unauthorized.selector);
        vm.prank(patient1);
        consentLedger.revoke(doctor1, CID_1);
    }
    
    // ========== DELEGATION TESTS ==========
    
    function test_GrantDelegation_Success() public {
        uint40 duration = 7 days;
        uint40 expectedExpiry = uint40(block.timestamp) + duration;
        
        vm.expectEmit(true, true, false, true);
        emit DelegationGranted(patient1, relative, expectedExpiry, false);
        
        vm.prank(patient1);
        consentLedger.grantDelegation(relative, duration, false);
        
        // Verify delegation
        IConsentLedger.Delegation memory delegation = consentLedger.getDelegation(patient1, relative);
        assertEq(delegation.delegatee, relative, "Delegatee should match");
        assertEq(delegation.expiresAt, expectedExpiry, "Expiry should match");
        assertFalse(delegation.allowSubDelegate, "Should not allow sub-delegate");
        assertTrue(delegation.active, "Should be active");
    }
    
    function test_GrantDelegation_WithSubDelegate_Success() public {
        vm.prank(patient1);
        consentLedger.grantDelegation(relative, 7 days, true);
        
        IConsentLedger.Delegation memory delegation = consentLedger.getDelegation(patient1, relative);
        assertTrue(delegation.allowSubDelegate, "Should allow sub-delegate");
    }
    
    function test_GrantDelegation_RevertWhen_DurationTooShort() public {
        vm.expectRevert(IConsentLedger.InvalidDuration.selector);
        vm.prank(patient1);
        consentLedger.grantDelegation(relative, 1 hours, false); // < 1 day
    }
    
    function test_GrantDelegation_RevertWhen_DurationTooLong() public {
        vm.expectRevert(IConsentLedger.InvalidDuration.selector);
        vm.prank(patient1);
        consentLedger.grantDelegation(relative, 6 * 365 days, false); // > 5 years
    }
    
    function test_DelegateAuthorityBySig_Success() public {
        uint40 duration = 30 days;
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = consentLedger.getNonce(patient1);
        
        bytes memory signature = signDelegationPermit(
            patient1PrivateKey,
            patient1,
            relative,
            duration,
            false,
            nonce,
            deadline,
            DOMAIN_SEPARATOR,
            DELEGATION_PERMIT_TYPEHASH
        );
        
        vm.prank(patient1);
        consentLedger.delegateAuthorityBySig(
            patient1, // Added patient address
            relative,
            duration,
            false,
            deadline,
            signature
        );
        
        // Verify delegation
        IConsentLedger.Delegation memory delegation = consentLedger.getDelegation(patient1, relative);
        assertTrue(delegation.active, "Should be active");
        
        // Verify nonce incremented
        assertEq(consentLedger.getNonce(patient1), nonce + 1, "Nonce should increment");
    }
    
    function test_RevokeDelegation_Success() public {
        // Grant delegation first
        vm.prank(patient1);
        consentLedger.grantDelegation(relative, 7 days, false);
        
        // Revoke
        vm.expectEmit(true, true, false, false);
        emit DelegationRevoked(patient1, relative);
        
        vm.prank(patient1);
        consentLedger.revokeDelegation(relative);
        
        // Verify revoked
        IConsentLedger.Delegation memory delegation = consentLedger.getDelegation(patient1, relative);
        assertFalse(delegation.active, "Should be inactive");
    }
    
    function test_RevokeDelegation_RevertWhen_NotActive() public {
        vm.expectRevert(IConsentLedger.NoActiveDelegation.selector);
        vm.prank(patient1);
        consentLedger.revokeDelegation(relative);
    }
    
    function test_GrantUsingDelegation_RevertWhen_DelegationExpired() public {
        // Grant delegation
        vm.prank(patient1);
        consentLedger.grantDelegation(relative, 7 days, false);
        
        // Warp past expiry
        vm.warp(block.timestamp + 8 days);
        
        vm.expectRevert(IConsentLedger.NoActiveDelegation.selector);
        vm.prank(relative);
        consentLedger.grantUsingDelegation(
            patient1,
            doctor1,
            CID_1,
            ENC_KEY_1,
            uint40(block.timestamp + 1 days)
        );
    }

    function test_GrantUsingRecordDelegation_Success() public {
        // 1. Patient grants access to doctor1 with allowDelegate = true
        vm.prank(authorizedContract);
        consentLedger.grantInternal(
            patient1,
            doctor1,
            CID_1,
            ENC_KEY_1,
            uint40(block.timestamp + 30 days),
            false,
            true // allowDelegate = true
        );

        // 2. Doctor1 grants access to doctor2 using record delegation
        vm.prank(doctor1);
        consentLedger.grantUsingRecordDelegation(
            patient1,
            doctor2,
            CID_1,
            ENC_KEY_1,
            uint40(block.timestamp + 7 days)
        );

        // 3. Verify access
        assertTrue(consentLedger.canAccess(patient1, doctor2, CID_1));
    }

    function test_GrantUsingRecordDelegation_RevertWhen_NoDelegateRight() public {
        // 1. Patient grants access to doctor1 with allowDelegate = FALSE
        vm.prank(authorizedContract);
        consentLedger.grantInternal(
            patient1,
            doctor1,
            CID_1,
            ENC_KEY_1,
            uint40(block.timestamp + 30 days),
            false,
            false // allowDelegate = false
        );

        // 2. Doctor1 tries to grant access to doctor2
        vm.expectRevert(IConsentLedger.Unauthorized.selector);
        vm.prank(doctor1);
        consentLedger.grantUsingRecordDelegation(
            patient1,
            doctor2,
            CID_1,
            ENC_KEY_1,
            uint40(block.timestamp + 7 days)
        );
    }

    function test_GrantUsingRecordDelegation_RevertWhen_ConsentExpired() public {
        // 1. Patient grants access to doctor1 (valid for 1 day)
        uint40 expireAt = uint40(block.timestamp + 1 days);
        
        vm.prank(authorizedContract);
        consentLedger.grantInternal(
            patient1,
            doctor1,
            CID_1,
            ENC_KEY_1,
            expireAt,
            false,
            true
        );

        // 2. Warp past expiry
        vm.warp(expireAt + 1);

        // 3. Doctor1 tries to grant access
        vm.expectRevert(IConsentLedger.Unauthorized.selector);
        vm.prank(doctor1);
        consentLedger.grantUsingRecordDelegation(
            patient1,
            doctor2,
            CID_1,
            ENC_KEY_1,
            uint40(block.timestamp + 7 days)
        );
    }
    
    // ========== CAN ACCESS TESTS ==========
    
    function test_CanAccess_Owner_Success() public view {
        // Patient can always access their own records
        assertTrue(consentLedger.canAccess(patient1, patient1, CID_1), "Owner should have access");
    }
    
    function test_CanAccess_WithConsent_Success() public {
        vm.prank(authorizedContract);
        consentLedger.grantInternal(
            patient1,
            doctor1,
            CID_1,
            ENC_KEY_1,
            uint40(block.timestamp + 30 days),
            false,
            false
        );
        
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_1), "Should have access with consent");
    }
    
    function test_CanAccess_NoConsent_False() public view {
        assertFalse(consentLedger.canAccess(patient1, doctor1, CID_1), "Should not have access without consent");
    }
    
    function test_CanAccess_Revoked_False() public {
        vm.prank(authorizedContract);
        consentLedger.grantInternal(
            patient1,
            doctor1,
            CID_1,
            ENC_KEY_1,
            uint40(block.timestamp + 30 days),
            false,
            false
        );
        
        vm.prank(patient1);
        consentLedger.revoke(doctor1, CID_1);
        
        assertFalse(consentLedger.canAccess(patient1, doctor1, CID_1), "Should not have access after revoke");
    }
    
    function test_CanAccess_Expired_False() public {
        uint40 expireAt = uint40(block.timestamp + 1 days);
        
        vm.prank(authorizedContract);
        consentLedger.grantInternal(
            patient1,
            doctor1,
            CID_1,
            ENC_KEY_1,
            expireAt,
            false,
            false
        );
        
        // Warp past expiry
        vm.warp(expireAt + 1);
        
        assertFalse(consentLedger.canAccess(patient1, doctor1, CID_1), "Should not have access after expiry");
    }
    
    // ========== EDGE CASES ==========
    
    function test_EdgeCase_MultipleConsents_DifferentCIDs() public {
        vm.startPrank(authorizedContract);
        consentLedger.grantInternal(patient1, doctor1, CID_1, ENC_KEY_1, 0, false, false);
        consentLedger.grantInternal(patient1, doctor1, CID_2, ENC_KEY_2, 0, false, false);
        vm.stopPrank();
        
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_1), "Should have access to CID_1");
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_2), "Should have access to CID_2");
    }
    
    function test_EdgeCase_MultipleConsents_DifferentGrantees() public {
        vm.startPrank(authorizedContract);
        consentLedger.grantInternal(patient1, doctor1, CID_1, ENC_KEY_1, 0, false, false);
        consentLedger.grantInternal(patient1, doctor2, CID_1, ENC_KEY_1, 0, false, false);
        vm.stopPrank();
        
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_1), "Doctor1 should have access");
        assertTrue(consentLedger.canAccess(patient1, doctor2, CID_1), "Doctor2 should have access");
    }
    
    function test_EdgeCase_OverwriteConsent() public {
        // Grant consent
        vm.prank(authorizedContract);
        consentLedger.grantInternal(
            patient1,
            doctor1,
            CID_1,
            ENC_KEY_1,
            uint40(block.timestamp + 1 days),
            false,
            false
        );
        
        // Grant again with different params (should overwrite)
        vm.prank(authorizedContract);
        consentLedger.grantInternal(
            patient1,
            doctor1,
            CID_1,
            ENC_KEY_2, // Different key
            uint40(block.timestamp + 7 days), // Different expiry
            true, // Different includeUpdates
            true // Different allowDelegate
        );
        
        IConsentLedger.Consent memory consent = consentLedger.getConsent(patient1, doctor1, CID_1);
        assertEq(consent.encKeyHash, ENC_KEY_2, "Should use new enc key");
        assertTrue(consent.includeUpdates, "Should include updates");
        assertTrue(consent.allowDelegate, "Should allow delegate");
    }
    
    function test_EdgeCase_GetNonce() public view {
        uint256 nonce = consentLedger.getNonce(patient1);
        assertEq(nonce, 0, "Initial nonce should be 0");
    }
}
