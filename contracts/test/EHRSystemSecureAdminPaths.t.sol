// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AccessControl.sol";
import "../src/RecordRegistry.sol";
import "../src/ConsentLedger.sol";
import "../src/EHRSystemSecure.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EHRSystemSecureAdminPaths
 * @notice Tests for previously-untested paths: rejectRequestBySig (EIP-712
 *         sponsored reject), pause, unpause. Each: success + rejected branch.
 *         The test contract is the EHRSystem owner (it deploys it directly).
 */
contract EHRSystemSecureAdminPathsTest is Test {
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
    uint256 attackerPrivateKey = 0xBAD;

    bytes32 constant CID_HASH = keccak256("QmCID1");
    bytes32 constant ENC_KEY_HASH = keccak256("encKey");

    bytes32 private constant REJECT_TYPEHASH = keccak256(
        "RejectRequest(bytes32 reqId,uint256 deadline)"
    );

    function setUp() public {
        ministry = makeAddr("ministry");
        patient1 = vm.addr(patientPrivateKey);
        doctor1 = makeAddr("doctor1");
        org1 = makeAddr("org1");
        attacker = vm.addr(attackerPrivateKey);

        vm.prank(ministry);
        accessControl = new AccessControl(ministry);
        recordRegistry = new RecordRegistry(accessControl);
        vm.prank(ministry);
        consentLedger = new ConsentLedger(ministry);

        // test contract is the deployer => EHRSystem owner
        ehrSystem = new EHRSystemSecure(
            address(accessControl), address(recordRegistry), address(consentLedger)
        );

        vm.startPrank(ministry);
        consentLedger.authorizeContract(address(ehrSystem), true);
        consentLedger.setAccessControl(address(accessControl));
        consentLedger.setRecordRegistry(address(recordRegistry));
        vm.stopPrank();

        vm.prank(patient1);
        accessControl.registerAsPatient();

        // verified doctor
        vm.prank(ministry);
        accessControl.createOrganization("Hospital", org1, address(0));
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        vm.prank(org1);
        accessControl.verifyDoctor(doctor1, "Cardiologist");
    }

    function _createPendingRequest() internal returns (bytes32 reqId) {
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1, CID_HASH, IEHRSystem.RequestType.DirectAccess,
            ENC_KEY_HASH, 7 * 24, 7 * 24
        );
        uint256 nonce = ehrSystem.getCurrentNonce();
        reqId = keccak256(abi.encode(
            doctor1, patient1, CID_HASH, IEHRSystem.RequestType.DirectAccess, nonce - 1
        ));
    }

    function _signReject(bytes32 reqId, uint256 deadline, uint256 key) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(REJECT_TYPEHASH, reqId, deadline));
        bytes32 domainSeparator = ehrSystem.DOMAIN_SEPARATOR();
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    // ===================== rejectRequestBySig (EIP-712 sponsored) =====================

    function test_RejectRequestBySig_Success() public {
        bytes32 reqId = _createPendingRequest();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signReject(reqId, deadline, patientPrivateKey); // patient authorizes

        // anyone (relayer) submits
        vm.prank(makeAddr("relayer"));
        ehrSystem.rejectRequestBySig(reqId, deadline, sig);

        IEHRSystem.AccessRequest memory req = ehrSystem.getAccessRequest(reqId);
        assertTrue(req.status == IEHRSystem.RequestStatus.Rejected, "request must be Rejected");
    }

    function test_RejectRequestBySig_RevertWhen_SignerNotParty() public {
        bytes32 reqId = _createPendingRequest();
        uint256 deadline = block.timestamp + 1 hours;
        // attacker (neither patient nor requester) signs
        bytes memory sig = _signReject(reqId, deadline, attackerPrivateKey);

        vm.expectRevert(IEHRSystem.NotParty.selector);
        ehrSystem.rejectRequestBySig(reqId, deadline, sig);
    }

    function test_RejectRequestBySig_RevertWhen_DeadlinePassed() public {
        bytes32 reqId = _createPendingRequest();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signReject(reqId, deadline, patientPrivateKey);

        vm.warp(block.timestamp + 2 hours);

        vm.expectRevert(IEHRSystem.RequestExpired.selector);
        ehrSystem.rejectRequestBySig(reqId, deadline, sig);
    }

    // ===================== pause / unpause (onlyOwner) =====================

    function test_Pause_Success_BlocksRequestAccess() public {
        ehrSystem.pause(); // test contract = owner
        assertTrue(ehrSystem.paused(), "must be paused");

        // whenNotPaused gate must now block requestAccess
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(doctor1);
        ehrSystem.requestAccess(
            patient1, CID_HASH, IEHRSystem.RequestType.DirectAccess,
            ENC_KEY_HASH, 7 * 24, 7 * 24
        );
    }

    function test_Pause_RevertWhen_NotOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        vm.prank(attacker);
        ehrSystem.pause();
    }

    function test_Unpause_Success_RestoresRequestAccess() public {
        ehrSystem.pause();
        assertTrue(ehrSystem.paused(), "paused");

        ehrSystem.unpause();
        assertFalse(ehrSystem.paused(), "unpaused");

        // request flow works again
        bytes32 reqId = _createPendingRequest();
        IEHRSystem.AccessRequest memory req = ehrSystem.getAccessRequest(reqId);
        assertTrue(req.status == IEHRSystem.RequestStatus.Pending, "request pending after unpause");
    }
}
