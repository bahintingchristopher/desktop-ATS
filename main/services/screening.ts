// Automated screening: score applicants 0–100 against a role's criteria using their
// resume (PDF/DOCX/TXT in the applicant's resume/ folder) and the emails they sent.
// Rule-based and fully offline. Every score comes with readable reasons.
import fs from "fs";
import path from "path";
import mammoth from "mammoth";
// Import the library file directly: pdf-parse's index runs a debug self-test when required.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (b: Buffer) => Promise<{ text: string }> = require("pdf-parse/lib/pdf-parse.js");
import { getDb } from "../db";
import { applicantDir } from "./files";
import { setStage } from "./data";

export type Role = {
  id: number;
  title: string;
  required_skills: string[];
  preferred_skills: string[];
  min_years: number;
  locations: string[];
  threshold: number;
  auto_advance: boolean;
  active: boolean;
};

export type ScoreDetails = {
  roleId: number;
  roleTitle: string;
  score: number;
  passed: boolean;
  matchedRequired: string[];
  missingRequired: string[];
  matchedPreferred: string[];
  missingPreferred: string[];
  years: number | null;
  minYears: number;
  locationMatch: string | null;
  sources: string[];
  breakdown: { required: number; preferred: number; experience: number; location: number };
};

/* ---------- Roles CRUD ---------- */
type RoleRow = Omit<Role, "required_skills" | "preferred_skills" | "locations" | "auto_advance" | "active"> & {
  required_skills: string; preferred_skills: string; locations: string; auto_advance: number; active: number;
};
const fromRow = (r: RoleRow): Role => ({
  ...r,
  required_skills: JSON.parse(r.required_skills || "[]"),
  preferred_skills: JSON.parse(r.preferred_skills || "[]"),
  locations: JSON.parse(r.locations || "[]"),
  auto_advance: !!r.auto_advance,
  active: !!r.active,
});

export function listRoles(): Role[] {
  return (getDb().prepare("SELECT * FROM roles ORDER BY active DESC, title").all() as unknown as RoleRow[]).map(fromRow);
}
export function getRole(id: number): Role | null {
  const r = getDb().prepare("SELECT * FROM roles WHERE id=?").get(id) as unknown as RoleRow | undefined;
  return r ? fromRow(r) : null;
}

const clean = (a: string[] = []) => [...new Set(a.map((s) => s.trim()).filter(Boolean))];

export function saveRole(r: Partial<Role> & { title: string }) {
  const row = {
    title: r.title.trim(),
    required_skills: JSON.stringify(clean(r.required_skills)),
    preferred_skills: JSON.stringify(clean(r.preferred_skills)),
    min_years: Math.max(0, Number(r.min_years) || 0),
    locations: JSON.stringify(clean(r.locations)),
    threshold: Math.min(100, Math.max(0, Number(r.threshold ?? 60))),
    auto_advance: r.auto_advance ? 1 : 0,
    active: r.active === false ? 0 : 1,
  };
  const db = getDb();
  if (r.id) {
    db.prepare(`UPDATE roles SET title=@title,required_skills=@required_skills,preferred_skills=@preferred_skills,
      min_years=@min_years,locations=@locations,threshold=@threshold,auto_advance=@auto_advance,active=@active WHERE id=@id`).run({ ...row, id: r.id });
    return r.id;
  }
  return Number(db.prepare(`INSERT INTO roles(title,required_skills,preferred_skills,min_years,locations,threshold,auto_advance,active)
    VALUES(@title,@required_skills,@preferred_skills,@min_years,@locations,@threshold,@auto_advance,@active)`).run(row).lastInsertRowid);
}

export function deleteRole(id: number) {
  getDb().prepare("DELETE FROM roles WHERE id=?").run(id);
}

/* ---------- Text extraction ---------- */
async function fileText(p: string): Promise<string> {
  const ext = path.extname(p).toLowerCase();
  try {
    if (ext === ".pdf") return (await pdfParse(fs.readFileSync(p))).text;
    if (ext === ".docx") return (await mammoth.extractRawText({ path: p })).value;
    if ([".txt", ".md", ".rtf"].includes(ext)) return fs.readFileSync(p, "utf8");
  } catch {
    /* unreadable or scanned file: skip it */
  }
  return "";
}

/** All searchable text for an applicant: resume files + position/notes + emails they sent. */
async function applicantText(applicantId: number) {
  const db = getDb();
  const a = db.prepare("SELECT name,email,position,notes FROM applicants WHERE id=?").get(applicantId) as
    { name: string; email: string | null; position: string; notes: string } | undefined;
  if (!a) throw new Error("Applicant not found");
  const sources: string[] = [];
  const parts: string[] = [a.position, a.notes];
  const resumeDir = path.join(applicantDir(applicantId), "resume");
  for (const f of fs.readdirSync(resumeDir)) {
    const t = await fileText(path.join(resumeDir, f));
    if (t.trim()) { parts.push(t); sources.push(f); }
  }
  if (a.email) {
    const emails = db.prepare("SELECT subject,text FROM emails WHERE lower(from_addr)=lower(?) AND deleted=0").all(a.email) as { subject: string; text: string }[];
    if (emails.length) { parts.push(...emails.map((e) => `${e.subject}\n${e.text}`)); sources.push(`${emails.length} email(s)`); }
  }
  return { text: parts.join("\n"), sources };
}

