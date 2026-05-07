import { KycTier } from "@prisma/client";

export class CreateWalletDto {
  customerId!: string;               // bank's KYC subject id
  fullName!: string;
  passportNo!: string;
  dob!: string;                       // ISO date
  nationality!: string;
  address!: string;
  occupation?: string;
  sourceOfFunds?: string;
  kycTier!: KycTier;
  isPEP?: boolean;
}

export class TransferDto {
  to!: string;                        // destination 0x…
  amount!: string;                    // bPKR base units (decimal string)
}
