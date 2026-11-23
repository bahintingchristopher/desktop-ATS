import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb } from "../db";
import { sendResetCode } from "./mail";

type AccountInput = { email: string; password: string };
type AuthStatus = { hasAccount: boolean; authenticated: boolean; email: string | null };
type UserRow = {
  id: number;
  email: string;
  password_hash: string;
  reset_hash: string | null;
  reset_expires_at: string | null;
};

let authenticated = false;

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function hashSecret(secret: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(secret, salt, 64).toString("hex")}`;
}

function verifySecret(secret: string, stored: string) {
  const [scheme, salt, derived] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !derived) return false;
  const expected = Buffer.from(derived, "hex");
  const actual = scryptSync(secret, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function currentUser() {
  return getDb().prepare("SELECT id,email,password_hash,reset_hash,reset_expires_at FROM users ORDER BY id LIMIT 1").get() as UserRow | undefined;
}

export function status(): AuthStatus {
  const user = currentUser();
  return { hasAccount: !!user, authenticated: authenticated && !!user, email: authenticated ? user?.email ?? null : null };
}

export function isAuthenticated() {
  return authenticated && !!currentUser();
}

export function createAccount(input: AccountInput) {
  if (currentUser()) throw new Error("An account already exists. Sign in instead.");
  const email = normalizeEmail(input.email);
  if (!validEmail(email)) throw new Error("Enter a valid email address.");
  if (input.password.length < 8) throw new Error("Password must be at least 8 characters.");
  getDb().prepare("INSERT INTO users (email,password_hash) VALUES (?,?)").run(email, hashSecret(input.password));
  authenticated = true;
  return { email };
}

export function login(input: AccountInput) {
  const email = normalizeEmail(input.email);
  const user = getDb().prepare("SELECT id,email,password_hash,reset_hash,reset_expires_at FROM users WHERE email=?").get(email) as UserRow | undefined;
  if (!user || !verifySecret(input.password, user.password_hash)) throw new Error("Invalid email or password.");
  authenticated = true;
  return { email: user.email };
}

export function logout() {
  authenticated = false;
}

export async function requestReset(email: string) {
  const normalized = normalizeEmail(email);
  const user = getDb().prepare("SELECT id,email FROM users WHERE email=?").get(normalized) as { id: number; email: string } | undefined;
  if (!user) return { email: normalized };
  const code = String(randomInt(100000, 1000000));
  getDb()
    .prepare("UPDATE users SET reset_hash=?, reset_expires_at=? WHERE id=?")
    .run(hashSecret(code), new Date(Date.now() + 10 * 60_000).toISOString(), user.id);
  try {
    await sendResetCode(user.email, code);
  } catch {
    throw new Error("Could not send the reset email. Check your email settings and try again.");
  }
  return { email: user.email };
}

export function resetWithCode(input: { email: string; code: string; newPassword: string }) {
  if (input.newPassword.length < 8) throw new Error("Password must be at least 8 characters.");
  const email = normalizeEmail(input.email);
  const user = getDb()
    .prepare("SELECT id,email,reset_hash,reset_expires_at FROM users WHERE email=?")
    .get(email) as Pick<UserRow, "id" | "email" | "reset_hash" | "reset_expires_at"> | undefined;
  if (!user?.reset_hash || !user.reset_expires_at) throw new Error("Invalid or expired reset code.");
  if (Date.parse(user.reset_expires_at) < Date.now()) throw new Error("Invalid or expired reset code.");
  if (!verifySecret(input.code.trim(), user.reset_hash)) throw new Error("Invalid or expired reset code.");
  getDb()
    .prepare("UPDATE users SET password_hash=?, reset_hash=NULL, reset_expires_at=NULL WHERE id=?")
    .run(hashSecret(input.newPassword), user.id);
  authenticated = true;
  return { email: user.email };
}