/* ---------- Scoring ---------- */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word, case-insensitive match. Handles skills like "C#", "C++", "Node.js", "Next.js" / "nextjs". */
function hasTerm(text: string, term: string) {
  const variants = new Set([term, term.replace(/\./g, ""), term.replace(/\s+/g, ""), term.replace(/\.js$/i, "js")]);
  return [...variants].some((v) => new RegExp(`(^|[^a-z0-9])${esc(v)}(?![a-z0-9])`, "i").test(text));
}

/** Largest "N years" figure mentioned, e.g. "5+ years", "3 yrs of experience". */
function yearsOfExperience(text: string): number | null {
  const nums = [...text.matchAll(/(\d{1,2})(?:\.\d)?\s*\+?\s*(?:years?|yrs?)\b/gi)].map((m) => Number(m[1])).filter((n) => n > 0 && n < 50);
  return nums.length ? Math.max(...nums) : null;
}

export function scoreText(role: Role, text: string, sources: string[] = []): ScoreDetails {
  const req = role.required_skills, pref = role.preferred_skills;
  const matchedRequired = req.filter((s) => hasTerm(text, s));
  const matchedPreferred = pref.filter((s) => hasTerm(text, s));
  const years = yearsOfExperience(text);
  const locationMatch = role.locations.find((l) => hasTerm(text, l)) ?? null;

  // Weights: required 50, preferred 20, experience 20, location 10. Empty criteria count as fully met.
  const required = req.length ? (matchedRequired.length / req.length) * 50 : 50;
  const preferred = pref.length ? (matchedPreferred.length / pref.length) * 20 : 20;
  const experience = role.min_years ? (years === null ? 0 : Math.min(years / role.min_years, 1) * 20) : 20;
  const location = role.locations.length ? (locationMatch || hasTerm(text, "remote") ? 10 : 0) : 10;
  const score = Math.round(required + preferred + experience + location);

  return {
    roleId: role.id, roleTitle: role.title, score,
    passed: score >= role.threshold && matchedRequired.length === req.length,
    matchedRequired, missingRequired: req.filter((s) => !matchedRequired.includes(s)),
    matchedPreferred, missingPreferred: pref.filter((s) => !matchedPreferred.includes(s)),
    years, minYears: role.min_years, locationMatch, sources,
    breakdown: { required: Math.round(required), preferred: Math.round(preferred), experience: Math.round(experience), location: Math.round(location) },
  };
}

/** Screen one applicant against a role, store the result, and auto-advance if the role says so. */
export async function screenApplicant(applicantId: number, roleId: number) {
  const role = getRole(roleId);
  if (!role) throw new Error("Role not found");
  const { text, sources } = await applicantText(applicantId);
  const d = scoreText(role, text, sources);
  const db = getDb();
  db.prepare("UPDATE applicants SET role_id=?, score=?, score_details=?, screened_at=datetime('now') WHERE id=?")
    .run(roleId, d.score, JSON.stringify(d), applicantId);
  if (role.auto_advance && d.passed) {
    const cur = db.prepare("SELECT stage FROM applicants WHERE id=?").get(applicantId) as { stage: string };
    if (cur.stage === "Applied") setStage(applicantId, "Screened");
  }
  return d;
}

/** Screen every applicant assigned to the role (or all unassigned ones in the Applied stage). */
export async function screenRole(roleId: number, includeUnassigned = true) {
  const ids = getDb().prepare(
    `SELECT id FROM applicants WHERE role_id=? ${includeUnassigned ? "OR (role_id IS NULL AND stage='Applied')" : ""}`,
  ).all(roleId) as { id: number }[];
  for (const { id } of ids) await screenApplicant(id, roleId);
  return rankings(roleId);
}

export function rankings(roleId: number) {
  return (getDb().prepare(`SELECT id,name,email,position,stage,score,score_details,screened_at FROM applicants
    WHERE role_id=? ORDER BY score DESC, name`).all(roleId) as { score_details: string | null }[])
    .map((r) => ({ ...r, details: r.score_details ? (JSON.parse(r.score_details) as ScoreDetails) : null }));
}

/** Guess a role from an email subject / position text (e.g. "Application for Full-Stack Developer"). */
export function guessRole(text: string): Role | null {
  const t = text.toLowerCase();
  return listRoles().filter((r) => r.active).sort((a, b) => b.title.length - a.title.length)
    .find((r) => t.includes(r.title.toLowerCase())) ?? null;
}

/** Called after an applicant is created/updated from email: auto-screen if a matching role exists. */
export async function autoScreen(applicantId: number) {
  const a = getDb().prepare("SELECT position, role_id FROM applicants WHERE id=?").get(applicantId) as { position: string; role_id: number | null } | undefined;
  if (!a) return null;
  const role = a.role_id ? getRole(a.role_id) : guessRole(a.position ?? "");
  return role ? screenApplicant(applicantId, role.id) : null;
}
