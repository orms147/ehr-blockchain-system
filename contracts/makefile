-include .env
export

# Arbitrum Sepolia Chain ID: 421614
# Using Etherscan V2 API for verification (unified multichain)

deployAccessControl:; forge script script/DeployAccessControl.s.sol:DeployAccessControl \
    --rpc-url $(RPC_URL) \
    --account $(ACCOUNT) \
    --broadcast \
    --verify \
    --verifier etherscan \
    --verifier-url "https://api.etherscan.io/v2/api?chainid=421614" \
    --etherscan-api-key $(ETHERSCAN_API_KEY) \
    --delay 30

deployConsentLedger:; forge script script/DeployConsentLedger.s.sol:DeployConsentLedger \
    --rpc-url $(RPC_URL) \
    --account $(ACCOUNT) \
    --broadcast \
    --verify \
    --verifier etherscan \
    --verifier-url "https://api.etherscan.io/v2/api?chainid=421614" \
    --etherscan-api-key $(ETHERSCAN_API_KEY) \
    --delay 30

deployRecordRegistry:; forge script script/DeployRecordRegistry.s.sol:DeployRecordRegistry \
    --rpc-url $(RPC_URL) \
    --account $(ACCOUNT) \
    --broadcast \
    --verify \
    --verifier etherscan \
    --verifier-url "https://api.etherscan.io/v2/api?chainid=421614" \
    --etherscan-api-key $(ETHERSCAN_API_KEY) \
    --delay 30

deployEHRSystemSecure:; forge script script/DeployEHRSystemSecure.s.sol:DeployEHRSystemSecure \
    --rpc-url $(RPC_URL) \
    --account $(ACCOUNT) \
    --broadcast \
    --verify \
    --verifier etherscan \
    --verifier-url "https://api.etherscan.io/v2/api?chainid=421614" \
    --etherscan-api-key $(ETHERSCAN_API_KEY) \
    --delay 30

deployAll:; forge script script/DeployAll.s.sol:DeployAll \
    --rpc-url $(RPC_URL) \
    --account $(ACCOUNT) \
    --broadcast \
    --verify \
    --verifier etherscan \
    --verifier-url "https://api.etherscan.io/v2/api?chainid=421614" \
    --etherscan-api-key $(ETHERSCAN_API_KEY) \
    --delay 30