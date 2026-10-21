import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw || !/^[A-Za-z0-9+/]{43}=$/.test(raw)) {
    throw new Error("APP_ENCRYPTION_KEY deve conter 32 bytes em base64.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("Chave de criptografia inválida.");
  return key;
}

export function encryptSecret(value: string, context: string): string {
  if (!value || !context) throw new Error("Valor e contexto são obrigatórios.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  // Bind ciphertext to its provider/key name to prevent swapping database rows.
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptSecret(envelope: string, context: string): string {
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || !context) {
    throw new Error("Formato de segredo inválido.");
  }
  const [, ivEncoded, tagEncoded, ciphertextEncoded] = parts;
  const iv = Buffer.from(ivEncoded, "base64");
  const tag = Buffer.from(tagEncoded, "base64");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Formato de segredo inválido.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskSecret(value: string): string {
  return value.length > 4 ? `••••${value.slice(-4)}` : "••••";
}
