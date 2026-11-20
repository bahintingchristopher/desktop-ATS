import crypto from "crypto";
import { getDb } from "../db";
import { mailConfig } from "./settings";

export const STAGES = ["Applied", "Screened", "Interviewed", "Offered", "Hired", "Rejected"] as const;

/* ---------- Applicants ---------- */
export function listApplicants() {
  return getDb().prepare(`SELECT a.*,
      (SELECT count(*) FROM emails e WHERE e.applicant_id=a.id AND e.is_read=0) unread,
      (SELECT min(start) FROM interviews i WHERE i.applicant_id=a.id AND i.start>=datetime('now')) next_interview
    FROM applicants a ORDER BY a.updated_at DESC`).all();
}

export function getApplicant(id: number) {
  const db = getDb();
  return {
    applicant: db.prepare("SELECT * FROM applicants WHERE id=?").get(id),
    emails: db.prepare("SELECT * FROM emails WHERE applicant_id=? ORDER BY date DESC").all(id),
    interviews: db.prepare("SELECT * FROM interviews WHERE applicant_id=? ORDER BY start DESC").all(id),
    recordings: db.prepare("SELECT * FROM recordings WHERE applicant_id=? ORDER BY created_at DESC").all(id),
  };
}

export type ApplicantInput = { id?: number; name: string; email?: string; phone?: string; position?: string; source?: string; stage?: string; notes?: string };

export function saveApplicant(a: ApplicantInput) {
  const db = getDb();
  // Bind only known columns (the renderer may send extra fields like created_at/unread).
  const row = {
    name: a.name.trim(),
    email: a.email?.trim().toLowerCase() || null,
    phone: a.phone ?? "",
    position: a.position ?? "",
    source: a.source ?? "Email",
    stage: a.stage ?? "Applied",
    notes: a.notes ?? "",
  };
  if (a.id) {
    const prev = db.prepare("SELECT stage FROM applicants WHERE id=?").get(a.id) as { stage: string } | undefined;
    db.prepare(`UPDATE applicants SET name=@name,email=@email,phone=@phone,position=@position,source=@source,
      stage=@stage,notes=@notes,updated_at=datetime('now') WHERE id=@id`).run({ ...row, id: a.id });
    if (prev && prev.stage !== row.stage) db.prepare("INSERT INTO stage_history(applicant_id,stage) VALUES(?,?)").run(a.id, row.stage);
    return a.id;
  }
  const info = db.prepare(`INSERT INTO applicants(name,email,phone,position,source,stage,notes)
    VALUES(@name,@email,@phone,@position,@source,@stage,@notes)`).run(row);
  const id = Number(info.lastInsertRowid);
  db.prepare("INSERT INTO stage_history(applicant_id,stage) VALUES(?,?)").run(id, a.stage ?? "Applied");
  if (a.email) db.prepare("UPDATE emails SET applicant_id=? WHERE lower(from_addr)=lower(?) OR lower(to_addr)=lower(?)").run(id, a.email, a.email);
  return id;
}

export function setStage(id: number, stage: string) {
  const db = getDb();
  db.prepare("UPDATE applicants SET stage=?, updated_at=datetime('now') WHERE id=?").run(stage, id);
  db.prepare("INSERT INTO stage_history(applicant_id,stage) VALUES(?,?)").run(id, stage);
}

export function deleteApplicant(id: number) {
  const db = getDb();
  db.prepare("DELETE FROM stage_history WHERE applicant_id=?").run(id);
  db.prepare("DELETE FROM applicants WHERE id=?").run(id);
}

/* ---------- Emails ---------- */
export function listEmails(folder: "INBOX" | "SENT", search = "") {
  const q = `%${search}%`;
  return getDb().prepare(`SELECT e.id,e.message_id,e.applicant_id,e.from_addr,e.from_name,e.to_addr,e.subject,
      substr(e.text,1,160) preview,e.date,e.is_read,e.attachments,a.name applicant_name
    FROM emails e LEFT JOIN applicants a ON a.id=e.applicant_id
    WHERE e.folder=? AND (e.subject LIKE ? OR e.from_addr LIKE ? OR e.from_name LIKE ? OR e.to_addr LIKE ?)
    ORDER BY e.date DESC LIMIT 500`).all(folder, q, q, q, q);
}

export function getEmail(id: number) {
  const db = getDb();
  db.prepare("UPDATE emails SET is_read=1 WHERE id=?").run(id);
  return db.prepare("SELECT * FROM emails WHERE id=?").get(id);
}

/* ---------- Interviews ---------- */
export type InterviewInput = { id?: number; applicant_id: number; title: string; start: string; end: string; platform: string; link?: string; status?: string };

