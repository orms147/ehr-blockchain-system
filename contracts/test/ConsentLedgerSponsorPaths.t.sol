// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ConsentLedger.sol";

/**
 * @title ConsentLedgerSponsorPaths
 * @notice Tests for the SPONSOR / RELAYER / EIP-712-relayer paths that had 0
 *         coverage (revokeFor, delegateAuthorityBySig, authorizeSponsor,
 *         grantDelegationInternal). Each function: success + rejected branch.
 */
contract ConsentLedgerSponsorPathsTest is Test {
    ConsentLedger public consentLedger;

    address public ministry;        // = admin
    address public sponsor;
    address public patient;
    address public doctor;          // consent grantee
    address public delegatee;
    address public attacker;

    uint256 patientPrivateKey = 0xA11CE;
    uint256 attackerPrivateKey = 0xBAD;

    bytes32 constant CID = keccak256("record-V1");
    bytes32 constant ENC = keccak256("enc-key-hash");

    bytes32 private constant DELEGATION_PERMIT_TYPEHASH = keccak256(
        "DelegationPermit(address patient,address delegatee,uint40 duration,bool allowSubDelegate,uint256 deadline,uint256 nonce)"
    );

    function setUp() public {
        ministry = makeAddr("ministry");
        sponsor = makeAddr("sponsor");
        patient = vm.addr(patientPrivateKey);
        doctor = makeAddr("doctor");
        delegatee = makeAddr("delegatee");
        attacker = makeAddr("attacker");

        vm.prank(ministry);
        consentLedger = new ConsentLedger(ministry); // admin = ministry
    }

    function _grantConsentAsAdmin() internal {
        // admin (ministry) is authorizedContracts[admin]=true => can call grantInternal
        vm.prank(ministry);
        consentLedger.grantInternal(patient, doctor, CID, ENC, 0, false);
    }

    // ===================== authorizeSponsor =====================

    function test_AuthorizeSponsor_Success() public {
        vm.expectEmit(true, false, false, true);
        emit IConsentLedger.SponsorAuthorized(sponsor, true);

        vm.prank(ministry);
        consentLedger.authorizeSponsor(sponsor, true);

        assertTrue(consentLedger.authorizedSponsors(sponsor), "sponsor must be whitelisted");
    }

    function test_AuthorizeSponsor_RevertWhen_NotAdmin() public {
        vm.expectRevert(IConsentLedger.Unauthorized.selector);
        vm.prank(attacker);
        consentLedger.authorizeSponsor(sponsor, true);
    }

    // ===================== revokeFor =====================

    function test_RevokeFor_Success() public {
        _grantConsentAsAdmin();
        vm.prank(ministry);
        consentLedger.authorizeSponsor(sponsor, true);

        // sanity: consent active before
        assertTrue(consentLedger.getConsent(patient, doctor, CID).active, "consent active pre-revoke");

        vm.expectEmit(true, true, true, false); // ignore timestamp data field
        emit IConsentLedger.ConsentRevoked(patient, doctor, CID, 0);

        vm.prank(sponsor);
        consentLedger.revokeFor(patient, doctor, CID);

        assertFalse(consentLedger.getConsent(patient, doctor, CID).active, "consent must be inactive post-revoke");
    }

    // The branch the GVHD asked about by name: non-sponsor caller -> NotSponsor.
    function test_RevokeFor_RevertWhen_CallerNotSponsor() public {
        _grantConsentAsAdmin();

        vm.expectRevert(IConsentLedger.NotSponsor.selector);
        vm.prank(attacker); // not in authorizedSponsors
        consentLedger.revokeFor(patient, doctor, CID);
    }

    // ===================== delegateAuthorityBySig (EIP-712 relayer) =====================

    function test_DelegateAuthorityBySig_Success() public {
        uint40 duration = 30 days;
        uint256 deadline = block.timestamp + 1 hours;
        uint40 expectedExp = uint40(block.timestamp + duration);
        bytes memory sig = _signDelegationPermit(patient, delegatee, duration, true, deadline, 0);

        // anyone (sponsor/relayer) can submit; patient signature gates state
        vm.prank(sponsor);
        consentLedger.delegateAuthorityBySig(patient, delegatee, duration, true, deadline, sig);

        IConsentLedger.Delegation memory d = consentLedger.getDelegation(patient, delegatee);
        assertTrue(d.active, "delegation active");
        assertTrue(d.allowSubDelegate, "allowSubDelegate true");
        assertEq(d.expiresAt, expectedExp, "expiry");
        assertEq(consentLedger.getNonce(patient), 1, "nonce bumped");
    }

    function test_DelegateAuthorityBySig_RevertWhen_BadSignature() public {
        uint40 duration = 30 days;
        uint256 deadline = block.timestamp + 1 hours;
        // sign for `delegatee` but submit for `attacker` -> recovered signer != patient
        bytes memory sig = _signDelegationPermit(patient, delegatee, duration, true, deadline, 0);

        vm.expectRevert(IConsentLedger.InvalidSignature.selector);
        consentLedger.delegateAuthorityBySig(patient, attacker, duration, true, deadline, sig);
    }

    function test_DelegateAuthorityBySig_RevertWhen_DeadlinePassed() public {
        uint40 duration = 30 days;
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signDelegationPermit(patient, delegatee, duration, true, deadline, 0);

        vm.warp(block.timestamp + 2 hours);

        vm.expectRevert(IConsentLedger.DeadlinePassed.selector);
        consentLedger.delegateAuthorityBySig(patient, delegatee, duration, true, deadline, sig);
    }

    // ===================== grantDelegationInternal (onlyAuthorized) =====================

    function test_GrantDelegationInternal_Success() public {
        uint40 duration = 30 days;
        uint40 expectedExp = uint40(block.timestamp + duration);

        vm.prank(ministry); // authorized
        consentLedger.grantDelegationInternal(patient, delegatee, duration, false);

        IConsentLedger.Delegation memory d = consentLedger.getDelegation(patient, delegatee);
        assertTrue(d.active, "delegation active");
        assertFalse(d.allowSubDelegate, "allowSubDelegate false");
        assertEq(d.expiresAt, expectedExp, "expiry");
    }

    function test_GrantDelegationInternal_RevertWhen_NotAuthorized() public {
        vm.expectRevert(IConsentLedger.Unauthorized.selector);
        vm.prank(attacker); // not authorizedContracts, not admin
        consentLedger.grantDelegationInternal(patient, delegatee, 30 days, false);
    }

    // ===================== helpers =====================

    function _signDelegationPermit(
        address patient_,
        address delegatee_,
        uint40 duration,
        bool allowSubDelegate,
        uint256 deadline,
        uint256 nonce
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(
            DELEGATION_PERMIT_TYPEHASH,
            patient_,
            delegatee_,
            duration,
            allowSubDelegate,
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
