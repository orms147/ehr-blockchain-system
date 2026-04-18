// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AccessControl.sol";
import "../src/RecordRegistry.sol";
import "../src/ConsentLedger.sol";
import "../src/DoctorUpdate.sol";
import "./helpers/TestHelpers.sol";

/// @title ConsentLedgerPhase1FixesTest
/// @notice Covers BUG-A (inherit includeUpdates), BUG-B (doctor sees own update),
/// BUG-C (revoke cascades to record-delegate), BUG-D (emergency doesn't overwrite
/// long-term consent). See `context/18_fix_list.md`.
contract ConsentLedgerPhase1FixesTest is TestHelpers {
    AccessControl public accessControl;
    RecordRegistry public recordRegistry;
    ConsentLedger public consentLedger;
    DoctorUpdate public doctorUpdate;

    address public ministry;
    address public patient;
    address public doctorA;
    address public doctorB;
    address public org;

    bytes32 constant V1 = keccak256("phase1_V1");
    bytes32 constant V2 = keccak256("phase1_V2");
    bytes32 constant V3 = keccak256("phase1_V3");
    bytes32 constant RT = keccak256("checkup");
    bytes32 constant EK = keccak256("aesKey");

    function setUp() public {
        ministry = makeAddr("ministry");
        patient = makeAddr("patient");
        doctorA = makeAddr("doctorA");
        doctorB = makeAddr("doctorB");
        org = makeAddr("org");

        vm.prank(ministry);
        accessControl = new AccessControl(ministry);
        recordRegistry = new RecordRegistry(accessControl);
        vm.prank(ministry);
        consentLedger = new ConsentLedger(ministry);
        doctorUpdate = new DoctorUpdate(accessControl, recordRegistry, consentLedger);

        recordRegistry.setConsentLedger(address(consentLedger));
        recordRegistry.authorizeContract(address(doctorUpdate), true);

        vm.startPrank(ministry);
        consentLedger.authorizeContract(address(this), true);
        consentLedger.authorizeContract(address(doctorUpdate), true);
        consentLedger.setAccessControl(address(accessControl));
        consentLedger.setRecordRegistry(address(recordRegistry));
        vm.stopPrank();

        // Register roles
        vm.prank(patient);
        accessControl.registerAsPatient();

        vm.prank(ministry);
        accessControl.createOrganization("Hospital", org, address(0));

        vm.prank(doctorA);
        accessControl.registerAsDoctor();
        vm.prank(org);
        accessControl.verifyDoctor(doctorA, "Cardiologist");

        vm.prank(doctorB);
        accessControl.registerAsDoctor();
        vm.prank(org);
        accessControl.verifyDoctor(doctorB, "Surgeon");

        // Build V1 → V2 → V3
        vm.prank(patient);
        recordRegistry.addRecord(V1, bytes32(0), RT);
        vm.prank(patient);
        recordRegistry.addRecord(V2, V1, RT);
        vm.prank(patient);
        recordRegistry.addRecord(V3, V2, RT);
    }

    // =================================================================
    // BUG-A: grantUsingRecordDelegation inherits includeUpdates from sender
    // =================================================================

    function test_BugA_DelegateeInheritsIncludeUpdates_True() public {
        // Patient gives Doctor A full chain access with allowDelegate
        consentLedger.grantInternal(patient, doctorA, V2, EK, 0, true, true);

        // A delegates to B via grantUsingRecordDelegation
        vm.prank(doctorA);
        consentLedger.grantUsingRecordDelegation(patient, doctorB, V2, EK, 0);

        // BEFORE fix: B could only see V2. AFTER fix: B sees whole chain.
        assertTrue(consentLedger.canAccess(patient, doctorB, V1), "B must see V1 (chain root)");
        assertTrue(consentLedger.canAccess(patient, doctorB, V2), "B must see V2 (anchor)");
        assertTrue(consentLedger.canAccess(patient, doctorB, V3), "B must see V3 (newer chain version)");
    }

    function test_BugA_DelegateeInheritsIncludeUpdates_False() public {
        // Patient gives Doctor A a read-only consent on V2 but still with allowDelegate
        consentLedger.grantInternal(patient, doctorA, V2, EK, 0, false, true);

        vm.prank(doctorA);
        consentLedger.grantUsingRecordDelegation(patient, doctorB, V2, EK, 0);

        // A is "read-only V2" so B inherits the same restriction.
        assertFalse(consentLedger.canAccess(patient, doctorB, V1), "B must NOT see V1 when sender is read-only");
        assertTrue(consentLedger.canAccess(patient, doctorB, V2), "B must see V2 anchor");
        assertFalse(consentLedger.canAccess(patient, doctorB, V3), "B must NOT see V3 when sender is read-only");
    }

    function test_BugA_OneHopOnly_BCannotReDelegate() public {
        consentLedger.grantInternal(patient, doctorA, V2, EK, 0, true, true);
        vm.prank(doctorA);
        consentLedger.grantUsingRecordDelegation(patient, doctorB, V2, EK, 0);

        // B should NOT be able to delegate further (allowDelegate forced false).
        address doctorC = makeAddr("doctorC");
        vm.prank(doctorC);
        accessControl.registerAsDoctor();
        vm.prank(org);
        accessControl.verifyDoctor(doctorC, "GP");

        vm.prank(doctorB);
        vm.expectRevert();  // Unauthorized: B doesn't have allowDelegate
        consentLedger.grantUsingRecordDelegation(patient, doctorC, V2, EK, 0);
    }

    // =================================================================
    // BUG-C: Patient revoke cascades to record-delegate grantee
    // =================================================================

    function test_BugC_RevokeA_CascadesToB() public {
        consentLedger.grantInternal(patient, doctorA, V2, EK, 0, true, true);

        vm.prank(doctorA);
        consentLedger.grantUsingRecordDelegation(patient, doctorB, V2, EK, 0);

        // Before revoke: B has access
        assertTrue(consentLedger.canAccess(patient, doctorB, V2));

        // Patient revokes A
        vm.prank(patient);
        consentLedger.revoke(doctorA, V2);

        // After revoke: B also loses access via cascade
        assertFalse(consentLedger.canAccess(patient, doctorA, V2), "A direct revoked");
        assertFalse(consentLedger.canAccess(patient, doctorB, V2), "B must lose access after source A revoked");
        assertFalse(consentLedger.canAccess(patient, doctorB, V3), "B loses chain access too");
    }

    function test_BugC_A_ReRequestsWithoutAllowDelegate_BLosesAccess() public {
        consentLedger.grantInternal(patient, doctorA, V2, EK, 0, true, true);
        vm.prank(doctorA);
        consentLedger.grantUsingRecordDelegation(patient, doctorB, V2, EK, 0);
        assertTrue(consentLedger.canAccess(patient, doctorB, V2));

        // Patient re-grants A with allowDelegate=false (downgrade)
        consentLedger.grantInternal(patient, doctorA, V2, EK, 0, true, false);

        // A still has access (normal grant). But B's delegate-sourced consent
        // loses validity because source no longer allowDelegate.
        assertTrue(consentLedger.canAccess(patient, doctorA, V2));
        assertFalse(consentLedger.canAccess(patient, doctorB, V2), "B loses access when source A's allowDelegate is removed");
    }

    function test_BugC_A_ExpiresNaturally_BLosesAccess() public {
        // A has 1-day consent, can delegate
        uint40 aExpiry = uint40(block.timestamp + 1 days);
        consentLedger.grantInternal(patient, doctorA, V2, EK, aExpiry, true, true);

        vm.prank(doctorA);
        consentLedger.grantUsingRecordDelegation(patient, doctorB, V2, EK, aExpiry);
        assertTrue(consentLedger.canAccess(patient, doctorB, V2));

        // Warp past A's expiry
        vm.warp(block.timestamp + 2 days);

        assertFalse(consentLedger.canAccess(patient, doctorA, V2), "A expired");
        assertFalse(consentLedger.canAccess(patient, doctorB, V2), "B expires with source");
    }

    // =================================================================
    // BUG-D: Emergency access does NOT overwrite normal consent
    // =================================================================

    function test_BugD_EmergencyDoesNotOverwriteNormalConsent() public {
        // Patient grants long-term 30-day consent
        uint40 longExpiry = uint40(block.timestamp + 30 days);
        consentLedger.grantInternal(patient, doctorA, V1, EK, longExpiry, true, false);
        assertTrue(consentLedger.canAccess(patient, doctorA, V1));

        // Doctor A triggers 24h emergency (via grantEmergencyInternal directly for test)
        uint40 emergencyExpiry = uint40(block.timestamp + 1 days);
        consentLedger.grantEmergencyInternal(patient, doctorA, V1, emergencyExpiry);

        // Both present: canAccess should still be TRUE
        assertTrue(consentLedger.canAccess(patient, doctorA, V1), "canAccess during both");

        // Warp past emergency but before normal expiry
        vm.warp(block.timestamp + 2 days);

        // Normal 30-day consent MUST still work (this is the core of BUG-D).
        assertTrue(
            consentLedger.canAccess(patient, doctorA, V1),
            "30-day normal consent must survive emergency expiry (BUG-D)"
        );
    }

    function test_BugD_EmergencyWorksAloneWhenNoNormalConsent() public {
        // No prior consent. Doctor triggers emergency.
        uint40 emergencyExpiry = uint40(block.timestamp + 1 days);
        consentLedger.grantEmergencyInternal(patient, doctorA, V1, emergencyExpiry);

        assertTrue(consentLedger.canAccess(patient, doctorA, V1), "Emergency-only access");

        // After emergency expires, no more access
        vm.warp(block.timestamp + 2 days);
        assertFalse(consentLedger.canAccess(patient, doctorA, V1), "Emergency expired, no fallback");
    }

    function test_BugD_EmergencyReachesWholeChain() public {
        // Emergency anchored on V2 — walks to root V1 → covers chain (no includeUpdates gating for emergency).
        consentLedger.grantEmergencyInternal(patient, doctorA, V2, uint40(block.timestamp + 1 days));

        assertTrue(consentLedger.canAccess(patient, doctorA, V1));
        assertTrue(consentLedger.canAccess(patient, doctorA, V2));
        assertTrue(consentLedger.canAccess(patient, doctorA, V3));
    }

    function test_BugD_UnverifiedDoctorStillDeniedDuringEmergency() public {
        address unverified = makeAddr("unverifiedDoctor");
        vm.prank(unverified);
        accessControl.registerAsDoctor();
        // NOT verified by org

        consentLedger.grantEmergencyInternal(patient, unverified, V1, uint40(block.timestamp + 1 days));

        assertFalse(
            consentLedger.canAccess(patient, unverified, V1),
            "Unverified doctors must not access even via emergency (FIX audit #3 preserved)"
        );
    }
}
