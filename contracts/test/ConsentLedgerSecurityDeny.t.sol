// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ConsentLedger.sol";

/**
 * @title ConsentLedgerSecurityDeny
 * @notice EIP-712 deny branches for grantBySig that were missing:
 *         domain binding (chainId / verifyingContract / version), replay,
 *         wrong nonce, and wrong signer. Each isolates ONE thing: the signed
 *         message (params + nonce + deadline) stays valid; only the tested
 *         field differs, so the revert is InvalidSignature because the
 *         recovered signer no longer equals `patient`.
 */
contract ConsentLedgerSecurityDenyTest is Test {
    ConsentLedger public consentLedger;

    address public ministry;
    address public patient;
    address public doctor;
    address public attacker;

    uint256 patientPrivateKey = 0xA11CE;
    uint256 attackerPrivateKey = 0xBAD;

    bytes32 constant CID = keccak256("record-V1");
    bytes32 constant ENC = keccak256("enc-key-hash");

    bytes32 private constant CONSENT_PERMIT_TYPEHASH = keccak256(
        "ConsentPermit(address patient,address grantee,bytes32 rootCidHash,bytes32 encKeyHash,uint256 expireAt,bool allowDelegate,uint256 deadline,uint256 nonce)"
    );

    function setUp() public {
        ministry = makeAddr("ministry");
        patient = vm.addr(patientPrivateKey);
        doctor = makeAddr("doctor");
        attacker = makeAddr("attacker");

        vm.prank(ministry);
        consentLedger = new ConsentLedger(ministry);
    }

    function _consentStructHash(uint40 expireAt, uint256 deadline, uint256 nonce)
        internal view returns (bytes32)
    {
        return keccak256(abi.encode(
            CONSENT_PERMIT_TYPEHASH, patient, doctor, CID, ENC, expireAt, false, deadline, nonce
        ));
    }

    function _digest(
        string memory name,
        string memory version,
        uint256 chainId,
        address verifyingContract,
        bytes32 structHash
    ) internal pure returns (bytes32) {
        bytes32 ds = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes(name)),
            keccak256(bytes(version)),
            chainId,
            verifyingContract
        ));
        return keccak256(abi.encodePacked("\x19\x01", ds, structHash));
    }

    function _sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    // ---- baseline: correct domain succeeds (so the deny tests below isolate the bug) ----
    function test_GrantBySig_CorrectDomain_Success() public {
        uint40 expireAt = uint40(block.timestamp + 30 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 sh = _consentStructHash(expireAt, deadline, consentLedger.getNonce(patient));
        bytes memory sig = _sign(patientPrivateKey,
            _digest("EHR Consent Ledger", "2", block.chainid, address(consentLedger), sh));

        consentLedger.grantBySig(patient, doctor, CID, ENC, expireAt, false, deadline, sig);
        assertEq(consentLedger.getNonce(patient), 1, "nonce bumped on valid grant");
    }

    // ---- P1: domain binding ----
    function test_GrantBySig_RevertWhen_WrongChainId() public {
        uint40 expireAt = uint40(block.timestamp + 30 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 sh = _consentStructHash(expireAt, deadline, consentLedger.getNonce(patient));
        // only chainId differs
        bytes memory sig = _sign(patientPrivateKey,
            _digest("EHR Consent Ledger", "2", block.chainid + 1, address(consentLedger), sh));

        vm.expectRevert(IConsentLedger.InvalidSignature.selector);
        consentLedger.grantBySig(patient, doctor, CID, ENC, expireAt, false, deadline, sig);
    }

    function test_GrantBySig_RevertWhen_WrongVerifyingContract() public {
        uint40 expireAt = uint40(block.timestamp + 30 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 sh = _consentStructHash(expireAt, deadline, consentLedger.getNonce(patient));
        // only verifyingContract differs
        bytes memory sig = _sign(patientPrivateKey,
            _digest("EHR Consent Ledger", "2", block.chainid, address(0xdEaD), sh));

        vm.expectRevert(IConsentLedger.InvalidSignature.selector);
        consentLedger.grantBySig(patient, doctor, CID, ENC, expireAt, false, deadline, sig);
    }

    function test_GrantBySig_RevertWhen_WrongDomainVersion() public {
        uint40 expireAt = uint40(block.timestamp + 30 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 sh = _consentStructHash(expireAt, deadline, consentLedger.getNonce(patient));
        // only version differs ("1" instead of "2")
        bytes memory sig = _sign(patientPrivateKey,
            _digest("EHR Consent Ledger", "1", block.chainid, address(consentLedger), sh));

        vm.expectRevert(IConsentLedger.InvalidSignature.selector);
        consentLedger.grantBySig(patient, doctor, CID, ENC, expireAt, false, deadline, sig);
    }

    // ---- P2: replay + wrong nonce ----
    function test_GrantBySig_RevertWhen_ReplaySameSignature() public {
        uint40 expireAt = uint40(block.timestamp + 30 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 sh = _consentStructHash(expireAt, deadline, 0); // nonce 0
        bytes memory sig = _sign(patientPrivateKey,
            _digest("EHR Consent Ledger", "2", block.chainid, address(consentLedger), sh));

        // first submission consumes nonce 0
        consentLedger.grantBySig(patient, doctor, CID, ENC, expireAt, false, deadline, sig);

        // replay: nonce is now 1, signature was over 0 -> recovered signer != patient
        vm.expectRevert(IConsentLedger.InvalidSignature.selector);
        consentLedger.grantBySig(patient, doctor, CID, ENC, expireAt, false, deadline, sig);
    }

    function test_GrantBySig_RevertWhen_WrongNonce() public {
        uint40 expireAt = uint40(block.timestamp + 30 days);
        uint256 deadline = block.timestamp + 1 hours;
        // sign over a future nonce (current + 5)
        bytes32 sh = _consentStructHash(expireAt, deadline, consentLedger.getNonce(patient) + 5);
        bytes memory sig = _sign(patientPrivateKey,
            _digest("EHR Consent Ledger", "2", block.chainid, address(consentLedger), sh));

        vm.expectRevert(IConsentLedger.InvalidSignature.selector);
        consentLedger.grantBySig(patient, doctor, CID, ENC, expireAt, false, deadline, sig);
    }

    // ---- A2: wrong signer ----
    function test_GrantBySig_RevertWhen_SignerNotPatient() public {
        uint40 expireAt = uint40(block.timestamp + 30 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 sh = _consentStructHash(expireAt, deadline, consentLedger.getNonce(patient));
        // correct domain, but signed by attacker (not patient)
        bytes memory sig = _sign(attackerPrivateKey,
            _digest("EHR Consent Ledger", "2", block.chainid, address(consentLedger), sh));

        vm.expectRevert(IConsentLedger.InvalidSignature.selector);
        consentLedger.grantBySig(patient, doctor, CID, ENC, expireAt, false, deadline, sig);
    }
}
