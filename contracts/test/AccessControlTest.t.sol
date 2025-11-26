// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AccessControl.sol";
import "./helpers/TestHelpers.sol";

/**
 * @title AccessControlTest
 * @notice Comprehensive tests for AccessControl contract
 * Coverage: Self-registration, Multi-role, Verification, Revoke, Edge cases
 */
contract AccessControlTest is TestHelpers {
    AccessControl public accessControl;
    
    // Test accounts
    address public ministry;
    address public patient1;
    address public patient2;
    address public doctor1;
    address public doctor2;
    address public org1;
    address public org2;
    address public attacker;
    
    // Events to test
    event UserRegistered(address indexed user, string role);
    event DoctorVerified(address indexed doctor, address indexed verifier, string credential);
    event OrganizationVerified(address indexed org, address indexed verifier, string orgName);
    event VerificationRevoked(address indexed user, address indexed revoker, string reason);
    
    function setUp() public {
        // Setup accounts
        ministry = makeAddr("ministry");
        patient1 = makeAddr("patient1");
        patient2 = makeAddr("patient2");
        doctor1 = makeAddr("doctor1");
        doctor2 = makeAddr("doctor2");
        org1 = makeAddr("org1");
        org2 = makeAddr("org2");
        attacker = makeAddr("attacker");
        
        // Deploy AccessControl
        vm.prank(ministry);
        accessControl = new AccessControl(ministry);
    }
    
    // ========== CONSTRUCTOR TESTS ==========
    
    function test_Constructor_Success() public view {
        // Ministry should have MINISTRY and VERIFIED_ORG roles
        (bool isPatient, bool isDoctor, bool isVerifiedDoctor, bool isOrg, bool isVerifiedOrg, bool isMinistry) 
            = accessControl.getUserStatus(ministry);
        
        assertFalse(isPatient, "Ministry should not be patient");
        assertFalse(isDoctor, "Ministry should not be doctor");
        assertFalse(isVerifiedDoctor, "Ministry should not be verified doctor");
        assertFalse(isOrg, "Ministry should not be org");
        assertTrue(isVerifiedOrg, "Ministry should be verified org");
        assertTrue(isMinistry, "Ministry should have ministry role");
    }
    
    function test_Constructor_RevertWhen_InvalidAddress() public {
        vm.expectRevert(IAccessControl.InvalidAddress.selector);
        new AccessControl(address(0));
    }
    
    // ========== SELF-REGISTRATION TESTS ==========
    
    function test_RegisterAsPatient_Success() public {
        vm.expectEmit(true, false, false, true);
        emit UserRegistered(patient1, "PATIENT");
        
        vm.prank(patient1);
        accessControl.registerAsPatient();
        
        assertTrue(accessControl.isPatient(patient1), "Should be patient");
    }
    
    function test_RegisterAsDoctor_Success() public {
        vm.expectEmit(true, false, false, true);
        emit UserRegistered(doctor1, "DOCTOR_UNVERIFIED");
        
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        
        assertTrue(accessControl.isDoctor(doctor1), "Should be doctor");
        assertFalse(accessControl.isVerifiedDoctor(doctor1), "Should not be verified yet");
    }
    
    function test_RegisterAsOrganization_Success() public {
        vm.expectEmit(true, false, false, true);
        emit UserRegistered(org1, "ORGANIZATION_UNVERIFIED");
        
        vm.prank(org1);
        accessControl.registerAsOrganization();
        
        assertTrue(accessControl.isOrganization(org1), "Should be organization");
        assertFalse(accessControl.isVerifiedOrganization(org1), "Should not be verified yet");
    }
    
    // ========== MULTI-ROLE TESTS ==========
    
    function test_MultipleRoles_PatientAndDoctor() public {
        vm.startPrank(doctor1);
        accessControl.registerAsDoctor();
        accessControl.registerAsPatient(); // Should not revert
        vm.stopPrank();
        
        (bool isP, bool isD,,,,) = accessControl.getUserStatus(doctor1);
        assertTrue(isP, "Should be patient");
        assertTrue(isD, "Should be doctor");
    }
    
    function test_MultipleRoles_AllThree() public {
        vm.startPrank(doctor1);
        accessControl.registerAsPatient();
        accessControl.registerAsDoctor();
        accessControl.registerAsOrganization();
        vm.stopPrank();
        
        (bool isP, bool isD,, bool isO,,) = accessControl.getUserStatus(doctor1);
        assertTrue(isP, "Should be patient");
        assertTrue(isD, "Should be doctor");
        assertTrue(isO, "Should be organization");
    }
    
    function test_MultipleRoles_BitwiseOperations() public {
        // Test that bitwise OR (|=) works correctly
        vm.startPrank(patient1);
        accessControl.registerAsPatient();
        
        // First registration
        assertTrue(accessControl.isPatient(patient1), "Should be patient after first registration");
        
        // Second registration (different role)
        accessControl.registerAsDoctor();
        
        // Both roles should be active
        assertTrue(accessControl.isPatient(patient1), "Should still be patient");
        assertTrue(accessControl.isDoctor(patient1), "Should also be doctor");
        vm.stopPrank();
    }
    
    // ========== VERIFICATION TESTS ==========
    
    function test_VerifyOrganization_ByMinistry_Success() public {
        // Org registers first
        vm.prank(org1);
        accessControl.registerAsOrganization();
        
        // Ministry verifies
        vm.expectEmit(true, true, false, true);
        emit OrganizationVerified(org1, ministry, "Hospital ABC");
        
        vm.prank(ministry);
        accessControl.verifyOrganization(org1, "Hospital ABC");
        
        assertTrue(accessControl.isVerifiedOrganization(org1), "Should be verified");
        
        // Check verification details
        (address verifier, string memory orgName, uint40 verifiedAt, bool isVerified) 
            = accessControl.getOrgVerification(org1);
        
        assertEq(verifier, ministry, "Verifier should be ministry");
        assertEq(orgName, "Hospital ABC", "Org name should match");
        assertGt(verifiedAt, 0, "Verified timestamp should be set");
        assertTrue(isVerified, "Should be verified");
    }
    
    function test_VerifyOrganization_RevertWhen_NotMinistry() public {
        vm.prank(org1);
        accessControl.registerAsOrganization();
        
        vm.expectRevert(IAccessControl.NotAuthorized.selector);
        vm.prank(attacker);
        accessControl.verifyOrganization(org1, "Hospital ABC");
    }
    
    function test_VerifyOrganization_RevertWhen_NotRegistered() public {
        vm.expectRevert(IAccessControl.NotAuthorized.selector);
        vm.prank(ministry);
        accessControl.verifyOrganization(org1, "Hospital ABC");
    }
    
    function test_VerifyDoctor_ByOrganization_Success() public {
        // Setup: Verify org first
        vm.prank(org1);
        accessControl.registerAsOrganization();
        vm.prank(ministry);
        accessControl.verifyOrganization(org1, "Hospital ABC");
        
        // Doctor registers
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        
        // Org verifies doctor
        vm.expectEmit(true, true, false, true);
        emit DoctorVerified(doctor1, org1, "Cardiologist - Hospital ABC");
        
        vm.prank(org1);
        accessControl.verifyDoctor(doctor1, "Cardiologist - Hospital ABC");
        
        assertTrue(accessControl.isVerifiedDoctor(doctor1), "Should be verified");
        
        // Check verification details
        (address verifier, string memory credential, uint40 verifiedAt, bool isVerified) 
            = accessControl.getDoctorVerification(doctor1);
        
        assertEq(verifier, org1, "Verifier should be org");
        assertEq(credential, "Cardiologist - Hospital ABC", "Credential should match");
        assertGt(verifiedAt, 0, "Verified timestamp should be set");
        assertTrue(isVerified, "Should be verified");
    }
    
    function test_VerifyDoctor_RevertWhen_NotVerifiedOrg() public {
        // Org not verified
        vm.prank(org1);
        accessControl.registerAsOrganization();
        
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        
        vm.expectRevert(IAccessControl.NotAuthorized.selector);
        vm.prank(org1);
        accessControl.verifyDoctor(doctor1, "Cardiologist");
    }
    
    function test_VerifyDoctor_RevertWhen_DoctorNotRegistered() public {
        // Setup verified org
        vm.prank(org1);
        accessControl.registerAsOrganization();
        vm.prank(ministry);
        accessControl.verifyOrganization(org1, "Hospital ABC");
        
        // Try to verify unregistered doctor
        vm.expectRevert(IAccessControl.NotAuthorized.selector);
        vm.prank(org1);
        accessControl.verifyDoctor(doctor1, "Cardiologist");
    }
    
    // ========== REVOKE VERIFICATION TESTS ==========
    
    function test_RevokeDoctorVerification_ByVerifier_Success() public {
        // Setup: Verify doctor
        _setupVerifiedDoctor(doctor1, org1);
        
        // Revoke by verifier
        vm.expectEmit(true, true, false, true);
        emit VerificationRevoked(doctor1, org1, "Misconduct");
        
        vm.prank(org1);
        accessControl.revokeDoctorVerification(doctor1);
        
        assertFalse(accessControl.isVerifiedDoctor(doctor1), "Should not be verified");
        assertTrue(accessControl.isDoctor(doctor1), "Should still be doctor (unverified)");
    }
    
    function test_RevokeDoctorVerification_ByMinistry_Success() public {
        // Setup: Verify doctor
        _setupVerifiedDoctor(doctor1, org1);
        
        // Ministry can also revoke
        vm.prank(ministry);
        accessControl.revokeDoctorVerification(doctor1);
        
        assertFalse(accessControl.isVerifiedDoctor(doctor1), "Should not be verified");
    }
    
    function test_RevokeDoctorVerification_RevertWhen_Unauthorized() public {
        _setupVerifiedDoctor(doctor1, org1);
        
        vm.expectRevert(IAccessControl.NotAuthorized.selector);
        vm.prank(attacker);
        accessControl.revokeDoctorVerification(doctor1);
    }
    
    function test_RevokeOrgVerification_ByMinistry_Success() public {
        // Setup: Verify org
        vm.prank(org1);
        accessControl.registerAsOrganization();
        vm.prank(ministry);
        accessControl.verifyOrganization(org1, "Hospital ABC");
        
        // Revoke
        vm.expectEmit(true, true, false, true);
        emit VerificationRevoked(org1, ministry, "License expired");
        
        vm.prank(ministry);
        accessControl.revokeOrgVerification(org1);
        
        assertFalse(accessControl.isVerifiedOrganization(org1), "Should not be verified");
        assertTrue(accessControl.isOrganization(org1), "Should still be org (unverified)");
    }
    
    function test_RevokeOrgVerification_RevertWhen_NotMinistry() public {
        vm.prank(org1);
        accessControl.registerAsOrganization();
        vm.prank(ministry);
        accessControl.verifyOrganization(org1, "Hospital ABC");
        
        vm.expectRevert(IAccessControl.NotAuthorized.selector);
        vm.prank(attacker);
        accessControl.revokeOrgVerification(org1);
    }
    
    // ========== QUERY FUNCTION TESTS ==========
    
    function test_GetUserStatus_AllRoles() public {
        // Register all roles
        vm.startPrank(doctor1);
        accessControl.registerAsPatient();
        accessControl.registerAsDoctor();
        accessControl.registerAsOrganization();
        vm.stopPrank();
        
        (bool isP, bool isD, bool isVD, bool isO, bool isVO, bool isM) 
            = accessControl.getUserStatus(doctor1);
        
        assertTrue(isP, "Should be patient");
        assertTrue(isD, "Should be doctor");
        assertFalse(isVD, "Should not be verified doctor");
        assertTrue(isO, "Should be organization");
        assertFalse(isVO, "Should not be verified org");
        assertFalse(isM, "Should not be ministry");
    }
    
    function test_GetUserStatus_Unregistered() public view {
        (bool isP, bool isD, bool isVD, bool isO, bool isVO, bool isM) 
            = accessControl.getUserStatus(attacker);
        
        assertFalse(isP, "Should not be patient");
        assertFalse(isD, "Should not be doctor");
        assertFalse(isVD, "Should not be verified doctor");
        assertFalse(isO, "Should not be organization");
        assertFalse(isVO, "Should not be verified org");
        assertFalse(isM, "Should not be ministry");
    }
    
    // ========== EDGE CASES ==========
    
    function test_EdgeCase_DoubleRegistration_SameRole() public {
        vm.startPrank(patient1);
        accessControl.registerAsPatient();
        
        // Register again (should not revert, just no-op)
        accessControl.registerAsPatient();
        vm.stopPrank();
        
        assertTrue(accessControl.isPatient(patient1), "Should still be patient");
    }
    
    function test_EdgeCase_VerifyAlreadyVerified() public {
        _setupVerifiedDoctor(doctor1, org1);
        
        // Verify again (should not revert)
        vm.prank(org1);
        accessControl.verifyDoctor(doctor1, "Updated credential");
        
        assertTrue(accessControl.isVerifiedDoctor(doctor1), "Should still be verified");
    }
    
    function test_EdgeCase_RevokeUnverified() public {
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        
        // Try to revoke unverified doctor (should revert)
        vm.expectRevert(IAccessControl.NotAuthorized.selector);
        vm.prank(ministry);
        accessControl.revokeDoctorVerification(doctor1);
    }
    
    // ========== HELPER FUNCTIONS ==========
    
    function _setupVerifiedDoctor(address doctor, address org) internal {
        // Register and verify org
        vm.prank(org);
        accessControl.registerAsOrganization();
        vm.prank(ministry);
        accessControl.verifyOrganization(org, "Hospital ABC");
        
        // Register and verify doctor
        vm.prank(doctor);
        accessControl.registerAsDoctor();
        vm.prank(org);
        accessControl.verifyDoctor(doctor, "Cardiologist");
    }
}