export function listInterviews(from?: string, to?: string) {
  return getDb().prepare(`SELECT i.*, a.name applicant_name, a.email applicant_email FROM interviews i
    JOIN applicants a ON a.id=i.applicant_id
    WHERE (? IS NULL OR i.start>=?) AND (? IS NULL OR i.start<?) ORDER BY i.start`).all(from ?? null, from ?? null, to ?? null, to ?? null);
}

export function saveInterview(i: InterviewInput) {
  const db = getDb();
  const row = {
    applicant_id: i.applicant_id, title: i.title, start: i.start, end: i.end,
    platform: i.platform, link: i.link ?? "", status: i.status ?? "Scheduled",
  };
  if (i.id) {
    db.prepare("UPDATE interviews SET applicant_id=@applicant_id,title=@title,start=@start,end=@end,platform=@platform,link=@link,status=@status WHERE id=@id").run({ ...row, id: i.id });
    return i.id;
  }
  const id = Number(db.prepare("INSERT INTO interviews(applicant_id,title,start,end,platform,link,status) VALUES(@applicant_id,@title,@start,@end,@platform,@link,@status)").run(row).lastInsertRowid);
  const a = db.prepare("SELECT stage FROM applicants WHERE id=?").get(i.applicant_id) as { stage: string } | undefined;
  if (a && (a.stage === "Applied" || a.stage === "Screened")) setStage(i.applicant_id, "Interviewed");
  return id;
}

export function deleteInterview(id: number) {
  getDb().prepare("DELETE FROM interviews WHERE id=?").run(id);
}

const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsEsc = (s: string) => s.replace(/[\\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");

/** Build an iCalendar invite so the applicant can add the interview to their calendar. */
export function buildIcs(i: { id?: number; title: string; start: string; end: string; link?: string; attendee: string }) {
  const org = mailConfig().email;
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Desktop ATS//EN", "METHOD:REQUEST", "BEGIN:VEVENT",
    `UID:${i.id ?? crypto.randomUUID()}@desktop-ats`, `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(i.start)}`, `DTEND:${icsDate(i.end)}`, `SUMMARY:${icsEsc(i.title)}`,
    i.link ? `LOCATION:${icsEsc(i.link)}` : "", i.link ? `DESCRIPTION:Join: ${icsEsc(i.link)}` : "",
    `ORGANIZER:mailto:${org}`, `ATTENDEE;RSVP=TRUE:mailto:${i.attendee}`,
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

/* ---------- Analytics ---------- */
export function analytics(from?: string, to?: string) {
  const db = getDb();
  const f = from ?? "1970-01-01";
  const t = to ?? "9999-12-31";
  const one = (sql: string, ...p: (string | number)[]) => (db.prepare(sql).get(...p) as { c: number }).c;
  const reached = (stage: string) =>
    one(`SELECT count(DISTINCT h.applicant_id) c FROM stage_history h JOIN applicants a ON a.id=h.applicant_id
         WHERE h.stage=? AND a.created_at BETWEEN ? AND ?`, stage, f, t);
  return {
    totals: {
      applicants: one("SELECT count(*) c FROM applicants WHERE created_at BETWEEN ? AND ?", f, t),
      active: one("SELECT count(*) c FROM applicants WHERE stage NOT IN ('Hired','Rejected')"),
      interviewsNext7: one("SELECT count(*) c FROM interviews WHERE start BETWEEN datetime('now') AND datetime('now','+7 days')"),
      interviews: one("SELECT count(*) c FROM interviews WHERE start BETWEEN ? AND ?", f, t),
      offered: one("SELECT count(*) c FROM applicants WHERE stage='Offered'"),
      // Only applicants who still exist AND are still Hired, counted once, by when they were (last) moved to Hired.
      hiredThisMonth: one(`SELECT count(*) c FROM applicants a WHERE a.stage='Hired' AND
        (SELECT max(h.at) FROM stage_history h WHERE h.applicant_id=a.id AND h.stage='Hired') >= date('now','start of month')`),
      hired: one("SELECT count(*) c FROM applicants WHERE stage='Hired' AND created_at BETWEEN ? AND ?", f, t),
      rejected: one("SELECT count(*) c FROM applicants WHERE stage='Rejected' AND created_at BETWEEN ? AND ?", f, t),
    },
    sources: db.prepare("SELECT coalesce(source,'Other') name, count(*) value FROM applicants WHERE created_at BETWEEN ? AND ? GROUP BY 1 ORDER BY 2 DESC").all(f, t),
    monthly: db.prepare(`SELECT strftime('%Y-%m',created_at) month, count(*) count FROM applicants
      WHERE created_at>=date('now','start of month','-11 months') GROUP BY 1 ORDER BY 1`).all(),
    funnel: ["Applied", "Screened", "Interviewed", "Offered", "Hired"].map((s) => ({ stage: s, count: reached(s) })),
    byStage: db.prepare("SELECT stage, count(*) count FROM applicants GROUP BY stage").all(),
  };
}
