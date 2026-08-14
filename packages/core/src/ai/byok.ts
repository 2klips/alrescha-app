import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface ByokKeyEnvelope {
  readonly algorithm: "aes-256-gcm";
  readonly authTag: string;
  readonly ciphertext: string;
  readonly iv: string;
  readonly version: 1;
}

function encryptionKey(masterKey: string): Buffer {
  const decoded = Buffer.from(masterKey, "base64");
  if (decoded.length !== 32) {
    throw new Error(
      "BYOK_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
    );
  }
  return decoded;
}

export function encryptByokKey(input: {
  readonly masterKey: string;
  readonly providerKey: string;
}): ByokKeyEnvelope {
  if (!input.providerKey.trim()) {
    throw new Error("Provider key is required.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    encryptionKey(input.masterKey),
    iv,
  );
  const ciphertext = Buffer.concat([
    cipher.update(input.providerKey, "utf8"),
    cipher.final(),
  ]);
  return {
    algorithm: "aes-256-gcm",
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    version: 1,
  };
}

export function decryptByokKey(input: {
  readonly envelope: ByokKeyEnvelope;
  readonly masterKey: string;
}): string {
  if (
    input.envelope.algorithm !== "aes-256-gcm" ||
    input.envelope.version !== 1
  ) {
    throw new Error("Unsupported BYOK key envelope.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(input.masterKey),
    Buffer.from(input.envelope.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(input.envelope.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(input.envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
