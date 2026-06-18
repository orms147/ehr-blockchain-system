// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import "../src/ConsentLedger.sol";

/**
 * @title  CascadeHandler
 * @notice Stateful-invariant handler. The fuzzer drives random delegation churn
 *         (grant / sub-delegate / revoke) on a small actor pool while the patient
 *         keeps issuing DIRECT consents. Every action is wrapped in try/catch so a
 *         reverting random call is simply skipped (handler never reverts).
 */
contract CascadeHandler {
    Vm internal constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    ConsentLedger public cl;
    address public patient;
    bytes32 internal constant ENC = keccak256("encKey");

    address[5] public actors;

    address[] public directGrantees;
    bytes32[] public directCids;
    uint256 public directCount;

    constructor(ConsentLedger _cl, address _patient) {
        cl = _cl;
        patient = _patient;
        for (uint256 i = 0; i < 5; i++) {
            actors[i] = address(uint160(uint256(keccak256(abi.encodePacked("inv-actor", i)))));
        }
    }

    /// Patient issues a fresh DIRECT consent (must stay alive forever after).
    function directGrant(uint256 seed) external {
        address g = address(uint160(uint256(keccak256(abi.encodePacked("inv-grantee", directCount, seed)))));
        bytes32 cid = keccak256(abi.encodePacked("inv-cid", directCount, seed));
        try cl.grantInternal(patient, g, cid, ENC, uint40(block.timestamp) + 30 days, false) {
            directGrantees.push(g);
            directCids.push(cid);
            directCount++;
        } catch {}
    }

    function rootDelegate(uint256 seed) external {
        address d = actors[seed % 5];
        vm.prank(patient);
        try cl.grantDelegation(d, 30 days, true) {} catch {}
    }

    function subDelegate(uint256 sp, uint256 sc) external {
        address p = actors[sp % 5];
        address c = actors[sc % 5];
        if (p == c) return;
        vm.prank(p);
        try cl.subDelegate(patient, c, 30 days, true) {} catch {}
    }

    function revokeRoot(uint256 seed) external {
        address d = actors[seed % 5];
        vm.prank(patient);
        try cl.revokeDelegation(d) {} catch {}
    }
}

/**
 * @title  ConsentLedgerCascadeInvariantTest
 * @notice INVARIANT: arbitrary delegation churn (grant/sub-delegate/revoke) can
 *         NEVER invalidate a patient's DIRECT consent — the cascade revoke must
 *         only ever touch delegation-derived rights (advisor feedback #3 / Footgun #1).
 */
contract ConsentLedgerCascadeInvariantTest is Test {
    ConsentLedger internal cl;
    CascadeHandler internal handler;

    address internal ministry = makeAddr("ministry");
    address internal patient  = makeAddr("patient");

    function setUp() public {
        vm.prank(ministry);
        cl = new ConsentLedger(ministry);

        handler = new CascadeHandler(cl, patient);

        // The handler mints the patient's direct consents on its behalf.
        vm.prank(ministry);
        cl.authorizeContract(address(handler), true);

        targetContract(address(handler));
    }

    function invariant_DirectGrantsImmuneToCascade() public view {
        uint256 n = handler.directCount();
        for (uint256 i = 0; i < n; i++) {
            assertTrue(
                cl.canAccess(patient, handler.directGrantees(i), handler.directCids(i)),
                "a DIRECT grant was wrongly invalidated by delegation churn"
            );
        }
    }
}
