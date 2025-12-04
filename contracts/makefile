-include .env
export

deployAccessControl:; forge script script/DeployAccessControl.s.sol:DeployAccessControl \
    --rpc-url $(RPC_URL) \
    --account $(ACCOUNT) \
    --broadcast \
    --verify \
    --verifier etherscan \
    --chain sepolia \
    --etherscan-api-key $(ETHERSCAN_API_KEY) \
    --delay 30

deployConsentLedger:; forge script script/DeployConsentLedger.s.sol:DeployConsentLedger \
    --rpc-url $(RPC_URL) \
    --account $(ACCOUNT) \
    --broadcast \
    --verify \
    --verifier etherscan \
    --chain sepolia \
    --etherscan-api-key $(ETHERSCAN_API_KEY) \
    --delay 30

deployRecordRegistry:; forge script script/DeployRecordRegistry.s.sol:DeployRecordRegistry \
    --rpc-url $(RPC_URL) \
    --account $(ACCOUNT) \
    --broadcast \
    --verify \
    --verifier etherscan \
    --chain sepolia \
    --etherscan-api-key $(ETHERSCAN_API_KEY) \
    --delay 30

deployEHRSystemSecure:; forge script script/DeployEHRSystemSecure.s.sol:DeployEHRSystemSecure \
    --rpc-url $(RPC_URL) \
    --account $(ACCOUNT) \
    --broadcast \
    --verify \
    --verifier etherscan \
    --chain sepolia \
    --etherscan-api-key $(ETHERSCAN_API_KEY) \
    --delay 30

deployAll:; forge script script/DeployAll.s.sol:DeployAll \
    --rpc-url $(RPC_URL) \
    --account $(ACCOUNT) \
    --broadcast \
    --verify \
    --verifier etherscan \
    --chain sepolia \
    --etherscan-api-key $(ETHERSCAN_API_KEY) \
    --delay 30