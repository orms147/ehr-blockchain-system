// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AccessControl.sol";
import "../src/RecordRegistry.sol";
import "../src/ConsentLedger.sol";
import "../src/EHRSystemSecure.sol";

/**
 * @title EHRSystemDomainDeny
 * @notice EIP-712 domain-binding deny branches for rejectRequestBySig (domain
 *         "EHR System Secure"/"2"). A wrong-domain signature recovers to a
 *         signer that is neither patient nor requester, so the contract reverts
 *         NotParty. Baseline (correct domain) succeeds to isolate the cause.
 */
contract EHRSystemDomainDenyTest is Test {
    AccessControl public accessControl;
    RecordRegistry public recordRegistry;
    ConsentLedger public consentLedger;
    EHRSystemSecure public ehrSystem;

    address public ministry;
    address public patient1;
    address public doctor1;
    address public org1;

    uint256 patientPrivateKey = 0x5678;

    bytes32 constant CID_HASH = keccak256("QmCID1");
    bytes32 constant ENC_KEY_HASH = keccak256("encKey");
    bytes32 private constant REJECT_TYPEHASH = keccak256("RejectRequest(bytes32 reqId,uint256 deadline)");

    function setUp() public {
        ministry = makeAddr("ministry");
        patient1 = vm.addr(patientPrivateKey);
        doctor1 = makeAddr("doctor1");
        org1 = makeAddr("org1");

        vm.prank(ministry);
        accessControl = new AccessControl(ministry);
        recordRegistry = new RecordRegistry(accessControl);
        vm.prank(ministry);
        consentLedger = new ConsentLedger(ministry);
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
            patient1, CID_HASH, IEHRSystem.RequestType.DirectAccess, ENC_KEY_HASH, 7 * 24, 7 * 24
        );
        uint256 nonce = ehrSystem.getCurrentNonce();
        reqId = keccak256(abi.encode(
            doctor1, patient1, CID_HASH, IEHRSystem.RequestType.DirectAccess, nonce - 1
        ));
    }

    function _digest(
        string memory name,
        string memory version,
        uint256 chainId,
        address verifyingContract,
        bytes32 reqId,
        uint256 deadline
    ) internal pure returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(REJECT_TYPEHASH, reqId, deadline));
        bytes32 ds = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes(name)),
            keccak256(bytes(version)),
            chainId,
            verifyingContract
        ));
        return keccak256(abi.encodePacked("\x19\x01", ds, structHash));
    }

    function _sign(bytes32 digest) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(patientPrivateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    // baseline: correct domain -> succeeds (isolates the deny cause below)
    function test_RejectRequestBySig_CorrectDomain_Success() public {
        bytes32 reqId = _createPendingRequest();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(_digest("EHR System Secure", "2", block.chainid, address(ehrSystem), reqId, deadline));

        ehrSystem.rejectRequestBySig(reqId, deadline, sig);
        assertTrue(
            ehrSystem.getAccessRequest(reqId).status == IEHRSystem.RequestStatus.Rejected,
            "correct-domain signature must reject the request"
        );
    }

    function test_RejectRequestBySig_RevertWhen_WrongChainId() public {
        bytes32 reqId = _createPendingRequest();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(_digest("EHR System Secure", "2", block.chainid + 1, address(ehrSystem), reqId, deadline));

        vm.expectRevert(IEHRSystem.NotParty.selector);
        ehrSystem.rejectRequestBySig(reqId, deadline, sig);
    }

    function test_RejectRequestBySig_RevertWhen_WrongVerifyingContract() public {
        bytes32 reqId = _createPendingRequest();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(_digest("EHR System Secure", "2", block.chainid, address(0xdEaD), reqId, deadline));

        vm.expectRevert(IEHRSystem.NotParty.selector);
        ehrSystem.rejectRequestBySig(reqId, deadline, sig);
    }
}
