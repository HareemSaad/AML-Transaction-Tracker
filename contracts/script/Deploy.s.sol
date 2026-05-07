// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {BankStablecoin} from "../src/BankStablecoin.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {OnRampOffRamp} from "../src/OnRampOffRamp.sol";

/// @notice Deploys the AML stack and writes deployments/local.json.
/// @dev Run via: `forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast`.
///      Custodial wallets are EOAs created by the backend; no factory deployed.
contract Deploy is Script {
    // Tier caps in bPKR (6 decimals).
    uint256 constant TIER1_CAP = 500_000 * 1e6;
    uint256 constant TIER2_CAP = 10_000_000 * 1e6;
    uint256 constant TIER3_CAP = 100_000_000 * 1e6;

    // Rule 12 — first-90-days caps.
    uint256 constant TIER1_NEW_CAP = 100_000 * 1e6;
    uint256 constant TIER2_NEW_CAP = 1_000_000 * 1e6;
    uint256 constant TIER3_NEW_CAP = 10_000_000 * 1e6;

    // Rule 1 — PKR 2.5M CTR threshold.
    uint256 constant CTR_THRESHOLD = 2_500_000 * 1e6;

    // Rule 12 — 90-day window.
    uint64 constant NEW_ACCOUNT_WINDOW = 90 days;

    function run() external {
        uint256 pk = vm.envOr(
            "DEPLOYER_PK",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address admin = vm.addr(pk);

        vm.startBroadcast(pk);

        ComplianceRegistry registry =
            new ComplianceRegistry(admin, CTR_THRESHOLD, NEW_ACCOUNT_WINDOW);
        BankStablecoin stablecoin = new BankStablecoin(admin);
        OnRampOffRamp onramp = new OnRampOffRamp(admin, address(stablecoin), address(registry));

        // OnRamp mints/burns; admin is already BANK_OPERATOR + COMPLIANCE_OFFICER on registry.
        stablecoin.grantRole(stablecoin.MINTER_ROLE(), address(onramp));
        stablecoin.grantRole(stablecoin.BURNER_ROLE(), address(onramp));

        registry.setTierCap(1, TIER1_CAP);
        registry.setTierCap(2, TIER2_CAP);
        registry.setTierCap(3, TIER3_CAP);
        registry.setNewAccountCap(1, TIER1_NEW_CAP);
        registry.setNewAccountCap(2, TIER2_NEW_CAP);
        registry.setNewAccountCap(3, TIER3_NEW_CAP);

        // graph-node misses events emitted from the contract's constructor
        // (same tx as contract creation). Re-emit CtrThresholdChanged and
        // NewAccountWindowChanged in a regular block so the subgraph
        // RegistryConfig populates correctly — without these, ctrThreshold
        // reads as 0 in mappings and Rules 1 & 2 never fire.
        registry.setCtrThreshold(CTR_THRESHOLD);
        registry.setNewAccountWindow(NEW_ACCOUNT_WINDOW);

        vm.stopBroadcast();

        string memory json = string.concat(
            "{\n",
            "  \"network\": \"local\",\n",
            "  \"chainId\": ", vm.toString(block.chainid), ",\n",
            "  \"deployer\": \"", vm.toString(admin), "\",\n",
            "  \"deployBlock\": ", vm.toString(block.number), ",\n",
            "  \"registry\": \"", vm.toString(address(registry)), "\",\n",
            "  \"stablecoin\": \"", vm.toString(address(stablecoin)), "\",\n",
            "  \"onramp\": \"", vm.toString(address(onramp)), "\"\n",
            "}\n"
        );
        vm.writeFile("./deployments/local.json", json);

        console2.log("registry  ", address(registry));
        console2.log("stablecoin", address(stablecoin));
        console2.log("onramp    ", address(onramp));
        console2.log("admin     ", admin);
        console2.log("deployBlock", block.number);
    }
}
