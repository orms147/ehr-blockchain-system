// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AccessControl.sol";
import "../src/RecordRegistry.sol";
import "../src/ConsentLedger.sol";
import "../src/DoctorUpdate.sol";
import "./helpers/TestHelpers.sol";

contract DoctorUpdateDebugTest is TestHelpers {
    AccessControl public accessControl;
    RecordRegistry public recordRegistry;
    ConsentLedger public consentLedger;
    DoctorUpdate public doctorUpdate;
    
    address public ministry = makeAddr("ministry");
    address public doctor1 = makeAddr("doctor1");
    address public org1 = makeAddr("org1");
    
    function setUp() public {
        vm.prank(ministry);
        accessControl = new AccessControl(ministry);
        
        recordRegistry = new RecordRegistry(accessControl);
        
        vm.prank(ministry);
        consentLedger = new ConsentLedger(ministry);
        
        doctorUpdate = new DoctorUpdate(accessControl, recordRegistry, consentLedger);
        
        // Setup verified doctor
        vm.prank(org1);
        accessControl.registerAsOrganization();
        
        vm.prank(ministry);
        accessControl.verifyOrganization(org1, "Org");
        
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        
        vm.prank(org1);
        accessControl.verifyDoctor(doctor1, "Doc");
    }
    
    function test_Debug_IsDoctor() public view {
        bool isDoc = accessControl.isDoctor(doctor1);
        assertTrue(isDoc, "Doctor1 should be a doctor");
        
        bool isVerified = accessControl.isVerifiedDoctor(doctor1);
        assertTrue(isVerified, "Doctor1 should be verified");
    }
}
