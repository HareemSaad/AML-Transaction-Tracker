import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Contract,
  JsonRpcProvider,
  NonceManager,
  Wallet as EthersWallet,
  HDNodeWallet,
  keccak256,
  parseEther,
  toUtf8Bytes,
} from "ethers";
import { KycTier, Wallet } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateWalletDto, TransferDto } from "./dto";
import { decryptSecret, encryptSecret } from "./crypto.util";

const REGISTRY_ABI = [
  "function registerCustodial(address wallet, uint8 kycTier, bool isPEP, bytes32 piiHash)",
  "function checkOutgoing(address wallet, uint256 amount) view returns (bool ok, string reason, bool isLarge, bool isPep, bool isNewAccount)",
  "function consumePepApproval(address wallet)",
  "function pepApprovals(address) view returns (uint256)",
  "function setBlocked(address wallet, bool blocked)",
];
const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

const TIER_TO_NUM: Record<KycTier, number> = {
  NONE: 0, BASIC: 1, ENHANCED: 2, CORPORATE: 3,
};

@Injectable()
export class WalletsService {
  private readonly log = new Logger(WalletsService.name);
  private readonly provider?: JsonRpcProvider;
  private readonly operator?: NonceManager;
  private readonly registry?: Contract;
  private readonly stablecoin?: Contract;
  private readonly stablecoinAddress?: string;
  private readonly registryAddress?: string;
  private readonly walletKeyPassphrase: string;
  // Newly-created custodial EOAs need a small ETH balance to pay gas when the
  // backend signs token transfers from them. The operator funds them at create
  // time. Configurable via WALLET_GAS_TOPUP_ETH (default 0.1).
  private readonly gasTopupEth: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.registryAddress = config.get<string>("REGISTRY_ADDRESS") || undefined;
    this.stablecoinAddress = config.get<string>("STABLECOIN_ADDRESS") || undefined;
    const rpcUrl = config.get<string>("RPC_URL");
    const pk = config.get<string>("DEPLOYER_PK");
    this.walletKeyPassphrase =
      config.get<string>("WALLET_KEY_ENCRYPTION_KEY")
      ?? "dev-only-passphrase-change-in-prod";
    this.gasTopupEth = config.get<string>("WALLET_GAS_TOPUP_ETH") ?? "0.1";

