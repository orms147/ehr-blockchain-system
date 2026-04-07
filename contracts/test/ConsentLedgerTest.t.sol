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
    address public doctor3;
    address public doctor4;
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
        doctor3 = makeAddr("doctor3");
        doctor4 = makeAddr("doctor4");
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
            uint40(block.timestamp) + ONE_WEEK,
            false,
            false
        );

        assertTrue(consentLedger.canAccess(patient1, doctor2, CID_HASH), "Doctor2 should have access");
    }

    function test_GrantUsingDelegation_RevertWhen_NoDelegation() public {
        vm.expectRevert(IConsentLedger.NoActiveDelegation.selector);
        vm.prank(doctor1);
        consentLedger.grantUsingDelegation(
            patient1, doctor2, CID_HASH, ENC_KEY_HASH,
            uint40(block.timestamp) + ONE_WEEK,
            false,
            false
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

    // ========== CHAIN DELEGATION (Option B — sub-delegate + cascade revoke) ==========

    /// @dev Helper: patient1 bulk-delegates to doctor1 with allowSubDelegate=true.
    function _patientDelegatesToDoctor1(bool allowSubDelegate_) internal {
        vm.prank(patient1);
        consentLedger.grantDelegation(doctor1, 30 days, allowSubDelegate_);
    }

    /// Test 1: happy path — A (with allowSubDelegate=true) sub-delegates to B.
    function test_SubDelegate_Success() public {
        _patientDelegatesToDoctor1(true);

        vm.prank(doctor1);
        consentLedger.subDelegate(patient1, doctor2, 7 days, false);

        IConsentLedger.Delegation memory d = consentLedger.getDelegation(patient1, doctor2);
        assertTrue(d.active, "doctor2 delegation should be active");
        assertFalse(d.allowSubDelegate, "doctor2 should not allow further sub-delegation");
        assertEq(
            consentLedger.delegationParent(patient1, doctor2),
            doctor1,
            "doctor1 should be recorded as parent"
        );
    }

    /// Test 2: A without allowSubDelegate cannot sub-delegate.
    function test_SubDelegate_RevertWhen_ParentNotAllowSubDelegate() public {
        _patientDelegatesToDoctor1(false);

        vm.expectRevert(IConsentLedger.SubDelegateNotAllowed.selector);
        vm.prank(doctor1);
        consentLedger.subDelegate(patient1, doctor2, 7 days, false);
    }

    /// Test 3: A with no delegation at all cannot sub-delegate.
    function test_SubDelegate_RevertWhen_NoActiveDelegation() public {
        vm.expectRevert(IConsentLedger.NoActiveDelegation.selector);
        vm.prank(doctor1);
        consentLedger.subDelegate(patient1, doctor2, 7 days, false);
    }

    /// Test 4: sub-delegation expiry is capped to the parent's expiry.
    function test_SubDelegate_CapsExpiryToParent() public {
        // patient delegates 10 days to doctor1
        vm.prank(patient1);
        consentLedger.grantDelegation(doctor1, 10 days, true);

        // doctor1 tries to sub-delegate 30 days to doctor2
        vm.prank(doctor1);
        consentLedger.subDelegate(patient1, doctor2, 30 days, false);

        IConsentLedger.Delegation memory parent = consentLedger.getDelegation(patient1, doctor1);
        IConsentLedger.Delegation memory child = consentLedger.getDelegation(patient1, doctor2);

        assertEq(child.expiresAt, parent.expiresAt, "child expiry must match parent expiry");
    }

    /// Test 5: grantUsingDelegation caps consent expiry to the caller's delegation expiry.
    function test_GrantUsingDelegation_CapsExpiryToDelegation() public {
        // doctor1 gets a 10-day delegation
        vm.prank(patient1);
        consentLedger.grantDelegation(doctor1, 10 days, false);

        IConsentLedger.Delegation memory d = consentLedger.getDelegation(patient1, doctor1);

        // doctor1 tries to grant access to doctor2 with a 60-day expiry
        vm.prank(doctor1);
        consentLedger.grantUsingDelegation(
            patient1,
            doctor2,
            CID_HASH,
            ENC_KEY_HASH,
            uint40(block.timestamp) + 60 days,
            false,
            false
        );

        IConsentLedger.Consent memory c = consentLedger.getConsent(patient1, doctor2, CID_HASH);
        assertEq(c.expireAt, d.expiresAt, "consent expireAt must be capped to delegation expiry");
    }

    /// Test 6: patient revokes A → consents granted by A OR by A's sub-delegate B both fail canAccess.
    function test_CanAccess_CascadeRevokeViaPatient() public {
        _patientDelegatesToDoctor1(true);

        // doctor1 sub-delegates to doctor2
        vm.prank(doctor1);
        consentLedger.subDelegate(patient1, doctor2, 7 days, false);

        // doctor1 grants consent to doctor3 (via delegation)
        vm.prank(doctor1);
        consentLedger.grantUsingDelegation(
            patient1, doctor3, CID_HASH, ENC_KEY_HASH,
            uint40(block.timestamp) + ONE_WEEK, false, false
        );

        // doctor2 grants consent to doctor4 (via sub-delegation)
        bytes32 cid4 = keccak256("QmCID4");
        vm.prank(doctor2);
        consentLedger.grantUsingDelegation(
            patient1, doctor4, cid4, ENC_KEY_HASH,
            uint40(block.timestamp) + ONE_WEEK, false, false
        );

        assertTrue(consentLedger.canAccess(patient1, doctor3, CID_HASH), "doctor3 should have access before revoke");
        assertTrue(consentLedger.canAccess(patient1, doctor4, cid4), "doctor4 should have access before revoke");

        // patient revokes doctor1 (root of the chain)
        vm.prank(patient1);
        consentLedger.revokeDelegation(doctor1);

        assertFalse(
            consentLedger.canAccess(patient1, doctor3, CID_HASH),
            "doctor3 consent must fail after root revoke (direct descendant)"
        );
        assertFalse(
            consentLedger.canAccess(patient1, doctor4, cid4),
            "doctor4 consent must fail after root revoke (2-hop descendant)"
        );
    }

    /// Test 7: parent revokes its sub-delegate B → B's consents fail, but A's own consents still work.
    function test_CanAccess_CascadeRevokeViaParent() public {
        _patientDelegatesToDoctor1(true);

        // doctor1 sub-delegates to doctor2
        vm.prank(doctor1);
        consentLedger.subDelegate(patient1, doctor2, 7 days, false);

        // doctor1 grants to doctor3 (directly)
        vm.prank(doctor1);
        consentLedger.grantUsingDelegation(
            patient1, doctor3, CID_HASH, ENC_KEY_HASH,
            uint40(block.timestamp) + ONE_WEEK, false, false
        );

        // doctor2 grants to doctor4 (via sub-delegation)
        bytes32 cid4 = keccak256("QmCID4");
        vm.prank(doctor2);
        consentLedger.grantUsingDelegation(
            patient1, doctor4, cid4, ENC_KEY_HASH,
            uint40(block.timestamp) + ONE_WEEK, false, false
        );

        // doctor1 revokes doctor2's sub-delegation
        vm.prank(doctor1);
        consentLedger.revokeSubDelegation(patient1, doctor2);

        assertFalse(
            consentLedger.canAccess(patient1, doctor4, cid4),
            "doctor4 consent must fail after doctor2 sub-delegation revoked"
        );
        assertTrue(
            consentLedger.canAccess(patient1, doctor3, CID_HASH),
            "doctor3 consent must still work (doctor1's own grant)"
        );
    }

    /// Test 8: 3-level chain A→B→C; revoke at root → leaf's grant fails via canAccess walk.
    function test_CanAccess_MultiHop3Levels() public {
        // patient → doctor1 (root, allowSubDelegate=true)
        _patientDelegatesToDoctor1(true);

        // doctor1 → doctor2 (allowSubDelegate=true, so doctor2 can further sub-delegate)
        vm.prank(doctor1);
        consentLedger.subDelegate(patient1, doctor2, 20 days, true);

        // doctor2 → doctor3 (leaf, cannot further sub-delegate)
        vm.prank(doctor2);
        consentLedger.subDelegate(patient1, doctor3, 10 days, false);

        // doctor3 grants consent to doctor4 via grantUsingDelegation
        bytes32 cid4 = keccak256("QmCID4");
        vm.prank(doctor3);
        consentLedger.grantUsingDelegation(
            patient1, doctor4, cid4, ENC_KEY_HASH,
            uint40(block.timestamp) + ONE_WEEK, false, false
        );

        assertTrue(
            consentLedger.canAccess(patient1, doctor4, cid4),
            "doctor4 should have access through 3-hop chain"
        );

        // patient revokes doctor1 — should cascade through 3 hops and kill doctor4's grant
        vm.prank(patient1);
        consentLedger.revokeDelegation(doctor1);

        assertFalse(
            consentLedger.canAccess(patient1, doctor4, cid4),
            "doctor4 consent must fail after root revoke cascades through 3 hops"
        );
    }
}
