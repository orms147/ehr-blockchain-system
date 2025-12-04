// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ConsentLedger.sol";

contract DeployConsentLedger is Script {
    function run() external returns (ConsentLedger consentLedger) {
        vm.startBroadcast();

        consentLedger = new ConsentLedger(0x71aDE4593711749EA08A3552A59A832c1b40A955);

        vm.stopBroadcast();
    }
}
