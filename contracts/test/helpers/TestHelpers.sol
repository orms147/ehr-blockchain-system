// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";

/**
 * @title TestHelpers
 * @notice Base contract for tests with common utilities
 */
contract TestHelpers is Test {
    // Common constants for testing
    bytes32 constant CID_HASH_1 = keccak256("QmTestCID1");
    bytes32 constant CID_HASH_2 = keccak256("QmTestCID2");
    bytes32 constant CID_HASH_3 = keccak256("QmTestCID3");
    
    bytes32 constant PARENT_CID_HASH = bytes32(0);
    
    bytes32 constant RECORD_TYPE_DIAGNOSIS = keccak256("Diagnosis");
    bytes32 constant RECORD_TYPE_LAB = keccak256("LabResult");
    bytes32 constant RECORD_TYPE_PRESCRIPTION = keccak256("Prescription");
    
    bytes32 constant ENC_KEY_HASH_1 = keccak256("encKey1");
    bytes32 constant ENC_KEY_HASH_2 = keccak256("encKey2");

    // Helper to create a deterministic address
    function createAddress(string memory name) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(name)))));
    }
    
    // Helper to get current timestamp as uint40
    function nowU40() internal view returns (uint40) {
        return uint40(block.timestamp);
    }
    
    // Helper for time manipulation
    function skipTime(uint256 duration) internal {
        vm.warp(block.timestamp + duration);
    }
}
