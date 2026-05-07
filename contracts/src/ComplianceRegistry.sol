// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @notice Audit-trail registry for the bank's custodial-EOA model.
///
/// Custodial wallets are EOAs created and signed by the bank's backend; the
/// backend calls `registerCustodial` to publish the wallet's compliance profile
/// on-chain (KYC tier, PEP status, opening timestamp, sanctions flag). The
/// `checkOutgoing` view function is an advisory pre-check the backend runs
/// before signing a token transfer — there is no on-chain enforcement, since
/// custodial transfers are plain ERC20 calls. The subgraph reads this registry
/// alongside ERC20 `Transfer` events to compute Pakistan AML rule flags
/// (1, 2, 5, 7, 8, 9, 12).
contract ComplianceRegistry is AccessControl {
    bytes32 public constant COMPLIANCE_OFFICER_ROLE = keccak256("COMPLIANCE_OFFICER_ROLE");
    bytes32 public constant BANK_OPERATOR_ROLE = keccak256("BANK_OPERATOR_ROLE");

    struct WalletProfile {
        uint8 kycTier;       // 0=none, 1=basic, 2=enhanced, 3=corporate
        bool isPEP;          // Rule 9
        bool isBlocked;      // sanctions / freeze
        uint64 openedAt;     // Rule 12 — timestamp registered
        bytes32 piiHash;     // PII full data lives in backend
    }

    mapping(address => WalletProfile) public profiles;
    mapping(address => bool) public isCustodialWallet;

    /// @notice Per-tx cap by KYC tier. Backend uses this when pre-checking.
    mapping(uint8 => uint256) public tierTransferCap;

    /// @notice Cap during new-account window (Rule 12).
    mapping(uint8 => uint256) public newAccountCap;

    /// @notice CTR reporting threshold (Rule 1) in token units.
    uint256 public ctrThreshold;

    /// @notice Window during which `newAccountCap` applies (Rule 12 = 90 days).
    uint64 public newAccountWindow;

    /// @notice Pending PEP approvals — granted by compliance officer, consumed
    ///         by the backend before signing a PEP transfer (Rule 9 EDD gate).
    mapping(address => uint256) public pepApprovals;

    event ProfileSet(
        address indexed wallet,
        uint8 kycTier,
        bool isPEP,
        bytes32 piiHash,
        uint64 openedAt
    );
    event Blocked(address indexed wallet, bool isBlocked);
    event CtrThresholdChanged(uint256 newThreshold);
    event TierCapChanged(uint8 indexed tier, uint256 cap);
    event NewAccountCapChanged(uint8 indexed tier, uint256 cap);
    event NewAccountWindowChanged(uint64 newWindow);
    event PepApprovalGranted(address indexed wallet, uint256 newCount);
    event PepApprovalConsumed(address indexed wallet, uint256 remaining);

    error NotCustodial();
    error InvalidTier();
    error AlreadyRegistered();

    constructor(address admin, uint256 _ctrThreshold, uint64 _newAccountWindow) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(COMPLIANCE_OFFICER_ROLE, admin);
        _grantRole(BANK_OPERATOR_ROLE, admin);
        ctrThreshold = _ctrThreshold;
        newAccountWindow = _newAccountWindow;
        emit CtrThresholdChanged(_ctrThreshold);
        emit NewAccountWindowChanged(_newAccountWindow);
    }

    // ─── Onboarding / lifecycle ────────────────────────────────────────────────

    /// @notice Called by the backend after generating a custodial EOA.
    function registerCustodial(
        address wallet,
        uint8 kycTier,
        bool isPEP,
        bytes32 piiHash
    ) external onlyRole(BANK_OPERATOR_ROLE) {
        if (kycTier == 0 || kycTier > 3) revert InvalidTier();
        if (isCustodialWallet[wallet]) revert AlreadyRegistered();
        WalletProfile storage p = profiles[wallet];
        p.kycTier = kycTier;
        p.isPEP = isPEP;
        p.piiHash = piiHash;
        p.openedAt = uint64(block.timestamp);
        isCustodialWallet[wallet] = true;
        emit ProfileSet(wallet, kycTier, isPEP, piiHash, p.openedAt);
    }

    /// @notice Compliance officer can update tier / PEP / piiHash after re-KYC.
    function setProfile(
        address wallet,
        uint8 kycTier,
        bool isPEP,
        bytes32 piiHash
    ) external onlyRole(COMPLIANCE_OFFICER_ROLE) {
        if (!isCustodialWallet[wallet]) revert NotCustodial();
        if (kycTier == 0 || kycTier > 3) revert InvalidTier();
        WalletProfile storage p = profiles[wallet];
        p.kycTier = kycTier;
        p.isPEP = isPEP;
        p.piiHash = piiHash;
        emit ProfileSet(wallet, kycTier, isPEP, piiHash, p.openedAt);
    }

    function setBlocked(address wallet, bool blocked) external onlyRole(COMPLIANCE_OFFICER_ROLE) {
        profiles[wallet].isBlocked = blocked;
        emit Blocked(wallet, blocked);
    }

    // ─── Config ────────────────────────────────────────────────────────────────

    function setCtrThreshold(uint256 t) external onlyRole(COMPLIANCE_OFFICER_ROLE) {
        ctrThreshold = t;
        emit CtrThresholdChanged(t);
    }

    function setTierCap(uint8 tier, uint256 cap) external onlyRole(COMPLIANCE_OFFICER_ROLE) {
        tierTransferCap[tier] = cap;
        emit TierCapChanged(tier, cap);
    }

    function setNewAccountCap(uint8 tier, uint256 cap) external onlyRole(COMPLIANCE_OFFICER_ROLE) {
        newAccountCap[tier] = cap;
        emit NewAccountCapChanged(tier, cap);
    }

    function setNewAccountWindow(uint64 w) external onlyRole(COMPLIANCE_OFFICER_ROLE) {
        newAccountWindow = w;
        emit NewAccountWindowChanged(w);
    }

    // ─── PEP approval flow (Rule 9 EDD gate) ──────────────────────────────────

    function grantPepApproval(address wallet, uint256 count)
        external
        onlyRole(COMPLIANCE_OFFICER_ROLE)
    {
        pepApprovals[wallet] += count;
        emit PepApprovalGranted(wallet, pepApprovals[wallet]);
    }

    /// @notice Backend calls before signing a PEP transfer; reverts if no approval.
    function consumePepApproval(address wallet) external onlyRole(BANK_OPERATOR_ROLE) {
        uint256 cur = pepApprovals[wallet];
        require(cur > 0, "PEP_APPROVAL_REQUIRED");
        unchecked { pepApprovals[wallet] = cur - 1; }
        emit PepApprovalConsumed(wallet, cur - 1);
    }

    // ─── Pre-flight check used by the backend before signing a transfer ──────

    function checkOutgoing(address wallet, uint256 amount)
        external
        view
        returns (bool ok, string memory reason, bool isLarge, bool isPep, bool isNewAccount)
    {
        WalletProfile memory p = profiles[wallet];
        if (p.kycTier == 0) return (false, "NO_PROFILE", false, false, false);
        if (p.isBlocked) return (false, "BLOCKED", false, p.isPEP, false);
        uint256 cap = tierTransferCap[p.kycTier];
        if (cap > 0 && amount > cap) {
            return (false, "TIER_CAP", false, p.isPEP, false);
        }
        bool _new = block.timestamp - p.openedAt < newAccountWindow;
        if (_new) {
            uint256 ncap = newAccountCap[p.kycTier];
            if (ncap > 0 && amount > ncap) {
                return (false, "NEW_ACCT_CAP", false, p.isPEP, true);
            }
        }
        bool _large = amount >= ctrThreshold;
        return (true, "", _large, p.isPEP, _new);
    }

    function getProfile(address wallet) external view returns (WalletProfile memory) {
        return profiles[wallet];
    }
}
