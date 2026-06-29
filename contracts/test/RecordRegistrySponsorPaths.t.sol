// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AccessControl.sol";
import "../src/RecordRegistry.sol";

/**
 * @title RecordRegistrySponsorPaths
 * @notice Tests for previously-untested sponsored paths: authorizeSponsor and
 *         addRecordFor (gas-sponsored record creation). Each: success + rejected.
 *         The test contract deploys RecordRegistry => it is the `deployer`.
 */
contract RecordRegistrySponsorPathsTest is Test {
    AccessControl public accessControl;
    RecordRegistry public recordRegistry;

    address public ministry;
    address public sponsor;
    address public patient;
    address public stranger;   // not a registered patient
    address public attacker;

    bytes32 constant CID = keccak256("record-V1");
    bytes32 constant RTYPE = keccak256("general");

    function setUp() public {
        ministry = makeAddr("ministry");
        sponsor = makeAddr("sponsor");
        patient = makeAddr("patient");
        stranger = makeAddr("stranger");
        attacker = makeAddr("attacker");

        vm.prank(ministry);
        accessControl = new AccessControl(ministry);

        // test contract is the deployer of RecordRegistry
        recordRegistry = new RecordRegistry(accessControl);

        vm.prank(patient);
        accessControl.registerAsPatient();
    }

    // ===================== authorizeSponsor (onlyDeployer) =====================

    function test_AuthorizeSponsor_Success() public {
        recordRegistry.authorizeSponsor(sponsor, true); // deployer = test contract
        assertTrue(recordRegistry.authorizedSponsors(sponsor), "sponsor whitelisted");
    }

    function test_AuthorizeSponsor_RevertWhen_NotDeployer() public {
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "Only deployer"));
        vm.prank(attacker);
        recordRegistry.authorizeSponsor(sponsor, true);
    }

    // ===================== addRecordFor (sponsored, NotSponsor branch) =====================

    function test_AddRecordFor_Success() public {
        recordRegistry.authorizeSponsor(sponsor, true);

        vm.prank(sponsor);
        recordRegistry.addRecordFor(CID, bytes32(0), RTYPE, patient);

        assertTrue(recordRegistry.recordExists(CID), "record exists");
        bytes32[] memory owned = recordRegistry.getOwnerRecords(patient);
        assertEq(owned.length, 1, "patient owns 1 record");
        assertEq(owned[0], CID, "owned record is CID");
    }

    // GVHD-named branch: caller not an authorized sponsor -> NotSponsor.
    function test_AddRecordFor_RevertWhen_NotSponsor() public {
        vm.expectRevert(IRecordRegistry.NotSponsor.selector);
        vm.prank(attacker); // not authorized
        recordRegistry.addRecordFor(CID, bytes32(0), RTYPE, patient);
    }

    // sponsor authorized but target is not a registered patient -> NotPatient.
    function test_AddRecordFor_RevertWhen_PatientNotRegistered() public {
        recordRegistry.authorizeSponsor(sponsor, true);

        vm.expectRevert(IRecordRegistry.NotPatient.selector);
        vm.prank(sponsor);
        recordRegistry.addRecordFor(CID, bytes32(0), RTYPE, stranger);
    }
}
