import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Ported from shared-login-for-personal-apps/reference/server/lib/password.mjs.
// The stored format must stay byte-compatible: every app in the sign-on group
// verifies the same AUTH_PASSWORD_HASH.
//
// Node's built-in scrypt is used instead of bcrypt so the server keeps zero
// native dependencies (App Service Linux has no reliable compiler toolchain
// during `npm ci`).
// promisify() loses scrypt's options overload, so wrap it explicitly.
const scryptAsync = (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

export async function hashPassword(plainPassword: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(plainPassword, salt, KEY_LENGTH, SCRYPT_PARAMS);

  return [
    "scrypt",
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

export async function verifyPassword(
  plainPassword: string,
  storedHash: string | undefined,
): Promise<boolean> {
  const parts = String(storedHash ?? "").split("$");

  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const [, rawN, rawR, rawP, rawSalt, rawKey] = parts;
  const params = {
    N: Number.parseInt(rawN, 10),
    r: Number.parseInt(rawR, 10),
    p: Number.parseInt(rawP, 10),
  };

  if (
    !Number.isFinite(params.N) ||
    !Number.isFinite(params.r) ||
    !Number.isFinite(params.p)
  ) {
    return false;
  }

  const salt = Buffer.from(rawSalt, "base64");
  const expected = Buffer.from(rawKey, "base64");

  if (salt.length === 0 || expected.length === 0) {
    return false;
  }

  let derived: Buffer;
  try {
    derived = await scryptAsync(plainPassword, salt, expected.length, params);
  } catch {
    return false;
  }

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
