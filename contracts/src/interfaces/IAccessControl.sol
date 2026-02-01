// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAccessControl {
    // ============ STRUCTS ============
    
    struct Verification {
        address verifier;
        string credential;      
        uint40 verifiedAt;
        bool active;
    }

    struct Organization {
        uint256 id;
        string name;
        address primaryAdmin;
        address backupAdmin;
        uint40 createdAt;
        bool active;
    }

    // ============ EVENTS ============
    
    // User Registration
    event UserRegistered(address indexed user, string roleType);
    
    // Doctor Verification (includes orgId for audit trail)
    event DoctorVerified(address indexed doctor, address indexed verifier, uint256 indexed orgId, string credential);
    
    // Organization Entity Events
    event OrganizationCreated(uint256 indexed orgId, string name, address primaryAdmin, address backupAdmin);
    event OrganizationAdminChanged(uint256 indexed orgId, address oldPrimary, address newPrimary, address oldBackup, address newBackup);
    event OrganizationStatusChanged(uint256 indexed orgId, bool active);
    
    // Legacy (kept for backward compatibility)
    event OrganizationVerified(address indexed org, string name);
    event MemberAdded(address indexed org, address indexed doctor);
    event MemberRemoved(address indexed org, address indexed doctor);
    event VerificationRevoked(address indexed user, address indexed revoker);
    event RelayerUpdated(address indexed relayer, bool authorized);
    
    // Deprecation Warning
    event DeprecatedFunctionCalled(address indexed caller, string functionName);

    // ============ ERRORS ============
    
    error AlreadyRegistered();
    error NotAuthorized();
    error InvalidAddress();
    error NotVerifiedOrg();

    // ============ ORGANIZATION MANAGEMENT (Ministry only) ============
    
    function createOrganization(
        string calldata name,
        address primaryAdmin,
        address backupAdmin
    ) external returns (uint256 orgId);
    
    function setOrgAdmins(
        uint256 orgId,
        address newPrimary,
        address newBackup
    ) external;
    
    function setOrgActive(uint256 orgId, bool active) external;

    // ============ REGISTRATION ============
    
    function registerAsPatient() external;
    function registerAsDoctor() external;
    function registerAsOrganization() external; // DEPRECATED

    // ============ VERIFICATION ============
    
    function verifyOrganization(address org, string calldata orgName) external; // DEPRECATED
    function verifyDoctor(address doctor, string calldata credential) external;
    function verifyDoctorByMinistry(address doctor, string calldata credential) external;

    // ============ REVOCATION ============
    
    function revokeDoctorVerification(address doctor) external;
    function revokeOrgVerification(address org) external;
    
    // ============ MEMBER MANAGEMENT (orgId-based) ============
    
    function addOrgMember(uint256 orgId, address doctor) external;
    function removeOrgMember(uint256 orgId, address doctor) external;
    function getOrgMembersByOrgId(uint256 orgId) external view returns (address[] memory);
    function isDoctorMemberOfOrg(uint256 orgId, address doctor) external view returns (bool);
    
    // DEPRECATED: Legacy member functions (will revert)
    function addMember(address org, address doctor) external;
    function removeMember(address org, address doctor) external;

    // ============ VIEW FUNCTIONS ============
    
    function isPatient(address user) external view returns (bool);
    function isDoctor(address user) external view returns (bool);
    function isVerifiedDoctor(address user) external view returns (bool);
    function isOrganization(address user) external view returns (bool);
    function isVerifiedOrganization(address user) external view returns (bool);
    function isMinistry(address user) external view returns (bool);
    function isActiveOrgAdmin(address user) external view returns (bool);

    function getDoctorVerification(address doctor) external view returns (
        address verifier,
        string memory credential,
        uint40 verifiedAt,
        bool isVerified
    );

    function getOrgVerification(address org) external view returns (
        address verifier,
        string memory orgName,
        uint40 verifiedAt,
        bool isVerified
    );

    function getOrganization(uint256 orgId) external view returns (Organization memory);
    function getAdminOrgId(address admin) external view returns (uint256);
    
    // DEPRECATED: Legacy function, use getOrgMembersByOrgId(orgId) instead
    function getOrgMembers(address org) external view returns (address[] memory);

    function getUserStatus(address user) external view returns (
        bool isPatient_,
        bool isDoctor_,
        bool isDoctorVerified,
        bool isOrg,
        bool isOrgVerified,
        bool isMinistry_
    );

    function MINISTRY_OF_HEALTH() external view returns (address);
}
