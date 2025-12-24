// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/AccessControl.sol";
import "../src/RecordRegistry.sol";
import "../src/ConsentLedger.sol";
import "../src/EHRSystemSecure.sol";
import "../src/DoctorUpdate.sol";

contract DeployAll is Script {
    function run() external {
        vm.startBroadcast();
        address deployer = vm.envAddress("DEPLOYER_ADDR");

        // 1. Deploy AccessControl
        AccessControl accessControl = new AccessControl(deployer);
        console.log("AccessControl deployed at:", address(accessControl));

        // 2. Deploy ConsentLedger
        ConsentLedger consentLedger = new ConsentLedger(deployer);
        console.log("ConsentLedger deployed at:", address(consentLedger));

        // 3. Deploy RecordRegistry
        RecordRegistry recordRegistry = new RecordRegistry(accessControl);
        console.log("RecordRegistry deployed at:", address(recordRegistry));

        // 4. Deploy EHRSystemSecure
        EHRSystemSecure ehrSystem = new EHRSystemSecure(
            address(accessControl),
            address(recordRegistry),
            address(consentLedger)
        );
        console.log("EHRSystemSecure deployed at:", address(ehrSystem));

        // 5. Deploy DoctorUpdate
        DoctorUpdate doctorUpdate = new DoctorUpdate(
            accessControl,
            recordRegistry,
            consentLedger
        );
        console.log("DoctorUpdate deployed at:", address(doctorUpdate));

        // ============ WIRING & CONFIGURATION ============
        
        // 6. Setup RecordRegistry
        recordRegistry.setConsentLedger(address(consentLedger));
        recordRegistry.authorizeContract(address(doctorUpdate), true);
        console.log("RecordRegistry configured");
        
        // 7. Authorize Sponsor (for gas sponsorship - relayer backend)
        address sponsor = vm.envOr("SPONSOR_ADDRESS", address(0));
        if (sponsor != address(0)) {
            accessControl.setRelayer(sponsor, true);
            recordRegistry.authorizeSponsor(sponsor, true);
            consentLedger.authorizeSponsor(sponsor, true);
            console.log("Sponsor authorized on all contracts:", sponsor);
        } else {
            console.log("WARNING: SPONSOR_ADDRESS not set, skipping authorization");
        }


        // 8. Setup ConsentLedger
        consentLedger.authorizeContract(address(ehrSystem), true);
        consentLedger.authorizeContract(address(doctorUpdate), true);
        console.log("ConsentLedger configured");


        vm.stopBroadcast();

    }
}
