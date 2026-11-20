import { safeStorage } from "electron";
import { getDb } from "../db";

const SECRET_KEYS = new Set(["mail.password"]);

export type Settings = Record<string, string>;

export function getSetting(key: string): string {
  const row = getDb().prepare("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | undefined;
  if (!row) return "";
  if (SECRET_KEYS.has(key) && row.value && safeStorage.isEncryptionAvailable()) {
    try { return safeStorage.decryptString(Buffer.from(row.value, "base64")); } catch { return ""; }
  }
  return row.value;
}

export function setSetting(key: string, value: string) {
  let v = value;
  if (SECRET_KEYS.has(key) && value && safeStorage.isEncryptionAvailable()) {
    v = safeStorage.encryptString(value).toString("base64");
  }
  getDb().prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, v);
}

/** Returns all settings for the UI; secrets are masked. */
export function getAllSettings(): Settings {
  const rows = getDb().prepare("SELECT key FROM settings").all() as { key: string }[];
  const out: Settings = {};
  for (const { key } of rows) out[key] = SECRET_KEYS.has(key) ? (getSetting(key) ? "********" : "") : getSetting(key);
  return out;
}

export function saveSettings(s: Settings) {
  for (const [k, v] of Object.entries(s)) {
    if (SECRET_KEYS.has(k) && v === "********") continue; // unchanged
    if (k === "mail.password") { setSetting(k, v.replace(/\s+/g, "")); continue; } // app passwords are shown with spaces; strip them
    if (k === "mail.email") { setSetting(k, v.trim()); continue; }
    setSetting(k, v);
  }
}

export const MAIL_PRESETS: Record<string, { imapHost: string; imapPort: number; smtpHost: string; smtpPort: number }> = {
  "gmail.com": { imapHost: "imap.gmail.com", imapPort: 993, smtpHost: "smtp.gmail.com", smtpPort: 465 },
  "outlook.com": { imapHost: "outlook.office365.com", imapPort: 993, smtpHost: "smtp.office365.com", smtpPort: 587 },
  "hotmail.com": { imapHost: "outlook.office365.com", imapPort: 993, smtpHost: "smtp.office365.com", smtpPort: 587 },
  "yahoo.com": { imapHost: "imap.mail.yahoo.com", imapPort: 993, smtpHost: "smtp.mail.yahoo.com", smtpPort: 465 },
};

export function mailConfig() {
  const email = getSetting("mail.email");
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const p = MAIL_PRESETS[domain];
  return {
    email,
    password: getSetting("mail.password"),
    displayName: getSetting("mail.displayName") || email,
    signature: getSetting("mail.signature"),
    imapHost: getSetting("mail.imapHost") || p?.imapHost || `imap.${domain}`,
    imapPort: Number(getSetting("mail.imapPort")) || p?.imapPort || 993,
    smtpHost: getSetting("mail.smtpHost") || p?.smtpHost || `smtp.${domain}`,
    smtpPort: Number(getSetting("mail.smtpPort")) || p?.smtpPort || 465,
  };
}
