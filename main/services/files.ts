import { app, shell } from "electron";
import fs from "fs";
import path from "path";
import { getDb } from "../db";
import { getSetting } from "./settings";

export function dataRoot() {
  const root = getSetting("data.folder") || path.join(app.getPath("documents"), "MyATS_Data");
  fs.mkdirSync(path.join(root, "Applicants"), { recursive: true });
  return root;
}

const safe = (s: string) => s.replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "_") || "Applicant";

export function applicantDirPath(applicantId: number) {
  const a = getDb().prepare("SELECT id,name FROM applicants WHERE id=?").get(applicantId) as { id: number; name: string } | undefined;
  if (!a) throw new Error("Applicant not found");
  return path.join(dataRoot(), "Applicants", `${safe(a.name)}_${a.id}`);
}

export function applicantDir(applicantId: number) {
  const dir = applicantDirPath(applicantId);
  for (const sub of ["interviews", "resume"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  return dir;
}

/** Ensure a path is inside the data root (prevents renderer path traversal). */
function assertInside(p: string) {
  const root = path.resolve(dataRoot());
  const full = path.resolve(p);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error("Path outside data folder");
  return full;
}

export type FileNode = { name: string; path: string; isDir: boolean; size: number; mtime: string; children?: FileNode[] };

export function listTree(dir = dataRoot(), depth = 4): FileNode[] {
  const full = assertInside(dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full, { withFileTypes: true })
    .map((e) => {
      const p = path.join(full, e.name);
      const st = fs.statSync(p);
      return {
        name: e.name,
        path: p,
        isDir: e.isDirectory(),
        size: st.size,
        mtime: st.mtime.toISOString(),
        children: e.isDirectory() && depth > 0 ? listTree(p, depth - 1) : undefined,
      };
    })
    .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
}

export function orphanApplicantFolders(): FileNode[] {
  const applicants = path.join(dataRoot(), "Applicants");
  return listTree(applicants, 0).filter((n) => {
    if (!n.isDir) return false;
    const id = n.name.match(/_(\d+)$/)?.[1];
    if (!id) return true;
    return !getDb().prepare("SELECT 1 FROM applicants WHERE id=?").get(Number(id));
  });
}

export function removeLegacyEmailFolders() {
  const applicants = path.join(dataRoot(), "Applicants");
  if (!fs.existsSync(applicants)) return;
  for (const entry of fs.readdirSync(applicants, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const emails = path.join(applicants, entry.name, "emails");
    if (fs.existsSync(emails) && fs.readdirSync(emails).length === 0) fs.rmSync(emails, { recursive: true, force: true });
  }
}

export function readText(p: string) {
  return fs.readFileSync(assertInside(p), "utf8");
}
export function readBinary(p: string) {
  return fs.readFileSync(assertInside(p));
}
export function openPath(p: string) {
  return shell.openPath(assertInside(p));
}
export function showInFolder(p: string) {
  shell.showItemInFolder(assertInside(p));
}

export function removeApplicantFolder(p: string) {
  const root = path.resolve(dataRoot());
  const full = assertInside(p);
  const applicants = path.join(root, "Applicants");
  if (!full.startsWith(applicants + path.sep)) throw new Error("Not an applicant folder");
  fs.rmSync(full, { recursive: true, force: true });
}

export function saveAttachment(applicantId: number, filename: string, content: Buffer, sub = "resume") {
  const p = path.join(applicantDir(applicantId), sub, safe(path.parse(filename).name) + path.extname(filename));
  fs.writeFileSync(p, content);
  return p;
}

export function saveRecording(applicantId: number, data: ArrayBuffer, interviewId?: number) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const p = path.join(applicantDir(applicantId), "interviews", `${stamp}_call.webm`);
  fs.writeFileSync(p, Buffer.from(data));
  const info = getDb()
    .prepare("INSERT INTO recordings(applicant_id,interview_id,audio_path) VALUES(?,?,?)")
    .run(applicantId, interviewId ?? null, p);
  return { id: Number(info.lastInsertRowid), path: p };
}
