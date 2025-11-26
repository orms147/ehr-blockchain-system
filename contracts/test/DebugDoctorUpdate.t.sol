// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AccessControl.sol";
import "../src/RecordRegistry.sol";
import "../src/ConsentLedger.sol";
import "../src/DoctorUpdate.sol";

contract DebugDoctorUpdateTest is Test {
    AccessControl public accessControl;
    RecordRegistry public recordRegistry;
    ConsentLedger public consentLedger;
    DoctorUpdate public doctorUpdate;
    
    address public ministry = makeAddr("ministry");
    address public doctor1 = makeAddr("doctor1");
    address public patient1 = makeAddr("patient1");
    
    function setUp() public {
        vm.prank(ministry);
        accessControl = new AccessControl(ministry);
        
        recordRegistry = new RecordRegistry(accessControl);
        
        vm.prank(ministry);
        consentLedger = new ConsentLedger(ministry);
        
        doctorUpdate = new DoctorUpdate(accessControl, recordRegistry, consentLedger);
        
        // Register doctor
        vm.prank(doctor1);
        accessControl.registerAsDoctor();
        
        // Register patient
        vm.prank(patient1);
        accessControl.registerAsPatient();
    }
    
    function test_Debug_IsDoctor() public view {
        bool isDoc = accessControl.isDoctor(doctor1);
        console.log("Is Doctor:", isDoc);
        require(isDoc, "Should be doctor");
    }
    
    function test_Debug_AddRecord() public {
        vm.prank(doctor1);
        doctorUpdate.addRecordByDoctor(
            "CID",
            "",
            "Type",
            patient1,
            bytes32(uint256(1)),
            bytes32(uint256(2)),
            0
        );
    }
}
