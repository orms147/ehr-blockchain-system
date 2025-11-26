// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IAccessControl.sol";

/**
 * @title AccessControl - Healthcare Verification System
 * @notice 3-tier system:
 * - Level 1: Self-registration (anyone can register)
 * - Level 2: Ver nstry of Health (admin)
 * 
 * @dev Gas optimized with bitwise operations
 */
contract AccessControl is IAccessControl {
    // ================ ROLES (Bitwise) ================
    uint8 private constant PATIENT = 1 << 0;        // 0001 - Bệnh nhân
    uint8 private constant DOCTOR = 1 << 1;         // 0010 - Bác sĩ (chưa verified)
    uint8 private constant ORGANIZATION = 1 << 2;   // 0100 - Tổ chức (chưa verified)
    uint8 private constant MINISTRY = 1 << 3;       // 1000 - Bộ Y Tế

    // ================ VERIFICATION FLAGS ================
    uint8 private constant VERIFIED_DOCTOR = 1 << 4;      // 10000
    uint8 private constant VERIFIED_ORG = 1 << 5;         // 100000

    // ================ STORAGE ================
    address public immutable override MINISTRY_OF_HEALTH;
    
    // User roles (packed in uint8)
    mapping(address => uint8) private _roles;
    
    // Verification records (using struct from interface)
    mapping(address => Verification) public doctorVerifications;
    mapping(address => Verification) public orgVerifications;
    
    // Organization members (để track bác sĩ thuộc org nào)
    mapping(address => address[]) public orgMembers; // org => doctors[]

    // ================ CONSTRUCTOR ================
    constructor(address ministryAddress) {
        if (ministryAddress == address(0)) revert InvalidAddress();
        
        MINISTRY_OF_HEALTH = ministryAddress;
        _roles[ministryAddress] = MINISTRY | VERIFIED_ORG;
        
        emit UserRegistered(ministryAddress, "MINISTRY");
    }

    // ================ MODIFIERS ================
    modifier onlyMinistry() {
        if ((_roles[msg.sender] & MINISTRY) == 0) revert NotAuthorized();
        _;
    }

    modifier onlyVerifiedOrg() {
        if ((_roles[msg.sender] & VERIFIED_ORG) == 0) revert NotAuthorized();
        _;
    }

    // ================ LEVEL 1: SELF-REGISTRATION ================
    
    /**
     * @notice Bất kỳ ai cũng có thể tự đăng ký làm bệnh nhân
     */
    function registerAsPatient() external override {
        // Allow multiple roles (e.g. Doctor can be Patient)
        _roles[msg.sender] |= PATIENT;
        emit UserRegistered(msg.sender, "PATIENT");
    }

    /**
     * @notice Bất kỳ ai cũng có thể tự đăng ký làm bác sĩ (chưa verified)
     */
    function registerAsDoctor() external override {
        // Allow multiple roles
        _roles[msg.sender] |= DOCTOR;
        emit UserRegistered(msg.sender, "DOCTOR_UNVERIFIED");
    }

    /**
     * @notice Bất kỳ ai cũng có thể tự đăng ký làm tổ chức y tế (chưa verified)
     */
    function registerAsOrganization() external override {
        // Allow multiple roles
        _roles[msg.sender] |= ORGANIZATION;
        emit UserRegistered(msg.sender, "ORGANIZATION_UNVERIFIED");
    }

    // ================ LEVEL 2: VERIFICATION ================

    /**
     * @notice Bộ Y Tế verify tổ chức y tế (bệnh viện, phòng khám, sở y tế)
     * @param org Địa chỉ tổ chức cần verify
     * @param orgName Tên tổ chức (VD: "Bệnh viện Bạch Mai")
     */
    function verifyOrganization(address org, string calldata orgName) 
        external override onlyMinistry 
    {
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

    /**
     * @notice Tổ chức đã verified có thể verify bác sĩ
     * @param doctor Địa chỉ bác sĩ cần verify
     * @param credential Chứng chỉ (VD: "Bác sĩ Nội khoa - Bệnh viện X")
     */
    function verifyDoctor(address doctor, string calldata credential) 
        external override onlyVerifiedOrg 
    {
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
        
        // Add to org members
        orgMembers[msg.sender].push(doctor);
        
        emit DoctorVerified(doctor, msg.sender, credential);
    }

    /**
     * @notice Bộ Y Tế có thể verify bác sĩ trực tiếp
     * @dev Dùng cho bác sĩ tự do xin chứng chỉ hành nghề
     */
    function verifyDoctorByMinistry(address doctor, string calldata credential) 
        external override onlyMinistry 
    {
        if ((_roles[doctor] & DOCTOR) == 0) revert NotAuthorized();
        
        _roles[doctor] |= VERIFIED_DOCTOR;
        
        doctorVerifications[doctor] = Verification({
            verifier: msg.sender,
            credential: credential,
            verifiedAt: uint40(block.timestamp),
            active: true
        });
        
        emit DoctorVerified(doctor, msg.sender, credential);
    }

    // ================ REVOKE VERIFICATION ================

    /**
     * @notice Thu hồi xác thực bác sĩ
     * @dev Chỉ org verify hoặc Ministry mới thu hồi được
     */
    function revokeDoctorVerification(address doctor) external override {
        Verification storage verif = doctorVerifications[doctor];
        
        // Chỉ verifier hoặc Ministry mới revoke được
        if (msg.sender != verif.verifier && msg.sender != MINISTRY_OF_HEALTH) {
            revert NotAuthorized();
        }
        
        verif.active = false;
        _roles[doctor] &= ~VERIFIED_DOCTOR; // Remove verified flag
        
        emit VerificationRevoked(doctor, msg.sender);
    }

    /**
     * @notice Thu hồi xác thực tổ chức (chỉ Ministry)
     */
    function revokeOrgVerification(address org) external override onlyMinistry {
        orgVerifications[org].active = false;
        _roles[org] &= ~VERIFIED_ORG;
        
        emit VerificationRevoked(org, msg.sender);
    }

    // ================ VIEW FUNCTIONS ================

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

    /**
     * @notice Lấy thông tin verify của bác sĩ
     * @return verifier Ai verify
     * @return credential Chứng chỉ/Tổ chức
     * @return verifiedAt Thời gian verify
     * @return isVerified Còn hiệu lực không
     */
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

    /**
     * @notice Lấy thông tin verify của tổ chức
     */
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

    /**
     * @notice Lấy danh sách bác sĩ của tổ chức
     */
    function getOrgMembers(address org) external view override returns (address[] memory) {
        return orgMembers[org];
    }

    /**
     * @notice Kiểm tra trạng thái đầy đủ của user
     */
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