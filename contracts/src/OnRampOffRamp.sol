// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {BankStablecoin} from "./BankStablecoin.sol";
import {ComplianceRegistry} from "./ComplianceRegistry.sol";

/// @notice Bridges fiat ↔ bPKR. Mints bPKR to a custodial wallet on fiat receipt;
///         burns bPKR and signals fiat payout off-chain on redemption.
contract OnRampOffRamp is AccessControl {
    bytes32 public constant BANK_OPERATOR_ROLE = keccak256("BANK_OPERATOR_ROLE");

    BankStablecoin public immutable stablecoin;
    ComplianceRegistry public immutable registry;

    event OnRamp(address indexed wallet, uint256 amount, bytes32 indexed fiatRef);
    event OffRamp(address indexed wallet, uint256 amount, bytes32 indexed fiatRef);

    error NotCustodial();

    constructor(address admin, address _stablecoin, address _registry) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(BANK_OPERATOR_ROLE, admin);
        stablecoin = BankStablecoin(_stablecoin);
        registry = ComplianceRegistry(_registry);
    }

    function mintFor(address wallet, uint256 amount, bytes32 fiatRef)
        external
        onlyRole(BANK_OPERATOR_ROLE)
    {
        if (!registry.isCustodialWallet(wallet)) revert NotCustodial();
        stablecoin.mint(wallet, amount);
        emit OnRamp(wallet, amount, fiatRef);
    }

    function redeem(address wallet, uint256 amount, bytes32 fiatRef)
        external
        onlyRole(BANK_OPERATOR_ROLE)
    {
        if (!registry.isCustodialWallet(wallet)) revert NotCustodial();
        stablecoin.burn(wallet, amount);
        emit OffRamp(wallet, amount, fiatRef);
    }
}
