// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ConsentLedger.sol";
import "./helpers/TestHelpers.sol";

/**
 * @title ConsentLedgerTrustedContact
 * @notice Tests for the Trusted Contact registry (replaces grantEmergencyAccess
 *         flow, dropped 2026-05-04). Patient-signed EIP-712 designation, public
 *         on-chain enumeration so backend cannot inject fake contacts.
 */
contract ConsentLedgerTrustedContactTest is TestHelpers {
    ConsentLedger public consentLedger;

    address public ministry;
    address public patient;
    address public family1;
    address public family2;
    address public attacker;

    uint256 patientPrivateKey = 0xA11CE;

    bytes32 private constant TRUSTED_CONTACT_PERMIT_TYPEHASH = keccak256(
        "TrustedContactPermit(address patient,address contact,string label,bool active,uint256 deadline,uint256 nonce)"
    );

    function setUp() public {
        ministry = makeAddr("ministry");
        patient = vm.addr(patientPrivateKey);
        family1 = makeAddr("family1");
        family2 = makeAddr("family2");
        attacker = makeAddr("attacker");

        vm.prank(ministry);
        consentLedger = new ConsentLedger(ministry);
    }

    // ========== DIRECT (msg.sender = patient) ==========

    function test_SetTrustedContact_Direct_Success() public {
        vm.prank(patient);
        consentLedger.setTrustedContact(family1, "Vo", true);

        assertTrue(consentLedger.isTrustedContact(patient, family1), "active");
        assertEq(consentLedger.trustedContactLabel(patient, family1), "Vo");

        address[] memory contacts = consentLedger.getTrustedContacts(patient);
        assertEq(contacts.length, 1);
        assertEq(contacts[0], family1);
    }

    function test_SetTrustedContact_Direct_Revoke() public {
        vm.prank(patient);
        consentLedger.setTrustedContact(family1, "Vo", true);

        vm.prank(patient);
        consentLedger.setTrustedContact(family1, "Vo", false);

        assertFalse(consentLedger.isTrustedContact(patient, family1));
        assertEq(consentLedger.getTrustedContacts(patient).length, 0);
    }

    function test_SetTrustedContact_Direct_Reactivate_NoDuplicateInList() public {
        vm.startPrank(patient);
        consentLedger.setTrustedContact(family1, "Vo", true);
        consentLedger.setTrustedContact(family1, "Vo", false);
        consentLedger.setTrustedContact(family1, "Vo", true);
        vm.stopPrank();

        // Should appear exactly once in the list (re-activation doesn't push again).
        address[] memory contacts = consentLedger.getTrustedContacts(patient);
        assertEq(contacts.length, 1);
        assertEq(contacts[0], family1);
    }

    function test_SetTrustedContact_Direct_Multiple() public {
        vm.startPrank(patient);
        consentLedger.setTrustedContact(family1, "Vo", true);
        consentLedger.setTrustedContact(family2, "Con trai", true);
        vm.stopPrank();

        address[] memory contacts = consentLedger.getTrustedContacts(patient);
        assertEq(contacts.length, 2);
    }

    function test_SetTrustedContact_RevertWhen_ContactIsZero() public {
        vm.expectRevert(IConsentLedger.Unauthorized.selector);
        vm.prank(patient);
        consentLedger.setTrustedContact(address(0), "Vo", true);
    }

    function test_SetTrustedContact_RevertWhen_ContactIsSelf() public {
        vm.expectRevert(IConsentLedger.Unauthorized.selector);
        vm.prank(patient);
        consentLedger.setTrustedContact(patient, "Self", true);
    }

    // ========== EIP-712 BY-SIG (relayer-friendly) ==========

    function test_SetTrustedContactBySig_Success() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signTrustedContactPermit(patient, family1, "Vo", true, deadline, 0);

        // Anyone can submit. Sender doesn't matter — patient signature gates state mutation.
        vm.prank(attacker);
        consentLedger.setTrustedContactBySig(patient, family1, "Vo", true, deadline, sig);

        assertTrue(consentLedger.isTrustedContact(patient, family1));
        // Nonce bumped.
        assertEq(consentLedger.getNonce(patient), 1);
    }

    function test_SetTrustedContactBySig_RevertWhen_BadSignature() public {
        uint256 deadline = block.timestamp + 1 hours;
        // Sign for family1, but submit for family2 — signature won't recover to patient.
        bytes memory sig = _signTrustedContactPermit(patient, family1, "Vo", true, deadline, 0);

        vm.expectRevert(IConsentLedger.InvalidSignature.selector);
        vm.prank(attacker);
        consentLedger.setTrustedContactBySig(patient, family2, "Vo", true, deadline, sig);
    }

    function test_SetTrustedContactBySig_RevertWhen_AttackerSigns() public {
        uint256 attackerKey = 0xBAD;
        // Attacker signs claiming patient designated family1.
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(abi.encode(
            TRUSTED_CONTACT_PERMIT_TYPEHASH,
            patient,
            family1,
            keccak256(bytes("Vo")),
            true,
            deadline,
            uint256(0)
        ));
        bytes32 digest = _hashTypedDataV4(address(consentLedger), structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attackerKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.expectRevert(IConsentLedger.InvalidSignature.selector);
        consentLedger.setTrustedContactBySig(patient, family1, "Vo", true, deadline, sig);
    }

    function test_SetTrustedContactBySig_RevertWhen_DeadlinePassed() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signTrustedContactPermit(patient, family1, "Vo", true, deadline, 0);

        vm.warp(block.timestamp + 2 hours);

        vm.expectRevert(IConsentLedger.DeadlinePassed.selector);
        consentLedger.setTrustedContactBySig(patient, family1, "Vo", true, deadline, sig);
    }

    function test_SetTrustedContactBySig_RevertWhen_ReplayAfterNonceBump() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signTrustedContactPermit(patient, family1, "Vo", true, deadline, 0);

        // First submission consumes nonce 0.
        consentLedger.setTrustedContactBySig(patient, family1, "Vo", true, deadline, sig);

        // Replay: signature was over nonce 0, but patient nonce is now 1 → invalid.
        vm.expectRevert(IConsentLedger.InvalidSignature.selector);
        consentLedger.setTrustedContactBySig(patient, family1, "Vo", true, deadline, sig);
    }

    function test_SetTrustedContactBySig_Revoke() public {
        uint256 deadline = block.timestamp + 1 hours;

        bytes memory sigSet = _signTrustedContactPermit(patient, family1, "Vo", true, deadline, 0);
        consentLedger.setTrustedContactBySig(patient, family1, "Vo", true, deadline, sigSet);

        bytes memory sigRevoke = _signTrustedContactPermit(patient, family1, "Vo", false, deadline, 1);
        consentLedger.setTrustedContactBySig(patient, family1, "Vo", false, deadline, sigRevoke);

        assertFalse(consentLedger.isTrustedContact(patient, family1));
        assertEq(consentLedger.getTrustedContacts(patient).length, 0);
    }

    // ========== ENUMERATION + EVENTS ==========

    function test_SetTrustedContact_EmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit IConsentLedger.TrustedContactSet(patient, family1, "Vo");

        vm.prank(patient);
        consentLedger.setTrustedContact(family1, "Vo", true);
    }

    function test_RevokeTrustedContact_EmitsEvent() public {
        vm.prank(patient);
        consentLedger.setTrustedContact(family1, "Vo", true);

        vm.expectEmit(true, true, false, true);
        emit IConsentLedger.TrustedContactRevoked(patient, family1);

        vm.prank(patient);
        consentLedger.setTrustedContact(family1, "Vo", false);
    }

    function test_GetTrustedContacts_FiltersRevoked() public {
        vm.startPrank(patient);
        consentLedger.setTrustedContact(family1, "A", true);
        consentLedger.setTrustedContact(family2, "B", true);
        consentLedger.setTrustedContact(family1, "A", false);  // Revoke family1
        vm.stopPrank();

        address[] memory contacts = consentLedger.getTrustedContacts(patient);
        assertEq(contacts.length, 1);
        assertEq(contacts[0], family2);
    }

    // ========== TRUSTED CONTACT === CAN_ACCESS (Footgun #2 fix 2026-06-01) ==========

    function test_CanAccess_TrustedContact_BypassesNormalConsent() public {
        // Footgun #2 fix (2026-06-01): TC = always-on emergency family access.
        // Patient explicitly designates them; semantic = "I trust this person
        // unconditionally to read my records during emergencies". canAccess
        // must return true without any consent grant or KeyShare row.
        //
        // Replaces older assumption that TC implied off-chain key delivery
        // only — that design forced backend to bypass canAccess for TC,
        // which broke the on-chain authority invariant.
        vm.prank(patient);
        consentLedger.setTrustedContact(family1, "Vo", true);

        bytes32 someCid = keccak256("V1");
        assertTrue(consentLedger.canAccess(patient, family1, someCid),
            "Trusted Contact must auto-pass canAccess");
    }

    function test_CanAccess_TrustedContact_RevokedLosesAccess() public {
        vm.prank(patient);
        consentLedger.setTrustedContact(family1, "Vo", true);

        bytes32 someCid = keccak256("V1");
        assertTrue(consentLedger.canAccess(patient, family1, someCid));

        // Revoke TC → access removed atomically on-chain.
        vm.prank(patient);
        consentLedger.setTrustedContact(family1, "Vo", false);

        assertFalse(consentLedger.canAccess(patient, family1, someCid),
            "Revoked TC must lose canAccess");
    }

    function test_CanAccess_NonTrustedContact_StillRequiresConsent() public {
        // Sanity: non-TC random wallet without consent still gets refused.
        bytes32 someCid = keccak256("V1");
        assertFalse(consentLedger.canAccess(patient, attacker, someCid),
            "Non-TC wallet without consent must be refused");
    }

    // ========== HELPERS ==========

    function _signTrustedContactPermit(
        address patient_,
        address contact,
        string memory label,
        bool active,
        uint256 deadline,
        uint256 nonce
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(
            TRUSTED_CONTACT_PERMIT_TYPEHASH,
            patient_,
            contact,
            keccak256(bytes(label)),
            active,
            deadline,
            nonce
        ));
        bytes32 digest = _hashTypedDataV4(address(consentLedger), structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(patientPrivateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _hashTypedDataV4(address verifyingContract, bytes32 structHash) internal view returns (bytes32) {
        bytes32 domainSeparator = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("EHR Consent Ledger")),
            keccak256(bytes("2")),
            block.chainid,
            verifyingContract
        ));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }
}
