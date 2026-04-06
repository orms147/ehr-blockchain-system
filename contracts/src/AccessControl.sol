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

    // Organization members (track doctor in Org) - MIGRATED TO orgId
    mapping(uint256 => address[]) public orgMembersByOrgId;  // orgId => doctors[]
    mapping(uint256 => mapping(address => bool)) public isMemberOfOrgById;  // orgId => doctor => bool
    
    // DEPRECATED: Legacy mappings (kept for backward compatibility reads)
    mapping(address => address[]) public orgMembers; // DEPRECATED
    mapping(address => mapping(address => bool)) public isMemberOfOrg; // DEPRECATED

    // Authorized relayers (for gas sponsorship)
    mapping(address => bool) public authorizedRelayers;

    // ============ ORGANIZATION ENTITY STORAGE ============
    uint256 public orgCount;
    mapping(uint256 => Organization) public organizations;
    mapping(address => uint256) public adminToOrgId;  // admin wallet => orgId (0 = not admin)

    // Constructor
    constructor (address ministryAddress) {
        if (ministryAddress == address(0)) revert InvalidAddress();

        MINISTRY_OF_HEALTH = ministryAddress;
        
        // Ministry only has MINISTRY role - NOT ORGANIZATION
        // Ministry is regulator, not a hospital
        _roles[ministryAddress] = MINISTRY;

        // Ministry is also an authorized relayer by default
        authorizedRelayers[ministryAddress] = true;

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

    modifier onlyRelayer() {
        if (!authorizedRelayers[msg.sender]) revert NotAuthorized();
        _;
    }

    // ============ RELAYER MANAGEMENT ============

    function setRelayer(address relayer, bool authorized) external onlyMinistry {
        if (relayer == address(0)) revert InvalidAddress();
        authorizedRelayers[relayer] = authorized;
        emit RelayerUpdated(relayer, authorized);
    }

    // ============ ORGANIZATION MANAGEMENT (Ministry only) ============

    /// @notice Create new organization entity
    /// @param name Organization name
    /// @param primaryAdmin Primary admin wallet (required)
    /// @param backupAdmin Backup admin wallet (optional, address(0) if none)
    function createOrganization(
        string calldata name,
        address primaryAdmin,
        address backupAdmin
    ) external override onlyMinistry returns (uint256 orgId) {
        if (primaryAdmin == address(0)) revert InvalidAddress();
        if (bytes(name).length == 0) revert InvalidAddress();
        if (primaryAdmin == backupAdmin) revert InvalidAddress();
        
        // Primary admin must not be admin of another org
        if (adminToOrgId[primaryAdmin] != 0) revert AlreadyRegistered();
        
        // Backup admin (if set) must not be admin of another org
        if (backupAdmin != address(0) && adminToOrgId[backupAdmin] != 0) {
            revert AlreadyRegistered();
        }
        
        orgId = ++orgCount;
        
        organizations[orgId] = Organization({
            id: orgId,
            name: name,
            primaryAdmin: primaryAdmin,
            backupAdmin: backupAdmin,
            createdAt: uint40(block.timestamp),
            active: true
        });
        
        // Map admins to org
        adminToOrgId[primaryAdmin] = orgId;
        _roles[primaryAdmin] |= ORGANIZATION | VERIFIED_ORG;
        
        // Set orgVerifications so isVerifiedOrganization returns true
        orgVerifications[primaryAdmin] = Verification({
            verifier: msg.sender,
            credential: name,
            verifiedAt: uint40(block.timestamp),
            active: true
        });
        
        if (backupAdmin != address(0)) {
            adminToOrgId[backupAdmin] = orgId;
            _roles[backupAdmin] |= ORGANIZATION | VERIFIED_ORG;
            
            orgVerifications[backupAdmin] = Verification({
                verifier: msg.sender,
                credential: name,
                verifiedAt: uint40(block.timestamp),
                active: true
            });
        }
        
        emit OrganizationCreated(orgId, name, primaryAdmin, backupAdmin);
    }

    /// @notice Change organization admins (for recovery/rotation)
    /// @param orgId Organization ID
    /// @param newPrimary New primary admin wallet
    /// @param newBackup New backup admin wallet (optional)
    function setOrgAdmins(
        uint256 orgId,
        address newPrimary,
        address newBackup
    ) external override onlyMinistry {
        Organization storage org = organizations[orgId];
        if (org.id == 0 || newPrimary == address(0)) revert InvalidAddress();
        if (newPrimary == newBackup) revert InvalidAddress();
        
        // Check new admins don't belong to OTHER orgs (allow swap in same org)
        if (adminToOrgId[newPrimary] != 0 && adminToOrgId[newPrimary] != orgId) {
            revert AlreadyRegistered();
        }
        if (newBackup != address(0) && adminToOrgId[newBackup] != 0 && adminToOrgId[newBackup] != orgId) {
            revert AlreadyRegistered();
        }
        
        // Store old values for event
        address oldPrimary = org.primaryAdmin;
        address oldBackup = org.backupAdmin;
        
        // Clear old admins
        _clearAdmin(oldPrimary);
        _clearAdmin(oldBackup);
        
        // Set new admins
        org.primaryAdmin = newPrimary;
        org.backupAdmin = newBackup;
        
        adminToOrgId[newPrimary] = orgId;
        _roles[newPrimary] |= ORGANIZATION | VERIFIED_ORG;
        
        // Set orgVerifications for new primary admin
        orgVerifications[newPrimary] = Verification({
            verifier: msg.sender,
            credential: org.name,
            verifiedAt: uint40(block.timestamp),
            active: true
        });
        
        if (newBackup != address(0)) {
            adminToOrgId[newBackup] = orgId;
            _roles[newBackup] |= ORGANIZATION | VERIFIED_ORG;
            
            // Set orgVerifications for new backup admin
            orgVerifications[newBackup] = Verification({
                verifier: msg.sender,
                credential: org.name,
                verifiedAt: uint40(block.timestamp),
                active: true
            });
        }
        
        emit OrganizationAdminChanged(orgId, oldPrimary, newPrimary, oldBackup, newBackup);
    }

    /// @notice Activate/deactivate organization
    function setOrgActive(uint256 orgId, bool active) external override onlyMinistry {
        Organization storage org = organizations[orgId];
        if (org.id == 0) revert InvalidAddress();
        
        org.active = active;
        
        // Update roles AND orgVerifications based on active status
        if (active) {
            _roles[org.primaryAdmin] |= VERIFIED_ORG;
            orgVerifications[org.primaryAdmin].active = true;
            if (org.backupAdmin != address(0)) {
                _roles[org.backupAdmin] |= VERIFIED_ORG;
                orgVerifications[org.backupAdmin].active = true;
            }
        } else {
            _roles[org.primaryAdmin] &= ~VERIFIED_ORG;
            orgVerifications[org.primaryAdmin].active = false;
            if (org.backupAdmin != address(0)) {
                _roles[org.backupAdmin] &= ~VERIFIED_ORG;
                orgVerifications[org.backupAdmin].active = false;
            }
        }
        
        emit OrganizationStatusChanged(orgId, active);
    }

    /// @dev Clear admin mapping, roles, and verification
    function _clearAdmin(address admin) internal {
        if (admin != address(0)) {
            adminToOrgId[admin] = 0;
            _roles[admin] &= ~(ORGANIZATION | VERIFIED_ORG);
            orgVerifications[admin].active = false;  // Sync with roles
            emit OrgAdminCleared(admin);
        }
    }

    // ============ REGISTER (Self) ============
    
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

    /// @notice DEPRECATED - Use Ministry createOrganization instead
    function registerAsOrganization() external override {
        emit DeprecatedFunctionCalled(msg.sender, "registerAsOrganization");
        revert NotAuthorized();
    }

    // ============ REGISTER (Relayer - for gas sponsorship) ============

    /// @notice Register a user as Patient - called by authorized relayer
    /// @param user The address to register as patient
    function registerPatientFor(address user) external onlyRelayer {
        if (user == address(0)) revert InvalidAddress();
        _roles[user] |= PATIENT;
        emit UserRegistered(user, "PATIENT");
    }

    /// @notice Register a user as Doctor - called by authorized relayer
    /// @param user The address to register as doctor
    function registerDoctorFor(address user) external onlyRelayer {
        if (user == address(0)) revert InvalidAddress();
        _roles[user] |= DOCTOR;
        emit UserRegistered(user, "DOCTOR_UNVERIFIED");
    }


    // ============ VERIFICATION ============
    
    /// @notice DEPRECATED - Use createOrganization instead
    function verifyOrganization(address org, string calldata orgName) external override onlyMinistry {
        emit DeprecatedFunctionCalled(msg.sender, "verifyOrganization");
        // Keep compatibility: still works for legacy wallets
        if ((_roles[org] & ORGANIZATION) == 0) revert NotAuthorized();
        if (org == address(0)) revert InvalidAddress();
        _roles[org] |= VERIFIED_ORG;
        orgVerifications[org] = Verification({
            verifier: msg.sender,
            credential: orgName,
            verifiedAt: uint40(block.timestamp),
            active: true
        });
        emit OrganizationVerified(org, orgName);
    }

    /// @notice Org admin verifies doctor (with orgId audit trail)
    function verifyDoctor(address doctor, string calldata credential) external override {
        uint256 orgId = adminToOrgId[msg.sender];
        if (orgId == 0 || !organizations[orgId].active) revert NotAuthorized();
        _verifyDoctor(doctor, credential, orgId);
    }

    /// @notice Ministry verifies doctor directly
    function verifyDoctorByMinistry(address doctor, string calldata credential) external override onlyMinistry {
        _verifyDoctor(doctor, credential, 0);  // orgId = 0 for Ministry
    }

    /// @dev Internal: verify doctor with orgId for audit
    function _verifyDoctor(address doctor, string memory credential, uint256 orgId) internal {
        if ((_roles[doctor] & DOCTOR) == 0) revert NotAuthorized();
        
        _roles[doctor] |= VERIFIED_DOCTOR;
        
        doctorVerifications[doctor] = Verification({
            verifier: msg.sender,
            credential: credential,
            verifiedAt: uint40(block.timestamp),
            active: true
        });
        
        emit DoctorVerified(doctor, msg.sender, orgId, credential);
    }

    
    // ============ ORG MEMBER MANAGEMENT (orgId-based) ============

    /// @notice Add doctor to organization (org admin only)
    function addOrgMember(uint256 orgId, address doctor) external {
        // Caller must be active admin of this org
        if (!isActiveOrgAdmin(msg.sender)) revert NotAuthorized();
        if (adminToOrgId[msg.sender] != orgId) revert NotAuthorized();
        
        // Doctor must be registered
        if ((_roles[doctor] & DOCTOR) == 0) revert NotAuthorized();
        
        // Skip if already member
        if (isMemberOfOrgById[orgId][doctor]) return;
        
        // Add relationship
        isMemberOfOrgById[orgId][doctor] = true;
        orgMembersByOrgId[orgId].push(doctor);
        
        emit MemberAdded(organizations[orgId].primaryAdmin, doctor);  // Legacy event format
    }

    /// @notice Remove doctor from organization (org admin only)
    function removeOrgMember(uint256 orgId, address doctor) external {
        // Caller must be active admin of this org
        if (!isActiveOrgAdmin(msg.sender)) revert NotAuthorized();
        if (adminToOrgId[msg.sender] != orgId) revert NotAuthorized();
        
        // Skip if not member
        if (!isMemberOfOrgById[orgId][doctor]) return;
        
        isMemberOfOrgById[orgId][doctor] = false;
        
        // Remove from array
        address[] storage list = orgMembersByOrgId[orgId];
        uint256 len = list.length;
        for (uint256 i = 0; i < len; ++i) {
            if (list[i] == doctor) {
                list[i] = list[len - 1];
                list.pop();
                break;
            }
        }
        
        emit MemberRemoved(organizations[orgId].primaryAdmin, doctor);  // Legacy event format
    }

    /// @notice Get org members by orgId
    function getOrgMembersByOrgId(uint256 orgId) external view returns (address[] memory) {
        return orgMembersByOrgId[orgId];
    }

    /// @notice Check if doctor is member of org
    function isDoctorMemberOfOrg(uint256 orgId, address doctor) external view returns (bool) {
        return isMemberOfOrgById[orgId][doctor];
    }

    // ============ DEPRECATED: Legacy member functions ============

    /// @notice DEPRECATED - Use addOrgMember(orgId, doctor) instead
    function addMember(address org, address doctor) external override {
        emit DeprecatedFunctionCalled(msg.sender, "addMember");
        revert NotAuthorized();
    }

    /// @notice DEPRECATED - Use removeOrgMember(orgId, doctor) instead
    function removeMember(address org, address doctor) external override {
        emit DeprecatedFunctionCalled(msg.sender, "removeMember");
        revert NotAuthorized();
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

    /// @notice Check if user is active org admin
    function isActiveOrgAdmin(address user) public view override returns (bool) {
        uint256 orgId = adminToOrgId[user];
        return orgId != 0 && organizations[orgId].active;
    }

    /// @notice Get organization by ID
    function getOrganization(uint256 orgId) external view override returns (Organization memory) {
        return organizations[orgId];
    }

    /// @notice Get org ID for admin wallet
    function getAdminOrgId(address admin) external view override returns (uint256) {
        return adminToOrgId[admin];
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