// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ConsentLedger.sol";

/**
 * @title  ConsentLedgerCascadePropertyTest
 * @notice Property + fuzz tests for the multi-hop delegation cascade and the
 *         "a patient's DIRECT grant survives a cascade revoke" guarantee — the
 *         thesis's headline access-control property (advisor feedback #3).
 *
 * @dev    accessControl is intentionally NOT wired into ConsentLedger, so the
 *         verified-doctor read-gate is inactive and the cascade/epoch logic is
 *         exercised in isolation (same approach as ConsentLedgerTest). The test
 *         contract authorizes itself so it can mint the patient's DIRECT consents
 *         via grantInternal (mirrors the relayer/sponsor path on-chain).
 */
contract ConsentLedgerCascadePropertyTest is Test {
    ConsentLedger internal cl;

    address internal ministry = makeAddr("ministry");
    address internal patient  = makeAddr("patient");

    bytes32 internal constant ENC  = keccak256("encKey");
    uint40  internal constant WEEK = 7 days;
    uint40  internal constant DUR  = 60 days; // delegation window used in the chains

    function setUp() public {
        vm.prank(ministry);
        cl = new ConsentLedger(ministry);
        // Authorize this test contract as a "system" caller (relayer/sponsor analogue)
        // so it can mint the patient's DIRECT consents via grantInternal.
        vm.prank(ministry);
        cl.authorizeContract(address(this), true);
    }

    // ---------- helpers ----------

    /// Deterministic, distinct, non-zero actor addresses for fuzzed chains.
    function _actor(uint256 i) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked("cascade-actor", i)))));
    }

    /// Patient's DIRECT consent (no delegation provenance) — the right that must survive.
    function _directGrant(address grantee, bytes32 cid, uint40 expireAt) internal {
        cl.grantInternal(patient, grantee, cid, ENC, expireAt, false);
    }

    /// Build patient -> a0 -> a1 -> ... -> a(links-1); returns the leaf delegatee.
    function _buildChain(uint256 links) internal returns (address leaf, address root) {
        root = _actor(0);
        vm.prank(patient);
        cl.grantDelegation(root, DUR, true); // allowSubDelegate = true
        leaf = root;
        for (uint256 i = 1; i < links; i++) {
            address next = _actor(i);
            vm.prank(leaf);
            cl.subDelegate(patient, next, DUR, true);
            leaf = next;
        }
    }

    // =====================================================================
    // 1) THE ADVISOR'S NAMED SCENARIO (deterministic property test)
    //    patient -> A -> B (delegation chain); B grants C access to R1 via the
    //    chain. The patient ALSO grants C a DIRECT consent for R2.
    //    Revoke A  =>  C loses R1 (chain-derived) but KEEPS R2 (direct).
    // =====================================================================
    function test_Scenario_RevokeRoot_KillsChain_KeepsDirect() public {
        address A = makeAddr("doctorA");
        address B = makeAddr("doctorB");
        address C = makeAddr("doctorC");
        bytes32 R1 = keccak256("record-via-chain");   // C accesses via patient->A->B->C
        bytes32 R2 = keccak256("record-direct");       // C accesses via a direct patient grant
        uint40 expire = uint40(block.timestamp) + WEEK;

        // chain: patient -> A -> B
        vm.prank(patient);
        cl.grantDelegation(A, DUR, true);
        vm.prank(A);
        cl.subDelegate(patient, B, DUR, true);

        // B uses the delegation to grant C access to R1 (the derived "patient->A->B->C" right)
        vm.prank(B);
        cl.grantUsingDelegation(patient, C, R1, ENC, expire, false);

        // patient grants C a DIRECT consent for a DIFFERENT record R2
        _directGrant(C, R2, expire);

        // before revoke: both access paths work
        assertTrue(cl.canAccess(patient, C, R1), "C must access R1 via chain before revoke");
        assertTrue(cl.canAccess(patient, C, R2), "C must access R2 via direct grant before revoke");

        // patient revokes A (root of the delegation chain)
        vm.prank(patient);
        cl.revokeDelegation(A);

        // CORE GUARANTEE: chain-derived right dies; the patient's DIRECT grant survives
        assertFalse(cl.canAccess(patient, C, R1), "C's chain-derived access to R1 must DIE after revoking A");
        assertTrue (cl.canAccess(patient, C, R2), "C's DIRECT access to R2 must SURVIVE the cascade revoke");
    }

    // =====================================================================
    // 1b) ADVISOR WORDING, LITERAL 3-DOCTOR CHAIN:
    //     patient -> A -> B -> C (sub-delegation chain); C (the leaf) grants G
    //     access to R1 via the delegated authority. The patient ALSO grants C a
    //     DIRECT consent for R2. Revoke A  =>  the whole A->B->C chain dies (G
    //     loses R1) but C's DIRECT consent (R2) survives. Mirrors the advisor's
    //     exact "BN -> A -> B -> C + BN cấp trực tiếp cho C; thu hồi A" scenario.
    // =====================================================================
    function test_Scenario_ABC_RevokeRoot_KillsChain_KeepsDirectToC() public {
        address A = makeAddr("abc-doctorA");
        address B = makeAddr("abc-doctorB");
        address C = makeAddr("abc-doctorC");
        address G = makeAddr("abc-grantee");
        bytes32 R1 = keccak256("abc-record-via-chain");
        bytes32 R2 = keccak256("abc-record-direct-to-C");
        uint40 expire = uint40(block.timestamp) + WEEK;

        // chain: patient -> A -> B -> C (each allowSubDelegate = true)
        vm.prank(patient);
        cl.grantDelegation(A, DUR, true);
        vm.prank(A);
        cl.subDelegate(patient, B, DUR, true);
        vm.prank(B);
        cl.subDelegate(patient, C, DUR, true);

        // C (leaf of the 3-hop chain) grants G access to R1 via the delegation
        vm.prank(C);
        cl.grantUsingDelegation(patient, G, R1, ENC, expire, false);

        // patient grants C a DIRECT consent for a DIFFERENT record R2
        _directGrant(C, R2, expire);

        assertTrue(cl.canAccess(patient, G, R1), "G must access R1 via patient->A->B->C before revoke");
        assertTrue(cl.canAccess(patient, C, R2), "C must access R2 via direct grant before revoke");

        // patient revokes the root A
        vm.prank(patient);
        cl.revokeDelegation(A);

        // whole A->B->C chain dies; C's DIRECT consent survives
        assertFalse(cl.canAccess(patient, G, R1), "A->B->C chain access to R1 must DIE after revoking A");
        assertTrue (cl.canAccess(patient, C, R2), "C's DIRECT access to R2 must SURVIVE the cascade revoke");
    }

    // =====================================================================
    // 2) FUZZ: revoking the root of an N-hop chain kills the leaf-granted consent.
    // =====================================================================
    function testFuzz_DeepChain_RevokeRoot_KillsLeaf(uint8 linksSeed) public {
        // 1..6 links keeps the canAccess walk within MAX_DELEGATION_WALK = 8.
        uint256 links = bound(linksSeed, 1, 6);

        (address leaf, address root) = _buildChain(links);

        address G = makeAddr("grantee-chain");
        bytes32 Rc = keccak256("fuzz-chain-record");
        uint40 expire = uint40(block.timestamp) + WEEK;

        vm.prank(leaf);
        cl.grantUsingDelegation(patient, G, Rc, ENC, expire, false);

        assertTrue(cl.canAccess(patient, G, Rc), "G must have chain access before revoke");

        vm.prank(patient);
        cl.revokeDelegation(root);

        assertFalse(cl.canAccess(patient, G, Rc), "G's chain access must die after the root is revoked");
    }

    // =====================================================================
    // 3) FUZZ: a DIRECT patient grant is immune to ANY delegation-chain revoke.
    //    (Footgun #1 territory: the cascade must never touch a direct consent.)
    // =====================================================================
    function testFuzz_DirectGrantImmuneToCascade(uint8 linksSeed, uint40 durSeed) public {
        uint256 links = bound(linksSeed, 1, 6);
        uint40 directExpire = uint40(block.timestamp) + uint40(bound(durSeed, 1 days, 365 days));

        // A direct grant to G for a direct record — the right we expect to survive.
        address G = makeAddr("grantee-direct");
        bytes32 Rd = keccak256("fuzz-direct-record");
        _directGrant(G, Rd, directExpire);
        assertTrue(cl.canAccess(patient, G, Rd), "direct grant must hold before any delegation activity");

        // Build an unrelated delegation chain and have the leaf also grant G a
        // chain-derived consent for a DIFFERENT record.
        (address leaf, address root) = _buildChain(links);
        bytes32 Rc = keccak256("fuzz-direct-chain-record");
        vm.prank(leaf);
        cl.grantUsingDelegation(patient, G, Rc, ENC, uint40(block.timestamp) + WEEK, false);
        assertTrue(cl.canAccess(patient, G, Rc), "chain grant must hold before revoke");

        // Revoke the chain root.
        vm.prank(patient);
        cl.revokeDelegation(root);

        // The chain-derived right dies; the DIRECT right is untouched.
        assertFalse(cl.canAccess(patient, G, Rc), "chain-derived access must die after root revoke");
        assertTrue (cl.canAccess(patient, G, Rd), "DIRECT grant must be IMMUNE to the cascade revoke");
    }

    // =====================================================================
    // 4) REGRESSION for bug F1 (context/20): a DIRECT grant that OVERWRITES a
    //    consent key previously created via bulk delegation must NOT be wrongly
    //    cascade-revoked when the (now unrelated) bulk delegation is revoked.
    //    Same record R, same grantee C => same consent key is reused.
    // =====================================================================
    function test_F1_DirectGrantOverBulkKey_SurvivesDelegationRevoke() public {
        address B = makeAddr("delegateB");
        address C = makeAddr("doctorC-f1");
        bytes32 R = keccak256("record-shared-then-direct"); // SAME record for both paths
        uint40 expire = uint40(block.timestamp) + WEEK;

        // 1) patient -> B (bulk delegation); B grants C access to R via the delegation.
        vm.prank(patient);
        cl.grantDelegation(B, DUR, true);
        vm.prank(B);
        cl.grantUsingDelegation(patient, C, R, ENC, expire, false);
        assertTrue(cl.canAccess(patient, C, R), "C has bulk-derived access to R before direct grant");

        // 2) patient now issues a DIRECT consent to C for the SAME record R
        //    (overwrites consent key keccak(patient, C, root(R))).
        _directGrant(C, R, expire);
        assertTrue(cl.canAccess(patient, C, R), "C has DIRECT access to R after the direct grant");

        // 3) patient revokes the old, now-irrelevant bulk delegation to B.
        vm.prank(patient);
        cl.revokeDelegation(B);

        // EXPECTED: C keeps access via the DIRECT grant. (F1 bug: returns false.)
        assertTrue(
            cl.canAccess(patient, C, R),
            "F1: DIRECT grant must survive revoking the stale bulk delegation it overwrote"
        );
    }
}