    if (this.registryAddress && this.stablecoinAddress && rpcUrl && pk) {
      this.provider = new JsonRpcProvider(rpcUrl);
      // NonceManager tracks nonces client-side so consecutive txs (registerCustodial
      // + gas top-up) don't collide when anvil mines instantly (block-time 0).
      this.operator = new NonceManager(new EthersWallet(pk, this.provider));
      this.registry = new Contract(this.registryAddress, REGISTRY_ABI, this.operator);
      this.stablecoin = new Contract(this.stablecoinAddress, ERC20_ABI, this.operator);
      this.log.log(`registry=${this.registryAddress} stablecoin=${this.stablecoinAddress}`);
    } else {
      this.log.warn("registry / stablecoin / RPC / DEPLOYER_PK missing — on-chain calls disabled");
    }
  }

  // ─── Custodial wallet creation (Rule 12 baseline) ─────────────────────────
  async create(dto: CreateWalletDto) {
    if (!this.registry || !this.provider) {
      throw new InternalServerErrorException(
        "On-chain registry not configured; run scripts/deploy-contracts.sh first.",
      );
    }
    const tierNum = TIER_TO_NUM[dto.kycTier];
    if (tierNum === 0) {
      throw new BadRequestException("kycTier must be BASIC, ENHANCED, or CORPORATE");
    }

    // Backend generates the custodial EOA — bank holds the key.
    const eoa: HDNodeWallet = EthersWallet.createRandom();
    const piiHash = keccak256(
      toUtf8Bytes([dto.passportNo, dto.fullName, dto.dob].join("|")),
    );

    this.log.log(`registering custodial ${eoa.address} tier=${dto.kycTier} pep=${dto.isPEP ?? false}`);
    const tx = await this.registry.registerCustodial(
      eoa.address,
      tierNum,
      dto.isPEP ?? false,
      piiHash,
    );
    const receipt = await tx.wait();
    if (!receipt) throw new InternalServerErrorException("registerCustodial receipt missing");

    // Top up gas so the EOA can sign its own transfers.
    if (this.operator && parseFloat(this.gasTopupEth) > 0) {
      const fundTx = await this.operator.sendTransaction({
        to: eoa.address,
        value: parseEther(this.gasTopupEth),
      });
      await fundTx.wait();
      this.log.log(`funded ${eoa.address} with ${this.gasTopupEth} ETH for gas`);
    }

    const enc = encryptSecret(eoa.privateKey, this.walletKeyPassphrase);

    return this.prisma.wallet.create({
      data: {
        id: eoa.address.toLowerCase(),
        customerId: dto.customerId,
        fullName: dto.fullName,
        passportNo: dto.passportNo,
        dob: new Date(dto.dob),
        nationality: dto.nationality,
        address: dto.address,
        occupation: dto.occupation,
        sourceOfFunds: dto.sourceOfFunds,
        kycTier: dto.kycTier,
        isPEP: dto.isPEP ?? false,
        piiHash,
        openedAt: new Date(),
        encryptedKey: enc.ciphertext,
        encryptedKeyIv: enc.iv,
        encryptedKeyTag: enc.tag,
      },
    });
  }

  findAll() {
    return this.prisma.wallet.findMany({
      orderBy: { createdAt: "desc" },
      // Never return private-key material in list/get endpoints.
      omit: { encryptedKey: true, encryptedKeyIv: true, encryptedKeyTag: true },
    });
  }

  async findOne(id: string) {
    const w = await this.prisma.wallet.findUnique({
      where: { id: id.toLowerCase() },
      omit: { encryptedKey: true, encryptedKeyIv: true, encryptedKeyTag: true },
    });
    if (!w) throw new NotFoundException(`wallet ${id} not found`);
    return w;
  }

  // ─── Signed transfer with advisory pre-check ──────────────────────────────
  async transfer(walletId: string, dto: TransferDto) {
    if (!this.registry || !this.stablecoin || !this.provider) {
      throw new InternalServerErrorException("on-chain not configured");
    }
    const w = await this.prisma.wallet.findUnique({ where: { id: walletId.toLowerCase() } });
    if (!w) throw new NotFoundException(`wallet ${walletId} not found`);

    const amountWei = BigInt(dto.amount);
    const [ok, reason, isLarge, isPep, isNew] =
      await this.registry.checkOutgoing(w.id, amountWei);
    if (!ok) {
      throw new UnprocessableEntityException({
        ok: false,
        reason,
        isLarge: Boolean(isLarge),
        isPEP: Boolean(isPep),
        isNewAccount: Boolean(isNew),
      });
    }

    if (isPep) {
      const remaining: bigint = await this.registry.pepApprovals(w.id);
      if (remaining === 0n) {
        throw new UnprocessableEntityException({ ok: false, reason: "PEP_APPROVAL_REQUIRED" });
      }
      const consumeTx = await this.registry.consumePepApproval(w.id);
      await consumeTx.wait();
    }

    // Sign as the custodial EOA.
    const pk = decryptSecret(
      { ciphertext: w.encryptedKey, iv: w.encryptedKeyIv, tag: w.encryptedKeyTag },
      this.walletKeyPassphrase,
    );
    const signer = new EthersWallet(pk, this.provider);
    const stableAsSigner = (this.stablecoin as Contract).connect(signer) as Contract;
    const tx = await stableAsSigner.transfer(dto.to, amountWei);
    const receipt = await tx.wait();
    this.log.log(`transfer ${w.id} → ${dto.to} amount=${dto.amount} tx=${receipt?.hash}`);

    return {
      ok: true,
      txHash: receipt?.hash,
      blockNumber: receipt?.blockNumber,
      flags: { isLarge: Boolean(isLarge), isPEP: Boolean(isPep), isNewAccount: Boolean(isNew) },
    };
  }

  // ─── Blacklist / unblock ──────────────────────────────────────────────────
  async setBlocked(walletId: string, blocked: boolean) {
    if (!this.registry) {
      throw new InternalServerErrorException("on-chain not configured");
    }
    const w = await this.prisma.wallet.findUnique({ where: { id: walletId.toLowerCase() } });
    if (!w) throw new NotFoundException(`wallet ${walletId} not found`);

    const tx = await this.registry.setBlocked(w.id, blocked);
    await tx.wait();
    this.log.log(`wallet ${w.id} blocked=${blocked}`);
    return { ok: true, walletId: w.id, blocked };
  }
}
