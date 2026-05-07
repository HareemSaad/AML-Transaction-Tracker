// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {BankStablecoin} from "../src/BankStablecoin.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {OnRampOffRamp} from "../src/OnRampOffRamp.sol";

contract AmlTest is Test {
    address admin = address(0xA11CE);
    address externalEoa = address(0xD00D);

    // Backend-generated custodial EOAs in tests.
    address custodialA = address(0xC0FFEE01);
    address custodialB = address(0xC0FFEE02);

    ComplianceRegistry registry;
    BankStablecoin token;
    OnRampOffRamp onramp;

    uint256 constant CTR = 2_500_000 * 1e6;
    uint256 constant TIER2_CAP = 10_000_000 * 1e6;
    uint256 constant TIER2_NEW_CAP = 1_000_000 * 1e6;

    bytes32 constant PII_A = keccak256("alice|passport|dob");
    bytes32 constant PII_B = keccak256("bob|passport|dob");

    function setUp() public {
        vm.startPrank(admin);
        registry = new ComplianceRegistry(admin, CTR, 90 days);
        token = new BankStablecoin(admin);
        onramp = new OnRampOffRamp(admin, address(token), address(registry));
        token.grantRole(token.MINTER_ROLE(), address(onramp));
        token.grantRole(token.BURNER_ROLE(), address(onramp));

        registry.setTierCap(1, 500_000 * 1e6);
        registry.setTierCap(2, TIER2_CAP);
        registry.setTierCap(3, 100_000_000 * 1e6);
        registry.setNewAccountCap(1, 100_000 * 1e6);
        registry.setNewAccountCap(2, TIER2_NEW_CAP);
        registry.setNewAccountCap(3, 10_000_000 * 1e6);
        vm.stopPrank();
    }

    function _register(address w, uint8 tier, bool pep, bytes32 pii) internal {
        vm.prank(admin);
        registry.registerCustodial(w, tier, pep, pii);
    }

    // ─── Stablecoin role gating ──────────────────────────────────────────────

    function test_StablecoinMintBurnIsRoleGated() public {
        vm.expectRevert();
        token.mint(custodialA, 1);
        vm.expectRevert();
        token.burn(custodialA, 1);
    }

    function test_OnrampMintsToCustodialOnly() public {
        _register(custodialA, 2, false, PII_A);
        vm.prank(admin);
        onramp.mintFor(custodialA, 5_000_000 * 1e6, "FIAT-1");
        assertEq(token.balanceOf(custodialA), 5_000_000 * 1e6);
    }

    function test_OnrampRejectsNonCustodial() public {
        vm.prank(admin);
        vm.expectRevert(OnRampOffRamp.NotCustodial.selector);
        onramp.mintFor(externalEoa, 1000, "FIAT-X");
    }

    // ─── registerCustodial ────────────────────────────────────────────────────

    function test_RegisterRoleGated() public {
        vm.prank(externalEoa);
        vm.expectRevert();
        registry.registerCustodial(custodialA, 2, false, PII_A);
    }

    function test_RegisterRejectsTier0OrTooHigh() public {
        vm.startPrank(admin);
        vm.expectRevert(ComplianceRegistry.InvalidTier.selector);
        registry.registerCustodial(custodialA, 0, false, PII_A);
        vm.expectRevert(ComplianceRegistry.InvalidTier.selector);
        registry.registerCustodial(custodialA, 4, false, PII_A);
        vm.stopPrank();
    }

    function test_RegisterCannotDoubleRegister() public {
        _register(custodialA, 2, false, PII_A);
        vm.prank(admin);
        vm.expectRevert(ComplianceRegistry.AlreadyRegistered.selector);
        registry.registerCustodial(custodialA, 2, false, PII_A);
    }

    function test_RegisterEmitsProfile() public {
        vm.expectEmit(true, false, false, true);
        emit ComplianceRegistry.ProfileSet(
            custodialA, 2, false, PII_A, uint64(block.timestamp)
        );
        _register(custodialA, 2, false, PII_A);
        assertTrue(registry.isCustodialWallet(custodialA));
    }

    // ─── checkOutgoing — advisory pre-check the backend uses ─────────────────

    function test_CheckOutgoingNoProfile() public view {
        (bool ok, string memory reason,,,) = registry.checkOutgoing(custodialA, 1);
        assertFalse(ok);
        assertEq(reason, "NO_PROFILE");
    }

    function test_CheckOutgoingBlocked() public {
        _register(custodialA, 2, false, PII_A);
        vm.prank(admin);
        registry.setBlocked(custodialA, true);
        (bool ok, string memory reason,,,) = registry.checkOutgoing(custodialA, 1);
        assertFalse(ok);
        assertEq(reason, "BLOCKED");
    }

    function test_CheckOutgoingTierCap() public {
        _register(custodialA, 2, false, PII_A);
        vm.warp(block.timestamp + 91 days); // past new-account window
        (bool ok, string memory reason,,,) =
            registry.checkOutgoing(custodialA, TIER2_CAP + 1);
        assertFalse(ok);
        assertEq(reason, "TIER_CAP");
    }

    function test_CheckOutgoingNewAccountCap() public {
        _register(custodialA, 2, false, PII_A);
        (bool ok, string memory reason,,,bool isNew) =
            registry.checkOutgoing(custodialA, TIER2_NEW_CAP + 1);
        assertFalse(ok);
        assertEq(reason, "NEW_ACCT_CAP");
        assertTrue(isNew);
    }

    function test_CheckOutgoingFlagsLargeAndPepAndNewAccount() public {
        _register(custodialA, 2, true, PII_A);
        // 1M is at the new-account cap, allowed; below CTR (2.5M).
        (bool ok,, bool isLarge, bool isPep, bool isNew) =
            registry.checkOutgoing(custodialA, 1_000_000 * 1e6);
        assertTrue(ok);
        assertFalse(isLarge);
        assertTrue(isPep);
        assertTrue(isNew);

        vm.warp(block.timestamp + 91 days);
        (ok,, isLarge, isPep, isNew) =
            registry.checkOutgoing(custodialA, 3_000_000 * 1e6);
        assertTrue(ok);
        assertTrue(isLarge);   // >= CTR threshold
        assertTrue(isPep);
        assertFalse(isNew);
    }

    // ─── PEP approval flow (Rule 9) ──────────────────────────────────────────

    function test_PepConsumeRequiresApproval() public {
        _register(custodialA, 2, true, PII_A);
        vm.prank(admin);
        vm.expectRevert(bytes("PEP_APPROVAL_REQUIRED"));
        registry.consumePepApproval(custodialA);
    }

    function test_PepGrantThenConsumeDecrements() public {
        _register(custodialA, 2, true, PII_A);
        vm.prank(admin);
        registry.grantPepApproval(custodialA, 2);
        assertEq(registry.pepApprovals(custodialA), 2);
        vm.prank(admin);
        registry.consumePepApproval(custodialA);
        assertEq(registry.pepApprovals(custodialA), 1);
    }

    function test_PepConsumeOperatorOnly() public {
        _register(custodialA, 2, true, PII_A);
        vm.prank(admin);
        registry.grantPepApproval(custodialA, 1);
        vm.prank(externalEoa);
        vm.expectRevert();
        registry.consumePepApproval(custodialA);
    }

    // ─── Off-ramp burns ──────────────────────────────────────────────────────

    function test_OffRampBurns() public {
        _register(custodialA, 2, false, PII_A);
        vm.prank(admin);
        onramp.mintFor(custodialA, 1_000_000 * 1e6, "FIAT-IN");
        vm.prank(admin);
        onramp.redeem(custodialA, 200_000 * 1e6, "FIAT-OUT");
        assertEq(token.balanceOf(custodialA), 800_000 * 1e6);
    }

    // ─── End-to-end EOA model: backend signs ERC20 transfer after pre-check ──

    function test_E2ETransferAfterPreCheck() public {
        _register(custodialA, 2, false, PII_A);
        vm.prank(admin);
        onramp.mintFor(custodialA, 5_000_000 * 1e6, "FIAT");

        uint256 amount = 500_000 * 1e6;
        (bool ok,,,,) = registry.checkOutgoing(custodialA, amount);
        assertTrue(ok);

        // Backend signs as the custodial EOA (uses stored private key).
        vm.prank(custodialA);
        token.transfer(externalEoa, amount);
        assertEq(token.balanceOf(externalEoa), amount);
    }
}
