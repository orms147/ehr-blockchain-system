// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "src/interfaces/IAccessControl.sol";

contract AccessControl is IAccessControl{
    // lot of storage slots!
    // mapping(address => bool) public isPatient;
    // mapping(address => bool) public isDoctor;
    // mapping(address => bool) public isOrganization;
    // mapping(address => bool) public isVerifiedDoctor;
    // mapping(address => bool) public isVerifiedOrg;

    // Bitwise : 
    // OR(|) -> Add role : I'm a doctor, patient too
    // AND(&) -> Check role : 01 AND 01 != 0 
    // AND(&) and NOT(~) -> remove role : 
    //              ~DOCTOR : 1111 1101
    //              Use as doctor and patient : 0000 0011
    //              Remove Doctor role : 0000 0011 & 1111 1101 = 0000 0001 (Patient)

    // Roles
    uint8 private constant PATIENT = 1 << 0;        // 0001 
    uint8 private constant DOCTOR = 1 << 1;         // 0010 
    uint8 private constant ORGANIZATION = 1 << 2;   // 0100 
    uint8 private constant MINISTRY = 1 << 3;       // 1000 

    // Veridication flags
    uint8 private constant VERIFIED_DOCTOR = 1 << 4;      // 0001 0000
    uint8 private constant VERIFIED_ORG = 1 << 5;         // 0010 0000

    // Storage
    address public immutable override MINISTRY_OF_HEALTH;   //override func from Interface

    // User role
    mapping(address => uint8) private _roles;

    // Verification struct (Interface)
    mapping(address => Verification) public doctorVerifications;
    mapping(address => Verification) public orgVerifications;

    // Organization members (track doctor in Org)
    mapping(address => address[]) public orgMembers; // org => doctors[]
    mapping(address => mapping(address => bool)) public isMemberOfOrg;

    // Constructor
    constructor (address ministryAddress) {
        if (ministryAddress == address(0)) revert InvalidAddress();

        MINISTRY_OF_HEALTH = ministryAddress;
        _roles[ministryAddress] = MINISTRY | ORGANIZATION | VERIFIED_ORG;

        orgVerifications[ministryAddress] = Verification({
             verifier: ministryAddress,
             credential: "Ministry of Health",
             verifiedAt: uint40(block.timestamp),
             active: true
           });

        emit UserRegistered(ministryAddress, "Ministry of Health");
    }

    // Modifier
    modifier onlyMinistry() {
        if ((_roles[msg.sender] & MINISTRY) == 0) revert NotAuthorized();
        _;
    }

    modifier onlyVerifiedOrg() {
        if ((_roles[msg.sender] & VERIFIED_ORG) == 0) revert NotAuthorized();
        _;
    }

    // Register
    
    function registerAsPatient() external override {
        // Allow multiple roles (e.g. Doctor can be Patient)
        _roles[msg.sender] |= PATIENT;
        emit UserRegistered(msg.sender, "PATIENT");
    }

    function registerAsDoctor() external override {
        // Allow multiple roles
        _roles[msg.sender] |= DOCTOR;
        emit UserRegistered(msg.sender, "DOCTOR_UNVERIFIED");
    }

    function registerAsOrganization() external override {
        // Allow multiple roles
        _roles[msg.sender] |= ORGANIZATION;
        emit UserRegistered(msg.sender, "ORGANIZATION_UNVERIFIED");
    }

    // Verification
    
    function verifyOrganization(address org, string calldata orgName) external override onlyMinistry {
        if ((_roles[org] & ORGANIZATION) == 0) revert NotAuthorized();
        
        // Add verified flag
        _roles[org] |= VERIFIED_ORG;
        
        // Record verification
        orgVerifications[org] = Verification({
            verifier: msg.sender,
            credential: orgName,
            verifiedAt: uint40(block.timestamp),
            active: true
        });
        
        emit OrganizationVerified(org, orgName);
    }

    // VERIFIED ORG can verify doctor
    function verifyDoctor(address doctor, string calldata credential) external override onlyVerifiedOrg {
        _verifyDoctor(doctor, credential);
    }

    // VERIFIED by MINISTRY (implements interface)
    function verifyDoctorByMinistry(address doctor, string calldata credential) external override onlyMinistry {
        _verifyDoctor(doctor, credential);
    }

    // VERIFIED ORG can verify doctor
    function _verifyDoctor(address doctor, string memory credential) internal {
        if ((_roles[doctor] & DOCTOR) == 0) revert NotAuthorized();
        
        // Add verified flag
        _roles[doctor] |= VERIFIED_DOCTOR;
        
        // Record verification
        doctorVerifications[doctor] = Verification({
            verifier: msg.sender,
            credential: credential,
            verifiedAt: uint40(block.timestamp),
            active: true
        });
        
        emit DoctorVerified(doctor, msg.sender, credential);
    }

    
    // ORG member

    function addMember(address org, address doctor) external override{
        if ((_roles[msg.sender] & VERIFIED_ORG) == 0) revert NotAuthorized();
        if (msg.sender != org) revert NotAuthorized();

        if ((_roles[doctor] & DOCTOR) == 0) revert NotAuthorized();

        if (isMemberOfOrg[org][doctor]) {
            return;
        }

        // Add relationship
        isMemberOfOrg[org][doctor] = true;
        orgMembers[org].push(doctor);

        emit MemberAdded(org, doctor);
    }

    function removeMember(address org, address doctor) external override{
        if ((_roles[msg.sender] & VERIFIED_ORG) == 0) revert NotAuthorized();
        if (msg.sender != org) revert NotAuthorized();

        if (!isMemberOfOrg[org][doctor]) {
            return;
        }

        isMemberOfOrg[org][doctor] = false;

        address[] storage list = orgMembers[org];
        uint256 len = list.length;

        for (uint256 i = 0; i < len; ++i) {
            if (list[i] == doctor) {
                list[i] = list[len - 1];
                list.pop();
                break;
            }
        }

        emit MemberRemoved(org, doctor);
    }

    // Revoke verification

    function revokeDoctorVerification(address doctor) external override {
        Verification storage verif = doctorVerifications[doctor];
        if (!verif.active) revert NotAuthorized();  //don't need to revoke

        // Omly verifier or Ministry can revoke 
        if (msg.sender != verif.verifier && msg.sender != MINISTRY_OF_HEALTH) {
            revert NotAuthorized();
        }
        
        verif.active = false;
        _roles[doctor] &= ~VERIFIED_DOCTOR; // Remove verified flag
        
        emit VerificationRevoked(doctor, msg.sender);
    }

    function revokeOrgVerification(address org) external override onlyMinistry {
        orgVerifications[org].active = false;
        _roles[org] &= ~VERIFIED_ORG;
        
        emit VerificationRevoked(org, msg.sender);
    }

    // View function

    function isPatient(address user) external view override returns (bool) {
        return (_roles[user] & PATIENT) != 0;
    }

    function isDoctor(address user) external view override returns (bool) {
        return (_roles[user] & DOCTOR) != 0;
    }

    function isVerifiedDoctor(address user) external view override returns (bool) {
        return (_roles[user] & VERIFIED_DOCTOR) != 0 && 
               doctorVerifications[user].active;
    }

    function isOrganization(address user) external view override returns (bool) {
        return (_roles[user] & ORGANIZATION) != 0;
    }

    function isVerifiedOrganization(address user) external view override returns (bool) {
        return (_roles[user] & VERIFIED_ORG) != 0 && 
               orgVerifications[user].active;
    }

    function isMinistry(address user) external view override returns (bool) {
        return (_roles[user] & MINISTRY) != 0;
    }

    function getDoctorVerification(address doctor) 
        external view override returns (
            address verifier,
            string memory credential,
            uint40 verifiedAt,
            bool isVerified
        ) 
    {
        Verification memory v = doctorVerifications[doctor];
        return (v.verifier, v.credential, v.verifiedAt, v.active);
    }

    function getOrgVerification(address org) 
        external view override returns (
            address verifier,
            string memory orgName,
            uint40 verifiedAt,
            bool isVerified
        ) 
    {
        Verification memory v = orgVerifications[org];
        return (v.verifier, v.credential, v.verifiedAt, v.active);
    }

    function getOrgMembers(address org) external view override returns (address[] memory) {
        return orgMembers[org];
    }

    // User's role status
    function getUserStatus(address user) 
        external view override returns (
            bool isPatient_,
            bool isDoctor_,
            bool isDoctorVerified,
            bool isOrg,
            bool isOrgVerified,
            bool isMinistry_
        ) 
    {
        uint8 role = _roles[user];
        
        return (
            (role & PATIENT) != 0,
            (role & DOCTOR) != 0,
            (role & VERIFIED_DOCTOR) != 0 && doctorVerifications[user].active,
            (role & ORGANIZATION) != 0,
            (role & VERIFIED_ORG) != 0 && orgVerifications[user].active,
            (role & MINISTRY) != 0
        );
    }
}