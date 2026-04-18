// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AccessControl.sol";
import "../src/RecordRegistry.sol";
import "../src/ConsentLedger.sol";
import "./helpers/TestHelpers.sol";

/// @title ConsentLedgerRootWalkTest
/// @notice Exercises the root-normalized consent semantics.
/// A single grant at any version covers the whole chain when includeUpdates=true.
/// includeUpdates=false restricts access to exactly the anchor cidHash.
contract ConsentLedgerRootWalkTest is TestHelpers {
    AccessControl public accessControl;
    RecordRegistry public recordRegistry;
    ConsentLedger public consentLedger;

    address public ministry;
    address public patient;
    address public doctor;
    address public org;

    bytes32 constant V1 = keccak256("V1_root");
    bytes32 constant V2 = keccak256("V2_update");
    bytes32 constant V3 = keccak256("V3_update");
    bytes32 constant UNRELATED = keccak256("unrelated_record");
    bytes32 constant RT = keccak256("checkup");
    bytes32 constant EK = keccak256("aesKey");

    function setUp() public {
        ministry = makeAddr("ministry");
        patient = makeAddr("patient");
        doctor = makeAddr("doctor");
        org = makeAddr("org");

        // Deploy
        vm.prank(ministry);
        accessControl = new AccessControl(ministry);
        recordRegistry = new RecordRegistry(accessControl);
        vm.prank(ministry);
        consentLedger = new ConsentLedger(ministry);

        // Wire
        recordRegistry.setConsentLedger(address(consentLedger));
        vm.prank(ministry);
        consentLedger.authorizeContract(address(this), true);
        vm.prank(ministry);
        consentLedger.setAccessControl(address(accessControl));
        vm.prank(ministry);
        consentLedger.setRecordRegistry(address(recordRegistry));

        // Register roles
        vm.prank(patient);
        accessControl.registerAsPatient();

        // New flow: Ministry creates org directly. registerAsOrganization is deprecated.
        vm.prank(ministry);
        accessControl.createOrganization("Hospital", org, address(0));

        vm.prank(doctor);
        accessControl.registerAsDoctor();
        vm.prank(org);
        accessControl.verifyDoctor(doctor, "Cardiologist");

        // Build chain V1 (root) → V2 → V3
        vm.prank(patient);
        recordRegistry.addRecord(V1, bytes32(0), RT);
        vm.prank(patient);
        recordRegistry.addRecord(V2, V1, RT);
        vm.prank(patient);
        recordRegistry.addRecord(V3, V2, RT);
    }

    // ======== Root walking ========

    function test_WalkToRoot_SetsStorageAtRoot() public {
        // Grant at V2 → storage must be at V1 (canonical root)
        consentLedger.grantInternal(patient, doctor, V2, EK, 0, true, false);

        IConsentLedger.Consent memory c = consentLedger.getConsent(patient, doctor, V1);
        assertEq(c.rootCidHash, V1, "rootCidHash must normalize to V1");
        assertEq(c.anchorCidHash, V2, "anchorCidHash must preserve input V2");
        assertTrue(c.active);
    }

    function test_GetConsent_FindsByAnyChildCidHash() public {
        consentLedger.grantInternal(patient, doctor, V2, EK, 0, true, false);

        IConsentLedger.Consent memory viaV1 = consentLedger.getConsent(patient, doctor, V1);
        IConsentLedger.Consent memory viaV2 = consentLedger.getConsent(patient, doctor, V2);
        IConsentLedger.Consent memory viaV3 = consentLedger.getConsent(patient, doctor, V3);

        assertEq(viaV1.rootCidHash, V1);
        assertEq(viaV2.rootCidHash, V1);
        assertEq(viaV3.rootCidHash, V1);
    }

    // ======== canAccess with includeUpdates=true ========

    function test_CanAccess_IncludeUpdatesTrue_CoversEntireChain() public {
        consentLedger.grantInternal(patient, doctor, V2, EK, 0, true, false);

        assertTrue(consentLedger.canAccess(patient, doctor, V1), "V1 should be accessible");
        assertTrue(consentLedger.canAccess(patient, doctor, V2), "V2 should be accessible");
        assertTrue(consentLedger.canAccess(patient, doctor, V3), "V3 should be accessible");
    }

    function test_CanAccess_DoesNotLeakToUnrelatedRecord() public {
        vm.prank(patient);
        recordRegistry.addRecord(UNRELATED, bytes32(0), RT);

        consentLedger.grantInternal(patient, doctor, V2, EK, 0, true, false);

        assertFalse(
            consentLedger.canAccess(patient, doctor, UNRELATED),
            "Consent in chain A must not grant access to record B"
        );
    }

    // ======== canAccess with includeUpdates=false (Chỉ đọc enforcement) ========

    function test_CanAccess_IncludeUpdatesFalse_OnlyAnchorAccessible() public {
        // "Chỉ đọc" anchored on V2
        consentLedger.grantInternal(patient, doctor, V2, EK, 0, false, false);

        assertFalse(
            consentLedger.canAccess(patient, doctor, V1),
            "V1 must NOT be accessible when includeUpdates=false and anchor=V2"
        );
        assertTrue(
            consentLedger.canAccess(patient, doctor, V2),
            "V2 (anchor) must be accessible"
        );
        assertFalse(
            consentLedger.canAccess(patient, doctor, V3),
            "V3 must NOT be accessible when includeUpdates=false and anchor=V2"
        );
    }

    function test_CanAccess_IncludeUpdatesFalse_AnchorIsRoot() public {
        // Read-only at root V1 is the simplest case
        consentLedger.grantInternal(patient, doctor, V1, EK, 0, false, false);

        assertTrue(consentLedger.canAccess(patient, doctor, V1));
        assertFalse(consentLedger.canAccess(patient, doctor, V2));
        assertFalse(consentLedger.canAccess(patient, doctor, V3));
    }

    // ======== Revoke walks too ========

    function test_Revoke_FromAnyVersion_InvalidatesWholeChain() public {
        consentLedger.grantInternal(patient, doctor, V2, EK, 0, true, false);
        assertTrue(consentLedger.canAccess(patient, doctor, V3));

        // Patient revokes by passing V3 (descendant) — contract walks to root V1
        vm.prank(patient);
        consentLedger.revoke(doctor, V3);

        assertFalse(consentLedger.canAccess(patient, doctor, V1));
        assertFalse(consentLedger.canAccess(patient, doctor, V2));
        assertFalse(consentLedger.canAccess(patient, doctor, V3));
    }

    // ======== Depth cap fail-safe ========

    function test_WalkToRoot_DepthCap_NoUnderflow() public {
        // Build a chain beyond MAX_RECORD_DEPTH (20). Walk stops at the cap and
        // treats the reached node as the effective root — this is a fail-safe
        // and we just assert that canAccess doesn't revert on excessive depth.
        bytes32 prev = V3;
        bytes32 tail;
        for (uint256 i = 0; i < 25; i++) {
            tail = keccak256(abi.encode("deep", i));
            vm.prank(patient);
            recordRegistry.addRecord(tail, prev, RT);
            prev = tail;
        }
        consentLedger.grantInternal(patient, doctor, V1, EK, 0, true, false);
        // canAccess on a very deep descendant must not revert
        bool ok = consentLedger.canAccess(patient, doctor, tail);
        // With the depth cap, the walk may stop before reaching V1. That's
        // acceptable — we only assert the call doesn't revert and terminates.
        ok; // silence warning
    }

    // ======== Unverified doctor still gated ========

    function test_CanAccess_UnverifiedDoctor_StillDenied() public {
        address unverified = makeAddr("unverifiedDoctor");
        vm.prank(unverified);
        accessControl.registerAsDoctor();
        // NOT verified by org

        consentLedger.grantInternal(patient, unverified, V2, EK, 0, true, false);

        assertFalse(
            consentLedger.canAccess(patient, unverified, V1),
            "Unverified doctor must not pass canAccess even with root-walked consent"
        );
    }
}
