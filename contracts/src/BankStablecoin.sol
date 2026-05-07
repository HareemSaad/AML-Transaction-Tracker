// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @notice Bank-issued PKR-pegged stablecoin. Mint/burn restricted to OnRampOffRamp.
/// @dev Compliance is enforced at the custodial-wallet boundary (CustodialWallet),
///      not on the token itself, since open-network counterparties hold balances too.
contract BankStablecoin is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    constructor(address admin) ERC20("Bank PKR", "bPKR") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(from, amount);
    }
}
