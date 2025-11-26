// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";

/**
 * @title TestHelpers
 * @notice Utility functions for testing EHR System
 */
contract TestHelpers is Test {
    
    // ================ EIP-712 HELPERS ================
    
    /**
     * @notice Generate EIP-712 signature for consent permit
     */
    function signConsentPermit(
        uint256 privateKey,
        address patient,
        address grantee,
        string memory rootCID,
        bytes32 encKeyHash,
        uint40 expireAt,
        bool includeUpdates,
        bool allowDelegate,
        uint256 nonce,
        uint256 deadline,
        bytes32 domainSeparator,
        bytes32 permitTypeHash
    ) internal pure returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(
            permitTypeHash,
            patient,
            grantee,
            keccak256(bytes(rootCID)),
            encKeyHash,
            expireAt,
            includeUpdates,
            allowDelegate,
            deadline,
            nonce
        ));
        
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            domainSeparator,
            structHash
        ));
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
    
    /**
     * @notice Generate EIP-712 signature for delegation permit
     */
    function signDelegationPermit(
        uint256 privateKey,
        address patient,
        address delegatee,
        uint40 duration,
        bool allowSubDelegate,
        uint256 nonce,
        uint256 deadline,
        bytes32 domainSeparator,
        bytes32 delegationTypeHash
    ) internal pure returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(
            delegationTypeHash,
            patient,
            delegatee,
            duration,
            allowSubDelegate,
            deadline,
            nonce
        ));
        
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            domainSeparator,
            structHash
        ));
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
    
    // ================ TIME HELPERS ================
    
    /**
     * @notice Warp to future time
     */
    function warpToFuture(uint256 seconds_) internal {
        vm.warp(block.timestamp + seconds_);
    }
    
    /**
     * @notice Warp to past time
     */
    function warpToPast(uint256 seconds_) internal {
        vm.warp(block.timestamp - seconds_);
    }
    
    /**
     * @notice Get current timestamp as uint40
     */
    function now40() internal view returns (uint40) {
        return uint40(block.timestamp);
    }
    
    // ================ TEST DATA GENERATORS ================
    
    /**
     * @notice Generate test CID
     */
    function generateCID(uint256 seed) internal pure returns (string memory) {
        return string(abi.encodePacked("QmTest", vm.toString(seed)));
    }
    
    /**
     * @notice Generate test encryption key hash
     */
    function generateEncKeyHash(uint256 seed) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("enc-key", seed));
    }
    
    /**
     * @notice Generate test address
     */
    function generateAddress(uint256 seed) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked("address", seed)))));
    }
    
    // ================ ASSERTION HELPERS ================
    
    /**
     * @notice Assert that two bytes32 arrays are equal
     */
    function assertEq(bytes32[] memory a, bytes32[] memory b) internal pure override {
        require(a.length == b.length, "Array length mismatch");
        for (uint256 i = 0; i < a.length; i++) {
            require(a[i] == b[i], "Array element mismatch");
        }
    }
    
    /**
     * @notice Assert that array contains element
     */
    function assertContains(bytes32[] memory arr, bytes32 element) internal pure {
        bool found = false;
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] == element) {
                found = true;
                break;
            }
        }
        require(found, "Element not found in array");
    }
}
