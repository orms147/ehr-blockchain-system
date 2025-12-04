// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/RecordRegistry.sol";
import "../src/interfaces/IAccessControl.sol";  // cần import interface

contract DeployRecordRegistry is Script {

    address constant ACCESS_CONTROL_ADDRESS = 0xBC35a6D05655858a2e8daba06f31611a6251ae8c;

    function run() external returns (RecordRegistry recordRegistry) {
        vm.startBroadcast();

        recordRegistry = new RecordRegistry(
            IAccessControl(ACCESS_CONTROL_ADDRESS)   
        );

        vm.stopBroadcast();
    }
}
