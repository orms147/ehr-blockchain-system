// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/AccessControl.sol";

contract DeployAccessControl is Script {
    function run() external returns (AccessControl accessControl) {
        vm.startBroadcast();

        accessControl = new AccessControl(0x71aDE4593711749EA08A3552A59A832c1b40A955);

        vm.stopBroadcast();
    }
}
