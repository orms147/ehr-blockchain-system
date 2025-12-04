// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/EHRSystemSecure.sol";

contract DeployEHRSystemSecure is Script {
    function run() external returns (EHRSystemSecure eHRSystemSecure) {
        vm.startBroadcast();

        eHRSystemSecure = new EHRSystemSecure(
            0xBC35a6D05655858a2e8daba06f31611a6251ae8c,
            0xB887f8c5ae6D384F19b1Db717322E789758627d6,
            0x4490fFFe17b9bDbE476018Fd5E7F0dB53AB7df2d
        );

        vm.stopBroadcast();
    }
}
