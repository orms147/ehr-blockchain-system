// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAccessControl {
    struct Verification {
        address verifier;
        string credential;      
        uint40 verifiedAt;      // unit32 = 4,29 bil secs = 136 years
        bool active;
    }       

    // Event
    event UserRegistered(address indexed user, string roleType);
    event DoctorVerified(address indexed doctor, address indexed verifier, string credential);
    event OrganizationVerified(address indexed org, string name);
    event MemberAdded(address indexed org, address indexed doctor);
    event MemberRemoved(address indexed org, address indexed doctor);
    event VerificationRevoked(address indexed user, address indexed revoker);

    // Error
    error AlreadyRegistered();
    error NotAuthorized();
    error InvalidAddress();
    error NotVerifiedOrg();     // only verified org may verify doctors

    // Registration
    function registerAsPatient() external;
    function registerAsDoctor() external;
    function registerAsOrganization() external;

    // Verification
    function verifyOrganization(address org, string calldata orgName) external;
    function verifyDoctor(address doctor, string calldata credential) external;
    function verifyDoctorByMinistry(address doctor, string calldata credential) external;

    // Revocation
    function revokeDoctorVerification(address doctor) external;
    function revokeOrgVerification(address org) external;
    
    // Member management
    function addMember(address org, address doctor) external;
    function removeMember(address org, address doctor) external;

    // View functions
    function isPatient(address user) external view returns (bool);
    function isDoctor(address user) external view returns (bool);
    function isVerifiedDoctor(address user) external view returns (bool);
    function isOrganization(address user) external view returns (bool);
    function isVerifiedOrganization(address user) external view returns (bool);
    function isMinistry(address user) external view returns (bool);

    function getDoctorVerification(address doctor) external view returns (
        address verifier,
        string memory credential,
        uint40 verifiedAt,
        bool isVerified
    );

    function getOrgVerification(address org) external view returns (
        address verifier,
        string memory orgName,      //don't need credential cus only legit or not
        uint40 verifiedAt,
        bool isVerified
    );

    function getOrgMembers(address org) external view returns (address[] memory);

    function getUserStatus(address user) external view returns (
        bool isPatient_,
        bool isDoctor_,
        bool isDoctorVerified,
        bool isOrg,
        bool isOrgVerified,
        bool isMinistry_
    );

    function MINISTRY_OF_HEALTH() external view returns (address);  // As declare a variable

}