import { BrowserWindow } from "electron";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { getDb } from "../db";
import { saveApplicant, setStage, unreadInboxCount } from "./data";
import { mailConfig } from "./settings";
import { applicantDir, saveAttachment } from "./files";
import { autoScreen } from "./screening";

function imapClient() {
  const c = mailConfig();
  if (!c.email || !c.password) throw new Error("Email is not set up. Open Settings and enter your email + app password.");
  return new ImapFlow({
    host: c.imapHost,
    port: c.imapPort,
    secure: c.imapPort === 993,
    auth: { user: c.email, pass: c.password },
    logger: false,
  });
}

function smtpTransport() {
  const c = mailConfig();
  return nodemailer.createTransport({
    host: c.smtpHost,
    port: c.smtpPort,
    secure: c.smtpPort === 465,
    auth: { user: c.email, pass: c.password },
  });
}

export async function testConnection() {
  const imap = imapClient();
  await imap.connect();
  await imap.logout();
  await smtpTransport().verify();
  return { ok: true };
}

function notify() {
  const unread = unreadInboxCount();
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send("mail:updated", { unread });
}

export function notifyUpdated() {
  notify();
}

function matchApplicant(addr: string): number | null {
  const row = getDb().prepare("SELECT id FROM applicants WHERE lower(email)=lower(?)").get(addr) as { id: number } | undefined;
  return row?.id ?? null;
}

export function deleteEmail(id: number) {
  const result = getDb().prepare("UPDATE emails SET deleted=1 WHERE id=?").run(id);
  if (result.changes) notify();
  return result.changes > 0;
}

let syncing = false;

