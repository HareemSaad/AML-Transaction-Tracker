import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// AES-256-GCM key derivation from a passphrase. Dev convenience only —
// production deployments must use KMS/HSM-backed key material.
function deriveKey(passphrase: string): Buffer {
  return scryptSync(passphrase, "regulated-aml-dev", 32);
}

export interface EncryptedSecret {
  ciphertext: string; // base64
  iv: string;         // base64
  tag: string;        // base64
}

export function encryptSecret(plaintext: string, passphrase: string): EncryptedSecret {
  const key = deriveKey(passphrase);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: ct.toString("base64"), iv: iv.toString("base64"), tag: tag.toString("base64") };
}

export function decryptSecret(s: EncryptedSecret, passphrase: string): string {
  const key = deriveKey(passphrase);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(s.iv, "base64"));
  decipher.setAuthTag(Buffer.from(s.tag, "base64"));
  const pt = Buffer.concat([decipher.update(Buffer.from(s.ciphertext, "base64")), decipher.final()]);
  return pt.toString("utf8");
}
