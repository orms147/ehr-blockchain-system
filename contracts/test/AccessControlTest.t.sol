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
    event OrganizationVerified(address indexed org, string orgName);
    event VerificationRevoked(address indexed user, address indexed revoker);
    event MemberAdded(address indexed org, address indexed doctor);
    event MemberRemoved(address indexed org, address indexed doctor);
    
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
        // Ministry should ONLY have MINISTRY role - NOT ORGANIZATION
        // Ministry is regulator, not a hospital
        (bool isPatient, bool isDoctor, bool isVerifiedDoctor, bool isOrg, bool isVerifiedOrg, bool isMinistry) 
            = accessControl.getUserStatus(ministry);
        
        assertFalse(isPatient, "Ministry should not be patient");
        assertFalse(isDoctor, "Ministry should not be doctor");
        assertFalse(isVerifiedDoctor, "Ministry should not be verified doctor");
        assertFalse(isOrg, "Ministry should NOT be org (regulator only)");
        assertFalse(isVerifiedOrg, "Ministry should NOT be verified org");
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
    
    function test_RegisterAsOrganization_RevertWhen_Deprecated() public {
        // registerAsOrganization is DEPRECATED - should revert
        vm.expectRevert(IAccessControl.NotAuthorized.selector);
        vm.prank(org1);
        accessControl.registerAsOrganization();
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
        // NOTE: registerAsOrganization is now deprecated (reverts with NotAuthorized)
        // This test now only tests Patient + Doctor roles
        // Organization role can only be assigned by Ministry via createOrganization
        vm.startPrank(doctor1);
        accessControl.registerAsPatient();
        accessControl.registerAsDoctor();
        vm.stopPrank();
        
        (bool isP, bool isD,, bool isO,,) = accessControl.getUserStatus(doctor1);
        assertTrue(isP, "Should be patient");
        assertTrue(isD, "Should be doctor");
        assertFalse(isO, "Should NOT be organization (self-registration deprecated)");
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
    
    // NOTE: verifyOrganization is now DEPRECATED - registerAsOrganization reverts
    // These tests verify the deprecated flow cannot be used
    
    function test_VerifyOrganization_RevertWhen_DeprecatedFlow() public {
        // registerAsOrganization is deprecated and reverts
        vm.expectRevert(IAccessControl.NotAuthorized.selector);
        vm.prank(org1);
        accessControl.registerAsOrganization();
    }
    
    function test_VerifyOrganization_RevertWhen_NotRegistered() public {
        // Trying to verify an org that wasn't registered should revert
        vm.expectRevert(IAccessControl.NotAuthorized.selector);
        vm.prank(ministry);
        accessControl.verifyOrganization(org1, "Hospital ABC");
    }
    
    function test_VerifyDoctor_ByOrganization_Success() public {
        // Setup: Create org via Ministry (new flow)
        vm.prank(ministry);
        accessControl.createOrganization("Hospital ABC", org1, address(0));
        
        // Doctor registers
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        
        // Org verifies doctor
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
        // Org NOT created via Ministry - should not be able to verify doctors
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        
        vm.expectRevert(IAccessControl.NotAuthorized.selector);
        vm.prank(org1);  // org1 is not a verified org
        accessControl.verifyDoctor(doctor1, "Cardiologist");
    }
    
    function test_VerifyDoctor_RevertWhen_DoctorNotRegistered() public {
        // Setup verified org via Ministry
        vm.prank(ministry);
        accessControl.createOrganization("Hospital ABC", org1, address(0));
        
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
        vm.expectEmit(true, true, false, false);
        emit VerificationRevoked(doctor1, org1);
        
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
        // Setup: Create org via Ministry
        vm.prank(ministry);
        accessControl.createOrganization("Hospital ABC", org1, address(0));
        
        // Revoke
        vm.expectEmit(true, true, false, false);
        emit VerificationRevoked(org1, ministry);
        
        vm.prank(ministry);
        accessControl.revokeOrgVerification(org1);
        
        assertFalse(accessControl.isVerifiedOrganization(org1), "Should not be verified");
        // Note: With Ministry flow, org still has some ORGANIZATION flag but VERIFIED_ORG is cleared
    }
    
    function test_RevokeOrgVerification_RevertWhen_NotMinistry() public {
        // Create org via Ministry
        vm.prank(ministry);
        accessControl.createOrganization("Hospital ABC", org1, address(0));
        
        vm.expectRevert(IAccessControl.NotAuthorized.selector);
        vm.prank(attacker);
        accessControl.revokeOrgVerification(org1);
    }
    
    // ========== QUERY FUNCTION TESTS ==========
    
    function test_GetUserStatus_AllRoles() public {
        // Register patient and doctor roles (org is deprecated via self-registration)
        vm.startPrank(doctor1);
        accessControl.registerAsPatient();
        accessControl.registerAsDoctor();
        vm.stopPrank();
        
        (bool isP, bool isD, bool isVD, bool isO, bool isVO, bool isM) 
            = accessControl.getUserStatus(doctor1);
        
        assertTrue(isP, "Should be patient");
        assertTrue(isD, "Should be doctor");
        assertFalse(isVD, "Should not be verified doctor");
        assertFalse(isO, "Should not be organization (self-registration deprecated)");
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
    
    // ========== MEMBERSHIP TESTS (ADDRESS-BASED - DEPRECATED) ==========\r\n    // NOTE: These address-based functions are deprecated in favor of orgId-based functions\r\n    // See test_AddOrgMember_* and test_RemoveOrgMember_* in Ministry-based tests section\r\n    \r\n    // The deprecated addMember and removeMember functions now revert with NotAuthorized\r\n    // See test_AddMember_RevertWhen_Deprecated and test_RemoveMember_RevertWhen_Deprecated\r\n    // in the \"DEPRECATED FUNCTION TESTS\" section at end of file
    
    function test_VerifyDoctor_DoesNotAddMember() public {
        // Setup verified org via Ministry
        vm.prank(ministry);
        uint256 orgId = accessControl.createOrganization("Hospital ABC", org1, address(0));
        
        // Register and verify doctor
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        vm.prank(org1);
        accessControl.verifyDoctor(doctor1, "Cardiologist");
        
        // ✅ CRITICAL: Verify doctor is NOT auto-added to members
        address[] memory members = accessControl.getOrgMembersByOrgId(orgId);
        assertEq(members.length, 0, "Verify should NOT auto-add member");
        assertFalse(accessControl.isDoctorMemberOfOrg(orgId, doctor1), "Should not be member after verify");
        
        // But doctor should be verified
        assertTrue(accessControl.isVerifiedDoctor(doctor1), "Should be verified");
    }
    
    function test_MembershipIndependentFromVerification() public {
        // Setup verified org via Ministry
        vm.prank(ministry);
        uint256 orgId = accessControl.createOrganization("Hospital ABC", org1, address(0));
        
        // Register and verify doctor
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        vm.prank(org1);
        accessControl.verifyDoctor(doctor1, "Cardiologist");
        
        // Add as member (using new orgId-based function)
        vm.prank(org1);
        accessControl.addOrgMember(orgId, doctor1);
        
        // Revoke verification
        vm.prank(org1);
        accessControl.revokeDoctorVerification(doctor1);
        
        // ✅ Should still be member (membership independent)
        assertTrue(accessControl.isDoctorMemberOfOrg(orgId, doctor1), "Should still be member");
        address[] memory members = accessControl.getOrgMembersByOrgId(orgId);
        assertEq(members.length, 1, "Should still have 1 member");
        
        // But not verified
        assertFalse(accessControl.isVerifiedDoctor(doctor1), "Should not be verified");
    }
    
    // ========== HELPER FUNCTIONS ==========
    
    function _setupVerifiedDoctor(address doctor, address org) internal {
        // Create org via Ministry (new flow)
        vm.prank(ministry);
        accessControl.createOrganization("Hospital ABC", org, address(0));
        
        // Register and verify doctor
        vm.prank(doctor);
        accessControl.registerAsDoctor();
        vm.prank(org);
        accessControl.verifyDoctor(doctor, "Cardiologist");
    }
    
    // ========== NEW: MINISTRY-BASED ORGANIZATION TESTS ==========
    
    // Helper: Create org via Ministry and return orgId
    function _createOrgViaMinistry(string memory name, address primaryAdmin, address backupAdmin) internal returns (uint256) {
        vm.prank(ministry);
        return accessControl.createOrganization(name, primaryAdmin, backupAdmin);
    }
    
    function test_CreateOrganization_Success() public {
        uint256 orgId = _createOrgViaMinistry("Hospital XYZ", org1, address(0));
        
        // Verify orgId returned
        assertEq(orgId, 1, "First org should have ID 1");
        assertEq(accessControl.orgCount(), 1, "Org count should be 1");
        
        // Verify org data
        IAccessControl.Organization memory org = accessControl.getOrganization(orgId);
        assertEq(org.id, 1, "Org ID should match");
        assertEq(org.name, "Hospital XYZ", "Org name should match");
        assertEq(org.primaryAdmin, org1, "Primary admin should match");
        assertEq(org.backupAdmin, address(0), "Backup admin should be zero");
        assertTrue(org.active, "Org should be active");
        
        // Verify admin mapping
        assertEq(accessControl.getAdminOrgId(org1), orgId, "Admin should map to org");
    }
    
    function test_CreateOrganization_SetsOrgVerifications() public {
        _createOrgViaMinistry("Hospital ABC", org1, org2);
        
        // ✅ CRITICAL: isVerifiedOrganization should return TRUE
        assertTrue(accessControl.isVerifiedOrganization(org1), "Primary admin should be verified org");
        assertTrue(accessControl.isVerifiedOrganization(org2), "Backup admin should be verified org");
        
        // Verify orgVerifications data is set correctly
        (address verifier1, string memory credential1, uint40 verifiedAt1, bool active1) 
            = accessControl.getOrgVerification(org1);
        assertEq(verifier1, ministry, "Verifier should be ministry");
        assertEq(credential1, "Hospital ABC", "Credential should be org name");
        assertGt(verifiedAt1, 0, "VerifiedAt should be set");
        assertTrue(active1, "Active should be true");
        
        (address verifier2, string memory credential2, uint40 verifiedAt2, bool active2) 
            = accessControl.getOrgVerification(org2);
        assertEq(verifier2, ministry, "Backup verifier should be ministry");
        assertEq(credential2, "Hospital ABC", "Backup credential should be org name");
        assertGt(verifiedAt2, 0, "Backup verifiedAt should be set");
        assertTrue(active2, "Backup active should be true");
    }
    
    function test_CreateOrganization_IsActiveOrgAdmin() public {
        _createOrgViaMinistry("Hospital ABC", org1, org2);
        
        assertTrue(accessControl.isActiveOrgAdmin(org1), "Primary should be active admin");
        assertTrue(accessControl.isActiveOrgAdmin(org2), "Backup should be active admin");
        assertFalse(accessControl.isActiveOrgAdmin(attacker), "Attacker should not be admin");
    }
    
    function test_CreateOrganization_RevertWhen_NotMinistry() public {
        vm.expectRevert(IAccessControl.NotAuthorized.selector);
        vm.prank(attacker);
        accessControl.createOrganization("Fake Hospital", org1, address(0));
    }
    
    function test_CreateOrganization_RevertWhen_InvalidPrimaryAdmin() public {
        vm.expectRevert(IAccessControl.InvalidAddress.selector);
        vm.prank(ministry);
        accessControl.createOrganization("Hospital", address(0), address(0));
    }
    
    function test_CreateOrganization_RevertWhen_PrimaryEqualsBackup() public {
        vm.expectRevert(IAccessControl.InvalidAddress.selector);
        vm.prank(ministry);
        accessControl.createOrganization("Hospital", org1, org1);
    }
    
    function test_CreateOrganization_RevertWhen_AdminAlreadyRegistered() public {
        _createOrgViaMinistry("Hospital 1", org1, address(0));
        
        // Try to create another org with same admin
        vm.expectRevert(IAccessControl.AlreadyRegistered.selector);
        vm.prank(ministry);
        accessControl.createOrganization("Hospital 2", org1, address(0));
    }
    
    function test_SetOrgAdmins_Success() public {
        uint256 orgId = _createOrgViaMinistry("Hospital ABC", org1, address(0));
        
        // Change admins
        vm.prank(ministry);
        accessControl.setOrgAdmins(orgId, org2, patient1);
        
        // Verify old admin cleared
        assertFalse(accessControl.isVerifiedOrganization(org1), "Old admin should not be verified");
        assertFalse(accessControl.isActiveOrgAdmin(org1), "Old admin should not be active");
        assertEq(accessControl.getAdminOrgId(org1), 0, "Old admin mapping should be cleared");
        
        // Verify new admins set
        assertTrue(accessControl.isVerifiedOrganization(org2), "New primary should be verified");
        assertTrue(accessControl.isVerifiedOrganization(patient1), "New backup should be verified");
        assertTrue(accessControl.isActiveOrgAdmin(org2), "New primary should be active admin");
        assertTrue(accessControl.isActiveOrgAdmin(patient1), "New backup should be active admin");
    }
    
    function test_SetOrgAdmins_SetsOrgVerifications() public {
        uint256 orgId = _createOrgViaMinistry("Hospital ABC", org1, address(0));
        
        vm.prank(ministry);
        accessControl.setOrgAdmins(orgId, org2, patient1);
        
        // Old admin should have orgVerifications.active = false
        (,,, bool oldActive) = accessControl.getOrgVerification(org1);
        assertFalse(oldActive, "Old admin orgVerifications.active should be false");
        
        // New admins should have orgVerifications set
        (address v1, string memory c1, uint40 t1, bool a1) = accessControl.getOrgVerification(org2);
        assertEq(v1, ministry, "New primary verifier");
        assertEq(c1, "Hospital ABC", "New primary credential");
        assertGt(t1, 0, "New primary timestamp");
        assertTrue(a1, "New primary active");
        
        (address v2, string memory c2, uint40 t2, bool a2) = accessControl.getOrgVerification(patient1);
        assertEq(v2, ministry, "New backup verifier");
        assertEq(c2, "Hospital ABC", "New backup credential");
        assertGt(t2, 0, "New backup timestamp");
        assertTrue(a2, "New backup active");
    }
    
    function test_SetOrgActive_DeactivatesOrg() public {
        uint256 orgId = _createOrgViaMinistry("Hospital ABC", org1, org2);
        
        // Deactivate
        vm.prank(ministry);
        accessControl.setOrgActive(orgId, false);
        
        // Check roles cleared
        assertFalse(accessControl.isVerifiedOrganization(org1), "Primary should not be verified");
        assertFalse(accessControl.isVerifiedOrganization(org2), "Backup should not be verified");
        
        // Check orgVerifications.active = false
        (,,, bool active1) = accessControl.getOrgVerification(org1);
        (,,, bool active2) = accessControl.getOrgVerification(org2);
        assertFalse(active1, "Primary orgVerifications.active should be false");
        assertFalse(active2, "Backup orgVerifications.active should be false");
        
        // isActiveOrgAdmin should also return false
        assertFalse(accessControl.isActiveOrgAdmin(org1), "Primary should not be active admin");
        assertFalse(accessControl.isActiveOrgAdmin(org2), "Backup should not be active admin");
    }
    
    function test_SetOrgActive_ReactivatesOrg() public {
        uint256 orgId = _createOrgViaMinistry("Hospital ABC", org1, org2);
        
        // Deactivate then reactivate
        vm.startPrank(ministry);
        accessControl.setOrgActive(orgId, false);
        accessControl.setOrgActive(orgId, true);
        vm.stopPrank();
        
        // Check roles restored
        assertTrue(accessControl.isVerifiedOrganization(org1), "Primary should be verified again");
        assertTrue(accessControl.isVerifiedOrganization(org2), "Backup should be verified again");
        
        // Check orgVerifications.active = true
        (,,, bool active1) = accessControl.getOrgVerification(org1);
        (,,, bool active2) = accessControl.getOrgVerification(org2);
        assertTrue(active1, "Primary orgVerifications.active should be true");
        assertTrue(active2, "Backup orgVerifications.active should be true");
    }
    
    // ========== ORG MEMBER MANAGEMENT (orgId-based) TESTS ==========
    
    function test_AddOrgMember_Success() public {
        uint256 orgId = _createOrgViaMinistry("Hospital ABC", org1, address(0));
        
        // Register doctor
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        
        // Add member (called by org admin)
        vm.prank(org1);
        accessControl.addOrgMember(orgId, doctor1);
        
        // Verify
        assertTrue(accessControl.isDoctorMemberOfOrg(orgId, doctor1), "Doctor should be member");
        address[] memory members = accessControl.getOrgMembersByOrgId(orgId);
        assertEq(members.length, 1, "Should have 1 member");
        assertEq(members[0], doctor1, "Member should be doctor1");
    }
    
    function test_AddOrgMember_RevertWhen_NotOrgAdmin() public {
        uint256 orgId = _createOrgViaMinistry("Hospital ABC", org1, address(0));
        
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        
        // Attacker tries to add member
        vm.expectRevert(IAccessControl.NotAuthorized.selector);
        vm.prank(attacker);
        accessControl.addOrgMember(orgId, doctor1);
    }
    
    function test_RemoveOrgMember_Success() public {
        uint256 orgId = _createOrgViaMinistry("Hospital ABC", org1, address(0));
        
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        
        vm.startPrank(org1);
        accessControl.addOrgMember(orgId, doctor1);
        accessControl.removeOrgMember(orgId, doctor1);
        vm.stopPrank();
        
        assertFalse(accessControl.isDoctorMemberOfOrg(orgId, doctor1), "Doctor should not be member");
    }
    
    // ========== DEPRECATED FUNCTION TESTS ==========
    
    function test_AddMember_RevertWhen_Deprecated() public {
        vm.expectRevert(IAccessControl.NotAuthorized.selector);
        vm.prank(org1);
        accessControl.addMember(org1, doctor1);
    }
    
    function test_RemoveMember_RevertWhen_Deprecated() public {
        vm.expectRevert(IAccessControl.NotAuthorized.selector);
        vm.prank(org1);
        accessControl.removeMember(org1, doctor1);
    }
}