/** Fetch new INBOX messages since the last seen UID and store them. */
export async function syncInbox(limit = 200) {
  if (syncing) return { added: 0 };
  syncing = true;
  const db = getDb();
  const own = mailConfig().email.toLowerCase();
  const imap = imapClient();
  let added = 0;
  try {
    await imap.connect();
    const lock = await imap.getMailboxLock("INBOX");
    try {
      const last = (db.prepare("SELECT max(uid) m FROM emails WHERE folder='INBOX'").get() as { m: number | null }).m ?? 0;
      const total = typeof imap.mailbox === "object" ? imap.mailbox.exists : 0;
      // First sync: only the most recent `limit` messages.
      const range = last ? `${last + 1}:*` : `${Math.max(1, total - limit + 1)}:*`;
      const insert = db.prepare(`INSERT OR IGNORE INTO emails
        (message_id,uid,folder,applicant_id,from_addr,from_name,to_addr,subject,text,html,date,in_reply_to,attachments)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      if (total > 0) {
        for await (const msg of imap.fetch(range, { uid: true, source: true }, { uid: !!last })) {
          if (msg.uid <= last || !msg.source) continue;
          const p = await simpleParser(msg.source);
          const from = p.from?.value[0];
          const fromAddr = (from?.address ?? "").toLowerCase();
          if (fromAddr === own) continue;
          const applicantId = matchApplicant(fromAddr);
          const atts = p.attachments.map((a) => ({ filename: a.filename ?? "file", size: a.size, contentType: a.contentType }));
          const r = insert.run(
            p.messageId ?? `uid-${msg.uid}`, msg.uid, "INBOX", applicantId, fromAddr, from?.name ?? "",
            Array.isArray(p.to) ? p.to.map((t) => t.text).join(", ") : p.to?.text ?? "",
            p.subject ?? "(no subject)", p.text ?? "", typeof p.html === "string" ? p.html : "",
            (p.date ?? new Date()).toISOString(), p.inReplyTo ?? null, JSON.stringify(atts),
          );
          if (r.changes) {
            added++;
            if (applicantId && p.attachments.length) {
              for (const a of p.attachments) saveAttachment(applicantId, a.filename ?? "file", a.content);
              await autoScreen(applicantId).catch(() => undefined); // re-score with the new resume
            }
          }
        }
      }
    } finally {
      lock.release();
    }
    await imap.logout();
  } finally {
    syncing = false;
  }
  if (added) notify();
  return { added };
}

let timer: NodeJS.Timeout | null = null;
export function startAutoSync(intervalMs = 60_000) {
  if (timer) clearInterval(timer);
  const tick = () => syncInbox().catch(() => undefined);
  tick();
  timer = setInterval(tick, intervalMs);
}

export function applicantFromReply(source: { from_addr: string; from_name: string; subject: string } | undefined, fallbackEmail: string) {
  const email = (source?.from_addr || fallbackEmail).trim().toLowerCase();
  const name = (source?.from_name || email.split("@")[0] || "Applicant").trim();
  const subject = (source?.subject || "").replace(/^(re|fwd):\s*/i, "").trim();
  const position = subject.match(/application for\s+(.+)/i)?.[1]?.trim() || subject.slice(0, 120) || "Application";
  return { name, email, position, source: "Email", stage: "Applied" };
}

export function stageFromSentMail(template: string | undefined, subject: string, body: string, isReply = false): "Applied" | "Offered" | "Rejected" | null {
  const t = (template ?? "").toLowerCase();
  const text = `${subject}\n${body}`.toLowerCase();
  if (t === "offer") return "Offered";
  if (t === "rejection") return "Rejected";
  if (isReply && (t === "acknowledge" || t === "invitation")) return "Applied";
  if (/\b(job offer|offer letter|offer of employment|we are pleased to offer)\b/.test(text)) return "Offered";
  if (/\b(rejected|not moving forward|move forward with other candidates|other candidates)\b/.test(text)) return "Rejected";
  return null;
}

export type SendInput = {
  to: string;
  subject: string;
  body: string;
  applicantId?: number | null;
  inReplyTo?: string | null;
  ics?: string | null;
  template?: string;
};

export async function sendMail(input: SendInput) {
  const c = mailConfig();
  const text = c.signature ? `${input.body}\n\n${c.signature}` : input.body;
  const info = await smtpTransport().sendMail({
    from: { name: c.displayName, address: c.fromEmail },
    replyTo: c.fromEmail,
    to: input.to,
    subject: input.subject,
    text,
    inReplyTo: input.inReplyTo ?? undefined,
    references: input.inReplyTo ?? undefined,
    icalEvent: input.ics ? { method: "REQUEST", content: input.ics } : undefined,
  });

  let applicantId = input.applicantId ?? matchApplicant(input.to);
  let createdApplicant = false;
  if (!applicantId) {
    const source = input.inReplyTo
      ? getDb().prepare("SELECT id,from_addr,from_name,subject FROM emails WHERE message_id=? OR in_reply_to=? ORDER BY date DESC LIMIT 1").get(input.inReplyTo, input.inReplyTo) as
          | { id: number; from_addr: string; from_name: string; subject: string }
          | undefined
      : undefined;
    const details = applicantFromReply(source, input.to);
    if (details.email && details.email !== c.email.toLowerCase()) {
      applicantId = saveApplicant(details);
      applicantDir(applicantId);
      getDb().prepare("UPDATE emails SET applicant_id=? WHERE id=? OR lower(from_addr)=lower(?)")
        .run(applicantId, source?.id ?? -1, details.email);
      if (source?.id) await saveEmailAttachments(source.id, applicantId).catch(() => []);
      await autoScreen(applicantId).catch(() => null);
      createdApplicant = true;
    }
  }

  getDb()
    .prepare(`INSERT OR IGNORE INTO emails (message_id,folder,applicant_id,from_addr,from_name,to_addr,subject,text,date,is_read,in_reply_to)
      VALUES (?,?,?,?,?,?,?,?,?,1,?)`)
    .run(info.messageId, "SENT", applicantId, c.fromEmail, c.displayName, input.to,
      input.subject, text, new Date().toISOString(), input.inReplyTo ?? null);
  const stage = stageFromSentMail(input.template, input.subject, input.body, !!input.inReplyTo);
  const current = applicantId
    ? (getDb().prepare("SELECT stage FROM applicants WHERE id=?").get(applicantId) as { stage: string } | undefined)?.stage
    : undefined;
  // "Applied" from a reply only confirms new applicants; never move someone further along back to Applied.
  if (applicantId && stage && !(stage === "Applied" && current && current !== "Applied")) setStage(applicantId, stage);
  notify();
  return { messageId: info.messageId, applicantId, stage, createdApplicant };
}

export async function sendResetCode(to: string, code: string) {
  const c = mailConfig();
  if (!c.email || !c.password) throw new Error("Email is not set up.");
  await smtpTransport().sendMail({
    from: { name: c.displayName, address: c.fromEmail },
    replyTo: c.fromEmail,
    to,
    subject: "Password reset code",
    text: `Your Desktop ATS password reset code is ${code}. It expires in 10 minutes.`,
  });
}

/** Download an email's attachments again (by UID) and save into the applicant's resume folder. */
export async function saveEmailAttachments(emailId: number, applicantId: number) {
  const e = getDb().prepare("SELECT uid FROM emails WHERE id=?").get(emailId) as { uid: number } | undefined;
  if (!e?.uid) return [];
  const imap = imapClient();
  await imap.connect();
  const lock = await imap.getMailboxLock("INBOX");
  const saved: string[] = [];
  try {
    const msg = await imap.fetchOne(String(e.uid), { source: true }, { uid: true });
    if (msg && msg.source) {
      const p = await simpleParser(msg.source);
      for (const a of p.attachments) saved.push(saveAttachment(applicantId, a.filename ?? "file", a.content));
    }
  } finally {
    lock.release();
    await imap.logout();
  }
  return saved;
}
