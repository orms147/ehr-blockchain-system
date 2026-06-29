// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AccessControl.sol";

/**
 * @title AccessControlRelayerPaths
 * @notice Tests for relayer/ministry-only paths that had 0 coverage:
 *         setRelayer, registerPatientFor, registerDoctorFor, verifyDoctorByMinistry.
 *         Each: success + rejected branch (wrong caller).
 */
contract AccessControlRelayerPathsTest is Test {
    AccessControl public accessControl;

    address public ministry;
    address public relayer;
    address public patient;
    address public doctor;
    address public attacker;

    function setUp() public {
        ministry = makeAddr("ministry");
        relayer = makeAddr("relayer");
        patient = makeAddr("patient");
        doctor = makeAddr("doctor");
        attacker = makeAddr("attacker");

        vm.prank(ministry);
        accessControl = new AccessControl(ministry);
    }

    // ===================== setRelayer (onlyMinistry) =====================

    function test_SetRelayer_Success() public {
        vm.expectEmit(true, false, false, true);
        emit IAccessControl.RelayerUpdated(relayer, true);

        vm.prank(ministry);
        accessControl.setRelayer(relayer, true);

        assertTrue(accessControl.authorizedRelayers(relayer), "relayer must be authorized");
    }

    function test_SetRelayer_RevertWhen_NotMinistry() public {
        vm.expectRevert(IAccessControl.NotAuthorized.selector);
        vm.prank(attacker);
        accessControl.setRelayer(relayer, true);
    }

    // ===================== registerPatientFor (onlyRelayer) =====================

    function test_RegisterPatientFor_Success() public {
        vm.prank(ministry);
        accessControl.setRelayer(relayer, true);

        vm.expectEmit(true, false, false, true);
        emit IAccessControl.UserRegistered(patient, "PATIENT");

        vm.prank(relayer);
        accessControl.registerPatientFor(patient);

        assertTrue(accessControl.isPatient(patient), "patient role set");
    }

    function test_RegisterPatientFor_RevertWhen_NotRelayer() public {
        vm.expectRevert(IAccessControl.NotAuthorized.selector);
        vm.prank(attacker); // not an authorized relayer
        accessControl.registerPatientFor(patient);
    }

    // ===================== registerDoctorFor (onlyRelayer) =====================

    function test_RegisterDoctorFor_Success() public {
        vm.prank(ministry);
        accessControl.setRelayer(relayer, true);

        vm.expectEmit(true, false, false, true);
        emit IAccessControl.UserRegistered(doctor, "DOCTOR_UNVERIFIED");

        vm.prank(relayer);
        accessControl.registerDoctorFor(doctor);

        assertTrue(accessControl.isDoctor(doctor), "doctor role set");
        assertFalse(accessControl.isVerifiedDoctor(doctor), "not verified yet");
    }

    function test_RegisterDoctorFor_RevertWhen_NotRelayer() public {
        vm.expectRevert(IAccessControl.NotAuthorized.selector);
        vm.prank(attacker);
        accessControl.registerDoctorFor(doctor);
    }

    // ===================== verifyDoctorByMinistry (onlyMinistry) =====================

    function test_VerifyDoctorByMinistry_Success() public {
        // Doctor must already hold the DOCTOR role.
        vm.prank(doctor);
        accessControl.registerAsDoctor();

        vm.expectEmit(true, true, true, true);
        emit IAccessControl.DoctorVerified(doctor, ministry, 0, "CCHN-123");

        vm.prank(ministry);
        accessControl.verifyDoctorByMinistry(doctor, "CCHN-123");

        assertTrue(accessControl.isVerifiedDoctor(doctor), "doctor must be verified");
    }

    function test_VerifyDoctorByMinistry_RevertWhen_NotMinistry() public {
        vm.prank(doctor);
        accessControl.registerAsDoctor();

        vm.expectRevert(IAccessControl.NotAuthorized.selector);
        vm.prank(attacker);
        accessControl.verifyDoctorByMinistry(doctor, "CCHN-123");
    }
}
