import { randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended argon2id parameters.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

// No easily-confused characters, since this gets read out or typed by hand.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function generateTempPassword(length = 10): string {
  const bytes = randomBytes(length * 2);
  let out = "";
  for (const b of bytes) {
    if (b < 256 - (256 % ALPHABET.length)) out += ALPHABET[b % ALPHABET.length];
    if (out.length === length) return out;
  }
  return generateTempPassword(length);
}
