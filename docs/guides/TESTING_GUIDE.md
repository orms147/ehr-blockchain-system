# Testing Guide - Foundry Best Practices

## 📋 Mục Lục
1. [Setup & Configuration](#setup--configuration)
2. [Test Structure](#test-structure)
3. [Common Patterns](#common-patterns)
4. [Coverage & Gas Optimization](#coverage--gas-optimization)
5. [Debugging Tips](#debugging-tips)

---

## Setup & Configuration

### Foundry Installation
```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Verify installation
forge --version
cast --version
anvil --version
```

### Project Structure
```
contracts/
├── src/
│   ├── interfaces/
│   │   ├── IAccessControl.sol
│   │   ├── IRecordRegistry.sol
│   │   └── IConsentLedger.sol
│   ├── AccessControl.sol
│   ├── RecordRegistry.sol
│   └── ConsentLedger.sol
├── test/
│   ├── helpers/
│   │   └── TestHelpers.sol
│   ├── AccessControlTest.t.sol
│   ├── RecordRegistryTest.t.sol
│   └── IntegrationTest.t.sol
└── foundry.toml
```

### foundry.toml Configuration
```toml
[profile.default]
src = "contracts/src"
out = "contracts/out"
libs = ["lib"]
test = "contracts/test"

solc_version = "0.8.24"
optimizer = true
optimizer_runs = 200

[profile.default.fuzz]
runs = 256

[profile.ci]
fuzz = { runs = 5000 }
```

---

## Test Structure

### Base Test Template

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MyContract.sol";
import "./helpers/TestHelpers.sol";

contract MyContractTest is TestHelpers {
    MyContract public myContract;
    
    // Test accounts
    address public user1;
    address public user2;
    address public admin;
    
    // Test data
    string constant TEST_DATA = "test";
    
    // Events to test
    event SomethingHappened(address indexed user, uint256 value);
    
    function setUp() public {
        // Setup accounts
        admin = makeAddr("admin");
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        
        // Deploy contracts
        vm.prank(admin);
        myContract = new MyContract();
    }
    
    // ========== POSITIVE TESTS ==========
    
    function test_SomeFunction_Success() public {
        // Arrange
        vm.prank(user1);
        
        // Act
        myContract.someFunction();
        
        // Assert
        assertTrue(myContract.someState());
    }
    
    // ========== NEGATIVE TESTS ==========
    
    function test_SomeFunction_RevertWhen_Unauthorized() public {
        vm.expectRevert(MyContract.Unauthorized.selector);
        vm.prank(user2);
        myContract.someFunction();
    }
    
    // ========== EDGE CASES ==========
    
    function test_EdgeCase_ZeroValue() public {
        // ...
    }
}
```

### Test Naming Convention

```solidity
// ✅ GOOD: Descriptive names
function test_AddRecord_Success() public {}
function test_AddRecord_RevertWhen_EmptyCID() public {}
function test_AddRecord_WithParent_Success() public {}

// ❌ BAD: Vague names
function test1() public {}
function testAdd() public {}
function testFail() public {}
```

**Pattern:**
- `test_FunctionName_Success` - Happy path
- `test_FunctionName_RevertWhen_Condition` - Error case
- `test_FunctionName_WithCondition_Success` - Variant
- `test_EdgeCase_Description` - Edge case

---

## Common Patterns

### 1. Using vm.prank & vm.startPrank

```solidity
// Single call
function test_SingleCall() public {
    vm.prank(user1);
    myContract.someFunction();  // Called as user1
    // Next call is back to test contract
}

// Multiple calls
function test_MultipleCalls() public {
    vm.startPrank(user1);
    myContract.function1();  // Called as user1
    myContract.function2();  // Called as user1
    vm.stopPrank();
    // Back to test contract
}
```

### 2. Testing Events

```solidity
function test_EventEmitted() public {
    // Expect event with specific parameters
    vm.expectEmit(true, true, true, false);
    emit RecordAdded(user1, cidHash, parentHash, typeHash, 0);
    
    vm.prank(user1);
    recordRegistry.addRecord(CID, "", "Type");
}
```

**Parameters:**
- 1st `true`: Check 1st indexed parameter
- 2nd `true`: Check 2nd indexed parameter
- 3rd `true`: Check 3rd indexed parameter
- 4th `false`: Don't check non-indexed data

### 3. Testing Reverts

```solidity
// Test specific error
function test_RevertWithError() public {
    vm.expectRevert(MyContract.CustomError.selector);
    myContract.failingFunction();
}

// Test with error parameters
function test_RevertWithErrorParams() public {
    vm.expectRevert(
        abi.encodeWithSelector(
            MyContract.InvalidValue.selector,
            expectedValue
        )
    );
    myContract.failingFunction();
}

// Test any revert
function test_RevertAny() public {
    vm.expectRevert();
    myContract.failingFunction();
}
```

### 4. Time Manipulation

```solidity
function test_TimeTravel() public {
    uint256 startTime = block.timestamp;
    
    // Warp to future
    vm.warp(startTime + 1 days);
    assertEq(block.timestamp, startTime + 1 days);
    
    // Warp to specific time
    vm.warp(1234567890);
    assertEq(block.timestamp, 1234567890);
}

function test_BlockNumber() public {
    // Advance block number
    vm.roll(block.number + 100);
    assertEq(block.number, 101);  // Assuming started at 1
}
```

### 5. Deal & Hoax (ETH Management)

```solidity
function test_WithETH() public {
    // Give user1 some ETH
    vm.deal(user1, 10 ether);
    assertEq(user1.balance, 10 ether);
    
    // Prank + deal in one
    hoax(user1, 5 ether);
    // user1 now has 5 ETH and is the caller
}
```

### 6. Fuzz Testing

```solidity
function testFuzz_AddRecord(string calldata cid) public {
    // Foundry will call this with random inputs
    vm.assume(bytes(cid).length > 0);  // Filter inputs
    vm.assume(bytes(cid).length < 100);
    
    vm.prank(patient1);
    recordRegistry.addRecord(cid, "", "Type");
    
    assertTrue(recordRegistry.recordExists(keccak256(bytes(cid))));
}

function testFuzz_Transfer(uint256 amount) public {
    vm.assume(amount > 0 && amount <= 1000 ether);
    // Test with random amounts
}
```

### 7. Helper Functions

```solidity
// Setup helpers
function _setupVerifiedDoctor(address doctor, address org) internal {
    vm.prank(org);
    accessControl.registerAsOrganization();
    
    vm.prank(ministry);
    accessControl.verifyOrganization(org, "Test Org");
    
    vm.prank(doctor);
    accessControl.registerAsDoctor();
    
    vm.prank(org);
    accessControl.verifyDoctor(doctor, "Test License");
}

// Assertion helpers
function _assertRecordExists(string memory cid) internal {
    assertTrue(
        recordRegistry.recordExists(keccak256(bytes(cid))),
        "Record should exist"
    );
}

// ID generation helpers
function _getRequestId(
    address requester,
    address patient,
    string memory cid,
    uint256 nonce
) internal pure returns (bytes32) {
    return keccak256(abi.encode(
        requester,
        patient,
        cid,
        EHRSystemSecure.RequestType.DirectAccess,
        nonce
    ));
}
```

---

## Coverage & Gas Optimization

### Running Coverage

```bash
# Generate coverage report
forge coverage

# Generate detailed report
forge coverage --report lcov

# View in browser (requires lcov)
genhtml lcov.info -o coverage
open coverage/index.html
```

### Target Metrics
- **Line Coverage**: >90%
- **Branch Coverage**: >85%
- **Function Coverage**: 100%

### Gas Optimization

```bash
# Gas report
forge test --gas-report

# Snapshot gas costs
forge snapshot

# Compare snapshots
forge snapshot --diff
```

**Optimization Tips:**
```solidity
// ❌ EXPENSIVE: Multiple SSTOREs
function badFunction() external {
    state1 = value1;  // SSTORE
    state2 = value2;  // SSTORE
    state3 = value3;  // SSTORE
}

// ✅ CHEAPER: Pack in struct
struct State {
    uint128 value1;
    uint128 value2;
    uint256 value3;
}
State public state;

function goodFunction() external {
    state = State(value1, value2, value3);  // 2 SSTOREs
}

// ✅ CHEAPEST: Use immutable/constant
uint256 public constant MAX_VALUE = 100;
address public immutable owner;
```

---

## Debugging Tips

### 1. Console Logging

```solidity
import "forge-std/console.sol";

function test_Debug() public {
    console.log("Address:", user1);
    console.log("Value:", someValue);
    console.log("Bool:", someCondition);
    
    // Multiple values
    console.log("User:", user1, "Balance:", balance);
}
```

### 2. Verbose Output

```bash
# Show logs
forge test -vv

# Show stack traces
forge test -vvv

# Show storage changes
forge test -vvvv

# Show everything
forge test -vvvvv
```

### 3. Test Specific Function

```bash
# Run specific test
forge test --match-test test_AddRecord_Success

# Run specific contract
forge test --match-contract AccessControlTest

# Run with pattern
forge test --match-path "test/Access*"
```

### 4. Debugging Failed Tests

```solidity
function test_Debug() public {
    // Add console logs
    console.log("Before:", state);
    
    myContract.someFunction();
    
    console.log("After:", state);
    
    // Use vm.expectRevert to see actual error
    vm.expectRevert();
    myContract.failingFunction();
}
```

### 5. Using Chisel (REPL)

```bash
# Start Chisel
chisel

# Test expressions
➜ uint256 x = 100
➜ x * 2
200

# Test contract calls
➜ MyContract c = new MyContract()
➜ c.someFunction()
```

---

## Advanced Patterns

### 1. Mock Contracts

```solidity
contract MockAccessControl is IAccessControl {
    mapping(address => bool) public doctors;
    
    function setDoctor(address user, bool isDoc) external {
        doctors[user] = isDoc;
    }
    
    function isDoctor(address user) external view returns (bool) {
        return doctors[user];
    }
    
    // ... implement other functions
}

contract MyTest is Test {
    MockAccessControl public mockAC;
    
    function setUp() public {
        mockAC = new MockAccessControl();
        mockAC.setDoctor(doctor1, true);
    }
}
```

### 2. Testing Upgradeable Contracts

```solidity
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

function test_Upgrade() public {
    // Deploy implementation
    MyContractV1 implV1 = new MyContractV1();
    
    // Deploy proxy
    ERC1967Proxy proxy = new ERC1967Proxy(
        address(implV1),
        abi.encodeCall(MyContractV1.initialize, (admin))
    );
    
    MyContractV1 contractV1 = MyContractV1(address(proxy));
    
    // Use V1
    contractV1.someFunction();
    
    // Upgrade to V2
    MyContractV2 implV2 = new MyContractV2();
    vm.prank(admin);
    contractV1.upgradeTo(address(implV2));
    
    MyContractV2 contractV2 = MyContractV2(address(proxy));
    contractV2.newFunction();
}
```

### 3. Integration Tests

```solidity
contract IntegrationTest is Test {
    AccessControl public accessControl;
    RecordRegistry public recordRegistry;
    ConsentLedger public consentLedger;
    DoctorUpdate public doctorUpdate;
    
    function setUp() public {
        // Deploy all contracts
        accessControl = new AccessControl(ministry);
        recordRegistry = new RecordRegistry(accessControl);
        consentLedger = new ConsentLedger(ministry);
        doctorUpdate = new DoctorUpdate(
            accessControl,
            recordRegistry,
            consentLedger
        );
        
        // Setup integrations
        recordRegistry.setConsentLedger(address(consentLedger));
        consentLedger.authorizeContract(address(doctorUpdate), true);
    }
    
    function test_Integration_DoctorCreatesRecord() public {
        // Setup verified doctor
        _setupVerifiedDoctor(doctor1, org1);
        
        // Doctor creates record
        vm.prank(doctor1);
        doctorUpdate.addRecordByDoctor(
            CID_1, "", "Blood Test", patient1,
            PATIENT_KEY, DOCTOR_KEY, 72
        );
        
        // Verify record created
        IRecordRegistry.Record memory rec = recordRegistry.getRecord(
            keccak256(bytes(CID_1))
        );
        assertEq(rec.owner, patient1);
        
        // Verify doctor has access
        assertTrue(consentLedger.canAccess(patient1, doctor1, CID_1));
    }
}
```

---

## Best Practices Checklist

### Test Organization
- [ ] Group tests by functionality
- [ ] Use descriptive test names
- [ ] Separate positive, negative, and edge cases
- [ ] Create helper functions for common setups

### Coverage
- [ ] Test all public/external functions
- [ ] Test all error conditions
- [ ] Test edge cases (zero, max, empty)
- [ ] Test access control
- [ ] Test events

### Gas Optimization
- [ ] Run gas reports regularly
- [ ] Snapshot gas costs
- [ ] Optimize hot paths
- [ ] Use immutable/constant where possible

### Security
- [ ] Test authorization checks
- [ ] Test input validation
- [ ] Test reentrancy protection
- [ ] Test overflow/underflow
- [ ] Test time-dependent logic

### Documentation
- [ ] Comment complex test logic
- [ ] Document test assumptions
- [ ] Explain why tests exist
- [ ] Link to related issues/bugs

---

## Kết Luận

### Key Takeaways

1. **Test Early, Test Often**: Write tests as you code
2. **Coverage Matters**: Aim for >90%
3. **Gas Awareness**: Monitor gas costs
4. **Use Helpers**: DRY principle applies to tests
5. **Debug Effectively**: Use console.log and verbose output

### Common Commands

```bash
# Run all tests
forge test

# Run with coverage
forge coverage

# Run with gas report
forge test --gas-report

# Run specific test
forge test --match-test testName -vv

# Debug with logs
forge test -vvvv
```

**Happy Testing! 🧪**
