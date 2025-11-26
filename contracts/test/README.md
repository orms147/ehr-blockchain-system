# Test Suite - EHR System

## Tổng Quan

Test suite hoàn chỉnh cho EHR System với **~190 test cases** covering tất cả contracts.

## Test Files

### 1. Helper Utilities
- **`test/helpers/TestHelpers.sol`** - EIP-712 signatures, time helpers, test data generators

### 2. Unit Tests
- **`test/AccessControlTest.t.sol`** (30+ tests) - Role management, verification
- **`test/RecordRegistryTest.t.sol`** (35+ tests) - Record CRUD, versioning
- **`test/ConsentLedgerTest.t.sol`** (50+ tests) - Consent, delegation, EIP-712
- **`test/DoctorUpdateTest.t.sol`** (30+ tests) - Doctor flows, emergency access
- **`test/EHRSystemSecureTest.t.sol`** (35+ tests) - 2-step approval, requests

### 3. Integration Tests
- **`test/IntegrationTest.t.sol`** (8 tests) - End-to-end user flows

## Chạy Tests (Git Bash)

```bash
cd "/c/University/DATN/ERH system(progsss)/contracts"

# Tất cả tests
forge test -vv

# Coverage
forge coverage

# Gas report
forge test --gas-report

# Specific file
forge test --match-path test/AccessControlTest.t.sol -vvv

# Specific test
forge test --match-test test_MultipleRoles_BitwiseOperations -vvvv
```

## Expected Results

- ✅ ~190 tests pass
- ✅ 0 failures
- ✅ Coverage > 90%

## Key Features

- ✅ EIP-712 signature testing
- ✅ Time-based expiry testing
- ✅ Multi-role bitwise operations
- ✅ 2-step approval flows
- ✅ Emergency access with witnesses
- ✅ Delegation flows
- ✅ End-to-end integration tests

## Debugging

```bash
# Chi tiết lỗi
forge test --match-test <test_name> -vvvv

# Coverage report
forge coverage --report summary

# Specific contract
forge test --match-contract AccessControlTest -vv
```
